import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export const name = "confirmReceived";
export async function execute(interaction) {
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
}
