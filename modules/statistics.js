const cron = require("node-cron");
const { Collection } = require("discord.js");

module.exports = async function (client) {
  var knownuserCache = [];
  //var trackedChannels = [];
  console.log("loading statistics module");
  await client.prisma.members
    .findMany({
      select: {
        ID: true,
      },
    })
    .then((members) => (knownuserCache = members));

  cron.schedule("30 0,15,30,45 * * * *", () => {
    console.log("running statistics tracking cron job");
    try {
      client.guilds.fetch("530537522355240961").then((guild) => {
        guild.members.fetch().then((members) => {
          members.forEach((member) => {
            let q = knownuserCache.find((ku) => ku.ID === member.user.id);
            if (q === undefined) {
              client.prisma.members
                .upsert({
                  where: { ID: member.user.id },
                  select: { ID: true },
                  update: {
                    DisplayName: member.user.username,
                    avatar: member.user.avatar,
                  },
                  create: {
                    ID: member.user.id,
                    DisplayName: member.user.username,
                    avatar: member.user.avatar,
                  },
                })
                .then((t) => {
                  knownuserCache.push(t);
                });
            }
          });

          client.prisma.voiceConnected
            .createMany({
              data: members
                .filter(
                  (m) =>
                    m.voice.channel != null &&
                    m.voice.channelId !== "530539169580318732"
                )
                .map((z) => {
                  return {
                    ID: z.id,
                    ChannelID: z.voice.channelId,
                    ChannelName: z.voice.channel.name,
                    deaf: z.voice.deaf,
                    mute: z.voice.mute,
                    streaming: z.voice.streaming,
                  };
                }),
            })
            .then((x) =>
              console.log("tracked " + x.count + " members in voice channels")
            );
          console.log(
            members
              .filter(
                (m) =>
                  m.presence?.status === "online" &&
                  m.user?.bot === false &&
                  (m.presence?.activities?.length ?? 0) > 0
              )
              .map((z) =>
                z.presence.activities
                  .filter((a) => a.type !== 4)
                  .map((a) => {
                    return {
                      userID: z.id,
                      applicationID: a.applicationId,
                      name: a.name,
                      details: a.details,
                      url: a.url,
                      state: a.state,
                      type: a.type.toString(),
                    };
                  })
              )
              .flat()
          );

          client.prisma.presence.createMany({
            data: members
              .filter(
                (m) =>
                  m.presence?.status === "online" &&
                  m.user?.bot === false &&
                  (m.presence?.activities?.length ?? 0) > 0
              )
              .map((z) =>
                z.presence.activities
                  .filter((a) => a.type !== 4)
                  .map((a) => {
                    return {
                      userID: z.id,
                      applicationID: a.applicationId,
                      name: a.name,
                      details: a.details,
                      url: a.url,
                      state: a.state,
                      type: a.type.toString(),
                    };
                  })
              )
              .flat(),
          });
        });
        //console.log(members.filter(m => m.presence.status === "online").select(m => m.presence));

        guild.scheduledEvents.fetch().then((events) => {
          client.events = events;
          client.cachUpdated = Date.now();
          client.events.forEach((event) => {
            let timespanToGo =
              new Date(event.scheduledStartTimestamp).getTime() - Date.now();
            if (timespanToGo / 60000 < 35 && timespanToGo / 60000 > 25) {
              global.client.logChannel.send(
                `${event.name} starting soon\n${event.url}`
              );
            }
          });
        });
      });
    } catch (e) {
      console.log(e);
    }
  });
};
