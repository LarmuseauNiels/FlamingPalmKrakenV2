import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { IslanderModule } from "../../islander/IslanderModule";
import { createLogger } from "../../utils/logger";

const log = createLogger("IslandRushCommand");

// /rush — instantly finish your in-progress build by paying Currency.
export default class IslandRushCommand implements IHandler {
  name = "rush";
  isGuild = true;
  data = new SlashCommandBuilder()
    .setName("rush")
    .setDescription("Instantly finish your current build for Currency") as SlashCommandBuilder;

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const res = await IslanderModule.rush(interaction.user.id);
      await interaction.editReply({ content: res.message });
    } catch (error) {
      log.error("rush failed:", error);
      await interaction.editReply({ content: "Something went wrong." });
    }
  }
}
