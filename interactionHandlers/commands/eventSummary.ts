import { ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { RaidModule } from "../../modules/RaidModule";

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
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      await interaction.reply({ content: `\`❌\` This only works in the server.`, ephemeral: true });
      return;
    }
    const channelId = interaction.options.getChannel("channel")?.id ?? interaction.channelId;
    const channel = interaction.guild.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) {
      await interaction.reply({ content: `\`❌\` Invalid channel.`, ephemeral: true });
      return;
    }

    const events = await interaction.guild.scheduledEvents.fetch();
    // The old code first ran a sort with a one-argument comparator (a no-op)
    // and reversed it; only this ascending sort ever mattered.
    global.client.events = events.sort((a, b) => (a.scheduledStartTimestamp ?? 0) - (b.scheduledStartTimestamp ?? 0));
    let contentText = "Upcoming events!\n";
    global.client.events.forEach((event) => {
      contentText += `${event.url}\n`;
    });

    const raids = await RaidModule.getRaidMessage();
    await channel.send({ content: contentText, embeds: raids.embeds, components: raids.components });
    await interaction.reply({ content: `\`✅\` Event summary sent.`, ephemeral: true });
  }
}
