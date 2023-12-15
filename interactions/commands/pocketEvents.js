const {
  SlashCommandBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} = require("discord.js");

module.exports = {
  name: "pocket-events",
  data: new SlashCommandBuilder()
    .setName("pocket-events")
    .setDescription("See all the available pocket party events!"),
  isGuild: true,
  async execute(interaction) {
    const events = await globalThis.client.prisma.pocketEvents.findMany({
      where: { Status: 1 },
    });

    if (events.length === 0) {
      interaction.reply({
        content:
          "There are no pocket party events at the moment, consider creating one!",
        ephemeral: true,
      });
      return;
    }

    // make an embed with all the events
    const embed = new EmbedBuilder()
      .setColor("#FD8612")
      .setTitle("Pocket Party Events")
      .setDescription("All the available pocket party events!")
      .setTimestamp()
      .setFooter({
        text: "Flamingpalm pocket party events",
        iconURL:
          "https://flamingpalm.com/assets/images/logo/FlamingPalmLogoSmall.png",
      });

    const select = new StringSelectMenuBuilder()
      .setCustomId("event-signup")
      .setPlaceholder("Select event to sign up");

    events.forEach((event) => {
      embed.addFields({
        name: event.Title,
        value: `Min Players: ${event.MinPlayers}`,
        inline: true,
      });
      select.addOptions({
        label: event.Title,
        value: event.ID.toString(),
      });
    });

    const row = new ActionRowBuilder().addComponents(select);

    interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
    });
  },
};
