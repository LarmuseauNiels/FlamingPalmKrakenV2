/**
 * Tool name → handler. Replaces a long switch: adding a tool is one line here
 * plus its definition in toolDefinitions.ts, and a mismatch between the two
 * fails at startup instead of answering "Tool not found." to the model.
 */
import { ToolContext, ToolHandler } from "./types";
import { TOOL_DEFINITIONS } from "./toolDefinitions";
import { CONFIRMED_TOOLS } from "./confirmation";
import {
  createRaidString,
  getMyRaidsString,
  getRaidDetailsString,
  getRaidsString,
  getUpcomingRaidsString,
  joinRaidString,
  leaveRaidString,
  setRaidAvailabilityString,
  suggestRaidTimeString,
} from "./raidTools";
import { getGameServerStatusString, manageGameServerString, startGameServerString } from "./gameServerTools";
import { controlMusicString, getMusicQueueString, playMusicString } from "./musicTools";
import {
  getEventsString,
  getMemberPointsString,
  getSteamGameInfoString,
  getStoreString,
  getTimestampString,
  getTimezoneString,
  setTimezoneString,
} from "./memberTools";

const author = (ctx: ToolContext) => ctx.authorId || "";

export const TOOL_HANDLERS: Readonly<Record<string, ToolHandler>> = {
  getEvents: (_args, ctx) => getEventsString(ctx.timezone),
  getRaids: () => getRaidsString(),
  getStore: () => getStoreString(),
  getRaidDetails: (args, ctx) => getRaidDetailsString(args, ctx),
  getUpcomingRaids: (_args, ctx) => getUpcomingRaidsString(ctx.timezone),
  createRaid: (args, ctx) => createRaidString(args, author(ctx)),
  getTimestamp: (args, ctx) => getTimestampString(args, author(ctx)),
  getMemberPoints: (_args, ctx) => getMemberPointsString(author(ctx)),
  getGameServerStatus: () => getGameServerStatusString(),
  joinRaid: (args, ctx) => joinRaidString(args, author(ctx)),
  setTimezone: (args, ctx) => setTimezoneString(args, author(ctx)),
  getTimezone: (_args, ctx) => getTimezoneString(author(ctx)),
  leaveRaid: (args, ctx) => leaveRaidString(args, author(ctx)),
  getSteamGameInfo: (args) => getSteamGameInfoString(args),
  startGameServer: (args, ctx) => startGameServerString(args, author(ctx)),
  manageGameServer: (args, ctx) => manageGameServerString(args, author(ctx)),
  getMyRaids: (_args, ctx) => getMyRaidsString(ctx),
  setRaidAvailability: (args, ctx) => setRaidAvailabilityString(args, ctx),
  suggestRaidTime: (args, ctx) => suggestRaidTimeString(args, ctx),
  playMusic: (args, ctx) => playMusicString(args, ctx),
  getMusicQueue: () => getMusicQueueString(),
  controlMusic: (args, ctx) => controlMusicString("controlMusic", args, ctx),
  setMusicVolume: (args, ctx) => controlMusicString("setMusicVolume", args, ctx),
  setMusicLoop: (args, ctx) => controlMusicString("setMusicLoop", args, ctx),
};

/** Throws if definitions, handlers and Confirm-button tools don't line up. Exported for tests. */
export function assertToolsConsistent(): void {
  const defined = TOOL_DEFINITIONS.map((tool) => tool.function?.name);
  const handled = Object.keys(TOOL_HANDLERS);
  const problems: string[] = [];

  const duplicates = defined.filter((name, index) => defined.indexOf(name) !== index);
  if (duplicates.length) problems.push(`defined twice: ${duplicates.join(", ")}`);
  const unhandled = defined.filter((name) => !TOOL_HANDLERS[name]);
  if (unhandled.length) problems.push(`defined without a handler: ${unhandled.join(", ")}`);
  const undefinedTools = handled.filter((name) => !defined.includes(name));
  if (undefinedTools.length) problems.push(`handler without a definition: ${undefinedTools.join(", ")}`);
  const unknownConfirmed = [...CONFIRMED_TOOLS].filter((name) => !TOOL_HANDLERS[name]);
  if (unknownConfirmed.length) problems.push(`confirmed tool without a handler: ${unknownConfirmed.join(", ")}`);

  if (problems.length) throw new Error(`Kraken AI tools are inconsistent — ${problems.join("; ")}`);
}

assertToolsConsistent();
