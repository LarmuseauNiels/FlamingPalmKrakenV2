const { SlashCommandBuilder } = require("@discordjs/builders");
const { EmbedBuilder, ButtonBuilder, ActionRowBuilder } = require("discord.js");

module.exports = {
  name: "admin-santa-confirmation",
  data: new SlashCommandBuilder()
    .setName("admin-santa-confirmation")
    .setDescription("Sends admin-santa-confirmation")
    .setDefaultPermission(false),
  async execute(interaction) {
    let links = await client.prisma.sSSender.findMany({
      where: { IsSend: false },
    });
    links.forEach((link) => {
      client.users.fetch(link.ID, false).then((user) => {
        let embed = new EmbedBuilder()
          .setColor("#FD8612")
          .setTitle(`Confirm send`)
          .addFields({
            name: "message",
            value:
              "This is a reminder to order your receiver a gift. If you have already done so press the button below. ",
          })
          .setFooter(
            "FlamingPalm Secret Santa",
            "https://flamingpalm.com/images/FlamingPalmLogoSmall.png"
          )
          .setTimestamp();
        let row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("confirmSend")
            .setLabel("I have ordered my gift receiver a gift")
            .setStyle("PRIMARY")
        );

        user.send({ embeds: [embed], components: [row], ephemeral: false });
      });
    });
    await interaction.reply("Sent santa send gift messages");
  },
  permissions: [
    {
      id: "178435947816419328",
      type: "USER",
      permission: true,
    },
  ],
  isGuild: true,
};
