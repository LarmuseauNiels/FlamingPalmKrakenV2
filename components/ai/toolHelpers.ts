/** Small helpers shared by the Kraken AI tools: argument parsing, time formatting, member lookups. */
import { createLogger } from "../../utils/logger";
import moment from "moment-timezone";
import { GuildMember, GuildTextBasedChannel } from "discord.js";

const log = createLogger("OllamaAI");

export function parseArgs(rawArgs: string | object): any {
  try {
    const args = typeof rawArgs === "string" ? JSON.parse(rawArgs || "{}") : rawArgs;
    return args && typeof args === "object" ? args : null;
  } catch {
    return null;
  }
}

/** "Fri 17 Oct 2026 19:00 Europe/Brussels (<t:...:F>)" — readable for the model, tagged for Discord. */
export function formatTime(date: Date, timezone: string | null): string {
  const zone = timezone ?? "UTC";
  const unix = Math.floor(date.getTime() / 1000);
  return `${moment.tz(date, zone).format("ddd D MMM YYYY HH:mm")} ${zone} (<t:${unix}:F>)`;
}

export async function getMemberTimezone(authorId: string): Promise<string | null> {
  try {
    const member = await globalThis.client.prisma.members.findUnique({
      where: { ID: authorId },
      select: { Timezone: true },
    });
    const validTimezones: string[] = (Intl as any).supportedValuesOf("timeZone");
    return member?.Timezone && validTimezones.includes(member.Timezone) ? member.Timezone : null;
  } catch (err) {
    log.error("Failed to fetch member timezone:", err);
    return null;
  }
}

/** The member on the FlamingPalm server, for voice-channel checks (works when asked from a DM). */
export async function getGuildMember(authorId: string): Promise<GuildMember | null> {
  const guild = await global.client.guilds.fetch(process.env.GUILD_ID!);
  return await guild.members.fetch(authorId).catch(() => null);
}

/** Display name for tool output — never a <@id> mention, which the reply could turn into a ping. */
export function memberName(userId: string): string {
  const guild = global.client.guilds.cache.get(process.env.GUILD_ID!);
  return guild?.members.cache.get(userId)?.displayName ?? global.client.idToName(userId) ?? "a member";
}

/**
 * Returns null when the guild member has at least one of `roleIds`,
 * otherwise a message for the model explaining why the action was refused.
 */
export async function checkMemberHasAnyRole(authorId: string, roleIds: string[], actionLabel: string): Promise<string | null> {
  try {
    const guild = await global.client.guilds.fetch(process.env.GUILD_ID!);
    const member = await guild.members.fetch(authorId).catch(() => null);
    if (!member || !roleIds.some((id) => member.roles.cache.has(id))) {
      return `This member does not have the role required to ${actionLabel}. Tell them to ask an admin.`;
    }
    return null;
  } catch (err: any) {
    log.error("Failed to verify game server role:", err);
    return "Couldn't verify the member's permissions right now. Please try again later.";
  }
}
