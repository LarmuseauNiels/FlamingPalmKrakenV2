const { SlashCommandBuilder } = require('@discordjs/builders');
const {MessageEmbed, MessageButton} = require("discord.js");

module.exports = {
    name: 'send-santas',
	data: new SlashCommandBuilder()
		.setName('send-santas')
		.setDescription('Sends recipients name/id to santas'),
	async execute(interaction) {
        // var SSFile = "./SSList.txt"
        // readFile(SSFile, 'utf8', (err,data) => {
        //         if (err) throw err;     
        //         console.log(data)
        // })
        let links = await client.prisma.sSLink.findMany( {
            include:{
                SSReceiver: {
                    include: {
                        Members: true
                    }
                }
            }
        });

        links.forEach(link =>{
            client.users.fetch(link.SenderID, false).then((user) => {

                let embed = new MessageEmbed()
                .setColor('#FD8612')
                .setTitle(  `You have been assigned ${link.SSReceiver.Members.DisplayName} as your recipient`)
      
                .addFields(
                    { name: 'Address', value: link.SSReceiver.Address  },
                    { name: 'Store links', value: link.SSReceiver.StoreLinks}
                )
                .setTimestamp()
                // .addComponents(
                //     new MessageButton()
                //         .setCustomId('confirm')
                //         .setLabel('I have acknowledged my recipient and will have my present ready on time.')
                // )
                .setFooter('FlamingPalm Secret Santa', 'https://flamingpalm.com/images/FlamingPalmLogoSmall.png');
                 
                user.send( {embeds: [embed], ephemeral: false});
               });
        })
        
		await interaction.reply("Sent secret santa recipients")
	},   

    isGuild : true
};