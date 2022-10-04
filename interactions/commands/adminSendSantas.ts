import {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from "discord.js";

module.exports = {
  name: "admin-send-santas",
  data: new SlashCommandBuilder()
    .setName("admin-send-santas")
    .setDescription("Sends recipients name/id to santas")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
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
          .setTitle(
            `You have been assigned ${link.SSReceiver.Members.DisplayName} as your recipient`
          )
          .addFields(
            { name: "Address", value: link.SSReceiver.Address },
            { name: "Store links", value: link.SSReceiver.StoreLinks }
          )
          .setFooter({
            text: `If you have any questions, please contact Niels#2398`,
            iconURL: "https://flamingpalm.com/images/FlamingPalmLogoSmall.png",
          })
          .setTimestamp();
        let row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("MsgSantaBtn")
            .setLabel("Message santa")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("MsgReceiverBtn")
            .setLabel("Message receiver")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("MsgSupportBtn")
            .setLabel("Message support")
            .setStyle(ButtonStyle.Danger)
        );
        user.send({ embeds: [embed], components: [row], ephemeral: false });
      });
    });
    await interaction.reply("Sent secret santa recipients");
  },
  isGuild: true,
};
