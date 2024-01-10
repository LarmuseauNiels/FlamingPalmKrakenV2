const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
} = require("discord.js");
module.exports = {
  name: "profile",
  data: new ContextMenuCommandBuilder()
    .setName("profile")
    .setType(ApplicationCommandType.User),
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
