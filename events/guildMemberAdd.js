const { MessageEmbed,MessageActionRow, MessageButton } = require('discord.js');

module.exports = {
    name: 'guildMemberAdd',
    execute(GuildMember) {


        let embed = new MessageEmbed()
            .setColor('#FD8612')
            .setTitle(  `${GuildMember.user.username} joined`)
            .setAuthor(`${GuildMember.user.username}`, 'https://cdn.discordapp.com/avatars/'+GuildMember.user.id+'/'+GuildMember.user.avatar)
            .addFields(
                { name: 'ID ', value: `${GuildMember.id}`,inline: false  },
                { name: 'name & discriminator', value: `${GuildMember.user.username}#${GuildMember.user.discriminator}`,inline: false  },
                { name: 'account created', value: `${GuildMember.user.createdAt}`,inline: false  },
            )
            .setTimestamp()
        client.logChannel.send({embeds: [embed]})
        // just a test
        const cachedInvites = client.invites.get(member.guild.id);
        GuildMember.guild.invites.fetch().then(newInvites => {
            client.invites.set(member.guild.id, newInvites);
            const usedInvite = newInvites.find(invite => cachedInvites.get(invite.code).uses < invite.uses);
            const { code, uses, inviter, channel } = usedInvite;
            client.logChannel.send("was invited by: "+inviter.tag);
        });
    },
};