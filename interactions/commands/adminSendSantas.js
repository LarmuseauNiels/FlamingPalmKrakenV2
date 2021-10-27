const { SlashCommandBuilder } = require('@discordjs/builders');
const {MessageEmbed, MessageButton, MessageActionRow} = require("discord.js");

module.exports = {
    name: 'admin-send-santas',
	data: new SlashCommandBuilder()
		.setName('admin-send-santas')
		.setDescription('Sends recipients name/id to santas')
        .setDefaultPermission(false),
	async execute(interaction) {
        let links = await client.prisma.sSLink.findMany( {
            include:{
                SSReceiver: {
                    include: {Members: true }
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
                .setFooter('FlamingPalm Secret Santa', 'https://flamingpalm.com/images/FlamingPalmLogoSmall.png')
                .setTimestamp();
                let row = new MessageActionRow()
                    .addComponents(
                        new MessageButton()
                            .setCustomId('confirmSanta')
                            .setLabel('I have received the required info and will purchase a gift in time ')
                            .setStyle('PRIMARY'));

                user.send( {embeds: [embed],components: [row], ephemeral: false});
               });
        })
		await interaction.reply("Sent secret santa recipients")
	},
    permissions: [
        {
            id: '178435947816419328',
            type: 'USER',
            permission: true,
        },
    ],
    isGuild : true
};