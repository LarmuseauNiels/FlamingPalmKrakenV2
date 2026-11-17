import { AutocompleteInteraction } from "discord.js";

/** Discord rejects an autocomplete response with more than 25 choices. */
const MAX_AUTOCOMPLETE_CHOICES = 25;

/** Suggests the manually awarded achievements; shared by give-achievement and give-event. */
export async function respondWithManualAchievements(interaction: AutocompleteInteraction): Promise<void> {
  const achievements = await global.client.achievementsModule.GetManualAchievements();
  const query = String(interaction.options.getFocused()).toLowerCase();
  const choices = achievements
    .map((achievement) => ({ name: achievement.Name?.trim() || `Achievement ${achievement.ID}`, value: achievement.ID.toString() }))
    .filter((choice) => choice.name.toLowerCase().includes(query))
    .slice(0, MAX_AUTOCOMPLETE_CHOICES);
  await interaction.respond(choices);
}
