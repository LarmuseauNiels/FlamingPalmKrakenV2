import { Interaction } from "discord.js";
import { IHandler } from "../interfaces/IHandler";
import { IEvent } from "../interfaces/IEvent";

export default class interactionCreate implements IEvent {
  name = "interactionCreate";
  async execute(interaction: any) {
    console.log("executing interaction");
    global.bugsnag.startSession();
    global.bugsnag.leaveBreadcrumb(
      interaction.commandName ?? "No command name"
    );
    try {
      if (interaction.isButton()) {
        console.log(interaction.customId);
        let buttonId = interaction.customId.split("_")[0];
        let button = global.client.buttons.get(buttonId);
        if (button) await button.execute(interaction);
      } else if (interaction.isStringSelectMenu()) {
        console.log(interaction.customId);
        let selectID = interaction.customId;
        let select = global.client.selects.get(selectID);
        if (select) await select.execute(interaction);
      } else if (interaction.isMessageContextMenuCommand()) {
        console.log(interaction.commandName);
        let menu = global.client.contextMenus.get(interaction.commandName);
        if (menu) await menu.execute(interaction);
      } else if (interaction.isUserContextMenuCommand()) {
        console.log((interaction as any).commandName);
        let menu = global.client.contextMenus.get(interaction.commandName);
        if (menu) await menu.execute(interaction);
      } else {
        if (interaction.isCommand()) {
          console.log(interaction.commandName);
          let command = global.client.commands.get(interaction.commandName);
          if (command) await command.execute(interaction);
        }
      }
      if (interaction.isModalSubmit()) {
        let modalId = interaction.customId.split("_")[0];
        let modal = global.client.modals.get(modalId);
        if (modal) await modal.execute(interaction);
      }
      if (interaction.isAutocomplete()) {
        let command = global.client.commands.get(interaction.commandName);
        if (command) await command.autocomplete(interaction);
      }
    } catch (error) {
      global.bugsnag.notify(error);
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
        await interaction.reply({
          content: "A problem occurred. Error has been logged and reported.",
          ephemeral: true,
        });
      }
    }
    global.bugsnag.pauseSession();
  }
}
