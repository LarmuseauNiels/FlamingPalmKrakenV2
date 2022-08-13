const {SlashCommandBuilder} = require('@discordjs/builders');
const {EmbedBuilder} = require("discord.js");

module.exports = {
    name: 'admin-santa-info',
    data: new SlashCommandBuilder()
        .setName('admin-santa-info')
        .setDescription('gets progress info of secret santa'),
    async execute(interaction) {
        let links = await client.prisma.sSLink.findMany({
            include:{
                SSReceiver: {
                    include: {Members: true }
                },
                SSSender: {
                    include: {Members: true }
                }
            }
        });
        let embed = new EmbedBuilder()
            .setColor('#FD8612')
            .setTitle(  `Progress info secret santa`)
            .addFields(
                { name: 'Read and confirmed', value: `${links.filter(x => x.confirmed === true).length} out of ${links.length} confirmed`  },
                { name: 'confirmed send', value: `${links.filter(x => x.SSSender.IsSend === true).length} out of ${links.length} send`  }

            )
            .setFooter('FlamingPalm Secret Santa', 'https://flamingpalm.com/images/FlamingPalmLogoSmall.png')
            .setTimestamp();
        interaction.reply({embeds: [embed], ephemeral: false});
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