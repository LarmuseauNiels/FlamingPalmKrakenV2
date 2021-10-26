const {SlashCommandBuilder} = require('@discordjs/builders');
const {MessageEmbed} = require("discord.js");

module.exports = {
    name: 'admin-santa-info',
    data: new SlashCommandBuilder()
        .setName('admin-santa-info')
        .setDescription('gets progress info of secret santa'),
    async execute(interaction) {
        let links = await client.prisma.sSLink.findMany();
        let embed = new MessageEmbed()
            .setColor('#FD8612')
            .setTitle(  `Progress info secret santa`)
            .addFields(
                { name: 'Read and confirmed', value: `${links.filter(x => x.confirmed === true).length} out of ${links.length} confirmed`  },
                //{ name: 'Store links', value: link.SSReceiver.StoreLinks}
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