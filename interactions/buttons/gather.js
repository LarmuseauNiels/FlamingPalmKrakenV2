const {ActionRowBuilder, ButtonBuilder, ButtonStyle} = require("discord.js");

module.exports = {
    name: 'gather',
    async execute(interaction) {
        let row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('gatherWood')
                    .setLabel('🪵')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('gatherFood')
                    .setLabel('🍖')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('gatherStone')
                    .setLabel('🧱')
                    .setStyle(ButtonStyle.Secondary)
            );
            interaction.reply({ components: [row] , ephemeral: true });
    }
};

