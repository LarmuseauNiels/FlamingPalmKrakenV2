import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventEntityType,
  PermissionFlagsBits,
  StageChannel,
  TextChannel,
  GuildTextThreadCreateOptions,
  ForumChannel,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";

export default class CreatePartyCommand implements IHandler {
  name: string = "create-party";
  data = new SlashCommandBuilder()
    .setName("create-party")
    .setDescription("Create a party night event")
    .addStringOption((option) =>
      option
        .setName("steamurl")
        .setDescription("Steam URL to extract the banner image")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ) as SlashCommandBuilder;
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
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

    try {
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
      const gameName = titleMatch[1];

      // Fetch the banner image and convert it to a base64 string
      const imageResponse = await fetch(bannerUrl);
      const buffer = Buffer.from(await imageResponse.arrayBuffer());
      const contentType =
        imageResponse.headers.get("content-type") || "image/png";
      const base64Image = `data:${contentType};base64,${buffer.toString(
        "base64"
      )}`;

      // Compute the upcoming Saturday at 8 PM
      const now = new Date();
      let daysUntilSaturday = (6 - now.getDay() + 7) % 7;
      // If today is Saturday and it's already past 8 PM, schedule for next Saturday
      if (daysUntilSaturday === 0 && now.getHours() >= 20) {
        daysUntilSaturday = 7;
      }
      const eventDate = new Date(now);
      eventDate.setDate(now.getDate() + daysUntilSaturday);
      eventDate.setHours(19, 0, 0, 0);

      // Optionally, set an end time (here, 2 hours after the start)
      const eventEndDate = new Date(eventDate.getTime() + 2 * 60 * 60 * 1000);

      //party channel ID = 1128667504428994641

      // Create a post in the forum channel
      const forumChannelId = "1063016731263643678";
      const forumChannel = await interaction.guild.channels.fetch(
        forumChannelId
      );
      if (!forumChannel || !(forumChannel instanceof TextChannel)) {
        await interaction.reply({
          content: "The specified channel is not a forum channel.",
          ephemeral: true,
        });
        return;
      }

      const post = await (forumChannel as TextChannel).threads.create({
        name: `W${this.getWeekNumber()} ${gameName}`,
        autoArchiveDuration: 10080, // 1 week
        //message: {
        //  content: steamUrl,
        //},
      });

      const postLink = `https://discord.com/channels/${interaction.guild.id}/${forumChannelId}/${post.id}`;

      // Create the scheduled event on the guild
      const scheduledEvent = await interaction.guild.scheduledEvents.create({
        name: "Party Night",
        scheduledStartTime: eventDate,
        scheduledEndTime: eventEndDate,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: GuildScheduledEventEntityType.External,
        // For external events, entityMetadata is required (set location as desired)
        entityMetadata: { location: "Online" },
        description: `Party night for ${gameName}. \r\n Join the discussion here: \r\n ${postLink}`,
        image: base64Image,
      });

      await interaction.reply({
        content: `Scheduled event "${
          scheduledEvent.name
        }" created for ${eventDate.toLocaleString()}.`,
      });
    } catch (error) {
      console.error("Error creating scheduled event: ", error);
      await interaction.reply({
        content:
          "An error occurred while creating the scheduled event. Please try again later.",
        ephemeral: true,
      });
    }
  }
  isGuild?: boolean = true;

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

    return weekNumber;
  }
}
