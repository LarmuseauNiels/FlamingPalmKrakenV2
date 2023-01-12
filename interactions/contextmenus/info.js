const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  EmbedBuilder,
} = require("discord.js");
module.exports = {
  name: "info",
  data: new ContextMenuCommandBuilder()
    .setName("info")
    .setType(ApplicationCommandType.User),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    interaction.guild.members.fetch(interaction.targetId).then((member) => {
      let embed = new EmbedBuilder()
        .setTitle(member.user.username)
        .setAuthor({
          name: member.user.username,
          iconURL: member.user.avatarURL(),
        })
        .addFields(
          { name: "ID", value: `${member.id}`, inline: false },
          { name: "Joined", value: `${member.joinedAt}`, inline: false },
          { name: "Created", value: `${member.user.createdAt}`, inline: false },
          { name: "Roles", value: `${member.roles.cache.size}`, inline: false }
        );
      interaction.editReply({ embeds: [embed], ephemeral: true });
    });
  },
  isGuild: true,
};
