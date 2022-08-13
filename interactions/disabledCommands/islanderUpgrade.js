
const { EmbedBuilder,ActionRowBuilder, MessageSelectMenu, ButtonBuilder} = require('discord.js');

module.exports = {
    name: "islanderUpgrade",
    async execute(interaction) {

        let response = await client.islander.GetUpgradable(interaction.user.id)

        let row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('islanderBuild')
                    .setLabel('Build')
                    .setStyle('SECONDARY'),
                new ButtonBuilder()
                    .setCustomId('islanderUpgrade')
                    .setLabel('Upgrade')
                    .setStyle('SECONDARY'),
                new ButtonBuilder()
                    .setCustomId('islanderBuyUnits')
                    .setLabel('Buy units')
                    .setStyle('SECONDARY'),
                new ButtonBuilder()
                    .setCustomId('islanderBuyShips')
                    .setLabel('Buy ships')
                    .setStyle('SECONDARY'),
                new ButtonBuilder()
                    .setCustomId('islanderExpedition')
                    .setLabel('Start expedition')
                    .setStyle('SECONDARY')
            );

        const row = new ActionRowBuilder()
            .addComponents(
                new MessageSelectMenu()
                    .setCustomId('select')
                    .setPlaceholder('Nothing selected')
                    .addOptions(
                        response.b.map(b => {return {
                            label: b.Name + ' lvl ' + b.Level,
                            description: b.TClevel.toString(),
                            value: b.BuildingID.toString()
                        }}))
            );
        await interaction.update({ content: "Upgrades" ,components: [row1,row] , ephemeral: true });
    },
};