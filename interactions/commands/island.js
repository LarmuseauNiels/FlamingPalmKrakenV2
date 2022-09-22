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
            // .setAuthor(member.DisplayName, 'https://cdn.discordapp.com/avatars/'+member.ID+'/'+interaction.user.avatar, 'https://flamingpalm.com')
            // //.setDescription('Some description here')
            // //.setThumbnail('https://i.imgur.com/AfFp7pu.png')
			//
            // .setTimestamp()
            // .setFooter('Work in progress Islander game', 'https://flamingpalm.com/images/FlamingPalmLogoSmall.png');
			// island.i_Building_Island.forEach(ibi =>{
			// 	let bl = ibi.i_BuildingLevel;
			//  	embed.addField(bl.Name, 'lvl ' + bl.Level, true);
			// })

			client.islander.GetImage(interaction.user.id,island).then(image => {
				interaction.reply({ files: [image]  , ephemeral: false });
			})


            //interaction.followUp({ embeds: [hiddenEmbed] , components: [row] ,ephemeral: true });
         },error =>{
		 	 console.log(error);
              interaction.reply({ content: "Island not available", ephemeral: true });
         });
	},
    isGuild: true,
};

