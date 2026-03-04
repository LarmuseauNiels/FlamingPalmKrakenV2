import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export const name = "confirmSend";
export async function execute(interaction) {
  await global.client.prisma.sSSender.update({
    where: { ID: interaction.user.id },
    data: { IsSend: true },
  });

  let row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("confirmSend")
      .setLabel("Confirmed")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true)
  );

  interaction.update({ components: [row] });
}
