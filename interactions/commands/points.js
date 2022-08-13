const {SlashCommandBuilder} = require('discord.js');
const {EmbedBuilder} = require("discord.js");
//const { EmbedBuilder,ActionRowBuilder, ButtonBuilder } = require('discord.js');

module.exports = {
    name: 'points',
    data: new SlashCommandBuilder()
        .setName('points')
        .setDescription('shows your flamingpalm points'),
    async execute(interaction) {
        let member = await client.prisma.members.findUnique( {
            where: {ID: interaction.user.id},
            include: {
                Points: true,
                PointHistory : {
                    orderBy: {TimeStamp: 'desc'},
                    take: 5
                }
            }
        });

        let embed = new EmbedBuilder()
            .setColor('#FD8612')
            .setTitle(  `You have ${member.Points.TotalPoints} :palm_tree:`)
            .setAuthor(member.DisplayName, 'https://cdn.discordapp.com/avatars/'+member.ID+'/'+interaction.user.avatar, 'https://flamingpalm.com')
            .setDescription('**last 5 transactions: **')
            //.setThumbnail('https://i.imgur.com/AfFp7pu.png')

            .setTimestamp()
            .setFooter('Work in progress Islander game', 'https://flamingpalm.com/images/FlamingPalmLogoSmall.png');
         member.PointHistory.forEach(h =>{
             embed.addField(`${h.points>0?'+':''} ${h.points}:palm_tree:`, `${h.comment == ""?'no comment':h.comment}`, false);
         })
        console.log(member);
        interaction.reply({embeds: [embed], ephemeral: true});
    },
    isGuild: true
};