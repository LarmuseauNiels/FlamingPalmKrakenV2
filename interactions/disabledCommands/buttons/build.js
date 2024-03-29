const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
  name: "build",
  async execute(interaction) {
    //let Islander: Islander = global.client.islander;

    if (interaction.user.id !== interaction.message.interaction.user.id) {
      interaction.reply({
        content: "You can't interact with someone else's buttons!",
        ephemeral: true,
      });
      return;
    }

    let row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("gather")
        .setLabel("Gather")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("build")
        .setLabel("Buildings")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("islanderBuyUnits")
        .setLabel("Units")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("islanderExpedition")
        .setLabel("Expeditions")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
    let row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("newBuilding")
        .setLabel("Build a new building")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("upgradeBuilding")
        .setLabel("Upgrade a building")
        .setStyle(ButtonStyle.Secondary)
    );
    interaction.update({ components: [row1, row] });
  },
};
