import cron from "node-cron";
import {ActivityType, BaseGuildTextChannel, EmbedBuilder, GuildMember, TextChannel} from "discord.js";
import { RaidModule } from "./RaidModule";
import { FpgClient } from "../components/FpgClient";
import { GameDig } from 'gamedig';
import axios from "axios";
import { config } from "../config";
import { logger } from "./Logger";


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

async function fetchVintageStoryServers(): Promise<any> {
  const url = "https://masterserver.vintagestory.at/api/v1/servers/list";
  const res = await axios.get(url, {
    headers: { Accept: "application/json" },
    timeout: 15000,
    validateStatus: () => true,
  });
  if (res.status >= 200 && res.status < 300) {
    return res.data;
  }
  throw new Error(`VintageStory master server request failed: ${res.status} ${res.statusText}`);
}

export default async function initStatistics(client: FpgClient) {
  let knownuserCache: Member[] = [];
  logger.info("Loading statistics module");

  knownuserCache = await client.prisma.members.findMany({
    select: { ID: true },
  });

  // Vintage Story server status — every minute
  cron.schedule("10 * * * * *", async () => {
    try {
      const data = await fetchVintageStoryServers();
      const server = data.data.find((s: any) => s.serverName === "Vintage Flaming Story");
      if (!server) {
        throw new Error("No server found for Vintage Flaming Story");
      }
      global.client.user.setActivity('VintageStory ' + server.players + '/8', { type: ActivityType.Playing });
      const channel = await client.channels.fetch(config.channels.vintageStory);
      if (channel) {
        (channel as BaseGuildTextChannel).setName("🏕️┃vintage-story-" + server.players);
      }
    } catch (e) {
      logger.debug("Vintage Story fetch failed: " + (e instanceof Error ? e.message : e));
      global.client.user.setActivity('flamingpalm.com', { type: ActivityType.Watching });
      try {
        const channel = await client.channels.fetch(config.channels.vintageStory);
        if (channel) {
          (channel as BaseGuildTextChannel).setName("🏕️┃vintage-story");
        }
      } catch {
        // Channel fetch failed — not critical
      }
    }
  });

  // Main statistics tracking — every 15 minutes
  cron.schedule("30 0,15,30,45 * * * *", async () => {
    logger.info("Running statistics tracking cron job");

    try {
      const guild = await client.guilds.fetch(config.guildId);
      const members = await guild.members.fetch();

      // Sync new members to database
      for (const member of members.values()) {
        const known = knownuserCache.find((ku) => ku.ID === member.user.id);
        if (!known) {
          const created = await client.prisma.members.upsert({
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
          });
          knownuserCache.push(created);
        }
      }

      // Track voice connected members
      const voiceData = members
        .filter(
          (m: GuildMember) =>
            m.voice.channel != null &&
            m.voice.channelId !== config.channels.afk
        )
        .map((z: GuildMember) => ({
          ID: z.id,
          ChannelID: z.voice.channelId!,
          ChannelName: cleanString(z.voice.channel!.name),
          deaf: z.voice.deaf,
          mute: z.voice.mute,
          streaming: z.voice.streaming,
        } as VoiceConnected));

      const voiceResult = await client.prisma.voiceConnected.createMany({ data: voiceData });
      logger.info("Tracked " + voiceResult.count + " members in voice channels");

      // Track presence data
      const presenceData = members
        .filter(
          (m: GuildMember) =>
            m.presence?.status !== "offline" &&
            m.user?.bot === false &&
            (m.presence?.activities?.length ?? 0) > 0
        )
        .map((z: GuildMember) =>
          z.presence!.activities
            .filter((a) => a.type !== 4)
            .map((a) => ({
              userID: z.id,
              applicationID: a.applicationId,
              name: cleanString(a.name),
              details: cleanString(a.details),
              url: cleanString(a.url),
              state: cleanString(a.state),
              type: a.type.toString(),
              status: z.presence!.status,
            } as PresenceData))
        )
        .flat();

      const presenceResult = await client.prisma.presence.createMany({ data: presenceData });
      logger.debug("Tracked " + presenceResult.count + " presence entries");

      // Check achievements
      await global.client.achievementsModule.checkAchievements(members);

      // Update cached events
      const events = await guild.scheduledEvents.fetch();
      client.events = events;

      // Send 30-minute event reminders
      for (const event of events.values()) {
        const timespanToGo = new Date(event.scheduledStartTimestamp).getTime() - Date.now();
        const minutesToGo = timespanToGo / 60000;
        if (minutesToGo < 35 && minutesToGo > 25) {
          const description = event?.description ?? "";
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
            .setFooter({ text: "Event at " });

          const eventText = event.name + (event.description ?? "");
          const roles = await guild.roles.fetch();
          const announcements = await client.channels.fetch(config.channels.announcements) as TextChannel;
          const role = roles.find((r) => eventText.includes(r.name));

          if (role) {
            await announcements.send({
              content: "<@&" + role.id + ">",
              embeds: [eventEmbed],
            });
          } else {
            await announcements.send({ embeds: [eventEmbed] });
          }
        }
      }

      // Refresh invites cache
      const invites = await guild.invites.fetch();
      global.client.invites.set(guild.id, invites);
    } catch (e) {
      logger.error("Statistics cron error", e);
    }

    // Check raid schedules
    try {
      await RaidModule.checkSchedules();
    } catch (e) {
      logger.error("Raid scheduling error", e);
    }
  });
}

export function cleanString(input: string | null | undefined): string {
  if (input === null || input === undefined) return "";
  let output = "";
  const str = input.toString();
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) <= 127) {
      output += str.charAt(i);
    }
  }
  return output;
}
