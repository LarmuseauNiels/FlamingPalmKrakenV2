const cron = require("node-cron");
const { Collection, EmbedBuilder } = require("discord.js");
const http = require("http");
const Gamedig = require("gamedig");
const { RaidModule } = require("../islander/RaidModule");

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
      client.guilds.fetch(process.env.GUILD_ID).then((guild) => {
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
                    m.voice.channelId !== "1128264365854961766"
                )
                .map((z) => {
                  return {
                    ID: z.id,
                    ChannelID: z.voice.channelId,
                    ChannelName: cleanString(z.voice.channel.name),
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

          global.client.achievementsModule.checkAchievements(members);
        });
        //console.log(members.filter(m => m.presence.status === "online").select(m => m.presence));

        guild.scheduledEvents.fetch().then((events) => {
          client.events = events;
          client.cachUpdated = Date.now();
          client.events.forEach((event) => {
            let timespanToGo =
              new Date(event.scheduledStartTimestamp).getTime() - Date.now();
            let description =
              event?.description !== null ? event.description : "";
            if (timespanToGo / 60000 < 35 && timespanToGo / 60000 > 25) {
              const eventEmbed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle("Starting in 30 min: " + event.name)
                .setURL(event.url)
                .setAuthor({
                  name: event.creator.username,
                  iconURL: event.creator.avatarURL(),
                })
                .setDescription(description)
                .setImage(event.coverImageURL({ size: 512 }))
                .setTimestamp(event.scheduledStartTimestamp)
                .setFooter({
                  text: "Event at ",
                });
              let eventText =
                event.name + event.description ? event.description : "";
              guild.roles.fetch().then((roles) => {
                client.channels
                  .fetch("1128266086119374848")
                  .then((announcements) => {
                    let role = roles.find((role) =>
                      eventText.includes(role.name)
                    );
                    if (role) {
                      announcements.send({
                        content: "<@&" + role.id + ">",
                        embeds: [eventEmbed],
                      });
                    } else {
                      announcements.send({
                        embeds: [eventEmbed],
                      });
                    }
                  });
              });
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

    console.log("running scheduling checker");
    try {
      RaidModule.checkSchedules();
    } catch (e) {
      global.bugsnag.notify(e);
      console.log(e);
    }
  });

  // cron schedule for every 5 minutes


  cron.schedule("15 0,5,10,15,20,25,30,35,40,45,50,55 * * * *", async () => {
    /*
    console.log("running arma tracking cron job");
    let prop = "❌";
    try {
      const apiUrl =
        "https://api.steampowered.com/IGameServersService/GetServerList/v1/?key=315F486717B5586382BEEF04F5C84696&filter=addr\\109.236.142.163:2309";
      let response = await fetch(apiUrl);
      let jsonData = await response.json();
      console.log(jsonData);
      prop = jsonData.response.servers[0].players;
      console.log("The value of propertyName is:", prop);
    } catch (e) {
      console.log(e);
    }*/

    let mcPlayers = "❌";
    try {
      let state = await Gamedig.query({
        type: "minecraft",
        host: "server.flamingpalm.com",
      });
      mcPlayers = state.players.length;
    } catch (e) {
      console.log(e);
    }

    global.client.user.setPresence({
        activities: [
            {
            name: "minecraft with " + mcPlayers + " online",
            type: "PLAYING",
            },
        ],
        status: "online",
        });
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
