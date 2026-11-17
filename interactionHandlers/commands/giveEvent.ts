import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import moment from "moment-timezone";
import { IHandler } from "../../interfaces/IHandler";
import { respondWithManualAchievements } from "../../modules/AchievementAutocomplete";
import { createLogger } from "../../utils/logger";

const log = createLogger("GiveEventCommand");

const EVENT_TIMEZONE = "Europe/Brussels";
/** Discord select menus hold at most 25 options. */
const MAX_SELECT_OPTIONS = 25;
const SELECT_TIMEOUT_MS = 5 * 60 * 1000;

export default class GiveEventCommand implements IHandler {
  name = "give-event";
  isGuild = true;
  data = new SlashCommandBuilder()
    .setName("give-event")
    .setDescription("give event to users")
    .addIntegerOption((option) =>
      option
        .setName("time")
        .setDescription("The hour the event was at 24h format brussels time")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("daysago")
        .setDescription("number of days ago")
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
    const achievement = parseInt(interaction.options.getString("achievement", true), 10);
    const description = interaction.options.getString("description") ?? undefined;
    const hour = interaction.options.getInteger("time", true);
    const daysAgo = interaction.options.getInteger("daysago", true);
    if (!Number.isInteger(achievement)) {
      await interaction.reply({ ephemeral: true, content: "Pick an achievement from the list." });
      return;
    }

    // The hour is Brussels time on that day. Converting it to a UTC range (and
    // not "hour minus today's offset") keeps 00:00 from becoming hour -1 and
    // respects daylight saving on the event's own date.
    const start = moment.tz(EVENT_TIMEZONE).subtract(daysAgo, "days").startOf("day").hour(hour);
    const end = start.clone().add(1, "hour");
    const results = await globalThis.client.prisma.$queryRaw<{ ID: string; DisplayName: string | null }[]>`
      select distinct M.ID, M.DisplayName
      from VoiceConnected join Members M on M.ID = VoiceConnected.ID
      where TimeStamp >= ${start.toDate()} and TimeStamp < ${end.toDate()}
      order by M.DisplayName
      limit 26`; // MAX_SELECT_OPTIONS + 1, as a literal: one extra row tells us the list was cut
    log.debug("Voice presence query results:", results);
    if (results.length === 0) {
      await interaction.reply({ ephemeral: true, content: `Sorry no users found online at that time` });
      return;
    }

    // A select menu holds at most 25 options; more used to throw.
    const shown = results.slice(0, MAX_SELECT_OPTIONS);
    const nameOf = (u: { ID: string; DisplayName: string | null }) => u.DisplayName?.trim() || u.ID;
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`giveAchievement-${achievement}`)
        .setPlaceholder("Select users")
        .addOptions(
          shown.map((u) => ({
            label: nameOf(u).slice(0, 100),
            description: `Give ${nameOf(u)} the achievement`.slice(0, 100),
            value: u.ID,
          }))
        )
    );

    const truncated = results.length > MAX_SELECT_OPTIONS;
    const message = await interaction.reply({
      ephemeral: false,
      content:
        `Selecting the people will instantly grant them the event` +
        (truncated ? `\n(Only the first ${MAX_SELECT_OPTIONS} people are listed.)` : ""),
      components: [row],
    });

    const commandUserId = interaction.user.id;
    const collector = message.createMessageComponentCollector({
      filter: (i) => i.customId === `giveAchievement-${achievement}`,
      time: SELECT_TIMEOUT_MS,
    });

    collector.on("collect", async (selection) => {
      if (!selection.isStringSelectMenu()) return;
      if (selection.user.id !== commandUserId) {
        await selection.reply({ ephemeral: true, content: `You can't give achievements` });
        return;
      }
      const selectedId = selection.values[0];
      await global.client.achievementsModule.GiveAchievement(selectedId, achievement, selection.user.id, description);
      const selected = shown.find((u) => u.ID === selectedId);
      await selection.reply({
        ephemeral: false,
        content: `gave achievement to ${selected ? nameOf(selected) : selectedId}`,
      });
    });
  }
  async autocomplete(interaction: AutocompleteInteraction) {
    await respondWithManualAchievements(interaction);
  }
}
