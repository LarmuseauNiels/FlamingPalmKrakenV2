const {MessageActionRow, MessageButton} = require("discord.js");

module.exports = {
    name: 'confirmSanta',
    async execute(interaction) {
        await client.prisma.sSSender.update({
            where:{SenderID: interaction.user.id},
            data: {IsSend: true}
        })

        let row = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId('confirmSend')
                    .setLabel('Confirmed')
                    .setStyle('SUCCESS')
                    .setDisabled(true));

        interaction.update({components: [row]});
    }
};

