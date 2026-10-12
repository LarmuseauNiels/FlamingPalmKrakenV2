import cron from "node-cron";
import axios from "axios";
import { GameDig } from "gamedig";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  TextChannel,
} from "discord.js";
import { FpgClient } from "../components/FpgClient";
import { createLogger } from "../utils/logger";
import { ValheimPlayerTracker, watchServerConsole } from "./ValheimPlayerLog";

const log = createLogger("PelicanStatus");

// Public hostname players connect to; also used for player-count queries.
const PUBLIC_HOST = "server.flamingpalm.com";

interface Allocation {
  address: string; // "host:port" or "ip:port"
}

interface ServerVariable {
  name: string;
  server_value: string;
}

// Which GameDig game type to query for player counts, read from the
// server's Pelican description: "gamedig: valheim" and optionally
// "gamedig_port: 27016" when the query port differs from the game port.
interface PlayerQueryConfig {
  type: string;
  port: number;
}

interface PlayerInfo {
  online: number;
  max: number;
  names: string[];
}

interface PelicanServer {
  identifier: string;
  name: string;
  node: string;
  playerQuery: PlayerQueryConfig | null;
  statusChannelId: string | null;
  limits: {
    memory: number; // MB, 0 = unlimited
    disk: number;   // MB, 0 = unlimited
    cpu: number;    // %, 0 = unlimited
  };
  allocation: Allocation | null;
  variables: ServerVariable[];
}

interface ServerResources {
  current_state: string;
  is_suspended: boolean;
  resources: {
    memory_bytes: number;
    cpu_absolute: number;
    disk_bytes: number;
    network_rx_bytes: number;
    network_tx_bytes: number;
    uptime: number; // ms
  };
}

interface LastBackup {
  age: string;     // e.g. "3h ago"
  size: string;    // e.g. "1.4GB"
}

interface ServerExtra {
  lastBackup: LastBackup | null;
  players: PlayerInfo | null;
}

// Console-log player trackers for Valheim servers, by Pelican identifier
const playerTrackers = new Map<string, ValheimPlayerTracker>();

// ── Formatters ────────────────────────────────────────────────────────────────

function formatUptime(ms: number): string {
  if (ms <= 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const days    = Math.floor(totalSeconds / 86400);
  const hours   = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0)  parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)}GB`;
  return `${Math.round(mb)}MB`;
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60)   return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)    return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function stateEmoji(state: string, suspended: boolean): string {
  if (suspended) return "⛔";
  switch (state) {
    case "running":  return "🟢";
    case "starting": return "🟡";
    case "stopping": return "🟠";
    default:         return "🔴";
  }
}

// ── API fetchers ──────────────────────────────────────────────────────────────

function apiGet(baseUrl: string, apiKey: string, path: string): Promise<any> {
  return axios.get(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    timeout: 10000,
  });
}

async function fetchServers(baseUrl: string, apiKey: string): Promise<PelicanServer[]> {
  const res = await apiGet(baseUrl, apiKey, "/api/client?type=admin-all");
  return res.data.data
    .map((s: any) => {
      const allocs = s.attributes.relationships?.allocations?.data ?? [];
      const primary = allocs.find((a: any) => a.attributes.is_default) ?? allocs[0];
      const allocation: Allocation | null = primary
        ? { address: `${PUBLIC_HOST}:${primary.attributes.port}` }
        : null;

      const variables: ServerVariable[] = (s.attributes.relationships?.variables?.data ?? [])
        .map((v: any) => ({ name: v.attributes.name, server_value: v.attributes.server_value }));

      return {
        identifier: s.attributes.identifier,
        name:       s.attributes.name,
        node:       s.attributes.node?.trim() ?? "Unknown",
        playerQuery: parsePlayerQueryConfig(s.attributes.description, primary?.attributes.port),
        statusChannelId: s.attributes.description?.match(/discord_channel:\s*(\d+)/i)?.[1] ?? null,
        limits:     s.attributes.limits,
        allocation,
        variables,
      };
    });
}

function parsePlayerQueryConfig(description: string | null | undefined, gamePort: number | undefined): PlayerQueryConfig | null {
  const type = description?.match(/gamedig:\s*([a-z0-9_-]+)/i)?.[1];
  if (!type) return null;
  const queryPort = description.match(/gamedig_port:\s*(\d+)/i)?.[1];
  const port = queryPort ? Number(queryPort) : gamePort;
  return port ? { type: type.toLowerCase(), port } : null;
}

/**
 * Queries the live player count via GameDig. Returns null when the server
 * has no gamedig tag or the query fails (unknown, not empty).
 */
async function fetchPlayers(server: PelicanServer): Promise<PlayerInfo | null> {
  if (!server.playerQuery) return null;
  try {
    const state = await GameDig.query({
      type: server.playerQuery.type,
      host: PUBLIC_HOST,
      port: server.playerQuery.port,
      socketTimeout: 2000,
      attemptTimeout: 5000,
      maxRetries: 1,
      checkOldIDs: true,
    });
    const online = state.numplayers ?? state.players.length;
    let names = state.players.map((p) => p.name).filter(Boolean);
    // Valheim reports blank names over A2S; fall back to the console tracker
    const tracker = playerTrackers.get(server.identifier);
    if (names.length === 0 && tracker) names = tracker.namesFor(online) ?? [];
    return { online, max: state.maxplayers, names };
  } catch (err: any) {
    log.debug(`Player query failed for ${server.name} (${server.playerQuery.type}:${server.playerQuery.port}): ${err.message || err}`);
    return null;
  }
}

function formatPlayers(players: PlayerInfo): string {
  const count = players.max > 0 ? `${players.online}/${players.max}` : `${players.online}`;
  if (players.names.length === 0) return count;
  const shown = players.names.slice(0, 10).join(", ");
  const more = players.names.length > 10 ? ` +${players.names.length - 10} more` : "";
  return `${count} (${shown}${more})`;
}

async function fetchResources(baseUrl: string, apiKey: string, id: string): Promise<ServerResources> {
  const res = await apiGet(baseUrl, apiKey, `/api/client/servers/${id}/resources`);
  return res.data.attributes;
}

async function fetchLastBackup(baseUrl: string, apiKey: string, id: string): Promise<LastBackup | null> {
  try {
    const res = await apiGet(baseUrl, apiKey, `/api/client/servers/${id}/backups`);
    const successful = res.data.data
      .filter((b: any) => b.attributes.is_successful && b.attributes.completed_at)
      .sort((a: any, b: any) =>
        new Date(b.attributes.completed_at).getTime() - new Date(a.attributes.completed_at).getTime()
      );
    if (successful.length === 0) return null;
    const latest = successful[0].attributes;
    return {
      age:  formatRelativeTime(new Date(latest.completed_at)),
      size: formatBytes(latest.bytes),
    };
  } catch (err: any) {
    if (err.response?.status === 409) {
      log.warn(`Backups locked for ${id} (server busy/conflict).`);
    } else {
      log.error(`Failed to fetch backups for ${id}:`, err.message || err);
    }
    return null;
  }
}

// ── Per-server embed & buttons ─────────────────────────────────────────────────

function buildServerEmbed(
  server: PelicanServer,
  res: ServerResources | undefined,
  extra: ServerExtra | undefined
): EmbedBuilder {
  if (!res) {
    return new EmbedBuilder()
      .setTitle(`❓ ${server.name}`)
      .setColor(0x95a5a6)
      .setDescription("Status unavailable")
      .setFooter({ text: `${server.identifier} · Last updated` })
      .setTimestamp();
  }

  const emoji = stateEmoji(res.current_state, res.is_suspended);
  const color = res.is_suspended
    ? 0x95a5a6
    : res.current_state === "running"
      ? 0x57f287
      : res.current_state === "starting" || res.current_state === "stopping"
        ? 0xfee75c
        : 0xed4245;

  const embed = new EmbedBuilder()
    .setTitle(`${emoji} ${server.name}`)
    .setColor(color)
    .setFooter({ text: `${server.identifier} · Last updated` })
    .setTimestamp();

  if (res.is_suspended) {
    embed.setDescription("Suspended");
    return embed;
  }

  if (res.current_state === "offline") {
    embed.setDescription("Offline");
    return embed;
  }

  if (res.current_state === "missing") {
    embed.setDescription("Missing (machine offline)");
    return embed;
  }

  // Node + address
  const nodeParts = [`\`${server.node}\``];
  if (server.allocation) nodeParts.push(`\`${server.allocation.address}\``);
  embed.addFields({ name: "Node", value: nodeParts.join(" · "), inline: true });

  // State / uptime
  const stateValue = res.current_state === "running"
    ? `Running · \`${formatUptime(res.resources.uptime)}\``
    : res.current_state.charAt(0).toUpperCase() + res.current_state.slice(1);
  embed.addFields({ name: "State", value: stateValue, inline: true });

  // Players (blank keeps the 3-column layout when the server has no gamedig tag)
  if (server.playerQuery) {
    const players = extra?.players;
    const value = players
      ? `\`${players.max > 0 ? `${players.online}/${players.max}` : players.online}\``
      : "Unknown";
    embed.addFields({ name: "Players", value, inline: true });
  } else {
    embed.addFields({ name: "\u200b", value: "\u200b", inline: true });
  }

  if (extra?.players?.names.length) {
    const names = extra.players.names;
    const shown = names.slice(0, 20).join(", ");
    const more = names.length > 20 ? ` +${names.length - 20} more` : "";
    embed.addFields({ name: "Online", value: `${shown}${more}`.slice(0, 1024), inline: false });
  }

  // CPU · RAM · Disk
  embed.addFields({
    name: "Resources",
    value: [
      `CPU: \`${res.resources.cpu_absolute.toFixed(1)}%\``,
      server.limits.memory > 0
        ? `RAM: \`${formatBytes(res.resources.memory_bytes)} / ${server.limits.memory}MB\``
        : `RAM: \`${formatBytes(res.resources.memory_bytes)}\``,
      server.limits.disk > 0
        ? `Disk: \`${formatBytes(res.resources.disk_bytes)} / ${server.limits.disk}MB\``
        : `Disk: \`${formatBytes(res.resources.disk_bytes)}\``,
    ].join("  ·  "),
    inline: false,
  });

  // Network
  embed.addFields({
    name: "Network",
    value: `↓ \`${formatBytes(res.resources.network_rx_bytes)}\`  ·  ↑ \`${formatBytes(res.resources.network_tx_bytes)}\``,
    inline: true,
  });

  // Last backup
  if (extra?.lastBackup) {
    embed.addFields({
      name: "Last Backup",
      value: `\`${extra.lastBackup.age}\` · \`${extra.lastBackup.size}\``,
      inline: true,
    });
  } else {
    embed.addFields({ name: "Last Backup", value: "None found", inline: true });
  }

  // Variables
  if (server.variables.length) {
    embed.addFields({
      name: "Variables",
      value: server.variables.map(v => `${v.name}: \`${v.server_value}\``).join("  ·  "),
      inline: false,
    });
  }

  return embed;
}

function buildServerButtons(
  server: PelicanServer,
  res: ServerResources | undefined
): ActionRowBuilder<ButtonBuilder> {
  const state = res?.current_state ?? "unknown";
  const suspended = res?.is_suspended ?? false;

  const isRunning = state === "running" && !suspended;
  const isOffline = state === "offline" && !suspended;

  const startBtn = new ButtonBuilder()
    .setCustomId(`pelican_start_${server.identifier}`)
    .setLabel("Start")
    .setEmoji("▶️")
    .setStyle(ButtonStyle.Success)
    .setDisabled(!isOffline);

  const restartBtn = new ButtonBuilder()
    .setCustomId(`pelican_restart_${server.identifier}`)
    .setLabel("Restart")
    .setEmoji("🔄")
    .setStyle(ButtonStyle.Primary)
    .setDisabled(!isRunning);

  const stopBtn = new ButtonBuilder()
    .setCustomId(`pelican_stop_${server.identifier}`)
    .setLabel("Stop")
    .setEmoji("⏹️")
    .setStyle(ButtonStyle.Danger)
    .setDisabled(!isRunning);

  const controlPanelBtn = new ButtonBuilder()
    .setLabel("Control Panel")
    .setEmoji("🖥️")
    .setStyle(ButtonStyle.Link)
    .setURL(`https://pelican.majesty.flamingpalm.com/server/${server.identifier}`);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(startBtn, restartBtn, stopBtn, controlPanelBtn);
}

// ── Per-server text channel (name + topic) ──────────────────────────────────

// Discord allows 2 name/topic edits per channel per 10 minutes, so edits are
// spaced out and only sent when something changed; the next tick catches up.
const CHANNEL_EDIT_INTERVAL_MS = 5 * 60 * 1000;
const STATUS_LINE_RE = /^(🟢|🟡|🟠|🔴) /u;
const channelEdits = new Map<string, { lastEdit: number; inFlight: boolean }>();

function buildStatusLine(res: ServerResources | undefined, players: PlayerInfo | null): string {
  const state = res?.is_suspended ? "suspended" : res?.current_state;
  if (state === "starting") return "🟡 Starting…";
  if (state === "stopping") return "🟠 Stopping…";
  if (state !== "running") return "🔴 Offline";
  if (players.online === 0) return "🟢 Online · nobody playing";
  if (players.names.length === 0) return `🟢 ${players.online} online`;
  return `🟢 ${players.online} online: ${players.names.join(", ")}`;
}

/**
 * Mirrors a server's player count into its channel name ("valheim-3") and who
 * is online into the first line of the channel topic. Enabled per server with
 * "discord_channel: <channel id>" in the Pelican description.
 */
async function updateServerChannel(
  client: FpgClient,
  server: PelicanServer,
  res: ServerResources | undefined,
  players: PlayerInfo | null
): Promise<void> {
  // A failed player query on a running server: keep the last known state
  // rather than flapping the channel name
  if (res?.current_state === "running" && !players) return;

  const channelId = server.statusChannelId;
  const edits = channelEdits.get(channelId) ?? { lastEdit: 0, inFlight: false };
  channelEdits.set(channelId, edits);
  if (edits.inFlight || Date.now() - edits.lastEdit < CHANNEL_EDIT_INTERVAL_MS) return;

  const channel = (await client.channels.fetch(channelId)) as TextChannel;
  const baseName = channel.name.replace(/-\d+$/, "");
  const name = res?.current_state === "running" ? `${baseName}-${players.online}` : baseName;

  const rest = (channel.topic ?? "").split("\n");
  if (STATUS_LINE_RE.test(rest[0])) rest.shift();
  const topic = [buildStatusLine(res, players), ...rest].join("\n").trim().slice(0, 1024);

  if (name === channel.name && topic === (channel.topic ?? "")) return;

  edits.inFlight = true;
  try {
    await channel.edit({ name, topic });
    edits.lastEdit = Date.now();
  } finally {
    edits.inFlight = false;
  }
}

// ── Module entry ──────────────────────────────────────────────────────────────

module.exports = async function (client: FpgClient) {
  const baseUrl   = process.env.PELICAN_URL?.replace(/\/$/, "");
  const apiKey    = process.env.PELICAN_API_KEY;
  const channelId = process.env.PELICAN_STATUS_CHANNEL_ID;

  if (!baseUrl || !apiKey || !channelId) {
    log.warn(
      "Pelican status monitor disabled — set PELICAN_URL, PELICAN_API_KEY, and PELICAN_STATUS_CHANNEL_ID to enable"
    );
    return;
  }

  // Map of server identifier → Discord message ID
  const serverMessages = new Map<string, string>();

  // Scan the channel for previously sent per-server messages from this bot.
  // Each message's embed footer starts with the server identifier.
  async function resolveServerMessages(channel: TextChannel): Promise<void> {
    log.info(`Scanning #${channel.name} for existing server status messages...`);
    const messages = await channel.messages.fetch({ limit: 100 });

    for (const msg of Array.from(messages.values())) {
      if (msg.author.id !== client.user?.id) continue;
      const footer = msg.embeds[0]?.footer?.text;
      if (!footer) continue;

      const identifier = footer.split(" · ")[0].trim();
      // Pelican identifiers are typically 8 characters (hex), but we check for general Alphanumeric
      if (/^[a-z0-9]+$/.test(identifier) && identifier.length >= 6) {
        if (!serverMessages.has(identifier)) {
          // First one found is the newest (fetch returns newest first)
          serverMessages.set(identifier, msg.id);
          log.info(`Found existing message for ${identifier}: ${msg.id}`);
        } else {
          // Found an older duplicate, delete it to keep channel clean
          const newerId = serverMessages.get(identifier);
          if (msg.id !== newerId) {
            log.info(`Deleting older duplicate message for ${identifier}: ${msg.id}`);
            msg.delete().catch(err => log.error(`Failed to delete duplicate message ${msg.id}:`, err));
          }
        }
      }
    }
  }

  async function updateStatus(): Promise<void> {
    try {
      const servers = await fetchServers(baseUrl, apiKey);

      for (const server of servers) {
        if (server.playerQuery?.type === "valheim" && !playerTrackers.has(server.identifier)) {
          const tracker = new ValheimPlayerTracker();
          playerTrackers.set(server.identifier, tracker);
          watchServerConsole(baseUrl, apiKey, server.identifier, tracker);
        }
      }

      // Fetch resources and backups in parallel for all servers
      const [resourceMap, extrasMap] = await Promise.all([
        (async () => {
          const map = new Map<string, ServerResources>();
          await Promise.all(
            servers.map(async (server) => {
              try {
                map.set(server.identifier, await fetchResources(baseUrl, apiKey, server.identifier));
              } catch (err: any) {
                if (err.response?.status === 409) {
                  log.warn(`Resources locked for ${server.name} (server busy/conflict).`);
                } else {
                  log.error(`Failed to fetch resources for ${server.name}:`, err.message || err);
                }
              }
            })
          );
          return map;
        })(),
        (async () => {
          const map = new Map<string, ServerExtra>();
          await Promise.all(
            servers.map(async (server) => {
              const lastBackup = await fetchLastBackup(baseUrl, apiKey, server.identifier);
              map.set(server.identifier, { lastBackup, players: null });
            })
          );
          return map;
        })(),
      ]);

      // Player counts only make sense for running servers
      await Promise.all(
        servers
          .filter((server) => resourceMap.get(server.identifier)?.current_state === "running")
          .map(async (server) => {
            const extra = extrasMap.get(server.identifier);
            if (extra) extra.players = await fetchPlayers(server);
          })
      );

      // Not awaited: a rate-limited channel edit must not hold up the embeds
      for (const server of servers.filter((s) => s.statusChannelId)) {
        const players = extrasMap.get(server.identifier)?.players ?? null;
        updateServerChannel(client, server, resourceMap.get(server.identifier), players).catch((err) =>
          log.error(`Failed to update channel for ${server.name}:`, err.message || err)
        );
      }

      const channel = (await client.channels.fetch(channelId)) as TextChannel;

      // On first run after reboot, scan the channel to recover existing messages
      if (serverMessages.size === 0) {
        await resolveServerMessages(channel);
      }

      // Update or send a message for each server
      for (const server of servers) {
        const res   = resourceMap.get(server.identifier);
        const extra = extrasMap.get(server.identifier);
        const embed = buildServerEmbed(server, res, extra);
        const row   = buildServerButtons(server, res);

        const existingId = serverMessages.get(server.identifier);
        if (existingId) {
          try {
            const existing = await channel.messages.fetch(existingId);
            await existing.edit({ embeds: [embed], components: [row] });
            continue;
          } catch (err: any) {
            // Only repost if the message was truly deleted or not found
            // Discord error 10008 is "Unknown Message"
            const isNotFound = err.code === 10008 || err.status === 404;

            if (isNotFound) {
              log.warn(`Message ${existingId} for ${server.identifier} not found, will repost.`);
              serverMessages.delete(server.identifier);
            } else {
              log.error(`Failed to edit message ${existingId} for ${server.identifier} (will retry later):`, err);
              continue; // Skip this update but keep the ID in map for next time
            }
          }
        }

        const msg = await channel.send({ embeds: [embed], components: [row] });
        serverMessages.set(server.identifier, msg.id);
      }
    } catch (err: any) {
      log.error("Failed to update Pelican server status:", err.message || err);
    }
  }

  // Initial update on startup, then refresh every minute
  await updateStatus();
  cron.schedule("0 * * * * *", () => {
    updateStatus().catch((err) => log.error("Pelican status cron error:", err));
  });
};

module.exports.getServerStatuses = async function (): Promise<string> {
  const baseUrl = process.env.PELICAN_URL?.replace(/\/$/, "");
  const apiKey = process.env.PELICAN_API_KEY;

  if (!baseUrl || !apiKey) {
    return "Game server monitoring is not configured.";
  }

  try {
    const servers = await fetchServers(baseUrl, apiKey);

    const resourceMap = new Map<string, ServerResources>();
    const playerMap = new Map<string, PlayerInfo>();
    await Promise.all(
      servers.map(async (server) => {
        try {
          const res = await fetchResources(baseUrl, apiKey, server.identifier);
          resourceMap.set(server.identifier, res);
          if (res.current_state === "running") {
            const players = await fetchPlayers(server);
            if (players) playerMap.set(server.identifier, players);
          }
        } catch {
          // Resource fetch failed for this server — skip it
        }
      })
    );

    let string = "";
    servers.forEach((server) => {
      const res = resourceMap.get(server.identifier);
      if (!res) {
        string += `${server.name}: Status unavailable\n`;
        return;
      }
      if (res.is_suspended) {
        string += `${server.name}: Suspended\n`;
        return;
      }
      const address = server.allocation?.address ?? "No address configured";
      const state = res.current_state;
      if (state === "offline" || state === "missing") {
        string += `${server.name}: ${state === "offline" ? "Offline" : "Offline (machine down)"} | Address: ${address}\n`;
        return;
      }
      const uptime = state === "running" ? formatUptime(res.resources.uptime) : "—";
      const cpu = res.resources.cpu_absolute.toFixed(1);
      const ram = formatBytes(res.resources.memory_bytes);
      const players = playerMap.get(server.identifier);
      const playerText = players
        ? ` | Players: ${formatPlayers(players)}`
        : server.playerQuery && state === "running" ? " | Players: unknown" : "";
      string += `${server.name}: ${state} | Address: ${address} | Uptime: ${uptime} | CPU: ${cpu}% | RAM: ${ram}${playerText}\n`;
    });

    return string || "No game servers found.";
  } catch (err: any) {
    log.error("getServerStatuses failed:", err.message || err);
    return "Failed to fetch game server status. Please try again later.";
  }
};

const POWER_SIGNALS: Record<string, { allowedStates: string[]; done: string }> = {
  start:   { allowedStates: ["offline"],             done: "is starting. It may take a minute or two before it is joinable." },
  restart: { allowedStates: ["running"],             done: "is restarting. It may take a minute or two before it is joinable again." },
  stop:    { allowedStates: ["running", "starting"], done: "is stopping." },
};

/**
 * Checks the server's current state allows `signal`, then sends it. Shared by
 * the AI assistant (by name) and the Activity's server page (by identifier).
 * Pelican's 409 "busy" is thrown to the caller.
 */
async function sendPowerSignal(
  baseUrl: string,
  apiKey: string,
  server: PelicanServer,
  signal: string
): Promise<{ ok: boolean; message: string }> {
  const signalInfo = POWER_SIGNALS[signal];
  const res = await fetchResources(baseUrl, apiKey, server.identifier);
  if (res.is_suspended) {
    return { ok: false, message: `${server.name} is suspended and cannot be controlled.` };
  }
  if (res.current_state === "missing") {
    return { ok: false, message: `${server.name} cannot be controlled because its machine is offline.` };
  }
  if (!signalInfo.allowedStates.includes(res.current_state)) {
    return {
      ok: false,
      message: `${server.name} is currently ${res.current_state}, so it can't be sent "${signal}".`,
    };
  }

  await axios.post(
    `${baseUrl}/api/client/servers/${server.identifier}/power`,
    { signal },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 10000,
    }
  );
  snapshotCache = null; // the next dashboard read should show the new state

  const address = server.allocation?.address ?? "no address configured";
  return {
    ok: true,
    message:
      signal === "stop"
        ? `${server.name} ${signalInfo.done}`
        : `${server.name} ${signalInfo.done} Address: ${address}`,
  };
}

/**
 * Sends a power signal (start, restart or stop) to the game server whose name
 * matches `query`. Matching is case-insensitive: an exact name match wins,
 * otherwise a unique partial match is used. Returns a human-readable result
 * for the AI assistant.
 */
module.exports.powerServer = async function (query: string, signal: string): Promise<string> {
  const baseUrl = process.env.PELICAN_URL?.replace(/\/$/, "");
  const apiKey = process.env.PELICAN_API_KEY;

  if (!baseUrl || !apiKey) {
    return "Game server control is not configured.";
  }

  const signalInfo = POWER_SIGNALS[signal];
  if (!signalInfo) {
    return `Unknown power action "${signal}".`;
  }

  try {
    const servers = await fetchServers(baseUrl, apiKey);
    const needle = query.trim().toLowerCase();
    const exact = servers.filter((s) => s.name.toLowerCase() === needle);
    const matches = exact.length ? exact : servers.filter((s) => s.name.toLowerCase().includes(needle));

    if (matches.length === 0) {
      return `No game server matches "${query}". Available servers: ${servers.map((s) => s.name).join(", ") || "none"}.`;
    }
    if (matches.length > 1) {
      return `"${query}" matches several servers: ${matches.map((s) => s.name).join(", ")}. Ask the member which one they mean.`;
    }

    return (await sendPowerSignal(baseUrl, apiKey, matches[0], signal)).message;
  } catch (err: any) {
    if (err.response?.status === 409) {
      return "That server is busy or already changing state. Try again in a moment.";
    }
    log.error(`powerServer (${signal}) failed:`, err.message || err);
    return `Failed to ${signal} the game server. Please try again later.`;
  }
};

// ── Structured snapshot for the Activity's server page ──────────────────────

interface ServerSnapshot {
  id: string;
  name: string;
  /** Pelican state: running, starting, stopping, offline, missing — or "unknown". */
  state: string;
  suspended: boolean;
  address: string | null;
  uptimeMs: number;
  cpuPercent: number;
  memoryBytes: number;
  memoryLimitMb: number;
  diskBytes: number;
  diskLimitMb: number;
  /** null when the server has no gamedig tag, isn't running, or the query failed. */
  players: PlayerInfo | null;
  tracksPlayers: boolean;
  lastBackup: LastBackup | null;
}

// Several members can have the page open at once and each polls; Pelican,
// backups and GameDig are shared across all of them for this long.
const SNAPSHOT_TTL_MS = 8000;
let snapshotCache: { at: number; data: Promise<ServerSnapshot[]> } | null = null;

/**
 * Every Pelican server with live state, resources, players and last backup.
 * Deliberately leaves out server variables — they can hold passwords, and this
 * is readable by every member. Returns null when Pelican isn't configured.
 */
module.exports.getServerSnapshot = function (): Promise<ServerSnapshot[]> | null {
  const baseUrl = process.env.PELICAN_URL?.replace(/\/$/, "");
  const apiKey = process.env.PELICAN_API_KEY;
  if (!baseUrl || !apiKey) return null;

  if (snapshotCache && Date.now() - snapshotCache.at < SNAPSHOT_TTL_MS) {
    return snapshotCache.data;
  }

  const data = (async () => {
    const servers = await fetchServers(baseUrl, apiKey);
    return Promise.all(
      servers.map(async (server): Promise<ServerSnapshot> => {
        const [res, lastBackup] = await Promise.all([
          fetchResources(baseUrl, apiKey, server.identifier).catch((err) => {
            log.debug(`Snapshot: no resources for ${server.name}: ${err.message || err}`);
            return undefined;
          }),
          fetchLastBackup(baseUrl, apiKey, server.identifier),
        ]);
        const running = res?.current_state === "running" && !res.is_suspended;
        return {
          id: server.identifier,
          name: server.name,
          state: res?.current_state ?? "unknown",
          suspended: res?.is_suspended ?? false,
          address: server.allocation?.address ?? null,
          uptimeMs: running ? res.resources.uptime : 0,
          cpuPercent: res?.resources.cpu_absolute ?? 0,
          memoryBytes: res?.resources.memory_bytes ?? 0,
          memoryLimitMb: server.limits.memory,
          diskBytes: res?.resources.disk_bytes ?? 0,
          diskLimitMb: server.limits.disk,
          players: running ? await fetchPlayers(server) : null,
          tracksPlayers: !!server.playerQuery,
          lastBackup,
        };
      })
    );
  })();

  snapshotCache = { at: Date.now(), data };
  // Don't cache a failure — the next poll should try again.
  data.catch(() => {
    if (snapshotCache?.data === data) snapshotCache = null;
  });
  return data;
};

/**
 * Power signal by Pelican identifier, for the Activity. `ok: false` means the
 * request was refused for a reason worth showing (wrong state, busy, unknown
 * server); unexpected failures throw.
 */
module.exports.powerServerById = async function (
  identifier: string,
  signal: string
): Promise<{ ok: boolean; message: string }> {
  const baseUrl = process.env.PELICAN_URL?.replace(/\/$/, "");
  const apiKey = process.env.PELICAN_API_KEY;
  if (!baseUrl || !apiKey) return { ok: false, message: "Game server control is not configured." };
  if (!POWER_SIGNALS[signal]) return { ok: false, message: `Unknown power action "${signal}".` };

  const server = (await fetchServers(baseUrl, apiKey)).find((s) => s.identifier === identifier);
  if (!server) return { ok: false, message: "Server not found." };

  try {
    return await sendPowerSignal(baseUrl, apiKey, server, signal);
  } catch (err: any) {
    if (err.response?.status === 409) {
      return { ok: false, message: "That server is busy or already changing state. Try again in a moment." };
    }
    throw err;
  }
};
