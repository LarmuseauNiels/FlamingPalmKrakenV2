import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { createLogger } from "../../utils/logger";

const log = createLogger("ProfileCommand");

export default class ProfileCommand implements IHandler {
  isGuild = true;
  name = "profile";
  data = new SlashCommandBuilder()
    .setName("profile")
    .setDescription("show your profile") as SlashCommandBuilder;

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: false });
    try {
      const profile = await global.client.achievementsModule.GetProfile(interaction.user.id);
      await interaction.editReply({ files: [profile] });
    } catch (err) {
      log.error("Failed to get profile:", err);
      await interaction.editReply({ content: "Failed to load profile." });
    }
  }
}
