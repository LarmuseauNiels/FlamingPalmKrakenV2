import cron from "node-cron";
import { EmbedBuilder, GuildMember, TextChannel } from "discord.js";
import { RaidModule } from "./RaidModule";
import { FpgClient } from "../components/FpgClient";

interface Member {
  ID: string;
  DisplayName?: string;
  avatar?: string;
}

interface VoiceConnected {
  ID: string;
  ChannelID: string;
  ChannelName: string;
  deaf: boolean;
  mute: boolean;
  streaming: boolean;
}

interface PresenceData {
  userID: string;
  applicationID: string | null;
  name: string;
  details: string | null;
  url: string | null;
  state: string | null;
  type: string;
  status: string;
}

module.exports = async function (client: FpgClient) {
  let knownuserCache: Member[] = [];
  console.log("loading statistics module");
  await client.prisma.members
    .findMany({
      select: {
        ID: true,
      },
    })
    .then((members: Member[]) => (knownuserCache = members));

  cron.schedule("30 0,15,30,45 * * * *", () => {
    console.log("running statistics tracking cron job");
    try {
      client.guilds.fetch(process.env.GUILD_ID!).then((guild) => {
        guild.members.fetch().then((members) => {
          members.forEach((member: GuildMember) => {
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
                .then((t: Member) => {
                  knownuserCache.push(t);
                });
            }
          });

          client.prisma.voiceConnected
            .createMany({
              data: members
                .filter(
                  (m: GuildMember) =>
                    m.voice.channel != null &&
                    m.voice.channelId !== "1128264365854961766"
                )
                .map((z: GuildMember) => {
                  return {
                    ID: z.id,
                    ChannelID: z.voice.channelId!,
                    ChannelName: cleanString(z.voice.channel!.name),
                    deaf: z.voice.deaf,
                    mute: z.voice.mute,
                    streaming: z.voice.streaming,
                  } as VoiceConnected;
                }),
            })
            .then((x) =>
              console.log("tracked " + x.count + " members in voice channels")
            );

          client.prisma.presence
            .createMany({
              data: members
                .filter(
                  (m: GuildMember) =>
                    m.presence?.status !== "offline" &&
                    m.user?.bot === false &&
                    (m.presence?.activities?.length ?? 0) > 0
                )
                .map((z: GuildMember) =>
                  z
                    .presence!.activities.filter((a) => a.type !== 4)
                    .map((a) => {
                      return {
                        userID: z.id,
                        applicationID: a.applicationId,
                        name: cleanString(a.name),
                        details: cleanString(a.details),
                        url: cleanString(a.url),
                        state: cleanString(a.state),
                        type: a.type.toString(),
                        status: z.presence!.status,
                      } as PresenceData;
                    })
                )
                .flat(),
            })
            .then((x) => {
              console.log(x);
            });

          global.client.achievementsModule.checkAchievements(members);
        });

        guild.scheduledEvents.fetch().then((events) => {
          client.events = events;
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
                  .then((announcements: TextChannel) => {
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
};

function cleanString(input: string | null | undefined): string {
  if (input === null || input === undefined) return "";
  let output = "";
  input = input.toString();
  for (let i = 0; i < input.length; i++) {
    if (input.charCodeAt(i) <= 127) {
      output += input.charAt(i);
    }
  }
  return output;
}
