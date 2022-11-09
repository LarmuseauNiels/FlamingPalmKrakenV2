const {
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require("discord.js");

module.exports = {
  name: "admin-santa-info",
  data: new SlashCommandBuilder()
    .setName("admin-santa-info")
    .setDescription("gets progress info of secret santa")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    if (interaction.user.id != "178435947816419328") {
      interaction.reply({
        content: "You are not allowed to use this command",
        ephemeral: true,
      });
      return;
    }
    let links = await client.prisma.sSLink.findMany({
      include: {
        SSReceiver: {
          include: { Members: true },
        },
        SSSender: {
          include: { Members: true },
        },
      },
    });
    let embed = new EmbedBuilder()
      .setColor("#FD8612")
      .setTitle(`Progress info secret santa`)
      .addFields(
        {
          name: "Read and confirmed",
          value: `${links.filter((x) => x.confirmed === true).length} out of ${
            links.length
          } confirmed`,
        },
        {
          name: "confirmed send",
          value: `${
            links.filter((x) => x.SSSender.IsSend === true).length
          } out of ${links.length} send`,
        },
        {
          name: "confirmed recieved",
          value: `${
            links.filter((x) => x.SSReceiver.IsReceived === true).length
          } out of ${links.length} received`,
        }
      )
      .setFooter({
        text: "Niels2398 FPG kraken bot",
        iconURL: "https://flamingpalm.com/images/FlamingPalmLogoSmall.png",
      })
      .setTimestamp();
    interaction.reply({ embeds: [embed], ephemeral: false });
  },
  isGuild: true,
};
