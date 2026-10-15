import { ButtonInteraction } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { RaidScheduler } from "../../modules/RaidScheduler";

/**
 * "Vote here instead" on a new-time notice: answers with a fresh DM voting
 * menu for members who'd rather not open the raid board.
 */
export default class RaidResendMenuHandler implements IHandler {
  name = "raidResendMenu";

  async execute(interaction: ButtonInteraction) {
    const raidId = parseInt(interaction.customId.split("_")[1]);
    const raid = isNaN(raidId) ? null : await RaidScheduler.getRaid(raidId);
    if (raid == null) {
      await interaction.reply({ content: "This raid isn't picking a time anymore.", ephemeral: true });
      return;
    }
    if (!raid.RaidAttendees.some((a) => a.MemberId === interaction.user.id)) {
      await interaction.reply({ content: "You're not signed up for this raid anymore.", ephemeral: true });
      return;
    }
    await interaction.reply(await RaidScheduler.buildSchedulingDM(raid, interaction.user.id) as any);
  }
}
