module.exports = {
  name: "interactionCreate",
  async execute(interaction) {
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
      }
      if (interaction.isMessageContextMenuCommand()) {
        console.log(interaction.commandName);
        let menu = global.client.contextMenus.get(interaction.commandName);
        if (menu) await menu.execute(interaction);
      } else if (interaction.isUserContextMenuCommand()) {
        console.log(interaction.commandName);
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
      await interaction.reply({
        content: "Issue executing, alerting niels",
        ephemeral: true,
      });
    }
    global.bugsnag.pauseSession();
  },
};
