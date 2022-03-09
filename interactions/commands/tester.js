const {SlashCommandBuilder} = require('@discordjs/builders');
//const { MessageEmbed,MessageActionRow, MessageButton } = require('discord.js');

module.exports = {
    name: 'tester',
    data: new SlashCommandBuilder()
        .setName('tester')
        .setDescription('testingcommand'),
    async execute(interaction) {
		var knownChannels;
		await client.prisma.channel.findMany({select: {
				ID: true
			}}).then(channel =>knownChannels = channel);
		client.guilds.fetch('530537522355240961').then(guild =>
		guild.channels.fetch().then(channels => {
			channels.forEach(channel => {
				if (channel.isVoice()) {
					if (!knownChannels.some(tchan => tchan.ID === channel.id )) {
						client.prisma.channel.create({
							ID: channel.id,
							ChannelName: channel.name
						});
					}

					text = text + "  ";
				}

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