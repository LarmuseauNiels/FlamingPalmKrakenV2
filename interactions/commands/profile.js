const { SlashCommandBuilder } = require("discord.js");
//const { EmbedBuilder,ActionRowBuilder, ButtonBuilder } = require('discord.js');

module.exports = {
  name: "profile",
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("show your profile"),
  async execute(interaction) {
    //interaction.deferReply();
    global.client.achievementsModule
      .GetProfile(interaction.user.id)
      .then((profile) => {
        interaction.reply({ files: [profile] });
      });
  },
  isGuild: true,
};
