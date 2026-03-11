import { authenticateAdmin } from "./Helpers";
import { createLogger } from "../../utils/logger";

const log = createLogger("RaidEndPoints");

function toRaidDto(raid: any) {
  return {
    id: raid.ID,
    title: raid.Title,
    minPlayers: raid.MinPlayers,
    creationTime: raid.CreationTime,
    status: raid.Status,
    creatorId: raid.Creator,
    creatorName: raid.Members?.DisplayName ?? raid.Creator,
    attending: raid._count?.RaidAttendees ?? 0,
  };
}

export function raidEndPoints(app) {
  const apiPrefix = "/admin/";

  // GET /admin/raids — list all raids
  app.get(apiPrefix + "raids", authenticateAdmin, async function (req, res) {
    try {
      const raids = await global.client.prisma.raids.findMany({
        include: {
          Members: { select: { DisplayName: true } },
          _count: { select: { RaidAttendees: true } },
        },
        orderBy: { CreationTime: "desc" } as any,
      });

      res.send(JSON.stringify(raids.map(toRaidDto)));
    } catch (err) {
      log.error("Failed to fetch raids:", err);
      res.status(500).send("Failed to load raids");
    }
  });

  // POST /admin/raids — create a new raid
  app.post(apiPrefix + "raids", authenticateAdmin, async function (req, res) {
    try {
      const { title, minPlayers } = req.body;

      if (!title || minPlayers == null) {
        return res.status(400).send("Missing required fields: title, minPlayers");
      }

      const user: any = (req as any).user;
      const creatorId: string = user?.id ?? "admin";

      const raid = await global.client.prisma.raids.create({
        data: {
          Title: title,
          MinPlayers: parseInt(minPlayers, 10),
          Creator: creatorId,
          CreationTime: new Date(),
          Status: 1,
        },
        include: {
          Members: { select: { DisplayName: true } },
          _count: { select: { RaidAttendees: true } },
        },
      });

      res.status(201).send(JSON.stringify(toRaidDto(raid)));
    } catch (err) {
      log.error("Failed to create raid:", err);
      res.status(500).send("Failed to create raid");
    }
  });

  // PUT /admin/raids/:id — update a raid
  app.put(apiPrefix + "raids/:id", authenticateAdmin, async function (req, res) {
    try {
      const raidId = parseInt(req.params.id, 10);
      const { title, minPlayers, status } = req.body;

      const updateData: any = {};
      if (title !== undefined) updateData.Title = title;
      if (minPlayers !== undefined) updateData.MinPlayers = parseInt(minPlayers, 10);
      if (status !== undefined) updateData.Status = parseInt(status, 10);

      const raid = await global.client.prisma.raids.update({
        where: { ID: raidId },
        data: updateData,
        include: {
          Members: { select: { DisplayName: true } },
          _count: { select: { RaidAttendees: true } },
        },
      });

      res.send(JSON.stringify(toRaidDto(raid)));
    } catch (err) {
      if ((err as any)?.code === "P2025") return res.status(404).send("Raid not found");
      log.error("Failed to update raid:", err);
      res.status(500).send("Failed to update raid");
    }
  });

  // DELETE /admin/raids/:id — delete a raid and its attendees
  app.delete(apiPrefix + "raids/:id", authenticateAdmin, async function (req, res) {
    try {
      const raidId = parseInt(req.params.id, 10);

      await global.client.prisma.$transaction([
        global.client.prisma.raidAvailability.deleteMany({
          where: {
            RaidSchedulingOption: { RaidId: raidId },
          },
        }),
        global.client.prisma.raidSchedulingOption.deleteMany({ where: { RaidId: raidId } }),
        global.client.prisma.raidAttendees.deleteMany({ where: { RaidId: raidId } }),
        global.client.prisma.raids.delete({ where: { ID: raidId } }),
      ]);

      res.status(204).send();
    } catch (err) {
      if ((err as any)?.code === "P2025") return res.status(404).send("Raid not found");
      log.error("Failed to delete raid:", err);
      res.status(500).send("Failed to delete raid");
    }
  });
}
