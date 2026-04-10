import { StringSelectMenuInteraction } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { RaidScheduler } from "../../modules/RaidScheduler";
import { createLogger } from "../../utils/logger";

const log = createLogger("RaidVoteHandler");

export default class RaidVoteHandler implements IHandler {
  name = "raidVote";

  async execute(interaction: StringSelectMenuInteraction) {
    if (!interaction.isStringSelectMenu()) return;

    const customId = interaction.customId;
    const raidId = parseInt(customId.split("_")[1]);

    if (isNaN(raidId)) {
      await interaction.reply({ content: "Invalid raid ID.", ephemeral: true });
      return;
    }

    const selectedOptionIds = interaction.values.map((v) => parseInt(v));

    try {
      // 1. Get all options for this raid to clear only this raid's availability for the user
      const raidOptions = await global.client.prisma.raidSchedulingOption.findMany({
        where: { RaidId: raidId },
        select: { ID: true },
      });
      const optionIds = raidOptions.map((o) => o.ID);

      await global.client.prisma.raidAvailability.deleteMany({
        where: {
          MemberId: interaction.user.id,
          SchedulingOptionId: { in: optionIds },
        },
      });

      // 2. Add new availability
      if (selectedOptionIds.length > 0) {
        await global.client.prisma.raidAvailability.createMany({
          data: selectedOptionIds.map((optionId) => ({
            MemberId: interaction.user.id,
            SchedulingOptionId: optionId,
          })),
        });
      }

      await interaction.reply({
        content:
          "Your availability has been updated! The bot will notify everyone once a consensus is reached.",
        ephemeral: true,
      });

      // 3. Trigger a re-check of consensus
      const raid = await global.client.prisma.raids.findFirst({
        include: {
          RaidAttendees: true,
          RaidSchedulingOption: true,
        },
        where: { ID: raidId },
      });

      if (raid && raid.Status === 2) {
        await RaidScheduler.scheduleRaid(raid as any);
      }
    } catch (error) {
      log.error("Error handling raid vote:", error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "An error occurred while saving your vote.",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "An error occurred while saving your vote.",
          ephemeral: true,
        });
      }
    }
  }
}
