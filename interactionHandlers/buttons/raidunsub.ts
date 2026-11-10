import { IHandler } from "../../interfaces/IHandler";
import { RaidModule } from "../../modules/RaidModule";

export default class RaidUnsub implements IHandler {
  name = "raidunsub";
  async execute(interaction) {
    const raidId = interaction.customId.split("_")[1];
    await global.client.prisma.raidAttendees.delete({
      where: {
        RaidId_MemberId: {
          RaidId: parseInt(raidId),
          MemberId: interaction.user.id,
        },
      },
    });
    await RaidModule.touchRaid(parseInt(raidId));
    interaction.reply({
      content: "Successfully unsubscribed from the raid!",
      ephemeral: true,
    });
  }
}
