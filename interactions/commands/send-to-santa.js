const { readFile } = require("fs");
const { SlashCommandBuilder } = require('@discordjs/builders');


module.exports = {
	data: new SlashCommandBuilder()
		.setName('send-to-santa')
		.setDescription('Fetch deez nuts'),
	async execute(interaction) {
        client.prisma.sSLink.findUnique( {
            where: {
                ReceiverID: interaction.user.id,
            }
        }).then( link => {
            client.users.fetch(link.SenderID, false).then((user) => {
                user.send('message from your receiver: ' + Santa + ' as your recipient');
                interaction.reply({ content: "successfully send message to "+ user.username, ephemeral: false });
               });
        });
	},

    isGuild: false,
};