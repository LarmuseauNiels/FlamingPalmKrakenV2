const { SlashCommandBuilder } = require("discord.js");
//const { EmbedBuilder,ActionRowBuilder, ButtonBuilder } = require('discord.js');

module.exports = {
  name: "loginstreak",
  data: new SlashCommandBuilder()
    .setName("loginstreak")
    .setDescription("show your login streak"),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    global.client.achievementsModule
      .GetLoginStreak(interaction.user.id)
      .then((streak) => {
        interaction.editReply({
          content: `Your current login streak is ${streak}`,
        });
      });
  },
  isGuild: true,
};
