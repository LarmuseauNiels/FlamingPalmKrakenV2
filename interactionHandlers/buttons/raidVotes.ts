import { RaidModule } from "../../modules/RaidModule";
import {
  ButtonInteraction,
  InteractionEditReplyOptions,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";

export default class RaidVotesHandler implements IHandler {
  name = "raidVotes";

  async execute(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    let raidId = Number(interaction.customId.split("_")[1]);
    // Older scheduling messages used a static "raidVotes" customId without the
    // raid ID. Recover it from the sibling vote select menu (raidVote_<id>).
    if (isNaN(raidId)) {
      raidId = this.findRaidIdFromComponents(interaction);
    }
    const embed = isNaN(raidId)
      ? null
      : await RaidModule.showVotes(raidId);
    if (!embed) {
      await interaction.editReply({
        content: "Sorry, I couldn't find this raid's scheduling votes.",
      } as InteractionEditReplyOptions);
      return;
    }
    await interaction.editReply({
      embeds: [embed],
      ephemeral: true,
    } as InteractionEditReplyOptions);
  }

  // Scans the message's components for the vote select menu (customId
  // "raidVote_<id>") and extracts the raid ID. Returns NaN if not found.
  private findRaidIdFromComponents(interaction: ButtonInteraction): number {
    for (const row of interaction.message.components ?? []) {
      for (const component of (row as any).components ?? []) {
        const customId: string | undefined = component.customId;
        if (customId && customId.startsWith("raidVote_")) {
          return Number(customId.split("_")[1]);
        }
      }
    }
    return NaN;
  }
}
