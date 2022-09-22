const { EmbedBuilder,SlashCommandBuilder } = require('discord.js');

module.exports = {
    name: 'gather',
    data: new SlashCommandBuilder()
        .setName('gather')
        .setDescription('Gather resources on your island')
        .addStringOption(option =>
            option.setName('resource')
                .setDescription('The resource you want to gather')
                .setRequired(true)
                .addChoices(
                    {name: 'Food', value: 'food'},
                    {name: 'Wood', value: 'wood'},
                    {name: 'Stone', value: 'stone'},
                )),
    async execute(interaction) {
        interaction.reply({ text: "Not implemented yet"  , ephemeral: true });
    },
    isGuild: true
};