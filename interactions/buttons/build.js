const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
  name: "build",
  async execute(interaction) {
    global.client.islander
      .GetMemberIsland(interaction.user.id)
      .then((member) => {
        let island = member.i_Island;
      });
  },
};
