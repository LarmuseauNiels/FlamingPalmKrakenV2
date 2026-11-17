import { ActivityType, BaseGuildTextChannel } from "discord.js";
import axios from "axios";
import { FpgClient } from "../components/FpgClient";
import { createLogger } from "../utils/logger";
import { scheduleJob } from "../utils/scheduleJob";

const log = createLogger("VintageStoryStatus");

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
  throw new Error(
    `VintageStory master server request failed: ${res.status} ${res.statusText}`
  );
}

const VS_CHANNEL_ID = "1423193044567462009";
const VS_CHANNEL_BASE_NAME = "🏕️┃vintage-story";
const VS_MAX_PLAYERS = 8;

/**
 * Discord allows 2 channel renames per 10 minutes and discord.js queues the
 * rest, so renaming every minute grew an ever-longer queue of stale renames.
 * Only rename (and set the presence) when the wanted value changes.
 */
let lastChannelName: string | null = null;
let lastActivityText: string | null = null;

async function applyStatus(client: FpgClient, players: number | null): Promise<void> {
  const activityText = players === null ? "flamingpalm.com" : `VintageStory ${players}/${VS_MAX_PLAYERS}`;
  if (activityText !== lastActivityText) {
    client.user.setActivity(activityText, {
      type: players === null ? ActivityType.Watching : ActivityType.Playing,
    });
    lastActivityText = activityText;
  }

  const channelName = players === null ? VS_CHANNEL_BASE_NAME : `${VS_CHANNEL_BASE_NAME}-${players}`;
  if (channelName === lastChannelName) return;

  const channel = (await client.channels.fetch(VS_CHANNEL_ID)) as BaseGuildTextChannel;
  if (channel.name !== channelName) await channel.setName(channelName);
  lastChannelName = channelName;
}

async function updateStatus(client: FpgClient): Promise<void> {
  let players: number | null = null;
  try {
    const data = await fetchVintageStoryServers();
    const server = data.data.find((s) => s.serverName === process.env.VS_SERVER_NAME);
    if (server) {
      players = server.players;
    } else {
      log.debug(`No server found for ${process.env.VS_SERVER_NAME} — server may be offline`);
    }
  } catch (err) {
    log.warn("Failed to fetch Vintage Story servers:", (err as any)?.message ?? err);
  }
  await applyStatus(client, players);
}

module.exports = function (client: FpgClient) {
  scheduleJob("Vintage Story status", "10 * * * * *", () => updateStatus(client));
};
