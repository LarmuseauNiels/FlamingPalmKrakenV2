const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	name:'sendToReciever',
	data: new SlashCommandBuilder()
		.setName('send-to-reciever')
		.setDescription('Sends a message to who you are buying a gift for'),
	async execute(interaction) {
        let link = await client.prisma.sSLink.findUnique( {
            where: {
                SenderID: interaction.user.id,
            }
        }).then( link => {
            client.users.fetch(link.ReceieverID, false).then((user) => {
                user.send('message from Santa: ' + reciever + ' as your recipient');
                interaction.reply({ content: "successfully send message to "+ user.username, ephemeral: false });
               });
        });
	},
    isGuild: false,
};