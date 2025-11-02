import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export const name = "confirmSanta";
export async function execute(interaction) {
  await client.prisma.sSLink.update({
    where: { SenderID: interaction.user.id },
    data: { confirmed: true },
  });

  let row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("confirmSanta")
      .setLabel("Confirmed")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true)
  );

  interaction.update({ components: [row] });
}
