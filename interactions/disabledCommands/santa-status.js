const { SlashCommandBuilder } = require('@discordjs/builders');
const {MessageEmbed, MessageButton, MessageActionRow} = require("discord.js");

module.exports = {
    name: 'santa-status',
    data: new SlashCommandBuilder()
        .setName('santa-status')
        .setDescription('Set the status of your gift')
        .setDefaultPermission(false),
    async execute(interaction) {

        await interaction.reply("Sent secret santa recipients")
    },
    isGuild : true
};