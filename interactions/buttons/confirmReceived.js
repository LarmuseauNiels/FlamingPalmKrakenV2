const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
  name: "confirmReceived",
  async execute(interaction) {
    await global.client.prisma.sSReceiver.update({
      where: { ID: interaction.user.id },
      data: { IsReceived: true },
    });

    let row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("confirmReceived")
        .setLabel("Reception confirmed")
        .setStyle(ButtonStyle.Success)
        .setDisabled(true)
    );

    interaction.update({ components: [row] });
  },
};
