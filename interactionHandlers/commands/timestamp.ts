import { SlashCommandBuilder } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { createLogger } from "../../utils/logger";
import { TimeParser } from "../../utils/TimeParser";
import moment from "moment-timezone";

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

    const parsed = await TimeParser.parse(datetimeInput, timezone);

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
