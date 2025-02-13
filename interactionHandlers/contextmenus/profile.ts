import {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  Interaction,
  InteractionEditReplyOptions,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";

export default class ProfileHandler implements IHandler {
  name = "profile";
  isGuild = true;

  data = new ContextMenuCommandBuilder()
    .setName("profile")
    .setType(ApplicationCommandType.User) as ContextMenuCommandBuilder;

  async execute(interaction: Interaction) {
    if (!interaction.isUserContextMenuCommand()) return;

    await interaction.deferReply({ ephemeral: true });
    const profile = await global.client.achievementsModule.GetProfile(
      interaction.targetId
    );
    interaction.editReply({
      files: [profile],
      ephemeral: true,
    } as InteractionEditReplyOptions);
  }
}
