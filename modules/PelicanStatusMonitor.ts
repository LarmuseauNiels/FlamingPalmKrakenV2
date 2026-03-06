import cron from "node-cron";
import axios from "axios";
import { EmbedBuilder, TextChannel } from "discord.js";
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
    .filter((s: any) => !s.attributes.is_suspended)
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
  } catch (err) {
    log.error(`Failed to fetch backups for ${id}:`, err);
    return null;
  }
}

// ── Embed builder ─────────────────────────────────────────────────────────────

function buildEmbed(
  servers: PelicanServer[],
  resources: Map<string, ServerResources>,
  extras: Map<string, ServerExtra>
): EmbedBuilder {
  const statuses  = [...resources.values()];
  const allOnline = statuses.length > 0 && statuses.every(r => r.current_state === "running");
  const anyOnline = statuses.some(r => r.current_state === "running");
  const color     = allOnline ? 0x57f287 : anyOnline ? 0xfee75c : 0xed4245;

  const embed = new EmbedBuilder()
    .setTitle("🖥️ Server Status")
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: "Last updated" });

  if (servers.length === 0) {
    embed.setDescription("No servers found.");
    return embed;
  }

  for (const server of servers) {
    const res   = resources.get(server.identifier);
    const extra = extras.get(server.identifier);

    if (!res) {
      embed.addFields({ name: `❓ ${server.name}`, value: "Status unavailable", inline: false });
      continue;
    }

    const emoji = stateEmoji(res.current_state, res.is_suspended);
    const lines: string[] = [];

    if (res.is_suspended) {
      lines.push("Suspended");
    } else if (res.current_state === "offline") {
      lines.push("Offline");
    } else {
      // Line 1 — node · connection address
      const nodeParts = [`🖧 \`${server.node}\``];
      if (server.allocation) nodeParts.push(`🔗 \`${server.allocation.address}\``);
      lines.push(nodeParts.join(" · "));

      // Line 2 — CPU · RAM · Disk
      const resourceParts = [
        `CPU: \`${res.resources.cpu_absolute.toFixed(1)}%\``,
        server.limits.memory > 0
          ? `RAM: \`${formatBytes(res.resources.memory_bytes)} / ${server.limits.memory}MB\``
          : `RAM: \`${formatBytes(res.resources.memory_bytes)}\``,
        server.limits.disk > 0
          ? `Disk: \`${formatBytes(res.resources.disk_bytes)} / ${server.limits.disk}MB\``
          : `Disk: \`${formatBytes(res.resources.disk_bytes)}\``,
      ];
      lines.push(resourceParts.join(" · "));

      // Line 3 — Network I/O · Uptime
      const networkParts = [
        `↓ \`${formatBytes(res.resources.network_rx_bytes)}\``,
        `↑ \`${formatBytes(res.resources.network_tx_bytes)}\``,
      ];
      if (res.current_state === "running") {
        networkParts.push(`Uptime: \`${formatUptime(res.resources.uptime)}\``);
      } else {
        networkParts.push(`State: \`${res.current_state}\``);
      }
      lines.push(networkParts.join(" · "));

      // Line 4 — Last backup (if available)
      if (extra?.lastBackup) {
        lines.push(`💾 Last backup: \`${extra.lastBackup.age}\` · \`${extra.lastBackup.size}\``);
      } else if (extra?.lastBackup === null) {
        lines.push("💾 No backups found");
      }

      // Line 5 — Variables
      if (server.variables.length) {
        const varList = server.variables
          .map(v => `${v.name}: \`${v.server_value}\``)
          .join(" · ");
        lines.push(`⚙️ ${varList}`);
      }
    }

    embed.addFields({ name: `${emoji} ${server.name}`, value: lines.join("\n"), inline: false });
  }

  return embed;
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

  let statusMessageId: string | null = null;

  async function resolveStatusMessage(channel: TextChannel): Promise<string | null> {
    const messages = await channel.messages.fetch({ limit: 50 });
    const existing = messages.find(
      m => m.author.id === client.user?.id && m.embeds[0]?.title === "🖥️ Server Status"
    );
    return existing?.id ?? null;
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
              } catch (err) {
                log.error(`Failed to fetch resources for ${server.name}:`, err);
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

      const embed   = buildEmbed(servers, resourceMap, extrasMap);
      const channel = (await client.channels.fetch(channelId)) as TextChannel;

      // On first run after reboot, scan the channel to recover the existing message
      if (!statusMessageId) {
        statusMessageId = await resolveStatusMessage(channel);
      }

      if (statusMessageId) {
        try {
          const existing = await channel.messages.fetch(statusMessageId);
          await existing.edit({ embeds: [embed] });
          return;
        } catch {
          // Message was deleted — post a fresh one below
          statusMessageId = null;
        }
      }

      const msg = await channel.send({ embeds: [embed] });
      statusMessageId = msg.id;
    } catch (err) {
      log.error("Failed to update Pelican server status:", err);
    }
  }

  // Initial update on startup, then refresh every minute
  await updateStatus();
  cron.schedule("0 * * * * *", () => {
    updateStatus().catch((err) => log.error("Pelican status cron error:", err));
  });
};
