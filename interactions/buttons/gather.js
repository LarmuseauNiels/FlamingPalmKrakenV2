const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
  name: "gather",
  async execute(interaction) {
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
    interaction.reply({ components: [row], ephemeral: true });
  },
};
