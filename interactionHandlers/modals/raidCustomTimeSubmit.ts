import { ModalSubmitInteraction } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { RaidRuleError, RaidScheduler } from "../../modules/RaidScheduler";
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
      // Adds the slot, counts the suggester in, re-DMs everyone's voting menu,
      // tells LFG and re-checks consensus — the same path the Activity uses.
      await RaidScheduler.suggestTime(raidId, interaction.user.id, parsed.toDate());

      await interaction.editReply({
        content: `Successfully added <t:${parsed.unix()}:F> to the raid options! Participants have been sent an updated voting menu in their DMs.`,
      });
    } catch (error) {
      if (error instanceof RaidRuleError) {
        await interaction.editReply({ content: error.message });
        return;
      }
      log.error("Error adding custom scheduling option:", error);
      await interaction.editReply({
        content: "An error occurred while adding the custom time.",
      });
    }
  }
}
