import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { respondWithManualAchievements } from "../../modules/AchievementAutocomplete";
import { createLogger } from "../../utils/logger";

const log = createLogger("GiveAchievementCommand");

export default class GiveAchievementCommand implements IHandler {
  name = "give-achievement";
  data = new SlashCommandBuilder()
    .setName("give-achievement")
    .setDescription("give achievement to users")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to give the achievement to")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("achievement")
        .setDescription("Achievement to give")
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription(
          "Optional description for this instance of the achievement"
        )
        .setRequired(false)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ) as SlashCommandBuilder;
  async execute(interaction: ChatInputCommandInteraction) {
    const user = interaction.options.getUser("user", true);
    const achievement = parseInt(interaction.options.getString("achievement", true), 10);
    const description = interaction.options.getString("description") ?? undefined;
    if (!Number.isInteger(achievement)) {
      await interaction.reply({ ephemeral: true, content: "Pick an achievement from the list." });
      return;
    }
    log.debug("Giving achievement:", achievement, interaction.options.getString("achievement"));
    await global.client.achievementsModule.GiveAchievement(
      user.id,
      achievement,
      interaction.user.id,
      description
    );
    await interaction.reply({
      ephemeral: true,
      content: `gave ${achievement} to ${user.username}`,
    });
  }
  async autocomplete(interaction: AutocompleteInteraction) {
    await respondWithManualAchievements(interaction);
  }
  // Was `isGuild: true;` — a type annotation, so it was never set. (Nothing
  // reads isGuild today; fixed for consistency with the other commands.)
  isGuild = true;
}
