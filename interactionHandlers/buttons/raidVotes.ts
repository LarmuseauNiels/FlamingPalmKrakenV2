import { RaidModule } from "../../modules/RaidModule";
import {
  ButtonInteraction,
  InteractionEditReplyOptions,
  Message,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";

export default class RaidVotesHandler implements IHandler {
  name = "raidVotes";

  async execute(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    const message: Message = await interaction.channel.messages.fetch(
      interaction.message.id
    );
    const content = message.content;
    const embed = await RaidModule.showVotes(Number(content));
    await interaction.editReply({
      embeds: [embed],
      ephemeral: true,
    } as InteractionEditReplyOptions);
  }
}
