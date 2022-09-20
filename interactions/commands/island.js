const { EmbedBuilder,AttachmentBuilder,SlashCommandBuilder } = require('discord.js');
const Canvas = require("@napi-rs/canvas");

module.exports = {
	name: 'island',
	data: new SlashCommandBuilder()
		.setName('island')
		.setDescription('Check progress on your island'),
	async execute(interaction) {
        // client.islander.GetMemberIsland(interaction.user.id).then(member =>  {
		// 	let island = member.i_Island;
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
		const canvas = Canvas.createCanvas(950, 650);
		const ctx = canvas.getContext('2d');

		const island = await Canvas.loadImage('sprites/starting.png');
		const header = await Canvas.loadImage('sprites/buttonLong_brown.png');
		const foodIcon = await Canvas.loadImage('sprites/food.png');
		const dudeIcon = await Canvas.loadImage('sprites/dude.png');
		const stoneIcon = await Canvas.loadImage('sprites/stone.png');
		const woodIcon = await Canvas.loadImage('sprites/wood.png');

		ctx.drawImage(island, -4, -180, 1000, 1000);
		ctx.drawImage(header, 80, 10, 190, 49);
		ctx.drawImage(header, 280, 10, 190, 49);
		ctx.drawImage(header, 480, 10, 190, 49);
		ctx.drawImage(header, 680, 10, 190, 49);
		ctx.drawImage(dudeIcon, 82, 10, 50, 50);
		ctx.drawImage(foodIcon, 285, 10, 50, 50);
		ctx.drawImage(woodIcon, 475, 2, 70, 70);
		ctx.drawImage(stoneIcon, 685, 10, 50, 50);
		addtext(ctx, "2", 200, 42);
		addtext(ctx, "0", 400, 42);
		addtext(ctx, "0", 600, 42);
		addtext(ctx, "0", 800, 42);

		const attachment = new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'island.png' });

		interaction.reply({ files: [attachment]  , ephemeral: false });
            //interaction.followUp({ embeds: [hiddenEmbed] , components: [row] ,ephemeral: true });
        // },error =>{
		// 	 console.log(error);
        //      interaction.reply({ content: "Island not available", ephemeral: true });
        // });
	},
    isGuild: true,
};

function addtext(ctx, text, x, y) {
	ctx.font = "28px sans-serif";
	ctx.textAlign = "center";
	ctx.fillStyle = "#fff";
	ctx.fillText(text, x, y);
}