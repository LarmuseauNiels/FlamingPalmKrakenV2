const { SlashCommandBuilder } = require("@discordjs/builders");
//const { MessageEmbed,MessageActionRow, MessageButton } = require('discord.js');

module.exports = {
  name: "$command",
  data: new SlashCommandBuilder()
    .setName("$command")
    .setDescription("$description"),
  async execute(interaction) {
    interaction.reply({
      content: "$command is still work in progress",
      ephemeral: true,
    });
  },
  isGuild: $isGuild,
};
