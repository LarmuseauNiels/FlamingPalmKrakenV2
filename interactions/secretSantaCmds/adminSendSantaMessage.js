const {
  EmbedBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
    .addStringOption((option) =>
      option
        .setName("button")
        .setDescription("adds extra button for confirmations")
        .setRequired(false)
        .addChoices(
          { name: "none", value: "none" },
          { name: "send", value: "send" },
          { name: "received", value: "received" }
        )
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
        if (interaction.options.getString("button") == "send") {
          let row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("confirmSend")
              .setLabel("I ordered the gift and it is on its way")
              .setStyle(ButtonStyle.Primary)
          );
          user.send({ embeds: [embed], components: [row], ephemeral: false });
        } else if (interaction.options.getString("button") == "received") {
          let row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("confirmReceived")
              .setLabel("I received the gift")
              .setStyle(ButtonStyle.Primary)
          );
          user.send({ embeds: [embed], components: [row], ephemeral: false });
        } else {
          user.send({ embeds: [embed], ephemeral: false });
        }
      });
    });
    await interaction.reply("Sent message");
  },
  isGuild: true,
};
