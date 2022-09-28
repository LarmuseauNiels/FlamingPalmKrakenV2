const { EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require("discord.js");

module.exports = {
  name: "guildMemberRemove",
  execute(GuildMember) {
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
    client.logChannel.send({ embeds: [embed] });
  },
};
