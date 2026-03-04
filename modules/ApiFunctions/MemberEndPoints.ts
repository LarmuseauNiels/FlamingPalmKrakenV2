import { authenticateToken, jsonify } from "./Helpers";
import { DashBoardModel } from "./ViewModels/dash-board-model";

/**
 * Core member endpoints: user profile data and the dashboard aggregate.
 * Points/shop lives in ShopEndPoints; profile card image in ProfileEndPoints.
 */
export function memberEndPoints(app) {
  let apiPrefix = "/members/";

  app.post(apiPrefix + "profile", authenticateToken, function (req, res) {
    res.send(jsonify(req.user));
  });

  app.get(
    apiPrefix + "dashboard",
    authenticateToken,
    async function (req, res) {
      let dashboard = new DashBoardModel();

      let points = await global.client.prisma.points.findFirst({
        where: { userid: req.user.id },
      });
      dashboard.dashboardPoints = points.TotalPoints;

      let raids = await global.client.prisma.raids.findMany({
        include: { RaidAttendees: true },
        where: { Status: { equals: 1 } },
        take: 5,
      });
      dashboard.raids = raids.map((raid) => ({
        ID: raid.ID,
        Title: raid.Title,
        MinPlayers: raid.MinPlayers,
        CreationTime: raid.CreationTime,
        Status: raid.Status,
        Attending: raid.RaidAttendees.length,
      }));

      let pointHistory = await global.client.prisma.pointHistory.findMany({
        where: { userid: req.user.id },
        take: 5,
        orderBy: { TimeStamp: "desc" } as any,
      });
      dashboard.pointHistory = pointHistory;

      res.send(jsonify(dashboard));
    }
  );
}
