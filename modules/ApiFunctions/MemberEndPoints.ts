import { authenticateToken, jsonify } from "./Helpers";
import { DashBoardModel } from "./ViewModels/dash-board-model";
import { RaidModule } from "../../modules/RaidModule";
import { createLogger } from "../../utils/logger";

const log = createLogger("MemberEndPoints");

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
      dashboard.dashboardPoints = points?.TotalPoints ?? 0;

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

  // GET /members/referrals — list of users referred by the authenticated member
  app.get(apiPrefix + "referrals", authenticateToken, async function (req, res) {
    try {
      const referrals = await global.client.prisma.refferals.findMany({
        where: { refferer: req.user.id },
        include: {
          Members_MembersToRefferals_userid: {
            select: { DisplayName: true, avatar: true },
          },
        },
        orderBy: { CreatedTimestamp: "desc" } as any,
      });

      const result = referrals.map((r) => ({
        userId: r.userid,
        displayName: r.Members_MembersToRefferals_userid.DisplayName ?? "Unknown",
        avatar: r.Members_MembersToRefferals_userid.avatar,
        createdTimestamp: r.CreatedTimestamp,
        isValid: r.IsValid,
        regularRewarded: r.RegularRewarded,
        memberRewarded: r.MemberRewarded,
      }));

      res.send(jsonify(result));
    } catch (err) {
      log.error("Failed to fetch referrals:", err);
      res.status(500).send("Failed to load referrals");
    }
  });

  // POST /members/raids/:id/join — join a raid
  app.post(apiPrefix + "raids/:id/join", authenticateToken, async function (req, res) {
    try {
      const raidId = parseInt(req.params.id, 10);
      const userId: string = req.user.id;

      const raid = await global.client.prisma.raids.findUnique({
        where: { ID: raidId },
      });

      if (!raid || raid.Status !== 1) {
        return res.status(404).send("Raid not found or not open");
      }

      const existing = await global.client.prisma.raidAttendees.count({
        where: { RaidId: raidId, MemberId: userId },
      });

      if (existing > 0) {
        return res.status(409).send("Already joined this raid");
      }

      await RaidModule.AddUserToRaid(userId, raidId);
      res.status(200).send("Joined raid successfully");
    } catch (err) {
      log.error("Failed to join raid:", err);
      res.status(500).send("Failed to join raid");
    }
  });

  //getLibrary for user
  app.get(apiPrefix + "library", authenticateToken, function (req, res) {
    let user = req.user;
    global.client.prisma.rewardItem
      .findMany({
        where: {
          RedeemedBy: user.id,
        },
        select: {
          RewardItemID: true,
          RedemptionTimeStamp: true,
          Reward: {
            select: {
              Title: true,
            },
          },
          RedemptionText: true,
        },
      })
      .then((rawLibrary) => {
        let library = rawLibrary.map((item) => {
          return {
            game: item.Reward.Title,
            orderId: item.RewardItemID,
            redemptionText: item.RedemptionText,
            timestamp: item.RedemptionTimeStamp,
          };
        });
        return res.send(jsonify(library));
      })
      .catch((err) => {
        log.error("Failed to fetch library:", err);
        res.status(500).send("Failed to load library");
      });
  });
}
