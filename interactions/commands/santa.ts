import {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from "discord.js";

module.exports = {
  name: "santa",
  data: new SlashCommandBuilder()
    .setName("santa")
    .setDescription("Secret santa menu"),
  async execute(interaction) {
    await interaction.reply();
  },
  isGuild: false,
};
