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
            .setCustomId("confirmSanta")
            .setLabel("I have read this message and will send a gift")
            .setStyle(ButtonStyle.Primary)
        );
        user.send({ embeds: [embed], components: [row], ephemeral: false });
      });
    });
    await interaction.reply("Sent secret santa recipients");
  },
  isGuild: true,
};
