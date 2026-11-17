/** Kraken AI tools for raids: listing, details, sign-ups and scheduling votes. */
import { createLogger } from "../../utils/logger";
import { RaidModule } from "../../modules/RaidModule";
import { RaidScheduler, RaidRuleError } from "../../modules/RaidScheduler";
import { ChannelUpdates } from "../../islander/ChannelUpdates";
import { ToolContext } from "./types";
import { formatTime, parseArgs } from "./toolHelpers";

const log = createLogger("OllamaAI");

export async function getRaidsString(): Promise<string> {
  const raids = await globalThis.client.prisma.raids.findMany({
    include: { RaidAttendees: true },
    where: { Status: 1 },
  });
  let string = "";
  raids.forEach((raid) => {
    string += `Raid: ${raid.Title} - ID: ${raid.ID} - Attendees: ${raid.RaidAttendees.length}/${raid.MinPlayers} \n`;
  });
  return string || "No open raids found.";
}

export async function getRaidDetailsString(rawArgs: string | object, ctx: ToolContext): Promise<string> {
  let args: any;
  try {
    args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
  } catch {
    return "Invalid arguments for getRaidDetails.";
  }
  const raidId = args?.raidId;
  if (!raidId || typeof raidId !== "number") {
    return "A valid numeric raid ID is required.";
  }

  const raid = await globalThis.client.prisma.raids.findFirst({
    where: { ID: raidId },
    include: {
      RaidAttendees: true,
      RaidSchedulingOption: { include: { RaidAvailability: true } },
    },
  });

  if (!raid) {
    return `Raid ${raidId} not found.`;
  }

  const statusMap: Record<number, string> = {
    1: "Open (collecting attendees)",
    2: "Scheduling (voting on times)",
    3: "Scheduled (confirmed)",
    4: "Cancelled",
  };
  const statusText = statusMap[raid.Status ?? 1] ?? "Unknown";

  let string = `Raid: ${raid.Title}\n`;
  string += `ID: ${raid.ID}\n`;
  string += `Status: ${statusText}\n`;
  string += `Creator: ${global.client.idToName(raid.Creator) ?? raid.Creator}\n`;
  string += `Min Players: ${raid.MinPlayers ?? 4}\n`;
  string += `Created: ${formatTime(new Date(raid.CreationTime ?? Date.now()), ctx.timezone)}\n`;

  // Attendees
  string += `\nAttendees (${raid.RaidAttendees.length}):\n`;
  if (raid.RaidAttendees.length === 0) {
    string += "  No one has signed up yet.\n";
  } else {
    raid.RaidAttendees.forEach((a: any) => {
      const name = global.client.idToName(a.MemberId) ?? a.MemberId;
      string += `  - ${name}\n`;
    });
  }

  // Scheduling options
  if (raid.RaidSchedulingOption && raid.RaidSchedulingOption.length > 0) {
    string += `\nScheduling Options (letter — time — who can make it):\n`;
    [...raid.RaidSchedulingOption]
      .sort((a: any, b: any) => (a.Timestamp?.getTime() ?? 0) - (b.Timestamp?.getTime() ?? 0))
      .forEach((opt: any) => {
        const time = opt.Timestamp ? formatTime(opt.Timestamp, ctx.timezone) : "Unknown time";
        const selected = opt.IsSelected ? " [SELECTED]" : "";
        const voters = (opt.RaidAvailability ?? []).map((v: any) => global.client.idToName(v.MemberId) ?? v.MemberId);
        const mine = (opt.RaidAvailability ?? []).some((v: any) => v.MemberId === ctx.authorId) ? " [you voted for this]" : "";
        string += `  ${opt.Option ?? "?"} — ${time}${selected}${mine} — ${voters.length} vote(s)${voters.length ? ": " + voters.join(", ") : ""}\n`;
      });
  }

  return string;
}

export async function getUpcomingRaidsString(timezone: string | null): Promise<string> {
  const now = new Date();
  const raids = await globalThis.client.prisma.raids.findMany({
    where: { Status: 3 },
    include: {
      RaidAttendees: true,
      RaidSchedulingOption: { where: { IsSelected: true } },
    },
  });

  const upcoming = raids.filter((r) =>
    r.RaidSchedulingOption.some(
      (opt) => opt.Timestamp !== null && opt.Timestamp > now
    )
  );

  if (upcoming.length === 0) {
    return "No upcoming scheduled raids found.";
  }

  // Sort by earliest scheduled time
  upcoming.sort((a, b) => {
    const aTime = a.RaidSchedulingOption.find((o) => o.IsSelected)?.Timestamp ?? new Date(0);
    const bTime = b.RaidSchedulingOption.find((o) => o.IsSelected)?.Timestamp ?? new Date(0);
    return aTime.getTime() - bTime.getTime();
  });

  let string = "";
  upcoming.forEach((raid) => {
    const selectedOpt = raid.RaidSchedulingOption.find((o) => o.IsSelected);
    const time = selectedOpt?.Timestamp ? formatTime(selectedOpt.Timestamp, timezone) : "Unknown time";
    string += `Raid: ${raid.Title} - ID: ${raid.ID} - When: ${time} - Attendees: ${raid.RaidAttendees.length}/${raid.MinPlayers ?? 4}\n`;
  });
  return string;
}

export async function createRaidString(rawArgs: string | object, authorId: string): Promise<string> {
  let args: any;
  try {
    args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
  } catch {
    return "Invalid arguments for createRaid.";
  }

  const title = args?.title;
  if (!title || typeof title !== "string") {
    return "A raid title is required.";
  }

  const minPlayers = typeof args?.minPlayers === "number" ? args.minPlayers : 4;

  try {
    const raid = await globalThis.client.prisma.raids.create({
      data: {
        Title: title,
        MinPlayers: minPlayers,
        Creator: authorId,
      },
    });

    // Auto-enlist the creator and check scheduling (same flow as /create-raid)
    try {
      await RaidModule.AddAttendeeToRaid(raid.ID, authorId);
      await RaidScheduler.SchedulingCreationCheck(raid.ID);
    } catch (err) {
      log.error("Failed to auto-enlist raid creator:", err);
    }

    // Post the updated raid list to the raid channel
    ChannelUpdates.MessageWithRaid("New raid created: " + title).catch((err) =>
      log.error("Failed to send raid channel update:", err)
    );

    return `Successfully created raid "${title}" (ID: ${raid.ID}) with a minimum of ${minPlayers} players. The creator has been automatically enlisted and the raid has been posted to the raid channel.`;
  } catch (err) {
    log.error("Failed to create raid:", err);
    return "Failed to create the raid. Please try again or use /create-raid instead.";
  }
}

export async function joinRaidString(rawArgs: string | object, authorId: string): Promise<string> {
  let args: any;
  try {
    args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
  } catch {
    return "Invalid arguments for joinRaid.";
  }

  const raidId = args?.raidId;
  if (!raidId || typeof raidId !== "number") {
    return "A valid numeric raid ID is required.";
  }

  if (!authorId) {
    return "Unable to determine which member is joining.";
  }

  // Check the raid exists and is open (Status 1)
  const raid = await globalThis.client.prisma.raids.findFirst({
    where: { ID: raidId },
    include: { RaidAttendees: true },
  });

  if (!raid) {
    return `Raid ${raidId} not found.`;
  }

  if (raid.Status !== 1) {
    const statusMap: Record<number, string> = {
      2: "currently in the scheduling phase",
      3: "already scheduled",
      4: "cancelled",
    };
    return `Cannot join "${raid.Title}" — this raid is ${statusMap[raid.Status ?? 1] ?? "not open for joining"}.`;
  }

  // Check if already joined
  const alreadyJoined = raid.RaidAttendees.some((a: any) => a.MemberId === authorId);
  if (alreadyJoined) {
    return `You are already signed up for "${raid.Title}".`;
  }

  try {
    await RaidModule.AddUserToRaid(authorId, raidId);
    const attendeeCount = raid.RaidAttendees.length + 1;
    return `Successfully joined "${raid.Title}" (ID: ${raidId}). You are attendee ${attendeeCount} of ${raid.MinPlayers ?? 4} needed. The raid channel has been updated.`;
  } catch (err: any) {
    // Handle unique constraint violation (already joined)
    if (err?.code === "P2002") {
      return `You are already signed up for "${raid.Title}".`;
    }
    log.error("Failed to join raid:", err);
    return "Failed to join the raid. Please try again or use the raid channel directly.";
  }
}

export async function leaveRaidString(rawArgs: string | object, authorId: string): Promise<string> {
  let args: any;
  try {
    args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
  } catch {
    return "Invalid arguments for leaveRaid.";
  }

  const raidId = args?.raidId;
  if (!raidId || typeof raidId !== "number") {
    return "A valid numeric raid ID is required.";
  }

  if (!authorId) {
    return "Unable to determine which member is leaving.";
  }

  // Check the raid exists and the user is signed up
  const raid = await globalThis.client.prisma.raids.findFirst({
    where: { ID: raidId },
    include: { RaidAttendees: true },
  });

  if (!raid) {
    return `Raid ${raidId} not found.`;
  }

  const isSignedUp = raid.RaidAttendees.some((a: any) => a.MemberId === authorId);
  if (!isSignedUp) {
    return `You are not signed up for "${raid.Title}".`;
  }

  try {
    await globalThis.client.prisma.raidAttendees.delete({
      where: {
        RaidId_MemberId: {
          RaidId: raidId,
          MemberId: authorId,
        },
      },
    });
    await RaidModule.touchRaid(raidId);

    // Post a channel update so the raid list reflects the change
    ChannelUpdates.MessageWithRaid(`<@${authorId}> has left the raid: ${raid.Title}`).catch((err) =>
      log.error("Failed to send raid channel update after leaving:", err)
    );

    const remaining = raid.RaidAttendees.length - 1;
    return `Successfully left "${raid.Title}". There are now ${remaining} attendee(s) signed up.`;
  } catch (err: any) {
    // Handle record not found (already left)
    if (err?.code === "P2025") {
      return `You are not signed up for "${raid.Title}".`;
    }
    log.error("Failed to leave raid:", err);
    return "Failed to leave the raid. Please try again or use the raid channel directly.";
  }
}

/** Voting is for signed-up members of a raid that is still in scheduling (same rule as the raid board). */
export async function checkSchedulingAttendee(raidId: number, memberId: string): Promise<string | null> {
  const raid = await globalThis.client.prisma.raids.findUnique({
    where: { ID: raidId },
    include: { RaidAttendees: { where: { MemberId: memberId } } },
  });
  if (!raid) return `Raid ${raidId} not found.`;
  if (raid.Status !== 2) return `"${raid.Title}" is not in scheduling, so there are no times to vote on.`;
  if (raid.RaidAttendees.length === 0) return `Only members signed up for "${raid.Title}" can vote on its times.`;
  return null;
}

export async function getMyRaidsString(ctx: ToolContext): Promise<string> {
  if (!ctx.authorId) return "Unable to determine which member is asking.";

  const raids = await globalThis.client.prisma.raids.findMany({
    where: { Status: { in: [1, 2, 3] }, RaidAttendees: { some: { MemberId: ctx.authorId } } },
    include: {
      RaidAttendees: true,
      RaidSchedulingOption: { include: { RaidAvailability: true } },
    },
  });

  const now = Date.now();
  const open = raids.filter((r) => r.Status === 1);
  const scheduling = raids.filter((r) => r.Status === 2);
  const scheduled = raids
    .map((r) => ({ raid: r, time: r.RaidSchedulingOption.find((o) => o.IsSelected)?.Timestamp }))
    .filter((r): r is { raid: (typeof r)["raid"]; time: Date } => r.time != null && r.time.getTime() > now)
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  if (open.length + scheduling.length + scheduled.length === 0) {
    return "The member is not signed up for any open, scheduling or upcoming raids.";
  }

  let string = "";
  if (scheduled.length > 0) {
    string += "Upcoming scheduled raids:\n";
    scheduled.forEach(({ raid, time }) => {
      string += `  ${raid.Title} (ID ${raid.ID}) — ${formatTime(time, ctx.timezone)} — ${raid.RaidAttendees.length} attendees\n`;
    });
  }
  if (scheduling.length > 0) {
    string += "\nRaids in scheduling (voting on times):\n";
    scheduling.forEach((raid) => {
      const voted = raid.RaidSchedulingOption.some((o) => o.RaidAvailability.some((v) => v.MemberId === ctx.authorId));
      string += `  ${raid.Title} (ID ${raid.ID})${voted ? "" : " — THE MEMBER HAS NOT VOTED YET"}\n`;
      [...raid.RaidSchedulingOption]
        .sort((a, b) => (a.Timestamp?.getTime() ?? 0) - (b.Timestamp?.getTime() ?? 0))
        .forEach((opt) => {
          const mine = opt.RaidAvailability.some((v) => v.MemberId === ctx.authorId) ? " [member is available]" : "";
          const time = opt.Timestamp ? formatTime(opt.Timestamp, ctx.timezone) : "Unknown time";
          string += `    ${opt.Option ?? "?"} — ${time} — ${opt.RaidAvailability.length}/${raid.RaidAttendees.length} available${mine}\n`;
        });
    });
  }
  if (open.length > 0) {
    string += "\nOpen raids still gathering players:\n";
    open.forEach((raid) => {
      string += `  ${raid.Title} (ID ${raid.ID}) — ${raid.RaidAttendees.length}/${raid.MinPlayers ?? 4} players\n`;
    });
  }
  return string.trim();
}

export async function setRaidAvailabilityString(rawArgs: string | object, ctx: ToolContext): Promise<string> {
  const args = parseArgs(rawArgs);
  if (!args) return "Invalid arguments for setRaidAvailability.";
  const raidId = args.raidId;
  if (typeof raidId !== "number") return "A valid numeric raid ID is required.";
  if (!ctx.authorId) return "Unable to determine which member is voting.";

  const toLetters = (v: any): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim().toUpperCase()).filter(Boolean) : []);
  const available = toLetters(args.available);
  const unavailable = toLetters(args.unavailable);
  if (available.length + unavailable.length === 0) return "Give at least one option letter in available or unavailable.";
  if (available.some((l) => unavailable.includes(l))) return "An option can't be both available and unavailable.";

  const denied = await checkSchedulingAttendee(raidId, ctx.authorId);
  if (denied) return denied;

  const options = await globalThis.client.prisma.raidSchedulingOption.findMany({ where: { RaidId: raidId } });
  const byLetter = new Map(options.map((o) => [String(o.Option).toUpperCase(), o]));
  const unknown = [...available, ...unavailable].filter((l) => !byLetter.has(l));
  if (unknown.length > 0) {
    return `Unknown option letter(s): ${unknown.join(", ")}. Valid options are: ${[...byLetter.keys()].sort().join(", ")}.`;
  }

  try {
    for (const letter of available) {
      // Every letter was checked against byLetter above (unknown → early return).
      const optionId = byLetter.get(letter)!.ID;
      await globalThis.client.prisma.raidAvailability.upsert({
        where: { SchedulingOptionId_MemberId: { SchedulingOptionId: optionId, MemberId: ctx.authorId } },
        create: { SchedulingOptionId: optionId, MemberId: ctx.authorId },
        update: {},
      });
    }
    if (unavailable.length > 0) {
      await globalThis.client.prisma.raidAvailability.deleteMany({
        where: { MemberId: ctx.authorId, SchedulingOptionId: { in: unavailable.map((l) => byLetter.get(l)!.ID) } },
      });
    }
    await RaidModule.touchRaid(raidId);
    await RaidScheduler.recheckRaid(raidId);
  } catch (err) {
    log.error("Failed to set raid availability:", err);
    return "Failed to save the vote. Please try again, or vote in the scheduling DM or on the raid board.";
  }

  let string = "Vote saved.";
  if (available.length) string += ` Available: ${available.join(", ")}.`;
  if (unavailable.length) string += ` Not available: ${unavailable.join(", ")}.`;

  // The vote may have been the one that settled the time.
  const raid = await globalThis.client.prisma.raids.findUnique({
    where: { ID: raidId },
    include: { RaidSchedulingOption: { where: { IsSelected: true } } },
  });
  const selected = raid?.RaidSchedulingOption[0]?.Timestamp;
  if (raid?.Status === 3 && selected) {
    string += ` That completed the vote: "${raid.Title}" is now scheduled for ${formatTime(selected, ctx.timezone)} and everyone has been notified.`;
  }
  return string;
}

export async function suggestRaidTimeString(rawArgs: string | object, ctx: ToolContext): Promise<string> {
  const args = parseArgs(rawArgs);
  const raidId = args?.raidId;
  const timestamp = args?.timestamp ? new Date(args.timestamp) : null;
  if (typeof raidId !== "number" || !timestamp || isNaN(timestamp.getTime())) {
    return "Invalid arguments for suggestRaidTime.";
  }

  const denied = await checkSchedulingAttendee(raidId, ctx.authorId);
  if (denied) return denied;

  try {
    const option = await RaidScheduler.suggestTime(raidId, ctx.authorId, timestamp);
    return `Suggested ${formatTime(timestamp, ctx.timezone)} as option ${option.Option} and marked you available for it. The other attendees have been notified.`;
  } catch (err) {
    if (err instanceof RaidRuleError) return err.message;
    log.error("Failed to suggest raid time:", err);
    return "Failed to suggest that time. Please try again, or use the raid board.";
  }
}
