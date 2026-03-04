import {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  EmbedBuilder,
  PermissionFlagsBits,
  Interaction,
  InteractionEditReplyOptions,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";

export default class InfoHandler implements IHandler {
  name = "info";
  isGuild = true;
  data = new ContextMenuCommandBuilder()
    .setName("info")
    .setType(ApplicationCommandType.User)
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ) as ContextMenuCommandBuilder;

  async execute(interaction: Interaction) {
    if (!interaction.isUserContextMenuCommand()) return;

    await interaction.deferReply({ ephemeral: true });
    const dbinfo = await global.client.prisma.members.findUnique({
      where: { ID: interaction.targetId },
      include: {
        Points: true,
        PointHistory: {
          orderBy: { TimeStamp: "desc" },
          take: 1,
        },
      },
    });

    const lastOnline: any = await global.client.prisma.$queryRaw`
      select DATE_FORMAT(date(TimeStamp), '%Y-%m-%d' ) as date, count(*)/4 as hours  
      from VoiceConnected 
      where ID = ${interaction.targetId}
      group by DATE_FORMAT(date(TimeStamp), '%Y-%m-%d' ) 
      order by date desc 
      limit 10`;

    lastOnline.reverse();
    const labels = lastOnline.map((x) => x.date).join(",");
    const data = lastOnline.map((x) => x.hours).join(",");
    const chart = `https://quickchart.io/chart/render/zm-45881e0a-49bc-4498-8b62-d64ff3adb44a?labels=${labels}&data1=${data}`;
    console.log(chart);

    const member = await interaction.guild.members.fetch(interaction.targetId);
    const embed = new EmbedBuilder()
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
      ephemeral: true,
    } as InteractionEditReplyOptions);
  }
}
