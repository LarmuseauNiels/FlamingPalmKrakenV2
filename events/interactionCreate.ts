import { Interaction } from "discord.js";
import { IHandler } from "../interfaces/IHandler";
import { IEvent } from "../interfaces/IEvent";
import { createLogger } from "../utils/logger";

const log = createLogger("InteractionCreate");

export default class interactionCreate implements IEvent {
  name = "interactionCreate";
  async execute(interaction: any) {
    log.info("Executing interaction");
    global.bugsnag.startSession();
    global.bugsnag.leaveBreadcrumb(
      interaction.commandName ?? "No command name"
    );
    try {
      if (interaction.isButton()) {
        await this.handleButton(interaction);
      } else if (interaction.isStringSelectMenu()) {
        await this.handleSelectMenu(interaction);
      } else if (interaction.isMessageContextMenuCommand() || interaction.isUserContextMenuCommand()) {
        await this.handleContextMenu(interaction);
      } else if (interaction.isCommand()) {
        await this.handleCommand(interaction);
      } else if (interaction.isModalSubmit()) {
        await this.handleModalSubmit(interaction);
      } else if (interaction.isAutocomplete()) {
        await this.handleAutocomplete(interaction);
      }
    } catch (error) {
      await this.handleError(interaction, error);
    } finally {
      global.bugsnag.pauseSession();
    }
  }

  /** An id we have no handler for is a stale component or an unregistered command. */
  private warnUnhandled(kind: string, id: string) {
    log.warn(`No ${kind} handler for "${id}"`);
  }

  private async handleButton(interaction: any) {
    log.debug("Button interaction:", interaction.customId);
    let buttonId = interaction.customId.split("_")[0];
    let button = global.client.buttons.get(buttonId);
    if (!button) return this.warnUnhandled("button", interaction.customId);
    await button.execute(interaction);
  }

  private async handleSelectMenu(interaction: any) {
    log.debug("Select menu interaction:", interaction.customId);
    let selectID = interaction.customId.split("_")[0];
    let select = global.client.selects.get(selectID);
    if (!select) return this.warnUnhandled("select", interaction.customId);
    await select.execute(interaction);
  }

  private async handleContextMenu(interaction: any) {
    log.debug("Context menu interaction:", interaction.commandName);
    let menu = global.client.contextMenus.get(interaction.commandName);
    if (!menu) return this.warnUnhandled("context menu", interaction.commandName);
    await menu.execute(interaction);
  }

  private async handleCommand(interaction: any) {
    log.debug("Command interaction:", interaction.commandName);
    let command = global.client.commands.get(interaction.commandName);
    if (!command) return this.warnUnhandled("command", interaction.commandName);
    await command.execute(interaction);
  }

  private async handleModalSubmit(interaction: any) {
    let modalId = interaction.customId.split("_")[0];
    let modal = global.client.modals.get(modalId);
    if (!modal) return this.warnUnhandled("modal", interaction.customId);
    await modal.execute(interaction);
  }

  private async handleAutocomplete(interaction: any) {
    let command = global.client.commands.get(interaction.commandName);
    if (!command?.autocomplete) return this.warnUnhandled("autocomplete", interaction.commandName);
    await command.autocomplete(interaction);
  }

  /**
   * Tells the member something went wrong, for every interaction that can be
   * answered — not only slash commands, so a failing button doesn't leave
   * Discord's bare "This interaction failed". Never throws: the interaction
   * may already be answered or expired.
   */
  private async handleError(interaction: any, error: any) {
    log.error("Interaction handler error:", error);
    global.client.log(error?.stack ?? String(error));
    if (!interaction.isRepliable?.()) return;

    const content = "A problem occurred. Error has been logged and reported.";
    try {
      // A deferred slash command shows "thinking…": replace that. A deferred
      // button/select (deferUpdate) must not have its message overwritten.
      if (interaction.isCommand() && interaction.deferred && !interaction.replied) {
        await interaction.editReply({ content });
      } else if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content, ephemeral: true });
      } else {
        await interaction.reply({ content, ephemeral: true });
      }
    } catch (replyError) {
      log.warn("Could not tell the member about the error:", replyError?.message ?? replyError);
    }
  }
}
