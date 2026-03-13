import { IHandler } from "../../interfaces/IHandler";
import { createLogger } from "../../utils/logger";

const log = createLogger("RaidUnsub");

export default class RaidUnsub implements IHandler {
  name = "raidunsub";
  async execute(interaction) {
    const raidId = parseInt(interaction.customId.split("_")[1]);
    try {
      const existing = await global.client.prisma.raidAttendees.findUnique({
        where: {
          RaidId_MemberId: {
            RaidId: raidId,
            MemberId: interaction.user.id,
          },
        },
      });

      if (!existing) {
        await interaction.reply({
          content: "You are not signed up for this raid.",
          ephemeral: true,
        });
        return;
      }

      await global.client.prisma.raidAttendees.delete({
        where: {
          RaidId_MemberId: {
            RaidId: raidId,
            MemberId: interaction.user.id,
          },
        },
      });
      await interaction.reply({
        content: "Successfully unsubscribed from the raid!",
        ephemeral: true,
      });
    } catch (error) {
      log.error("Failed to unsubscribe user " + interaction.user.id + " from raid " + raidId + ":", error);
      await interaction.reply({
        content: "Something went wrong while unsubscribing. Please try again.",
        ephemeral: true,
      });
    }
  }
}
