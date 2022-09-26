const { EmbedBuilder,AttachmentBuilder,SlashCommandBuilder, ActionRowBuilder, ButtonBuilder,ButtonStyle} = require('discord.js');

module.exports = {
	name: 'island',
	data: new SlashCommandBuilder()
		.setName('island')
		.setDescription('Check progress on your island'),
	async execute(interaction) {
		client.islander.GetMemberIsland(interaction.user.id).then(member =>  {
		 	let island = member.i_Island;
            const embed = new EmbedBuilder()
            .setColor('#FD8612')
				.setTitle(  "Island")
			var text = '';
			if (island == null){
				client.islander.SpawnIsland(member.ID)
				text = 'Welcome to Islander, you have started alone on your empty island' +
					'  You should now use /gather wood to gather your some wood and use /build to make a campfire!';
			}
			let row = new ActionRowBuilder()
				.addComponents(
					new ButtonBuilder()
						.setCustomId('islanderGather')
						.setLabel('Gather')
						.setStyle(ButtonStyle.Secondary),
					new ButtonBuilder()
						.setCustomId('islanderBuild')
						.setLabel('Building')
						.setStyle(ButtonStyle.Secondary),
					new ButtonBuilder()
						.setCustomId('islanderBuyUnits')
						.setLabel('Units')
						.setStyle(ButtonStyle.Secondary)
						.setDisabled(true),
					new ButtonBuilder()
						.setCustomId('islanderExpedition')
						.setLabel('Expeditions')
						.setStyle(ButtonStyle.Secondary)
						.setDisabled(true)
				);

			client.islander.GetImage(interaction.user.id,island).then(image => {
				interaction.reply({ content: text, files: [image],components: [row] , ephemeral: false });
			})
			},err => {
			console.log('error island 01' + err);
			interaction.reply({ content: 'You do not have an island yet.', ephemeral: true });
		});
	},
    isGuild: true,
};

