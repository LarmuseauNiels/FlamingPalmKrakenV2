const cron = require("node-cron");
const { Collection, EmbedBuilder } = require("discord.js");

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

          client.prisma.presence
            .createMany({
              data: members
                .filter(
                  (m) =>
                    m.presence?.status !== "offline" &&
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
                        name: cleanString(a.name),
                        details: cleanString(a.details),
                        url: cleanString(a.url),
                        state: cleanString(a.state),
                        type: a.type.toString(),
                        status: z.presence.status,
                      };
                    })
                )
                .flat(),
            })
            .then((x) => {
              console.log(x);
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
              const eventEmbed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle("Starting in 30 min: " + event.name)
                .setURL(event.url)
                .setAuthor({
                  name: event.creator.username,
                  iconURL: event.creator.avatarURL(),
                })
                .setDescription(event?.description ?? event.name)
                .setImage(event.coverImageURL({ size: 512 }))
                .setTimestamp(event.scheduledStartTimestamp)
                .setFooter({
                  text: "Event at ",
                });

              global.client.logChannel.send({ embeds: [eventEmbed] });
              //client.channels.cache.get("711936563000508496").send({ embeds: [eventEmbed] });
            }
          });
        });

        guild.invites.fetch().then((invites) => {
          global.client.invites.set(guild.id, invites);
        });
      });
    } catch (e) {
      global.bugsnag.notify(e);
      console.log(e);
    }
  });
};

function cleanString(input) {
  if (input === null || input === undefined) return "";
  var output = "";
  input = input.toString();
  for (var i = 0; i < input.length; i++) {
    if (input.charCodeAt(i) <= 127) {
      output += input.charAt(i);
    }
  }
  return output;
}
