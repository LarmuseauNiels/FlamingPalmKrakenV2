import { SlashCommandBuilder } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { createLogger } from "../../utils/logger";

const log = createLogger("ProfileCommand");

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
        interaction
          .editReply({ files: [profile] })
          .catch((err) => log.error("Failed to edit reply with profile:", err));
      })
      .catch((err) => {
        log.error("Failed to get profile:", err);
        interaction
          .editReply({ content: "Failed to load profile." })
          .catch((e) => log.error("Failed to reply with error:", e));
      });
  }
}
