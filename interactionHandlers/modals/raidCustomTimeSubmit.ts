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
      await RaidScheduler.AddSingleSchedulingOptionToRaid(raidId, parsed.toDate());

      await interaction.editReply({
        content: `Successfully added <t:${parsed.unix()}:F> to the raid options! Participants will see it next time they open the voting menu.`,
      });

      // Notify in LFG
      const raid = await global.client.prisma.raids.findUnique({
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
      }
    } catch (error) {
      log.error("Error adding custom scheduling option:", error);
      await interaction.editReply({
        content: "An error occurred while adding the custom time.",
      });
    }
  }
}
