const { ActionRowBuilder, ButtonBuilder } = require("discord.js");

module.exports = {
  name: "confirmSend",
  async execute(interaction) {
    await global.client.prisma.sSSender.update({
      where: { ID: interaction.user.id },
      data: { IsSend: true },
    });

    let row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("confirmSend")
        .setLabel("Confirmed")
        .setStyle(global.ButtonStyle.Success)
        .setDisabled(true)
    );

    interaction.update({ components: [row] });
  },
};
