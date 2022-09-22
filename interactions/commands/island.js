const { EmbedBuilder,AttachmentBuilder,SlashCommandBuilder } = require('discord.js');

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
				client.islander.SpawnIsland(member)
				text = 'Welcome to Islander, you have started alone on your empty island' +
					'  You should now use /gather wood to gather your some wood and use /build to make a campfire!';
			}
			client.islander.GetImage(interaction.user.id,island).then(image => {
				interaction.reply({ content: text, files: [image] , ephemeral: false });
			})

            //interaction.followUp({ embeds: [hiddenEmbed] , components: [row] ,ephemeral: true });
		 },err => {
			console.log('error island 01' + err);
			interaction.reply({ content: 'You do not have an island yet.', ephemeral: true });
		});
	},
    isGuild: true,
};

