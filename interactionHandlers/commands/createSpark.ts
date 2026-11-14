import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventEntityType,
  ForumChannel,
} from "discord.js";
import moment from "moment-timezone";
import { IHandler } from "../../interfaces/IHandler";
import { createLogger } from "../../utils/logger";

const log = createLogger("CreateSparkCommand");

const SPARK_TIMEZONE = "Europe/Brussels";
const SPARK_DAY = 6; // Saturday
const SPARK_START_HOUR = 20;

export default class CreateSparkCommand implements IHandler {
  name: string = "create-spark";
  data = new SlashCommandBuilder()
    .setName("create-spark")
    .setDescription("Create a Saturday Spark event")
    .addStringOption((option) =>
      option
        .setName("steamurl")
        .setDescription("Steam URL to extract the banner image")
        .setRequired(true)
    ) as SlashCommandBuilder;
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      // Ensure the command is run in a guild
      if (!interaction.guild) {
        await interaction.reply({
          content: "This command can only be used in a guild.",
          ephemeral: true,
        });
        return;
      }

      // Retrieve the Steam URL from command options
      const steamUrl = interaction.options.getString("steamurl", true);

      // Fetch the HTML content from the provided Steam URL
      const response = await fetch(steamUrl);
      const html = await response.text();

      // Extract the banner image URL from the Steam page using the og:image meta tag
      const bannerRegex = /<meta property="og:image" content="(.*?)"/;
      const match = html.match(bannerRegex);
      if (!match) {
        await interaction.reply({
          content:
            "Could not extract a banner image from the provided Steam URL.",
          ephemeral: true,
        });
        return;
      }
      const bannerUrl = match[1];

      // Extract game name from Steam page
      const titleRegex = /<meta property="og:title" content="(.*?)"/;
      const titleMatch = html.match(titleRegex);
      if (!titleMatch) {
        await interaction.reply({
          content:
            "Could not extract the game name from the provided Steam URL.",
          ephemeral: true,
        });
        return;
      }
      // Steam's og:title is "<game> on Steam"; keep just the game name.
      const gameName = titleMatch[1].replace(/\s+on Steam$/i, "").trim();

      // Fetch the banner image and convert it to a base64 string
      const imageResponse = await fetch(bannerUrl);
      const buffer = Buffer.from(await imageResponse.arrayBuffer());
      const contentType =
        imageResponse.headers.get("content-type") || "image/png";
      const base64Image = `data:${contentType};base64,${buffer.toString(
        "base64"
      )}`;

      const eventDate = this.getNextSparkStart();

      // Optionally, set an end time (here, 2 hours after the start)
      const eventEndDate = new Date(eventDate.getTime() + 2 * 60 * 60 * 1000);

      // Create a post in the forum channel
      const forumChannelId = "1128667504428994641"; // Saturday Spark forum channel ID
      const forumChannel = await interaction.guild.channels.fetch(
        forumChannelId
      );
      if (!forumChannel || !(forumChannel instanceof ForumChannel)) {
        await interaction.reply({
          content: "The specified channel is not a forum channel.",
          ephemeral: true,
        });
        return;
      }

      const post = await (forumChannel as ForumChannel).threads.create({
        name: `W${this.getWeekNumber(eventDate)} ${gameName}`,
        autoArchiveDuration: 10080, // 1 week
        message: {
          content: steamUrl,
        },
      });

      const postLink = `https://discord.com/channels/${interaction.guild.id}/${forumChannelId}/${post.id}`;

      // Create the scheduled event on the guild
      const scheduledEvent = await interaction.guild.scheduledEvents.create({
        name: `Spark: ${gameName}`,
        scheduledStartTime: eventDate,
        scheduledEndTime: eventEndDate,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: GuildScheduledEventEntityType.External,
        // For external events, entityMetadata is required (set location as desired)
        entityMetadata: { location: "Online" },
        description: `${gameName}\nJoin the discussion here:\n ${postLink}`,
        image: base64Image,
      });

      await interaction.reply({
        content: `Scheduled event "${scheduledEvent.name}" created for <t:${Math.floor(
          eventDate.getTime() / 1000
        )}:F>.`,
      });
    } catch (error) {
      log.error("Error creating scheduled event:", error);
      await interaction.reply({
        content: "An error occurred while creating the scheduled event.",
        ephemeral: true,
      });
    }
  }
  isGuild?: boolean = true;

  // The upcoming Spark slot in Brussels time, so it stays at the same wall-clock
  // hour across DST changes whatever timezone the server runs in. Once this
  // week's start has passed, it rolls over to next week.
  private getNextSparkStart(now: Date = new Date()): Date {
    const current = moment.tz(now, SPARK_TIMEZONE);
    const start = current
      .clone()
      .day(SPARK_DAY)
      .hour(SPARK_START_HOUR)
      .startOf("hour");
    if (!start.isAfter(current)) {
      start.add(7, "days");
    }
    return start.toDate();
  }

  private getWeekNumber(date: Date = new Date()): number {
    // Copy date to prevent modification
    const target = new Date(date.valueOf());

    // ISO week date weeks start on Monday, so correct the day number
    const dayNr = (date.getDay() + 6) % 7;

    // Set the target to the Thursday of the current week
    target.setDate(target.getDate() - dayNr + 3);

    // Get first Thursday of the year
    const firstThursday = new Date(target.getFullYear(), 0, 1);
    if (firstThursday.getDay() !== 4) {
      firstThursday.setMonth(0, 1 + ((4 - firstThursday.getDay() + 7) % 7));
    }

    // Get week number: Calculate full weeks to Thursday
    const weekNumber =
      1 +
      Math.ceil((target.getTime() - firstThursday.getTime()) / 86400000 / 7);

    return weekNumber - 1;
  }
}
