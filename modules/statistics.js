
const cron = require('node-cron');
const { Collection } = require('discord.js');

module.exports = async function (client) {
    var knownuserCache = []
    var trackedChannels = []
    client.log("loading statistics module");
    await client.prisma.members.findMany({select: {
        ID: true
      }}).then(members =>knownuserCache = members);
    await client.prisma.channel.findMany({select: {
    ID: true
    }}).then(channel =>trackedChannels = channel);

    cron.schedule('30 0,15,30,45 * * * *', () => {
         client.log('running statistics tracking cron job');
         try {
            trackedChannels.forEach(trackedChannel =>{
                let channelID = trackedChannel.ID;
                client.channels.fetch(channelID).then(channel =>{
                    let membersInChannel = [];
                    channel.members.forEach(member => {
                        let q = knownuserCache.find(ku => ku.ID == member.user.id);
                        if(q == undefined){
                            client.prisma.members.upsert({
                                where: {ID: member.user.id},
                                select: {ID: true},
                                update: {
                                    DisplayName: member.user.username,
                                    avatar: member.user.avatar
                                },
                                create: {
                                    ID: member.user.id,
                                    DisplayName: member.user.username,
                                    avatar: member.user.avatar
                                }
                            }).then(t => {
                                knownuserCache.push(t);
                                membersInChannel.push(t);
                            });
                        }
                        else{
                            membersInChannel.push(q);
                        }
                    });
                    if(membersInChannel.length > 0){
                        client.prisma.voiceConnected.createMany({
                            data: membersInChannel.map(z => {return { ID: z.ID, ChannelID: channelID}})
                        }).then(x => console.log( "tracked " + x.count + " members in channel")) 
                    }
                })
                
            })
        }
        catch( err){
            console.log(err);
            client.channelLog("Statistics module error " + err.toString());
        }
    });
}



