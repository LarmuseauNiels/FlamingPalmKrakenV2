import { SlashCommandBuilder } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { createLogger } from "../../utils/logger";
import * as moment from "moment-timezone";

const log = createLogger("TimestampCommand");

const FORMAT_OPTIONS = [
  { name: "Short time (9:41 PM)", value: "t" },
  { name: "Long time (9:41:30 PM)", value: "T" },
  { name: "Short date (30/06/2021)", value: "d" },
  { name: "Long date (30 June 2021)", value: "D" },
  { name: "Short date/time (30 June 2021 9:41 PM)", value: "f" },
  { name: "Long date/time (Wednesday, 30 June 2021 9:41 PM)", value: "F" },
  { name: "Relative (2 hours ago)", value: "R" },
];

// DD/MM/YYYY is the only date convention used — no MM/DD/YYYY ambiguity.
// AM/PM variants cover both uppercase (6:30PM) and lowercase (6:30pm),
// with and without a separating space.
// Year-less formats (DD/MM, MMMM D, D MMMM) default to the current year via moment.
const PARSE_FORMATS = [
  // Full date+time with year
  "YYYY-MM-DD HH:mm",
  "YYYY-MM-DD H:mm",
  "YYYY-MM-DD hh:mm A",
  "YYYY-MM-DD hh:mma",
  "YYYY-MM-DD h:mm A",
  "YYYY-MM-DD h:mma",
  "DD/MM/YYYY HH:mm",
  "DD/MM/YYYY H:mm",
  "DD/MM/YYYY hh:mm A",
  "DD/MM/YYYY hh:mma",
  "DD/MM/YYYY h:mm A",
  "DD/MM/YYYY h:mma",
  "MMMM D YYYY hh:mm A",
  "MMMM D YYYY hh:mma",
  "MMMM D YYYY h:mm A",
  "MMMM D YYYY h:mma",
  "MMMM D YYYY HH:mm",
  "D MMMM YYYY HH:mm",
  // Date-only with year
  "YYYY-MM-DD",
  "DD/MM/YYYY",
  // Date+time without year (defaults to current year)
  "DD/MM HH:mm",
  "DD/MM H:mm",
  "DD/MM hh:mm A",
  "DD/MM hh:mma",
  "DD/MM h:mm A",
  "DD/MM h:mma",
  "MMMM D HH:mm",
  "MMMM D H:mm",
  "MMMM D hh:mm A",
  "MMMM D hh:mma",
  "MMMM D h:mm A",
  "MMMM D h:mma",
  "D MMMM HH:mm",
  "D MMMM H:mm",
  "D MMMM hh:mm A",
  "D MMMM hh:mma",
  "D MMMM h:mm A",
  "D MMMM h:mma",
  // Date-only without year (defaults to current year)
  "DD/MM",
  "MMMM D",
  "D MMMM",
  // Time-only (defaults to today)
  "HH:mm",
  "H:mm",
  "hh:mm A",
  "hh:mma",
  "h:mm A",
  "h:mma",
];

export default class TimestampCommand implements IHandler {
  name = "timestamp";
  isGuild = false;
  data = new SlashCommandBuilder()
    .setName("timestamp")
    .setDescription(
      "Generate a Discord timestamp using your configured timezone."
    )
    .addStringOption((option) =>
      option
        .setName("datetime")
        .setDescription(
          'Date and/or time to convert, e.g. "15/03 18:30", "15/03/2026 18:30", "18:30", "March 15 6:30pm"'
        )
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("format")
        .setDescription("Discord timestamp display style (default: Long date/time)")
        .setRequired(false)
        .addChoices(...FORMAT_OPTIONS)
    ) as SlashCommandBuilder;

  async execute(interaction: any): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const datetimeInput = interaction.options.getString("datetime");
    const format = interaction.options.getString("format") ?? "F";

    // Look up the member's timezone
    let timezone = "UTC";
    let timezoneWasSet = false;
    try {
      const member = await global.client.prisma.members.findUnique({
        where: { ID: interaction.user.id },
        select: { Timezone: true },
      });
      if (member?.Timezone) {
        timezone = member.Timezone;
        timezoneWasSet = true;
      }
    } catch (error) {
      log.error("Failed to fetch member timezone", error);
    }

    const parsed = moment.tz(datetimeInput, PARSE_FORMATS, true, timezone);

    if (!parsed.isValid()) {
      await interaction.editReply({
        content: [
          `Could not parse **${datetimeInput}** as a date/time.`,
          `Accepted formats: \`DD/MM HH:mm\`, \`DD/MM/YYYY HH:mm\`, \`HH:mm\`, \`March 15 6:30pm\`, etc. Year defaults to current year if omitted.`,
          `Your configured timezone is **${timezone}**. Use \`/set-timezone\` to change it.`,
        ].join("\n"),
      });
      return;
    }

    const unixSeconds = parsed.unix();
    const interpretedAs = parsed.format("DD/MM/YYYY HH:mm");
    const tag = `<t:${unixSeconds}:${format}>`;

    const allFormats = FORMAT_OPTIONS.map(
      (f) => `\`<t:${unixSeconds}:${f.value}>\` → <t:${unixSeconds}:${f.value}>`
    ).join("\n");

    const timezoneNote = timezoneWasSet
      ? `Timezone: **${timezone}**`
      : `Timezone: **UTC** *(no timezone set — use \`/set-timezone\` to configure yours)*`;

    await interaction.editReply({
      content: [
        `**Timestamp for** \`${datetimeInput}\``,
        `Interpreted as: \`${interpretedAs}\` | ${timezoneNote}`,
        "",
        `Selected format: ${tag}`,
        `Copy: \`${tag}\``,
        "",
        "**All formats:**",
        allFormats,
      ].join("\n"),
    });
  }
}
