/** Confirm buttons: tools that change something only run after the member presses a button. */
import { createLogger } from "../../utils/logger";
import { TimeParser } from "../../utils/TimeParser";
import { ToolContext } from "./types";
import { checkSchedulingAttendee } from "./raidTools";
import { checkMemberHasAnyRole, formatTime, parseArgs } from "./toolHelpers";

const log = createLogger("OllamaAI");

/** Tools that change something for the member only run after they press a Confirm button. */
export const CONFIRMED_TOOLS = new Set(["createRaid", "joinRaid", "leaveRaid", "manageGameServer", "suggestRaidTime"]);

export const MAX_PENDING_ACTIONS = 4;

/**
 * Checks a confirmable action up front (so the member never gets a button
 * that is bound to fail) and queues its Confirm button. The tool runs for
 * real — re-checking everything — when the button is pressed.
 */
export async function requestConfirmation(name: string, rawArgs: string | object, ctx: ToolContext): Promise<string> {
  const args = parseArgs(rawArgs);
  if (!args) return `Invalid arguments for ${name}.`;
  if (!ctx.authorId) return "Unable to determine which member is asking.";

  let checked: { error: string } | { label: string; args: any };
  try {
    checked = await checkConfirmable(name, args, ctx);
  } catch (err) {
    log.error(`Failed to check ${name}:`, err);
    return "Something went wrong preparing that action. Please try again later.";
  }
  if ("error" in checked) return checked.error;

  const key = name + JSON.stringify(checked.args);
  if (ctx.pendingActions.some((a) => a.tool + JSON.stringify(a.args) === key)) {
    return `A Confirm button for "${checked.label}" is already queued.`;
  }
  if (ctx.pendingActions.length >= MAX_PENDING_ACTIONS) {
    return "Too many actions to confirm at once. Ask the member to confirm these first, then do the rest.";
  }
  ctx.pendingActions.push({ tool: name, args: checked.args, label: checked.label, userId: ctx.authorId });
  return `Waiting for confirmation: a Confirm button labelled ${checked.label} will be shown under your reply. Tell the member to press it. The action has NOT happened yet.`;
}

export async function checkConfirmable(name: string, args: any, ctx: ToolContext): Promise<{ error: string } | { label: string; args: any }> {
  switch (name) {
    case "createRaid": {
      const title = typeof args.title === "string" ? args.title.trim() : "";
      if (!title) return { error: "A raid title is required." };
      const minPlayers = typeof args.minPlayers === "number" && args.minPlayers >= 1 ? Math.floor(args.minPlayers) : 4;
      return { label: `Create raid "${title}" (min ${minPlayers})`, args: { title, minPlayers } };
    }
    case "joinRaid":
    case "leaveRaid": {
      if (typeof args.raidId !== "number") return { error: "A valid numeric raid ID is required." };
      const raid = await globalThis.client.prisma.raids.findFirst({
        where: { ID: args.raidId },
        include: { RaidAttendees: { where: { MemberId: ctx.authorId } } },
      });
      if (!raid) return { error: `Raid ${args.raidId} not found.` };
      const signedUp = raid.RaidAttendees.length > 0;
      if (name === "joinRaid") {
        if (raid.Status !== 1) return { error: `Cannot join "${raid.Title}" — it is no longer open for sign-ups.` };
        if (signedUp) return { error: `The member is already signed up for "${raid.Title}".` };
        return { label: `Join "${raid.Title}"`, args: { raidId: raid.ID } };
      }
      if (!signedUp) return { error: `The member is not signed up for "${raid.Title}".` };
      return { label: `Leave "${raid.Title}"`, args: { raidId: raid.ID } };
    }
    case "manageGameServer": {
      if (typeof args.serverName !== "string" || !args.serverName) return { error: "Please provide the name of the game server." };
      if (args.action !== "restart" && args.action !== "stop") return { error: 'The action must be either "restart" or "stop".' };
      const roleId = process.env.PELICAN_MANAGE_ROLE_ID;
      if (!roleId) return { error: "Restarting or stopping game servers through Kraken is not enabled." };
      const denied = await checkMemberHasAnyRole(ctx.authorId, [roleId], "restart or stop game servers");
      if (denied) return { error: denied };
      const verb = args.action === "restart" ? "Restart" : "Stop";
      return { label: `${verb} ${args.serverName}`, args: { serverName: args.serverName, action: args.action } };
    }
    case "suggestRaidTime": {
      if (typeof args.raidId !== "number") return { error: "A valid numeric raid ID is required." };
      if (typeof args.datetime !== "string" || !args.datetime) return { error: "A date/time to suggest is required." };
      const denied = await checkSchedulingAttendee(args.raidId, ctx.authorId);
      if (denied) return { error: denied };
      const zone = ctx.timezone ?? "UTC";
      const parsed = await TimeParser.parse(args.datetime, zone);
      if (!parsed.isValid()) return { error: `Could not understand "${args.datetime}" as a date/time (timezone ${zone}).` };
      if (parsed.valueOf() <= Date.now()) return { error: `${formatTime(parsed.toDate(), ctx.timezone)} is in the past.` };
      return {
        label: `Suggest ${parsed.clone().tz(zone).format("ddd D MMM HH:mm")} (${zone})`,
        args: { raidId: args.raidId, timestamp: parsed.toISOString() },
      };
    }
    default:
      return { error: "Tool not found." };
  }
}
