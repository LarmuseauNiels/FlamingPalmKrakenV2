const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
module.exports = {
  name: "profile",
  data: new ContextMenuCommandBuilder()
    .setName("profile")
    .setType(ApplicationCommandType.User)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    global.client.achievementsModule
      .GetProfile(interaction.targetId)
      .then((profile) => {
        interaction.editReply({ files: [profile], ephemeral: true });
      });
  },
  isGuild: true,
};
