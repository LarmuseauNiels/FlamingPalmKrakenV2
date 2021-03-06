const { MessageEmbed,MessageActionRow, MessageButton } = require('discord.js');

module.exports = {
    name: 'guildMemberAdd',
    async execute(GuildMember) {
        // just a test
        const cachedInvites = client.invites.get(GuildMember.guild.id);
        const oldinvites = cachedInvites.map(i => {return {code: i.code, uses: i.uses}});
        console.log(oldinvites);
        GuildMember.guild.invites.fetch().then(async(newInvites) =>  {
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
                try{
                    let user = await client.prisma.members.create({
                        data: {
                            ID: GuildMember.id,
                            DisplayName: GuildMember.user.username,
                            avatar: GuildMember.user.avatar
                        }
                    });
                    let referrer = await client.prisma.members.upsert({
                        where: {ID: usedInvite.inviter.id},
                        update: {
                            DisplayName: usedInvite.inviter.username,
                            avatar: usedInvite.inviter.avatar
                        },
                        create: {
                            ID: usedInvite.inviter.id,
                            DisplayName: usedInvite.inviter.username,
                            avatar: usedInvite.inviter.avatar
                        }
                    });

                    await client.prisma.refferals.create({
                        data: {
                            userid: GuildMember.id,
                            refferer: usedInvite.inviter.id
                        },
                    });
                } catch(error){
                    console.log(error);
                }
            client.logChannel.send({embeds: [embed]})
        });
    },
};