import { SlashCommandBuilder } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";

export default class ProfileCommand implements IHandler {
  isGuild = true;
  name = "profile";
  data = new SlashCommandBuilder()
    .setName("profile")
    .setDescription("show your profile") as SlashCommandBuilder;

  async execute(interaction: any): Promise<void> {
    await interaction.deferReply({ ephemeral: false });
    global.client.achievementsModule
      .GetProfile(interaction.user.id)
      .then((profile: any) => {
        interaction.editReply({ files: [profile] });
      });
  }
}
