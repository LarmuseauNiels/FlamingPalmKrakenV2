import cron from "node-cron";
import axios from "axios";
import { EmbedBuilder, TextChannel } from "discord.js";
import { FpgClient } from "../components/FpgClient";
import { createLogger } from "../utils/logger";

const log = createLogger("PelicanStatus");

interface PelicanServer {
  identifier: string;
  name: string;
  limits: {
    memory: number; // MB, 0 = unlimited
    cpu: number;    // %, 0 = unlimited
  };
}

interface ServerResources {
  current_state: string;
  is_suspended: boolean;
  resources: {
    memory_bytes: number;
    cpu_absolute: number;
    disk_bytes: number;
    uptime: number; // ms
  };
}

function formatUptime(ms: number): string {
  if (ms <= 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)}GB`;
  return `${Math.round(mb)}MB`;
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

async function fetchServers(baseUrl: string, apiKey: string): Promise<PelicanServer[]> {
  const res = await axios.get(`${baseUrl}/api/client`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    timeout: 10000,
  });
  return res.data.data.map((s: any) => ({
    identifier: s.attributes.identifier,
    name: s.attributes.name,
    limits: s.attributes.limits,
  }));
}

async function fetchResources(baseUrl: string, apiKey: string, identifier: string): Promise<ServerResources> {
  const res = await axios.get(`${baseUrl}/api/client/servers/${identifier}/resources`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    timeout: 10000,
  });
  return res.data.attributes;
}

function buildEmbed(servers: PelicanServer[], resources: Map<string, ServerResources>): EmbedBuilder {
  const statuses = [...resources.values()];
  const allOnline  = statuses.length > 0 && statuses.every(r => r.current_state === "running");
  const anyOnline  = statuses.some(r => r.current_state === "running");
  const color = allOnline ? 0x57f287 : anyOnline ? 0xfee75c : 0xed4245;

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
    const res = resources.get(server.identifier);
    if (!res) {
      embed.addFields({ name: `❓ ${server.name}`, value: "Status unavailable", inline: false });
      continue;
    }

    const emoji = stateEmoji(res.current_state, res.is_suspended);
    let valueStr: string;

    if (res.is_suspended) {
      valueStr = "Suspended";
    } else if (res.current_state === "offline") {
      valueStr = "Offline";
    } else {
      const parts = [
        `CPU: \`${res.resources.cpu_absolute.toFixed(1)}%\``,
        server.limits.memory > 0
          ? `RAM: \`${formatBytes(res.resources.memory_bytes)} / ${server.limits.memory}MB\``
          : `RAM: \`${formatBytes(res.resources.memory_bytes)}\``,
        res.current_state === "running"
          ? `Uptime: \`${formatUptime(res.resources.uptime)}\``
          : `State: \`${res.current_state}\``,
      ];
      valueStr = parts.join(" | ");
    }

    embed.addFields({ name: `${emoji} ${server.name}`, value: valueStr, inline: false });
  }

  return embed;
}

module.exports = async function (client: FpgClient) {
  const baseUrl  = process.env.PELICAN_URL?.replace(/\/$/, "");
  const apiKey   = process.env.PELICAN_API_KEY;
  const channelId = process.env.PELICAN_STATUS_CHANNEL_ID;

  if (!baseUrl || !apiKey || !channelId) {
    log.warn(
      "Pelican status monitor disabled — set PELICAN_URL, PELICAN_API_KEY, and PELICAN_STATUS_CHANNEL_ID to enable"
    );
    return;
  }

  let statusMessageId: string | null = null;

  async function updateStatus(): Promise<void> {
    try {
      const servers = await fetchServers(baseUrl, apiKey);

      const resourceMap = new Map<string, ServerResources>();
      await Promise.all(
        servers.map(async (server) => {
          try {
            const res = await fetchResources(baseUrl, apiKey, server.identifier);
            resourceMap.set(server.identifier, res);
          } catch (err) {
            log.error(`Failed to fetch resources for ${server.name}:`, err);
          }
        })
      );

      const embed = buildEmbed(servers, resourceMap);
      const channel = (await client.channels.fetch(channelId)) as TextChannel;

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
