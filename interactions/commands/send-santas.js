const { readFile } = require("fs");
const { SlashCommandBuilder } = require('@discordjs/builders');
const {MessageEmbed, MessageButton} = require("discord.js");

module.exports = {
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
                SSReciever: {
                    include: {
                        Members: true
                    }
                }
            }
        });

        links.foreach(link =>{
            client.users.fetch(link.RecieverID, false).then((user) => {

                let embed = new MessageEmbed()
                .setColor('#FD8612')
                .setTitle(  `You have been assigned ${link.SSReciever.Members.DisplayName} as your recipient`)
      
                .addFlieds(
                    { name: 'Address', value: link.SSReciever.Address  },
                    { name: 'Store links', value: link.SSReciever.StoreLinks}
                )
                .setTimestamp()
                .addComponnents(
                    new MessageButton()
                        .setCustomId('confirm')
                        .setLabel('I have acknowledged my recipient and will have my present ready on time.')
                )
                .setFooter('FlamingPalm Secret Santa', 'https://flamingpalm.com/images/FlamingPalmLogoSmall.png');
    
                user.send(embed);
               });
        })
        
		await interaction.reply("Sent secret santa recipients")
	},   

    isGuild : true
};