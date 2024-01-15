const {
  EmbedBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const { RaidModule } = require("../../islander/RaidModule");

module.exports = {
  name: "event-summary",
  data: new SlashCommandBuilder()
    .setName("event-summary")
    .setDescription("Send summary of upcoming events.")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to send summary message to.")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  isGuild: true,
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

    interaction.guild.scheduledEvents.fetch().then(async (events) => {
      events = events.sort((e) => e.scheduledStartTimestamp).reverse();
      client.events = events;
      client.cachUpdated = Date.now();
      var contentText = "Upcoming events!\n";

      let sortedEvents = client.events.sort((a, b) => {
        return a.scheduledStartTimestamp - b.scheduledStartTimestamp;
      });
      sortedEvents.forEach((event) => {
        contentText += `${event.url}\n`;
      });

      let raids = await RaidModule.getRaidMessage();
      channel.send({
        content: contentText,
        embeds: raids.embeds,
        components: raids.components,
      });
      interaction.reply({
        content: `\`✅\` Event summary sent.`,
        ephemeral: true,
      });
    });
  },
};
