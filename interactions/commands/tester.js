const {SlashCommandBuilder} = require('@discordjs/builders');
//const { MessageEmbed,MessageActionRow, MessageButton } = require('discord.js');

module.exports = {
    name: 'tester',
    data: new SlashCommandBuilder()
        .setName('tester')
        .setDescription('testingcommand'),
    async execute(interaction) {

		client.guilds.fetch('530537522355240961').then(guild =>
		guild.channels.fetch().then(channels => {
			let text = "";
			channels.forEach(channel => {
				if (channel.isVoice()) text = text + channel.name + " ";
			})
			interaction.reply({content: text, ephemeral: false});
		})
		)
    },
	permissions: [
		{
			id: '178435947816419328',
			type: 'USER',
			permission: true,
		},
	],
    isGuild: true
};