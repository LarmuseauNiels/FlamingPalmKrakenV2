import { ModalSubmitInteraction } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { RaidScheduler } from "../../modules/RaidScheduler";
import moment from "moment-timezone";
import { TimeParser } from "../../utils/TimeParser";
import { createLogger } from "../../utils/logger";

const log = createLogger("RaidCustomTimeSubmit");

export default class RaidCustomTimeSubmitHandler implements IHandler {
  name = "raidCustomTimeModal";

  async execute(interaction: ModalSubmitInteraction) {
    if (!interaction.isModalSubmit()) return;

    // Defer immediately — TimeParser.parse can fall back to a slow AI call that
    // exceeds Discord's 3s interaction window, which would invalidate the token
    // and cause a 10062 "Unknown interaction" error on reply.
    await interaction.deferReply({ ephemeral: true });

    const raidId = parseInt(interaction.customId.split("_")[1]);
    const datetimeInput = interaction.fields.getTextInputValue("customTime");

    let timezone = "UTC";
    try {
      const member = await global.client.prisma.members.findUnique({
        where: { ID: interaction.user.id },
        select: { Timezone: true },
      });
      if (member?.Timezone) {
        timezone = member.Timezone;
      }
    } catch (error) {
      log.error("Failed to fetch member timezone", error);
    }

    const parsed = await TimeParser.parse(datetimeInput, timezone);

    if (!parsed.isValid()) {
      await interaction.editReply({
        content: `Could not parse **${datetimeInput}** as a date/time. Please use formats like \`DD/MM HH:mm\` or \`March 15 6:30pm\`.`,
      });
      return;
    }

    if (parsed.isBefore(moment())) {
      await interaction.editReply({
        content: `The time **${datetimeInput}** is in the past! Please select a future time.`,
      });
      return;
    }

    try {
      const option = await RaidScheduler.AddSingleSchedulingOptionToRaid(
        raidId,
        parsed.toDate()
      );

      // Auto-accept the slot for whoever suggested it — they clearly want this
      // time, so count them in without making them vote for their own option.
      // upsert keeps it idempotent if the option already existed and they'd
      // already voted (composite PK SchedulingOptionId + MemberId).
      if (option) {
        await global.client.prisma.raidAvailability.upsert({
          where: {
            SchedulingOptionId_MemberId: {
              SchedulingOptionId: option.ID,
              MemberId: interaction.user.id,
            },
          },
          create: {
            SchedulingOptionId: option.ID,
            MemberId: interaction.user.id,
          },
          update: {},
        });
      }

      // Re-send the scheduling DM to every participant so the new option shows
      // up in their voting menu — Discord won't update already-sent select menus.
      await RaidScheduler.SendSchedulingDMs(raidId);

      await interaction.editReply({
        content: `Successfully added <t:${parsed.unix()}:F> to the raid options! Participants have been sent an updated voting menu in their DMs.`,
      });

      // Notify in LFG
      const raid = await global.client.prisma.raids.findFirst({
        include: {
          RaidAttendees: true,
          RaidSchedulingOption: true,
        },
        where: { ID: raidId },
      });

      if (raid) {
        global.client.lfg
          .send({
            content: `<@${interaction.user.id}> suggested a new time for **${raid.Title}**: <t:${parsed.unix()}:F>! Check your DMs to update your vote.`,
          })
          .catch((e) =>
            log.error("Failed to send custom time suggestion to lfg:", e)
          );

        // The suggester's auto-vote may have completed consensus on this slot —
        // re-check immediately so it can be scheduled without waiting for the
        // next poll (mirrors the raidVote select handler).
        if (raid.Status === 2) {
          await RaidScheduler.scheduleRaid(raid as any);
        }
      }
    } catch (error) {
      log.error("Error adding custom scheduling option:", error);
      await interaction.editReply({
        content: "An error occurred while adding the custom time.",
      });
    }
  }
}
