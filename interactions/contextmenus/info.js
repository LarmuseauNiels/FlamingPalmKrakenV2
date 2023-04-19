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
    let lastOnline = new Array();
    lastOnline = await global.client.prisma
      .$queryRaw`select DATE_FORMAT(date(TimeStamp), '%Y-%m-%d' ) as date, count(*)/4 as hours
            from VoiceConnected 
            where ID = '178435947816419328' 
            group by DATE_FORMAT(date(TimeStamp), '%Y-%m-%d' ) 
            order by date desc 
            limit 10`;
    lastOnline.sort((a, b) => b.date - a.date);
    let labels = lastOnline.map((x) => x.date).join(",");
    let data = lastOnline.map((x) => x.hours).join(",");
    let chart = `https://quickchart.io/chart/render/zm-83eae2c8-25d3-4d1f-899c-5bcc188ffb3e?labels=${labels}&data1=${data}`;
    console.log(chart);

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
            value: `${dbinfo?.Points?.TotalPoints ?? 0} :palm_tree:`,
            inline: false,
          },
          {
            name: "Last transaction",
            value: `${dbinfo?.PointHistory[0]?.comment ?? "No history"} ${
              dbinfo?.PointHistory[0]?.points ?? 0 > 0 ? "+" : ""
            } ${dbinfo?.PointHistory[0]?.points ?? 0}:palm_tree:`,
            inline: false,
          }
        )
        .setImage(chart)
        .setTimestamp();
      interaction.editReply({
        content: chart,
        embeds: [embed],
        ephemeral: true,
      });
    });
  },
  isGuild: true,
};
