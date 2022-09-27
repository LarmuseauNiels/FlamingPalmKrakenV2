const {ActionRowBuilder, ButtonBuilder, ButtonStyle} = require("discord.js");

module.exports = {
    name: 'gather',
    async execute(interaction) {
        let row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('gatherWood')
                    .setLabel(':wood:')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('gatherFood')
                    .setLabel(':meat_on_bone:')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('gatherStone')
                    .setLabel(':bricks:')
                    .setStyle(ButtonStyle.Secondary)
            );
            interaction.reply({ components: [row] , ephemeral: true });
    }
};

