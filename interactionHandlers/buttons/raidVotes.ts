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
    const raidId = Number(interaction.customId.split("_")[1]);
    const embed = await RaidModule.showVotes(raidId);
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
}
