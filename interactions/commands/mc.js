const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const Gamedig = require("gamedig");

module.exports = {
  name: "mc",
  data: new SlashCommandBuilder()
    .setName("mc")
    .setDescription("show minecraft server info"),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    let state = await Gamedig.query({
      type: "minecraft",
      host: "mc.flamingpalm.com",
    });

    let embed = new EmbedBuilder()
      .setColor("#FD8612")
      .setTitle("Minecraft server info")
      .setDescription("players online: " + state.players.length)
      .setTimestamp()
      .setFooter({
        text: "Flamingpalm Minecraft server",
        iconURL:
          "https://flamingpalm.com/assets/images/logo/FlamingPalmLogoSmall.png",
      });
    let playernames = "";
    state.players.forEach((player) => {
      playernames += player.name + "\n";
    });
    embed.addFields({
      name: "players",
      value: playernames,
      inline: false,
    });
    await interaction.editReply({ embeds: [embed] });
  },
  isGuild: true,
};
