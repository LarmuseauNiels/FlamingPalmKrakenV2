import {
  AutocompleteInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { RaidEmbeds } from "../../modules/RaidEmbeds";

const EMBED_FIELD_MAX_CHARS = 1024;

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(0, maxChars - 1) + "…" : text;
}
import { respondWithOwnCustomRaids } from "../../modules/RaidAutocomplete";

export default class CrInfoCommand implements IHandler {
  name = "cr-info";
  data = new SlashCommandBuilder()
    .setName("cr-info")
    .setDescription("Get information about a custom raid")
    .addIntegerOption((option) =>
      option
        .setName("raid")
        .setDescription("The raid to get information about")
        .setAutocomplete(true)
        .setRequired(true)
    ) as SlashCommandBuilder;
  async execute(interaction: ChatInputCommandInteraction) {
    const raidId = interaction.options.getInteger("raid", true);
    const raid = await global.client.prisma.raids.findUnique({
      where: {
        ID: raidId,
      },
      select: {
        ID: true,
        Title: true,
        MinPlayers: true,
        Status: true,
        Creator: true,
        RaidAttendees: {
          select: {
            MemberId: true,
            Members: {
              select: {
                DisplayName: true,
              },
            },
          },
        },
        RaidSchedulingOption: {
          select: {
            ID: true,
            Option: true,
            Timestamp: true,
          },
        },
      },
    });
    if (!raid) {
      await interaction.reply({ content: `Raid ${raidId} not found.`, ephemeral: true });
      return;
    }
    // Embed field values are capped at 1024 characters.
    const attendees = truncate(
      raid.RaidAttendees.map((attendee) => attendee.Members.DisplayName ?? attendee.MemberId).join(","),
      EMBED_FIELD_MAX_CHARS
    );
    const scheduleOptions = truncate(
      raid.RaidSchedulingOption.map((option) => `${option.Option}:${option.Timestamp}`).join(","),
      EMBED_FIELD_MAX_CHARS
    );

    const embed = new EmbedBuilder()
      .setColor("#FD8612")
      .setTitle(RaidEmbeds.title(raid))
      .addFields(
        {
          name: "Minimum Players",
          value: raid.MinPlayers ? raid.MinPlayers.toString() : "N/A", // Use "N/A" if raid.MinPlayers is undefined, null or empty
          inline: true,
        },
        {
          name: "Status",
          value: raid.Status ? raid.Status.toString() : "N/A", // Use "N/A" if raid.Status is undefined, null or empty
          inline: true,
        },
        {
          name: "Attendees",
          value: attendees || "N/A", // Use "N/A" if attendees is undefined, null or empty
          inline: false,
        },
        {
          name: "Scheduling Options",
          value: scheduleOptions || "N/A", // Use "N/A" if scheduleOptions is undefined, null or empty
          inline: false,
        }
      );
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  async autocomplete(interaction: AutocompleteInteraction) {
    await respondWithOwnCustomRaids(interaction);
  }
}
