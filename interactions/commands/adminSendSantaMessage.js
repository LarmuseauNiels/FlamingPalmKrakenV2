const {
  EmbedBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");
//const { EmbedBuilder,ActionRowBuilder, ButtonBuilder } = require('discord.js');

module.exports = {
  name: "admin-send-santa-message",
  data: new SlashCommandBuilder()
    .setName("admin-send-santa-message")
    .setDescription("send messages to secret santa recipients")
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("The message to send")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    if (interaction.user.id != "178435947816419328") {
      interaction.reply({
        content: "You are not allowed to use this command",
        ephemeral: true,
      });
      return;
    }
    const message = interaction.options.getString("message");
    let links = await client.prisma.sSLink.findMany({
      include: {
        SSReceiver: {
          include: { Members: true },
        },
      },
    });
    links.forEach((link) => {
      client.users.fetch(link.SenderID, false).then((user) => {
        let embed = new EmbedBuilder()
          .setColor("#FD8612")
          .setTitle(`Organizational message`)
          .addFields({ name: "message", value: message })
          .setFooter({
            text: "Niels2398 FPG kraken bot",
            iconURL: "https://flamingpalm.com/images/FlamingPalmLogoSmall.png",
          })
          .setTimestamp();

        user.send({ embeds: [embed], ephemeral: false });
      });
    });
    await interaction.reply("Sent message");
  },
  isGuild: true,
};
