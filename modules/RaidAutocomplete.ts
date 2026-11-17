import { AutocompleteInteraction } from "discord.js";
import { RaidEmbeds } from "./RaidEmbeds";

/** Discord rejects an autocomplete response with more than 25 choices. */
const MAX_AUTOCOMPLETE_CHOICES = 25;
/** Raids.Status of a custom raid (/create-custom-raid) that isn't scheduling yet. */
export const CUSTOM_RAID_STATUS = 5;

/**
 * Suggests the caller's own custom raids for a `raid` integer option. Shared
 * by the cr-* commands, which each had their own copy that could exceed 25
 * choices, crashed on an untitled raid and sent the ID as a string.
 */
export async function respondWithOwnCustomRaids(interaction: AutocompleteInteraction): Promise<void> {
  const raids = await global.client.prisma.raids.findMany({
    where: { Status: CUSTOM_RAID_STATUS, Creator: interaction.user.id },
    select: { ID: true, Title: true },
    orderBy: { ID: "desc" },
  });
  const query = String(interaction.options.getFocused()).toLowerCase();
  const choices = raids
    .map((raid) => ({ name: RaidEmbeds.title(raid), value: raid.ID }))
    .filter((choice) => choice.name.toLowerCase().includes(query))
    .slice(0, MAX_AUTOCOMPLETE_CHOICES);
  await interaction.respond(choices);
}
