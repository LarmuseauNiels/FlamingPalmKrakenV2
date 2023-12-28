const {
  SlashCommandBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} = require("discord.js");

module.exports = {
  name: "raids",
  data: new SlashCommandBuilder()
    .setName("raids")
    .setDescription("See all the available pocket party events!"),
  isGuild: true,
  async execute(interaction) {
    const raids = await globalThis.client.prisma.raids.findMany({
      include: { RaidAttendees: true },
      where: { Status: 1 },
    });

    if (raids.length === 0) {
      interaction.reply({
        content:
          "There are no raids at the moment, consider creating one!",
        ephemeral: true,
      });
      return;
    }

    // make an embed with all the events
    const embed = new EmbedBuilder()
      .setColor("#FD8612")
      .setTitle("Party Raids")
      .setDescription("All the available party raids!")
      .setTimestamp()
      .setFooter({
        text: "Flamingpalm party raids",
        iconURL:
          "https://flamingpalm.com/assets/images/logo/FlamingPalmLogoSmall.png",
      });

    const select = new StringSelectMenuBuilder()
      .setCustomId("raidsignup")
      .setPlaceholder("Select a raid to sign up");

    raids.forEach((raid) => {
      let attending = raid.RaidAttendees.some(r => r.MemberId === interaction.user.id);
      embed.addFields({
        name: raid.Title,
        value: `Attendees: ${raid.RaidAttendees.length}/${raid.MinPlayers} Attending: ${attending? '✅' : '❌'}`,
        inline: false,
      });
      select.addOptions({
        label: raid.Title,
        value: raid.ID.toString(),
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
