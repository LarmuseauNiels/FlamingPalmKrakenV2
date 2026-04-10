import cron from "node-cron";
import axios from "axios";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  TextChannel,
} from "discord.js";
import { FpgClient } from "../components/FpgClient";
import { createLogger } from "../utils/logger";

const log = createLogger("PelicanStatus");

interface Allocation {
  address: string; // "host:port" or "ip:port"
}

interface ServerVariable {
  name: string;
  server_value: string;
}

interface PelicanServer {
  identifier: string;
  name: string;
  node: string;
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
}

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
        ? { address: `${primary.attributes.ip_alias || primary.attributes.ip}:${primary.attributes.port}` }
        : null;

      const variables: ServerVariable[] = (s.attributes.relationships?.variables?.data ?? [])
        .map((v: any) => ({ name: v.attributes.name, server_value: v.attributes.server_value }));

      return {
        identifier: s.attributes.identifier,
        name:       s.attributes.name,
        node:       s.attributes.node?.trim() ?? "Unknown",
        limits:     s.attributes.limits,
        allocation,
        variables,
      };
    });
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

  // Blank for layout
  embed.addFields({ name: "\u200b", value: "\u200b", inline: true });

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
              map.set(server.identifier, { lastBackup });
            })
          );
          return map;
        })(),
      ]);

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
