import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  User,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { IslanderView } from "../../islander/IslanderView";
import { createLogger } from "../../utils/logger";

const log = createLogger("IslandCommand");

// /island [member] — render your island (or another member's): image + status
// embed + action buttons. Creates the island on first use. See
// docs/ISLANDER_DESIGN.md §7.
export default class IslandCommand implements IHandler {
  name = "island";
  isGuild = true;
  data = new SlashCommandBuilder()
    .setName("island")
    .setDescription("View your Islander island (or another member's)")
    .addUserOption((opt) =>
      opt
        .setName("member")
        .setDescription("Whose island to view (defaults to you)")
        .setRequired(false)
    ) as SlashCommandBuilder;

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    try {
      const target: User =
        interaction.options.getUser("member") ?? interaction.user;
      const message = await IslanderView.build(
        target.id,
        target.username,
        target.id === interaction.user.id
      );
      await interaction.editReply(message);
    } catch (error) {
      log.error("Failed to render island:", error);
      await interaction.editReply({
        content: "Something went wrong loading that island. Try again shortly.",
      });
    }
  }
}
