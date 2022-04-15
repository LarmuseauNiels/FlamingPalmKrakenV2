const { MessageEmbed,MessageActionRow, MessageButton } = require('discord.js');

module.exports = {
    name: 'guildMemberAdd',
    execute(GuildMember) {
        // just a test
        const cachedInvites = client.invites.get(GuildMember.guild.id);
        const oldinvites = cachedInvites.map(i => {return {code: i.code, uses: i.uses}});
        console.log(oldinvites);
        GuildMember.guild.invites.fetch().then(newInvites => {
            console.log("got invites")
            const usedInvite = newInvites.find(invite => oldinvites.find(i => i.code == invite.code).uses < invite.uses);
            let embed = new MessageEmbed()
                .setColor('#FD8612')
                .setTitle(  `${GuildMember.user.username} joined`)
                .setAuthor(`${GuildMember.user.username}`, 'https://cdn.discordapp.com/avatars/'+GuildMember.user.id+'/'+GuildMember.user.avatar)
                .addFields(
                    { name: 'ID ', value: `${GuildMember.id}`,inline: false  },
                    { name: 'name & discriminator', value: `${GuildMember.user.username}#${GuildMember.user.discriminator}`,inline: false  },
                    { name: 'account created', value: `${GuildMember.user.createdAt}`,inline: false  },
                    { name: 'link code', value: `${usedInvite.code}`,inline: false  },
                    { name: 'inviter', value: `${usedInvite.inviter.username}`,inline: false  },
                )
                .setTimestamp();
            try {
                client.prisma.refferals.create({
                    data: {
                        userid: GuildMember.id,
                        refferer: usedInvite.inviter.id
                    }
                });
            } catch (error) {
                console.error(error);
            }
            client.logChannel.send({embeds: [embed]})
        });
    },
};