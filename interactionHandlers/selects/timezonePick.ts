import { StringSelectMenuInteraction } from "discord.js";
import moment from "moment-timezone";
import { IHandler } from "../../interfaces/IHandler";
import { OTHER_TIMEZONE, saveMemberTimezone } from "../../modules/TimezonePrompt";
import { buildSuggestTimeModal } from "../buttons/raidSuggestTime";
import { createLogger } from "../../utils/logger";

const log = createLogger("TimezonePick");

/**
 * The one-click timezone picker (modules/TimezonePrompt.ts).
 * customId timezonePick_set              — offered after a first sign-up/vote
 * customId timezonePick_suggest_<raidId> — asked before "Suggest Custom Time";
 *                                          opens that modal once it's saved
 */
export default class TimezonePickHandler implements IHandler {
  name = "timezonePick";

  async execute(interaction: StringSelectMenuInteraction) {
    if (!interaction.isStringSelectMenu()) return;
    const [, mode, raidId] = interaction.customId.split("_");
    const timezone = interaction.values[0];

    if (timezone === OTHER_TIMEZONE) {
      await interaction.update({
        content: "No problem — use `/set-timezone` to search every timezone." +
          (mode === "suggest" ? " Then press **Suggest Custom Time** again." : ""),
        components: [],
      });
      return;
    }

    try {
      if (!(await saveMemberTimezone(interaction.user.id, timezone))) {
        await interaction.update({ content: "That timezone isn't recognised — try `/set-timezone`.", components: [] });
        return;
      }
    } catch (err) {
      log.error("Failed to save timezone:", err);
      await interaction.update({ content: "Couldn't save your timezone. Please try `/set-timezone`.", components: [] });
      return;
    }

    if (mode === "suggest" && raidId) {
      // Straight on to what they were doing; the modal reads times in the new zone.
      await interaction.showModal(buildSuggestTimeModal(raidId));
      return;
    }

    await interaction.update({
      content: `✅ Timezone set to **${timezone}** (it's ${moment.tz(timezone).format("HH:mm")} there). Change it any time with \`/set-timezone\`.`,
      components: [],
    });
  }
}
