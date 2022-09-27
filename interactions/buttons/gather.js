const {ActionRowBuilder, ButtonBuilder, ButtonStyle} = require("discord.js");

module.exports = {
    name: 'gather',
    async execute(interaction) {
        let row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('gatherWood')
                    .setLabel('Wood')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('1024292209559879742'),
                new ButtonBuilder()
                    .setCustomId('gatherFood')
                    .setLabel('Food')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('1024292206409953291'),
                new ButtonBuilder()
                    .setCustomId('gatherStone')
                    .setLabel('Stone')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('1024292208414822450')
            );
            interaction.reply({ components: [row] , ephemeral: true });
    }
};

