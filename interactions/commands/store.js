const { EmbedBuilder,ActionRowBuilder, ButtonBuilder,SlashCommandBuilder } = require('discord.js');

module.exports = {
    name: 'store',
    data: new SlashCommandBuilder()
        .setName('store')
        .setDescription('shows the flamingpalm points store'),
    async execute(interaction) {
        let embed = new EmbedBuilder()
            .setColor('#FD8612')
            .setTitle("Store")
            .setAuthor(interaction.user.username, 'https://cdn.discordapp.com/avatars/' + interaction.user.id + '/' + interaction.user.avatar, 'https://flamingpalm.com')
            .setDescription('Flamingpalm points store')
            //.setThumbnail('https://i.imgur.com/AfFp7pu.png')

            //.setImage('https://www.kenney.nl/assets/hexagon-kit/sample.png')
            .setTimestamp()
            .setFooter('Work in progress flamingpalm store', 'https://flamingpalm.com/images/FlamingPalmLogoSmall.png');
        let rewards = await client.prisma.reward.findMany({
            include:{RewardItem: true},
            orderBy:{Price:'asc'}
        })
        rewards.forEach(reward =>{
            let stock = reward.RewardItem.filter(x =>  x.RedeemedBy == "").length;
            if (stock == 0)  embed.addField(reward.Title, `out of stock` , true);
            else embed.addField(reward.Title, `**${reward.Price}:palm_tree:**` , true);//${reward.Description }\n ${stock} key${stock == 1?'':'s'} in stock\n
        })
        let row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setURL('https://flamingpalm.com/members')
                    .setLabel('Redeem on website')
                    .setStyle('LINK'));
        interaction.reply({embeds: [embed],components: [row], ephemeral: false});
    },
    isGuild: true
};