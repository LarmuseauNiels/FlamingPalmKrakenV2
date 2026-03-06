import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { RaidModule } from "../../modules/RaidModule";
import { createLogger } from "../../utils/logger";

const log = createLogger("EventSummary");

export default class EventSummaryHandler implements IHandler {
  name = "event-summary";
  data = new SlashCommandBuilder()
    .setName("event-summary")
    .setDescription("Send summary of upcoming events.")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to send summary message to.")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ) as SlashCommandBuilder;
  isGuild = true;
  async execute(interaction) {
    const channel = interaction.guild.channels.cache.get(
      interaction.options.get("channel")?.value || interaction.channel.id
    );

    if (!channel) {
      return interaction.reply({
        content: `\`❌\` Invalid channel.`,
        ephemeral: true,
      });
    }

    interaction.guild.scheduledEvents
      .fetch()
      .then(async (events) => {
        events = events.sort((e) => e.scheduledStartTimestamp).reverse();
        global.client.events = events;
        var contentText = "Upcoming events!\n";

        let sortedEvents = global.client.events.sort((a, b) => {
          return a.scheduledStartTimestamp - b.scheduledStartTimestamp;
        });
        sortedEvents.forEach((event) => {
          contentText += `${event.url}\n`;
        });

        let raids = await RaidModule.getRaidMessage();
        channel
          .send({
            content: contentText,
            embeds: raids.embeds,
            components: raids.components,
          })
          .catch((err) => log.error("Failed to send event summary:", err));
        interaction
          .reply({ content: `\`✅\` Event summary sent.`, ephemeral: true })
          .catch((err) => log.error("Failed to reply:", err));
      })
      .catch((err) => {
        log.error("Failed to fetch scheduled events:", err);
        interaction
          .reply({ content: `\`❌\` Failed to fetch events.`, ephemeral: true })
          .catch((e) => log.error("Failed to reply with error:", e));
      });
  }
}
