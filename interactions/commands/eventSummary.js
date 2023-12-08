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
      const eventEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("Upcoming events")
        .setAuthor({
          name: "Flaming palm",
          iconURL:
            "https://flamingpalm.com/assets/images/logo/FlamingPalmLogoSmall.png",
        })
        .setDescription("Upcoming events");
      let contentText = "";
      for (let event of events) {
        console.log(event);
        let actualevent = event[0];
        let eventText =
          actualevent.name + actualevent.description
            ? actualevent.description
            : "";
        let test = {
          name: "Event: " + actualevent.name,
          value: eventText,
          inline: false,
        };
        contentText += `${actualevent.url}\n`;
      }
      eventEmbed.setTimestamp(Date.now());

      channel.send({
        content: contentText,
        embeds: [eventEmbed],
      });
      interaction.reply({
        content: `\`✅\` Event summary sent.`,
        ephemeral: true,
      });
    });
  },
};
