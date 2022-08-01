const {MessageActionRow, MessageButton} = require("discord.js");

module.exports = {
    name: 'confirmSend',
    async execute(interaction) {
        await client.prisma.sSSender.update({
            where:{ID: interaction.user.id},
            data: {IsSend: true}
        })

        let row = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId('confirmSend')
                    .setLabel('Confirmed')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true));

        interaction.update({components: [row]});
    }
};

