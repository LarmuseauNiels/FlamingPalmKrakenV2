import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import moment from "moment-timezone";
import { createLogger } from "../utils/logger";

const log = createLogger("TimezonePrompt");

const IANA_TIMEZONES: string[] = (Intl as any).supportedValuesOf("timeZone");

/** Picked in the select menu to fall back to /set-timezone's full search. */
export const OTHER_TIMEZONE = "other";

/**
 * Likely timezones for a Discord client locale, shown first in the picker.
 * Discord doesn't tell bots a user's timezone, but the locale is a good hint.
 */
const LOCALE_TIMEZONES: Record<string, string[]> = {
  nl: ["Europe/Brussels", "Europe/Amsterdam"],
  fr: ["Europe/Brussels", "Europe/Paris"],
  de: ["Europe/Berlin", "Europe/Vienna", "Europe/Zurich"],
  "en-GB": ["Europe/London", "Europe/Dublin"],
  "en-US": ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"],
  "es-ES": ["Europe/Madrid"],
  "es-419": ["America/Mexico_City", "America/Bogota", "America/Buenos_Aires"],
  "pt-BR": ["America/Sao_Paulo"],
  it: ["Europe/Rome"],
  pl: ["Europe/Warsaw"],
  "sv-SE": ["Europe/Stockholm"],
  da: ["Europe/Copenhagen"],
  no: ["Europe/Oslo"],
  fi: ["Europe/Helsinki"],
  cs: ["Europe/Prague"],
  ro: ["Europe/Bucharest"],
  tr: ["Europe/Istanbul"],
  ru: ["Europe/Moscow"],
  uk: ["Europe/Kiev"],
  ja: ["Asia/Tokyo"],
  ko: ["Asia/Seoul"],
  "zh-CN": ["Asia/Shanghai"],
  "zh-TW": ["Asia/Taipei"],
};

/** The rest of the list: one zone per common offset, Brussels first (most members). */
const COMMON_TIMEZONES = [
  "Europe/Brussels",
  "Europe/London",
  "Europe/Helsinki",
  "Europe/Moscow",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Calcutta",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/**
 * A one-click timezone picker. Each option shows the current time there, so
 * members can pick by "which clock matches mine" rather than knowing IANA names.
 */
export function buildTimezonePicker(customId: string, locale?: string): ActionRowBuilder<StringSelectMenuBuilder> {
  const language = locale?.split("-")[0];
  const hinted = [...(LOCALE_TIMEZONES[locale ?? ""] ?? []), ...(LOCALE_TIMEZONES[language ?? ""] ?? [])];
  const zones = [...new Set([...hinted, ...COMMON_TIMEZONES])].filter((z) => IANA_TIMEZONES.includes(z)).slice(0, 24);

  const select = new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder("Pick the clock that matches yours");
  for (const zone of zones) {
    const now = moment.tz(zone);
    select.addOptions({
      label: `${now.format("HH:mm")} — ${zone.replace(/_/g, " ")}`,
      description: `UTC${now.format("Z")}, ${now.format("dddd D MMM")}`,
      value: zone,
    });
  }
  select.addOptions({
    label: "Something else…",
    description: "Search every timezone with /set-timezone",
    value: OTHER_TIMEZONE,
  });
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

export async function getMemberTimezone(memberId: string): Promise<string | null> {
  const member = await global.client.prisma.members.findUnique({
    where: { ID: memberId },
    select: { Timezone: true },
  });
  return member?.Timezone && IANA_TIMEZONES.includes(member.Timezone) ? member.Timezone : null;
}

export async function saveMemberTimezone(memberId: string, timezone: string): Promise<boolean> {
  if (!IANA_TIMEZONES.includes(timezone)) return false;
  await global.client.prisma.members.upsert({
    where: { ID: memberId },
    update: { Timezone: timezone },
    create: { ID: memberId, Timezone: timezone },
  });
  return true;
}

/**
 * After a member's first sign-up or vote, offers the timezone picker once —
 * as an ephemeral follow-up to an interaction that was already replied to.
 * Members who ignore it aren't asked again (Members.TimezonePromptedAt).
 * Never throws: this is a nicety and must not break the action it follows.
 */
export async function offerTimezoneOnce(interaction: any): Promise<void> {
  try {
    const memberId = interaction.user.id;
    const member = await global.client.prisma.members.findUnique({
      where: { ID: memberId },
      select: { Timezone: true, TimezonePromptedAt: true },
    });
    if (!member || member.Timezone || member.TimezonePromptedAt) return;

    // Claim the prompt first so two quick clicks don't both show it.
    const claimed = await global.client.prisma.members.updateMany({
      where: { ID: memberId, TimezonePromptedAt: null },
      data: { TimezonePromptedAt: new Date() },
    });
    if (claimed.count === 0) return;

    await interaction.followUp({
      content:
        "🕒 **Quick one:** what's your timezone? Then times you type (like *Friday 20:00* when suggesting a raid time) are read in your time, not UTC.",
      components: [buildTimezonePicker("timezonePick_set", interaction.locale)],
      ephemeral: true,
    });
  } catch (err) {
    log.error("Failed to offer timezone picker:", err);
  }
}
