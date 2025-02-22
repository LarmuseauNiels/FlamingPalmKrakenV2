import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventEntityType,
  PermissionFlagsBits,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";

export default class CreatePartyCommand implements IHandler {
  name: string = "create-party";
  data = new SlashCommandBuilder()
    .setName("create-party")
    .setDescription("Create a party night event")
    // Although we take in a name option, per requirements the event name is fixed as "party"
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Event name (ignored - event will be named 'party')")
        .setRequired(true)
    )
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
      eventDate.setHours(20, 0, 0, 0);

      // Optionally, set an end time (here, 2 hours after the start)
      const eventEndDate = new Date(eventDate.getTime() + 2 * 60 * 60 * 1000);

      // Create the scheduled event on the guild
      const scheduledEvent = await interaction.guild.scheduledEvents.create({
        name: "Party Night",
        scheduledStartTime: eventDate,
        scheduledEndTime: eventEndDate,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: GuildScheduledEventEntityType.External,
        // For external events, entityMetadata is required (set location as desired)
        entityMetadata: { location: "Online" },
        description: "Party night event created by the bot",
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
}
