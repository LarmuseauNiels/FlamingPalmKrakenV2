const { ActionRowBuilder, ButtonBuilder } = require("discord.js");

module.exports = {
  name: "confirmSanta",
  async execute(interaction) {
    await client.prisma.sSLink.update({
      where: { SenderID: interaction.user.id },
      data: { confirmed: true },
    });

    let row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("confirmSanta")
        .setLabel("Confirmed")
        .setStyle("SUCCESS")
        .setDisabled(true)
    );

    interaction.update({ components: [row] });
  },
};
