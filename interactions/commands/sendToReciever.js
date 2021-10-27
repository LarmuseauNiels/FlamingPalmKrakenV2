const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	name:'send-to-receiver',
	data: new SlashCommandBuilder()
		.setName('send-to-receiver')
		.setDescription('Sends a message to who you are buying a gift for')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The message to send')
                .setRequired(true)),
	async execute(interaction) {
        const message = interaction.options.getString('message');
        await client.prisma.sSLink.findUnique( {
            where: {SenderID: interaction.user.id}
        }).then( link => {
            if (link == null) {
                interaction.reply({ content: "Failure, you do not have a gift receiver", ephemeral: true });
                return;
            }
            client.users.fetch(link.ReceieverID, false).then((user) => {
                user.send('message from Santa: ' + message );
                interaction.reply({ content: "successfully send message to "+ user.username, ephemeral: false });
               });
        });
	},
    isGuild: false,
};