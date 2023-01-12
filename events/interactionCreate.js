module.exports = {
  name: "interactionCreate",
  async execute(interaction) {
    try {
      if (interaction.isButton()) {
        let buttonId = interaction.customId.split("_")[0];
        let button = global.client.buttons.get(buttonId);
        await button.execute(interaction);
      }
      if (interaction.isUserContextMenuCommand()) {
        console.log(interaction.commandName);
        let menu = global.client.contextMenus.get(interaction.commandName);
        await menu.execute(interaction);
      } else {
        if (interaction.isCommand()) {
          console.log(interaction.commandName);
          let command = global.client.commands.get(interaction.commandName);
          await command.execute(interaction);
        }
      }
      if (interaction.isModalSubmit()) {
        let modalId = interaction.customId.split("_")[0];
        let modal = global.client.modals.get(modalId);
        await modal.execute(interaction);
      }
    } catch (error) {
      global.client.log(error);
      await interaction.reply({
        content: "Issue executing, alerting niels",
        ephemeral: true,
      });
    }
  },
};
