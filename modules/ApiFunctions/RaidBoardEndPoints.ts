import { authenticateToken, jsonify } from "./Helpers";
import {
  MAX_SCHEDULING_OPTIONS,
  RaidRuleError,
  RaidScheduler,
} from "../RaidScheduler";
import { createLogger } from "../../utils/logger";

const log = createLogger("RaidBoardEndPoints");

/**
 * Member-facing raid endpoints behind the Activity's live scheduling board.
 * The board polls GET /members/raids/:id/board; votes and suggestions go
 * through the same RaidScheduler paths as the DM select menu and modal, so
 * consensus, DMs and LFG announcements behave identically either way.
 */
export function raidBoardEndPoints(app) {
  const apiPrefix = "/members/raids";

  // GET /members/raids — open and scheduling raids, for the board's picker.
  app.get(apiPrefix, authenticateToken, async function (req, res) {
    try {
      const raids = await global.client.prisma.raids.findMany({
        where: { Status: { in: [1, 2] } },
        include: { RaidAttendees: { select: { MemberId: true } } },
        orderBy: { CreationTime: "desc" } as any,
      });

      res.send(
        jsonify(
          raids.map((raid) => ({
            id: raid.ID,
            title: raid.Title,
            minPlayers: raid.MinPlayers,
            status: raid.Status,
            attendeeCount: raid.RaidAttendees.length,
            attending: raid.RaidAttendees.some((a) => a.MemberId === req.user.id),
          }))
        )
      );
    } catch (err) {
      log.error("Failed to list raids:", err);
      res.status(500).send("Failed to load raids");
    }
  });

  // GET /members/raids/:id/board — everything one board view needs.
  app.get(apiPrefix + "/:id/board", authenticateToken, async function (req, res) {
    try {
      const raidId = parseInt(req.params.id, 10);
      const raid = await global.client.prisma.raids.findUnique({
        where: { ID: raidId },
        include: {
          RaidAttendees: {
            include: { Members: { select: { DisplayName: true, avatar: true } } },
            orderBy: { CreationTime: "asc" } as any,
          },
          RaidSchedulingOption: {
            include: { RaidAvailability: { select: { MemberId: true } } },
            orderBy: { Timestamp: "asc" } as any,
          },
        },
      });

      if (!raid) return res.status(404).send("Raid not found");

      res.send(
        jsonify({
          id: raid.ID,
          title: raid.Title,
          minPlayers: raid.MinPlayers,
          status: raid.Status,
          maxOptions: MAX_SCHEDULING_OPTIONS,
          attending: raid.RaidAttendees.some((a) => a.MemberId === req.user.id),
          attendees: raid.RaidAttendees.map((a) => ({
            id: a.MemberId,
            name: a.Members?.DisplayName ?? "Unknown",
            avatar: a.Members?.avatar ?? null,
          })),
          options: raid.RaidSchedulingOption.map((o) => ({
            id: o.ID,
            time: o.Timestamp,
            selected: !!o.IsSelected,
            voters: o.RaidAvailability.map((a) => a.MemberId),
          })),
        })
      );
    } catch (err) {
      log.error("Failed to load raid board:", err);
      res.status(500).send("Failed to load the raid board");
    }
  });

  // POST /members/raids/:id/availability — { optionId, available }
  app.post(
    apiPrefix + "/:id/availability",
    authenticateToken,
    async function (req, res) {
      try {
        const raidId = parseInt(req.params.id, 10);
        const optionId = Number(req.body?.optionId);
        const available = req.body?.available;

        if (!Number.isInteger(optionId) || typeof available !== "boolean") {
          return res.status(400).send("Expected { optionId, available }");
        }

        const denied = await checkSchedulingAttendee(raidId, req.user.id);
        if (denied) return res.status(denied.status).send(denied.message);

        const option = await global.client.prisma.raidSchedulingOption.findFirst({
          where: { ID: optionId, RaidId: raidId },
        });
        if (!option) return res.status(404).send("That time is not part of this raid");

        await RaidScheduler.setAvailability(raidId, req.user.id, optionId, available);
        res.status(204).send();
      } catch (err) {
        log.error("Failed to set raid availability:", err);
        res.status(500).send("Failed to save your availability");
      }
    }
  );

  // POST /members/raids/:id/options — { time: ISO-8601 } suggests a new slot
  app.post(apiPrefix + "/:id/options", authenticateToken, async function (req, res) {
    try {
      const raidId = parseInt(req.params.id, 10);
      const time = new Date(req.body?.time);

      if (typeof req.body?.time !== "string" || isNaN(time.getTime())) {
        return res.status(400).send("Expected { time } as an ISO date");
      }
      // Slots are whole minutes, matching the DB's DATETIME(0) and the
      // (RaidId, Timestamp) uniqueness used to spot duplicate suggestions.
      time.setSeconds(0, 0);

      const denied = await checkSchedulingAttendee(raidId, req.user.id);
      if (denied) return res.status(denied.status).send(denied.message);

      const option = await RaidScheduler.suggestTime(raidId, req.user.id, time);
      res.status(201).send(jsonify({ id: option.ID }));
    } catch (err) {
      if (err instanceof RaidRuleError) return res.status(400).send(err.message);
      log.error("Failed to suggest raid time:", err);
      res.status(500).send("Failed to add that time");
    }
  });
}

/** Voting is for signed-up members of a raid that is still in scheduling. */
async function checkSchedulingAttendee(
  raidId: number,
  memberId: string
): Promise<{ status: number; message: string } | null> {
  const raid = await global.client.prisma.raids.findUnique({
    where: { ID: raidId },
    include: { RaidAttendees: { where: { MemberId: memberId } } },
  });
  if (!raid) return { status: 404, message: "Raid not found" };
  if (raid.Status !== 2) return { status: 409, message: "This raid is not in scheduling" };
  if (raid.RaidAttendees.length === 0) {
    return { status: 403, message: "Only members signed up for this raid can vote" };
  }
  return null;
}
