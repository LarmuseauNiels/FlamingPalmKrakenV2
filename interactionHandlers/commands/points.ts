import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";

export default class PointsCommand implements IHandler {
  name = "points";
  isGuild = true;
  data = new SlashCommandBuilder()
    .setName("points")
    .setDescription("shows your flamingpalm points") as SlashCommandBuilder;
  async execute(interaction: ChatInputCommandInteraction) {
    let member = await global.client.prisma.members.findUnique({
      where: { ID: interaction.user.id },
      include: {
        Points: true,
        PointHistory: {
          orderBy: { TimeStamp: "desc" },
          take: 5,
        },
      },
    });

    let embed = new EmbedBuilder()
      .setColor("#FD8612")
      .setTitle(`You have ${member.Points.TotalPoints} :palm_tree:`)
      .setAuthor({
        name: member.DisplayName,
        iconURL:
          "https://cdn.discordapp.com/avatars/" +
          member.ID +
          "/" +
          interaction.user.avatar,
        url: "https://flamingpalm.com",
      })
      .setDescription("**last 5 transactions: **")
      .setTimestamp()
      .setFooter({
        text: "Niels2398 FPG kraken bot",
        iconURL: "https://flamingpalm.com/images/FlamingPalmLogoSmall.png",
      });
    member.PointHistory.forEach((h) => {
      embed.addFields({
        name: `${h.points > 0 ? "+" : ""} ${h.points}:palm_tree:`,
        value: `${h.comment == "" ? "no comment" : h.comment}`,
        inline: false,
      });
    });
    console.log(member);
    interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
