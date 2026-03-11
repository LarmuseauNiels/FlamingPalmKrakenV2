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
          'Date and/or time to convert, e.g. "2026-03-15 18:30", "18:30", "March 15 2026 6:30pm"'
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
    try {
      const member = await global.client.prisma.members.findUnique({
        where: { ID: interaction.user.id },
        select: { Timezone: true },
      });
      if (member?.Timezone) {
        timezone = member.Timezone;
      }
    } catch (error) {
      log.error("Failed to fetch member timezone", error);
    }

    // Parse the input — try several common formats
    const PARSE_FORMATS = [
      "YYYY-MM-DD HH:mm",
      "YYYY-MM-DD H:mm",
      "YYYY-MM-DD hh:mmA",
      "YYYY-MM-DD h:mmA",
      "DD/MM/YYYY HH:mm",
      "MM/DD/YYYY HH:mm",
      "MMMM D YYYY h:mmA",
      "MMMM D YYYY HH:mm",
      "D MMMM YYYY HH:mm",
      "YYYY-MM-DD",
      "HH:mm",
      "H:mm",
      "h:mmA",
    ];

    const parsed = moment.tz(datetimeInput, PARSE_FORMATS, true, timezone);

    if (!parsed.isValid()) {
      await interaction.editReply({
        content: [
          `Could not parse **${datetimeInput}** as a date/time.`,
          `Accepted formats: \`YYYY-MM-DD HH:mm\`, \`HH:mm\`, \`March 15 2026 6:30pm\`, etc.`,
          `Your configured timezone is **${timezone}**. Use \`/set-timezone\` to change it.`,
        ].join("\n"),
      });
      return;
    }

    const unixSeconds = parsed.unix();

    // Build the Discord timestamp tag and a copyable code block
    const tag = `<t:${unixSeconds}:${format}>`;

    const allFormats = FORMAT_OPTIONS.map(
      (f) => `\`<t:${unixSeconds}:${f.value}>\` → <t:${unixSeconds}:${f.value}>`
    ).join("\n");

    await interaction.editReply({
      content: [
        `**Timestamp for** \`${datetimeInput}\` **in ${timezone}**`,
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
