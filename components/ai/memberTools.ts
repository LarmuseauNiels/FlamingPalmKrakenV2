/** Kraken AI tools about the member and the community: events, store, points, timezone, timestamps, Steam. */
import { createLogger } from "../../utils/logger";
import { TimeParser } from "../../utils/TimeParser";
import { getSteamGameInfo } from "../../modules/SteamModule";
import { formatTime } from "./toolHelpers";

const log = createLogger("OllamaAI");

export async function getEventsString(timezone: string | null): Promise<string> {
  let string = "";
  if (globalThis.client.events) {
    for (let e of globalThis.client.events) {
      let event = globalThis.client.events.get(e[0]);
      string += `Event: ${event.name} - Date: ${formatTime(
        new Date(event.scheduledStartTimestamp),
        timezone
      )} - Description: ${event.description} - Link: ${event.url} \n`;
    }
  }
  return string || "No upcoming events found.";
}

export async function getStoreString(): Promise<string> {
  let rewards = await global.client.prisma.reward.findMany({
    include: {
      RewardItem: { where: { RedeemedBy: "" }, select: { RewardItemID: true } },
    },
    orderBy: { Price: "asc" },
  });
  let string = "";
  rewards.forEach((reward) => {
    if (reward.visible) {
      let stock = reward.RewardItem.length;
      if (stock === 0) string += `Reward: ${reward.Title} - Out of stock \n`;
      else {
        string += `Reward: ${reward.Title} - Price: ${reward.Price} palm trees \n`;
      }
    }
  });
  return string || "Store is currently empty.";
}

export async function getMemberPointsString(authorId: string): Promise<string> {
  if (!authorId) {
    return "Unable to determine which member is asking.";
  }

  // Fetch current points balance
  const points = await globalThis.client.prisma.points.findUnique({
    where: { userid: authorId },
  });

  // Fetch recent point history (last 10 entries)
  const history = await globalThis.client.prisma.pointHistory.findMany({
    where: { userid: authorId },
    orderBy: { TimeStamp: "desc" },
    take: 10,
  });

  const totalPoints = points?.TotalPoints ?? 0;
  const memberName = global.client.idToName(authorId) ?? "Unknown member";

  let string = `Member: ${memberName}\n`;
  string += `Total palm tree points: ${totalPoints}\n`;

  if (points?.lastComment) {
    string += `Last transaction: ${points.lastComment}\n`;
  }

  if (history.length > 0) {
    string += `\nRecent point history (last ${history.length}):\n`;
    history.forEach((entry: any) => {
      const date = new Date(entry.TimeStamp).toLocaleDateString();
      string += `  ${date}: ${entry.points > 0 ? "+" : ""}${entry.points} — ${entry.comment}\n`;
    });
  } else {
    string += "\nNo recent point history found.";
  }

  return string;
}

export async function getTimezoneString(authorId: string): Promise<string> {
  if (!authorId) {
    return "Unable to determine which member is requesting their timezone.";
  }

  try {
    const member = await globalThis.client.prisma.members.findUnique({
      where: { ID: authorId },
      select: { Timezone: true, DisplayName: true },
    });

    if (!member) {
      return "You don't have a timezone configured yet. Use the setTimezone tool with a valid IANA timezone name (e.g. Europe/Brussels, America/New_York) to set one.";
    }

    if (!member.Timezone) {
      return "You don't have a timezone configured yet. Use the setTimezone tool with a valid IANA timezone name (e.g. Europe/Brussels, America/New_York) to set one.";
    }

    // Validate the stored value is still a recognized IANA timezone
    const validTimezones: string[] = (Intl as any).supportedValuesOf("timeZone");
    if (!validTimezones.includes(member.Timezone)) {
      return `Your timezone is currently set to "${member.Timezone}", but this is not a recognised IANA timezone anymore. Please set a new one using the setTimezone tool (e.g. Europe/Brussels, America/New_York).`;
    }

    // Show the user-friendly current time in their zone so they can sanity-check it
    const now = new Date();
    const localTime = now.toLocaleString("en-GB", { timeZone: member.Timezone, dateStyle: "full", timeStyle: "long" });

    return `Your timezone is currently set to ${member.Timezone}. The current time there is ${localTime}. If this looks wrong, tell me your new timezone and I'll update it.`;
  } catch (err) {
    log.error("Failed to get timezone:", err);
    return "Failed to retrieve your timezone. Please try again or use /set-timezone to set it.";
  }
}

export async function setTimezoneString(rawArgs: string | object, authorId: string): Promise<string> {
  let args: any;
  try {
    args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
  } catch {
    return "Invalid arguments for setTimezone.";
  }

  const timezone = args?.timezone;
  if (!timezone || typeof timezone !== "string") {
    return "A valid IANA timezone name is required (e.g. Europe/Brussels, America/New_York).";
  }

  // Validate against IANA timezone list
  const validTimezones: string[] = (Intl as any).supportedValuesOf("timeZone");
  if (!validTimezones.includes(timezone)) {
    return `"${timezone}" is not a valid IANA timezone. Examples of valid timezones: Europe/Brussels, America/New_York, Asia/Tokyo, Australia/Sydney.`;
  }

  if (!authorId) {
    return "Unable to determine which member is setting their timezone.";
  }

  try {
    await globalThis.client.prisma.members.upsert({
      where: { ID: authorId },
      update: { Timezone: timezone },
      create: { ID: authorId, Timezone: timezone },
    });

    return `Your timezone has been set to ${timezone}. The bot will now use this timezone when parsing date/time inputs for you (e.g. timestamps and raid scheduling).`;
  } catch (err) {
    log.error("Failed to set timezone:", err);
    return "Failed to set your timezone. Please try again or use /set-timezone.";
  }
}

export async function getTimestampString(rawArgs: string | object, authorId: string): Promise<string> {
  let args: any;
  try {
    args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
  } catch {
    return "Invalid arguments for getTimestamp.";
  }

  const datetimeInput = args?.datetime;
  if (!datetimeInput || typeof datetimeInput !== "string") {
    return "A date/time input is required.";
  }

  // Look up the user's timezone
  let timezone = "UTC";
  let timezoneWasSet = false;
  try {
    const member = await globalThis.client.prisma.members.findUnique({
      where: { ID: authorId },
      select: { Timezone: true },
    });
    if (member?.Timezone) {
      timezone = member.Timezone;
      timezoneWasSet = true;
    }
  } catch (err) {
    log.error("Failed to fetch member timezone for timestamp:", err);
  }

  const parsed = await TimeParser.parse(datetimeInput, timezone);

  if (!parsed.isValid()) {
    const tzNote = timezoneWasSet
      ? `Timezone: ${timezone}`
      : "No timezone set (using UTC). The user can set their timezone with /set-timezone.";
    return `Could not parse "${datetimeInput}" as a date/time. ${tzNote}`;
  }

  const unixSeconds = parsed.unix();

  const formats = [
    { label: "Short time", code: "t", example: "9:41 PM" },
    { label: "Long time", code: "T", example: "9:41:30 PM" },
    { label: "Short date", code: "d", example: "30/06/2021" },
    { label: "Long date", code: "D", example: "30 June 2021" },
    { label: "Short date/time", code: "f", example: "30 June 2021 9:41 PM" },
    { label: "Long date/time", code: "F", example: "Wednesday, 30 June 2021 9:41 PM" },
    { label: "Relative", code: "R", example: "in 2 hours" },
  ];

  let string = `Timestamps for "${datetimeInput}" (Timezone: ${timezoneWasSet ? timezone : "UTC (not set)"}):\n`;
  formats.forEach((f) => {
    const tag = `<t:${unixSeconds}:${f.code}>`;
    string += `${f.label}: ${tag} — copy: \`${tag}\`\n`;
  });

  return string;
}

export async function getSteamGameInfoString(rawArgs: string | object): Promise<string> {
  let args: any;
  try {
    args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
  } catch {
    return "Invalid arguments for getSteamGameInfo.";
  }
  const query = args?.query;
  if (!query || typeof query !== "string") {
    return "Please provide a game name to look up.";
  }
  try {
    return await getSteamGameInfo(query);
  } catch (error) {
    log.error("getSteamGameInfo failed", error);
    return "Sorry, I couldn't look up that game on Steam right now.";
  }
}
