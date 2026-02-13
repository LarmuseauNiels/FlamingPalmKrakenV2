import { Interaction } from "discord.js";
import { IHandler } from "../interfaces/IHandler";
import { IEvent } from "../interfaces/IEvent";
import { logger } from "../modules/Logger";

export default class interactionCreate implements IEvent {
  name = "interactionCreate";
  async execute(interaction: Interaction) {
    logger.debug(`Executing interaction: ${interaction.isCommand() ? (interaction as any).commandName : interaction.type}`);
    global.bugsnag.startSession();
    global.bugsnag.leaveBreadcrumb(
      (interaction as any).commandName ?? "No command name"
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

  private async handleButton(interaction: Interaction) {
    if (!interaction.isButton()) return;
    const buttonId = interaction.customId.split("_")[0];
    const button = global.client.buttons.get(buttonId);
    if (button) await button.execute(interaction);
  }

  private async handleSelectMenu(interaction: Interaction) {
    if (!interaction.isStringSelectMenu()) return;
    const select = global.client.selects.get(interaction.customId);
    if (select) await select.execute(interaction);
  }

  private async handleContextMenu(interaction: Interaction) {
    if (!interaction.isMessageContextMenuCommand() && !interaction.isUserContextMenuCommand()) return;
    const menu = global.client.contextMenus.get(interaction.commandName);
    if (menu) await menu.execute(interaction);
  }

  private async handleCommand(interaction: Interaction) {
    if (!interaction.isCommand()) return;
    const command = global.client.commands.get(interaction.commandName);
    if (command) await command.execute(interaction);
  }

  private async handleModalSubmit(interaction: Interaction) {
    if (!interaction.isModalSubmit()) return;
    const modalId = interaction.customId.split("_")[0];
    const modal = global.client.modals.get(modalId);
    if (modal) await modal.execute(interaction);
  }

  private async handleAutocomplete(interaction: Interaction) {
    if (!interaction.isAutocomplete()) return;
    const command = global.client.commands.get(interaction.commandName);
    if (command) await command.autocomplete(interaction);
  }

  private async handleError(interaction: Interaction, error: unknown) {
    try {
      logger.error("Interaction error", error);
      if (interaction.isCommand() || interaction.isButton() || interaction.isStringSelectMenu()) {
        const reply = {
          content: "A problem occurred. Error has been logged and reported.",
          ephemeral: true,
        };
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(reply);
        } else {
          await interaction.reply(reply);
        }
      }
    } catch {
      // Error handler itself failed (e.g., interaction expired) — nothing more to do
    }
  }
}
