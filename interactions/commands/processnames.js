const { EmbedBuilder,ActionRowBuilder, ButtonBuilder,SlashCommandBuilder } = require('discord.js');

module.exports = {
    name: 'processnames',
    data: new SlashCommandBuilder()
        .setName('processnames')
        .setDescription('saves usernames of new members'),
    async execute(interaction) {
        let members = await client.prisma.members.readMany({where:
                {
                    DisplayName: null
                }
        });
        

        interaction.reply("success",{ ephemeral: true});
    },
    isGuild: true
};