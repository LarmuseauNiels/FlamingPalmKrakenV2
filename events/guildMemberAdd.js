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
        const cachedInvites = client.invites.get(GuildMember.guild.id);
        GuildMember.guild.invites.fetch().then(newInvites => {
            console.log("got invites")
            client.invites.set(GuildMember.guild.id, newInvites);
            const usedInvite = newInvites.find(invite => cachedInvites.get(invite.code).uses < invite.uses);
            console.log(client.invites);
            console.log(cachedInvites);
            console.log(newInvites);
            console.log(usedInvite);
            client.logChannel.send(JSON.stringify(cachedInvites) + "\r\n" + JSON.stringify(newInvites));
        });
    },
};