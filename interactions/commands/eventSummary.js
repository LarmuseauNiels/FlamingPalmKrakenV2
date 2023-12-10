const {
  EmbedBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");

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

    interaction.guild.scheduledEvents.fetch().then((events) => {
      client.events = events;
      client.cachUpdated = Date.now();
      var contentText = "Upcoming events!\n";
      client.events.forEach((event) => {
        contentText += `${event.name}:\n${event.url}\n`;
      });

      channel.send({
        content: contentText
      });
      interaction.reply({
        content: `\`✅\` Event summary sent.`,
        ephemeral: true,
      });
    });
  },
};
