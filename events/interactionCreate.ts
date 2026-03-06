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
+        await this.handleButton(interaction);
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
    }
    global.bugsnag.pauseSession();
  }

  private async handleButton(interaction: any) {
    log.debug("Button interaction:", interaction.customId);
    let buttonId = interaction.customId.split("_")[0];
    let button = global.client.buttons.get(buttonId);
    if (button) await button.execute(interaction);
  }

  private async handleSelectMenu(interaction: any) {
    log.debug("Select menu interaction:", interaction.customId);
    let selectID = interaction.customId;
    let select = global.client.selects.get(selectID);
    if (select) await select.execute(interaction);
  }

  private async handleContextMenu(interaction: any) {
    log.debug("Context menu interaction:", interaction.commandName);
    let menu = global.client.contextMenus.get(interaction.commandName);
    if (menu) await menu.execute(interaction);
  }

  private async handleCommand(interaction: any) {
    log.debug("Command interaction:", interaction.commandName);
    let command = global.client.commands.get(interaction.commandName);
    if (command) await command.execute(interaction);
  }

  private async handleModalSubmit(interaction: any) {
    let modalId = interaction.customId.split("_")[0];
    let modal = global.client.modals.get(modalId);
    if (modal) await modal.execute(interaction);
  }

  private async handleAutocomplete(interaction: any) {
    let command = global.client.commands.get(interaction.commandName);
    if (command) await command.autocomplete(interaction);
  }

  private async handleError(interaction: any, error: any) {
    log.error("Interaction handler error:", error);
    global.client.log(error);
    if (interaction.isCommand()) {
      if (interaction.deferred) {
        await interaction.editReply({
          content: "A problem occurred. Error has been logged and reported.",
        });
      } else {
        await interaction.reply({
          content: "A problem occurred. Error has been logged and reported.",
          ephemeral: true,
        });
      }
    }
  }
}
