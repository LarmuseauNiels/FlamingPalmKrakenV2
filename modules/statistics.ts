import { Collection, EmbedBuilder, Guild, GuildMember, TextChannel } from "discord.js";
import { RaidScheduler } from "./RaidScheduler";
import { FpgClient } from "../components/FpgClient";
import { createLogger } from "../utils/logger";
import { scheduleJob } from "../utils/scheduleJob";

const log = createLogger("Statistics");

// Event text → role to tag, for events whose name doesn't contain the role
// name itself. Checked before the generic "role name appears in the event"
// match. /create-spark names events "Spark: <game>" (older ones
// "Saturday Spark: <game>"), but the role is called "Sparks".
const EVENT_ROLE_ALIASES: { text: string; roleName: string }[] = [
  { text: "Spark:", roleName: "Sparks" },
];

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

/** The job runs every 15 minutes; the announcement window below depends on it. */
const STATISTICS_CRON = "30 0,15,30,45 * * * *";
const STATISTICS_INTERVAL_MINUTES = 15;

/**
 * Events are announced "starting in 30 min" when a tick sees them in
 * (30 - 7.5, 30 + 7.5] minutes. The window is exactly one interval wide and
 * half-open, so every event is announced by exactly one tick. (It used to be
 * 25–35 minutes: narrower than the interval, so events starting 8–12 minutes
 * past a quarter hour fell between two ticks and were never announced.)
 */
const ANNOUNCE_LEAD_MINUTES = 30;
const ANNOUNCE_WINDOW_MIN_MINUTES = ANNOUNCE_LEAD_MINUTES - STATISTICS_INTERVAL_MINUTES / 2;
const ANNOUNCE_WINDOW_MAX_MINUTES = ANNOUNCE_LEAD_MINUTES + STATISTICS_INTERVAL_MINUTES / 2;

/** Voice channel excluded from voice tracking (AFK channel). */
const UNTRACKED_VOICE_CHANNEL_ID = "1128264365854961766";
const ANNOUNCEMENTS_CHANNEL_ID = "1128266086119374848";
/** Activity type 4 is a custom status, which isn't a game being played. */
const CUSTOM_STATUS_ACTIVITY_TYPE = 4;

module.exports = async function (client: FpgClient) {
  log.info("Loading statistics module");
  const knownMemberIds = new Set<string>();
  try {
    const members = await client.prisma.members.findMany({ select: { ID: true } });
    for (const member of members) knownMemberIds.add(member.ID);
  } catch (error) {
    log.error("Failed to load known member ids:", error);
  }

  scheduleJob("Statistics", STATISTICS_CRON, () => runStatistics(client, knownMemberIds));
};

/**
 * One statistics tick. Every step is independent and isolated, so a failing
 * Discord call (say, invites) never stops stats, announcements or raid upkeep.
 */
async function runStatistics(client: FpgClient, knownMemberIds: Set<string>): Promise<void> {
  log.info("Running statistics tracking");
  const guild = await runStep("fetch guild", () => client.guilds.fetch(process.env.GUILD_ID!));

  if (guild) {
    const members = await runStep("fetch guild members", () => guild.members.fetch());
    if (members) {
      await runStep("register new members", () => registerNewMembers(client, members, knownMemberIds));
      await runStep("track voice", () => trackVoice(client, members));
      await runStep("track presence", () => trackPresence(client, members));
      await runStep("check achievements", () => client.achievementsModule.checkAchievements(members));
    }
    await runStep("announce events", () => announceUpcomingEvents(client, guild));
    await runStep("refresh invites", async () => {
      client.invites.set(guild.id, await guild.invites.fetch());
    });
  }

  await runStep("expire stale raids", () => RaidScheduler.expireStaleRaids());
  await runStep("check raid schedules", () => RaidScheduler.checkSchedules());
}

async function runStep<T>(name: string, step: () => Promise<T>): Promise<T | null> {
  try {
    return await step();
  } catch (error) {
    log.error(`Statistics step "${name}" failed:`, error);
    return null;
  }
}

/** Creates a Members row for anyone not seen before. Sequential, to keep DB load flat. */
async function registerNewMembers(
  client: FpgClient,
  members: Collection<string, GuildMember>,
  knownMemberIds: Set<string>
): Promise<void> {
  for (const member of members.values()) {
    if (knownMemberIds.has(member.user.id)) continue;
    try {
      await client.prisma.members.upsert({
        where: { ID: member.user.id },
        select: { ID: true },
        update: { DisplayName: member.user.username, avatar: member.user.avatar },
        create: { ID: member.user.id, DisplayName: member.user.username, avatar: member.user.avatar },
      });
      knownMemberIds.add(member.user.id);
    } catch (error) {
      log.error(`Failed to upsert member ${member.user.id}:`, error);
    }
  }
}

async function trackVoice(client: FpgClient, members: Collection<string, GuildMember>): Promise<void> {
  const data: VoiceConnected[] = members
    .filter((m) => m.voice.channel != null && m.voice.channelId !== UNTRACKED_VOICE_CHANNEL_ID)
    .map((m) => ({
      ID: m.id,
      ChannelID: m.voice.channelId!,
      ChannelName: cleanString(m.voice.channel!.name),
      deaf: m.voice.deaf,
      mute: m.voice.mute,
      streaming: m.voice.streaming,
    }));
  const result = await client.prisma.voiceConnected.createMany({ data });
  log.info(`Tracked ${result.count} members in voice channels`);
}

async function trackPresence(client: FpgClient, members: Collection<string, GuildMember>): Promise<void> {
  const data: PresenceData[] = [...members.values()]
    .filter((m) => m.presence?.status !== "offline" && m.user?.bot === false && (m.presence?.activities?.length ?? 0) > 0)
    .flatMap((m) =>
      m.presence!.activities
        .filter((a) => a.type !== CUSTOM_STATUS_ACTIVITY_TYPE)
        .map((a) => ({
          userID: m.id,
          applicationID: a.applicationId,
          name: cleanString(a.name),
          details: cleanString(a.details),
          url: cleanString(a.url),
          state: cleanString(a.state),
          type: a.type.toString(),
          status: m.presence!.status,
        }))
    );
  const result = await client.prisma.presence.createMany({ data });
  log.debug(`Tracked ${result.count} presence records`);
}

/** Refreshes the event cache for the website and announces events starting in ~30 min. */
async function announceUpcomingEvents(client: FpgClient, guild: Guild): Promise<void> {
  const events = await guild.scheduledEvents.fetch();
  client.events = events;

  const now = Date.now();
  const dueEvents = [...events.values()].filter((event) => {
    const minutesToGo = (event.scheduledStartTimestamp - now) / 60_000;
    return minutesToGo > ANNOUNCE_WINDOW_MIN_MINUTES && minutesToGo <= ANNOUNCE_WINDOW_MAX_MINUTES;
  });
  if (dueEvents.length === 0) return;

  const roles = await guild.roles.fetch();
  const announcements = (await client.channels.fetch(ANNOUNCEMENTS_CHANNEL_ID)) as TextChannel;
  for (const event of dueEvents) {
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(`Starting in ${ANNOUNCE_LEAD_MINUTES} min: ${event.name}`)
      .setURL(event.url)
      .setAuthor({ name: event.creator.username, iconURL: event.creator.avatarURL() })
      .setDescription(event.description || null)
      .setImage(event.coverImageURL({ size: 512 }))
      .setTimestamp(event.scheduledStartTimestamp)
      .setFooter({ text: "Event at " });

    const eventText = event.name + (event.description ?? "");
    const alias = EVENT_ROLE_ALIASES.find((a) => eventText.includes(a.text));
    const role =
      (alias && roles.find((r) => r.name === alias.roleName)) || roles.find((r) => eventText.includes(r.name));

    try {
      await announcements.send(role ? { content: `<@&${role.id}>`, embeds: [embed] } : { embeds: [embed] });
    } catch (error) {
      log.error(`Failed to announce event ${event.id}:`, error);
    }
  }
}

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
