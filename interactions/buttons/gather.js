const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
  name: "gather",
  async execute(interaction) {
    if (interaction.user.id !== interaction.message.author.id) {
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
        .setCustomId("gatherWood")
        .setLabel("Wood")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("1024566960840769576"),
      new ButtonBuilder()
        .setCustomId("gatherFood")
        .setLabel("Food")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("1024566956130582628"),
      new ButtonBuilder()
        .setCustomId("gatherStone")
        .setLabel("Stone")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("1024566959456649256")
    );
    interaction.update({ components: [row1, row] });
  },
};
