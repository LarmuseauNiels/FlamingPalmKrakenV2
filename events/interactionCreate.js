module.exports = {
  name: "interactionCreate",
  async execute(interaction) {
    try {
      if (interaction.isButton()) {
        let button = client.buttons.get(interaction.customId);
        await button.execute(interaction);
      }
      if (interaction.isCommand()) {
        let command = client.commands.get(interaction.commandName);
        await command.execute(interaction);
      }
      if (interaction.isSelectMenu()) {
        console.log(interaction);
        //let selectMenu = client.selectMenus.get(interaction.customId);
        //await selectMenu.execute(interaction);
      }
    } catch (error) {
      client.log(error);
      await interaction.reply({
        content: "Issue executing, alert niels",
        ephemeral: true,
      });
    }
  },
};
