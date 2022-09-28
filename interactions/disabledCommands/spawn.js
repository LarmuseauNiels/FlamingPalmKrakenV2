const { SlashCommandBuilder } = require("@discordjs/builders");
//const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: "spawn",
  data: new SlashCommandBuilder()
    .setName("spawn")
    .setDescription("Create a brand new island"),
  async execute(interaction) {
    let test = await client.islander.SpawnIsland(interaction.member.user.id);

    await interaction.reply({
      content: "successfully spawned island",
      ephemeral: true,
    });
  },
  isGuild: true,
};
