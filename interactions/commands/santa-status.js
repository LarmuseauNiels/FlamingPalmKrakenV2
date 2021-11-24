const { SlashCommandBuilder } = require('@discordjs/builders');
const {MessageEmbed, MessageButton, MessageActionRow} = require("discord.js");

module.exports = {
    name: 'admin-santa-confirmation',
    data: new SlashCommandBuilder()
        .setName('admin-santa-confirmation')
        .setDescription('Sends admin-santa-confirmation')
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
                    .setTitle(  `Confirm send`)
                    .addFields(
                        { name: 'message', value: "Please confirm after you have ordered a gift"  }
                    )
                    .setFooter('FlamingPalm Secret Santa', 'https://flamingpalm.com/images/FlamingPalmLogoSmall.png')
                    .setTimestamp();
                let row = new MessageActionRow()
                    .addComponents(
                        new MessageButton()
                            .setCustomId('confirmSend')
                            .setLabel('I have ordered my gift receiver a gift')
                            .setStyle('PRIMARY'));

                user.send( {embeds: [embed],components: [row], ephemeral: false});
            });
        })
        await interaction.reply("Sent santa send gift messages")
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