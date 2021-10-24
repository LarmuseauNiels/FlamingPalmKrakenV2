const { SlashCommandBuilder } = require('@discordjs/builders');
module.exports = {
    name: 'send-to-santa',
	data: new SlashCommandBuilder()
		.setName('send-to-santa')
		.setDescription('Send message to your santa')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The message to send')
                .setRequired(true)),
	async execute(interaction) {
        const message = interaction.options.getString('message');
        client.prisma.sSLink.findUnique( {
            where: {ReceiverID: interaction.user.id}
        }).then( link => {
            client.users.fetch(link.SenderID, false).then((user) => {
                user.send('Message from your receiver: ' + message);
                interaction.reply({ content: "successfully send message to "+ user.username, ephemeral: false });
               });
        });
	},
    isGuild: false,
};