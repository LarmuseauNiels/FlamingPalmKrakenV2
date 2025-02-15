import { EmbedBuilder, GuildMember, Client } from "discord.js";
import { FpgClient } from "../components/FpgClient";
import { IEvent } from "../interfaces/IEvent";

export default class guildMemberRemove implements IEvent {
  name = "guildMemberRemove";
  execute(GuildMember: GuildMember) {
    let embed = new EmbedBuilder()
      .setColor("#FD8612")
      .setTitle(`${GuildMember.user.username} left`)
      .setAuthor({
        name: `${GuildMember.user.username}`,
        iconURL:
          "https://cdn.discordapp.com/avatars/" +
          GuildMember.user.id +
          "/" +
          GuildMember.user.avatar,
      })
      .addFields(
        { name: "ID", value: `${GuildMember.id}`, inline: false },
        {
          name: "name + discriminator",
          value: `${GuildMember.user.username}#${GuildMember.user.discriminator}`,
          inline: false,
        },
        {
          name: "account created",
          value: `${GuildMember.user.createdAt}`,
          inline: false,
        }
      )
      .setTimestamp();
    (global.client as FpgClient).logChannel.send({ embeds: [embed] });
  }
}
