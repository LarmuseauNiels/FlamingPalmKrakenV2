const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
module.exports = {
  name: "info",
  data: new ContextMenuCommandBuilder()
    .setName("info")
    .setType(ApplicationCommandType.User)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    let dbinfo = await global.client.prisma.members.findUnique({
      where: { ID: interaction.targetId },
      include: {
        Points: true,
        PointHistory: {
          orderBy: { TimeStamp: "desc" },
          take: 1,
        },
      },
    });
    interaction.guild.members.fetch(interaction.targetId).then((member) => {
      let embed = new EmbedBuilder()
        .setTitle(member.user.username)
        .setAuthor({
          name: member.user.username,
          iconURL: member.user.avatarURL(),
        })
        .addFields(
          { name: "ID", value: `${member.id}`, inline: false },
          {
            name: "Joined",
            value: `${member.joinedAt.toISOString()}`,
            inline: false,
          },
          {
            name: "Created",
            value: `${member.user.createdAt.toISOString()}`,
            inline: false,
          },
          {
            name: "Points",
            value: `${dbinfo.Points.TotalPoints} :palm_tree:`,
            inline: false,
          },
          {
            name: "Last transaction",
            value: `${dbinfo.PointHistory[0].comment} ${
              dbinfo.PointHistory[0].points > 0 ? "+" : ""
            } ${dbinfo.PointHistory[0].points}:palm_tree:`,
            inline: false,
          }
        );
      interaction.editReply({ embeds: [embed], ephemeral: true });
    });
  },
  isGuild: true,
};
