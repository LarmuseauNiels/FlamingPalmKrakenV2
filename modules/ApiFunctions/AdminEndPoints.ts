import { jsonify, authenticateToken, authenticateAdmin } from "./Helpers";
import { createLogger } from "../../utils/logger";

const log = createLogger("AdminEndPoints");

interface yearOverviewItem {
  date: string;
  activity: number;
}

export function adminEndPoints(app) {
  let apiPrefix = "/admin/";

  app.get(
    apiPrefix + "yearOverview",
    authenticateToken,
    async function (req, res) {
      let results: yearOverviewItem[] = await globalThis.client.prisma
        .$queryRaw`select date(timestamp) as date,count(*) as activity from VoiceConnected  WHERE year(VoiceConnected.TimeStamp) = year(curdate())  group by date(timestamp)`;
      res.send(jsonify(results));
    }
  );

  // GET admin/stats — dashboard summary cards
  app.get(apiPrefix + "stats", authenticateAdmin, async function (req, res) {
    try {
      const [totalMembers, pointsAggregate, activeShopItems, pendingRedemptions] =
        await Promise.all([
          global.client.prisma.members.count(),
          global.client.prisma.pointHistory.aggregate({
            _sum: { points: true },
            where: { points: { gt: 0 } },
          }),
          global.client.prisma.reward.count({
            where: {
              visible: true,
              RewardItem: {
                some: { RedeemedBy: "" },
              },
            },
          }),
          global.client.prisma.rewardItem.count({
            where: {
              NOT: { RedeemedBy: "" },
              RedeemedBy: { not: null },
              FulfilledAt: null,
            },
          }),
        ]);

      res.send(
        jsonify({
          totalMembers,
          totalPointsAwarded: pointsAggregate._sum.points ?? 0,
          activeShopItems,
          pendingRedemptions,
        })
      );
    } catch (err) {
      log.error("Failed to fetch admin stats:", err);
      res.status(500).send("Failed to load stats");
    }
  });

  // GET admin/shopItems — list all shop items (admin auth)
  app.get(apiPrefix + "shopItems", authenticateAdmin, async function (req, res) {
    try {
      const shopItems = await global.client.prisma.reward.findMany({
        select: {
          RewardID: true,
          Title: true,
          Description: true,
          Price: true,
          imageurl: true,
          nonSalePrice: true,
          RewardItem: {
            where: { RedeemedBy: "" },
            select: { RewardItemID: true },
          },
        },
      });

      const result = shopItems.map((item) => ({
        id: item.RewardID,
        title: item.Title,
        description: item.Description,
        price: item.Price,
        image: item.imageurl,
        stock: item.RewardItem.length,
        nonSalePrice: item.nonSalePrice,
      }));

      res.send(jsonify(result));
    } catch (err) {
      log.error("Failed to fetch admin shop items:", err);
      res.status(500).send("Failed to load shop items");
    }
  });

  // POST admin/shopItems — create a new shop item
  app.post(apiPrefix + "shopItems", authenticateAdmin, async function (req, res) {
    try {
      const { title, description, price, nonSalePrice, stock, image } = req.body;

      if (!title || !description || price == null || !image) {
        return res.status(400).send("Missing required fields");
      }

      const reward = await global.client.prisma.reward.create({
        data: {
          Title: title,
          Description: description,
          Price: price,
          nonSalePrice: nonSalePrice ?? null,
          imageurl: image,
          visible: true,
        },
      });

      // Create empty RewardItem placeholders to represent stock
      const stockCount = stock ?? 0;
      if (stockCount > 0) {
        await global.client.prisma.rewardItem.createMany({
          data: Array.from({ length: stockCount }, () => ({
            RewardID: reward.RewardID,
            RedemptionText: "",
            RedeemedBy: "",
          })),
        });
      }

      const created = {
        id: reward.RewardID,
        title: reward.Title,
        description: reward.Description,
        price: reward.Price,
        image: reward.imageurl,
        stock: stockCount,
        nonSalePrice: reward.nonSalePrice,
      };

      res.status(201).send(jsonify(created));
    } catch (err) {
      log.error("Failed to create shop item:", err);
      res.status(500).send("Failed to create shop item");
    }
  });

  // PUT admin/shopItems/:id — update an existing shop item
  app.put(apiPrefix + "shopItems/:id", authenticateAdmin, async function (req, res) {
    try {
      const rewardId = parseInt(req.params.id, 10);
      const { title, description, price, nonSalePrice, image } = req.body;

      const existing = await global.client.prisma.reward.findUnique({
        where: { RewardID: rewardId },
      });
      if (!existing) {
        return res.status(404).send("Shop item not found");
      }

      const updateData: any = {};
      if (title !== undefined) updateData.Title = title;
      if (description !== undefined) updateData.Description = description;
      if (price !== undefined) updateData.Price = price;
      if (nonSalePrice !== undefined) updateData.nonSalePrice = nonSalePrice;
      if (image !== undefined) updateData.imageurl = image;

      const updated = await global.client.prisma.reward.update({
        where: { RewardID: rewardId },
        data: updateData,
        include: {
          RewardItem: {
            where: { RedeemedBy: "" },
            select: { RewardItemID: true },
          },
        },
      });

      const result = {
        id: updated.RewardID,
        title: updated.Title,
        description: updated.Description,
        price: updated.Price,
        image: updated.imageurl,
        stock: updated.RewardItem.length,
        nonSalePrice: updated.nonSalePrice,
      };

      res.send(jsonify(result));
    } catch (err) {
      log.error("Failed to update shop item:", err);
      res.status(500).send("Failed to update shop item");
    }
  });

  // DELETE admin/shopItems/:id — delete a shop item
  app.delete(apiPrefix + "shopItems/:id", authenticateAdmin, async function (req, res) {
    try {
      const rewardId = parseInt(req.params.id, 10);

      const existing = await global.client.prisma.reward.findUnique({
        where: { RewardID: rewardId },
      });
      if (!existing) {
        return res.status(404).send("Shop item not found");
      }

      await global.client.prisma.reward.delete({
        where: { RewardID: rewardId },
      });

      res.status(204).send();
    } catch (err) {
      log.error("Failed to delete shop item:", err);
      res.status(500).send("Failed to delete shop item");
    }
  });

  // GET admin/members — list all members with stats
  app.get(apiPrefix + "members", authenticateAdmin, async function (req, res) {
    try {
      const members = await global.client.prisma.members.findMany({
        select: {
          ID: true,
          DisplayName: true,
          avatar: true,
          Points: {
            select: { TotalPoints: true },
          },
          VoiceConnected: {
            orderBy: { TimeStamp: "desc" } as any,
            take: 1,
            select: { TimeStamp: true },
          },
          PointHistory: {
            orderBy: { TimeStamp: "asc" } as any,
            take: 1,
            select: { TimeStamp: true },
          },
        },
      });

      const result = members.map((m) => ({
        userid: m.ID,
        username: m.DisplayName ?? m.ID,
        avatar: m.avatar ?? "",
        points: m.Points?.TotalPoints ?? 0,
        lastSeen: m.VoiceConnected[0]?.TimeStamp ?? null,
        joinDate: m.PointHistory[0]?.TimeStamp ?? null,
      }));

      res.send(jsonify(result));
    } catch (err) {
      log.error("Failed to fetch admin members:", err);
      res.status(500).send("Failed to load members");
    }
  });

  // GET admin/pendingRedemptions — list unfulfilled redemptions
  app.get(apiPrefix + "pendingRedemptions", authenticateAdmin, async function (req, res) {
    try {
      const redemptions = await global.client.prisma.rewardItem.findMany({
        where: {
          NOT: { RedeemedBy: "" },
          RedeemedBy: { not: null },
          FulfilledAt: null,
        },
        select: {
          RewardItemID: true,
          RewardID: true,
          RedeemedBy: true,
          RedemptionTimeStamp: true,
          Reward: {
            select: { Title: true },
          },
        },
        orderBy: { RedemptionTimeStamp: "asc" } as any,
      });

      const memberIds = [...new Set(redemptions.map((r) => r.RedeemedBy).filter(Boolean))];
      const members = await global.client.prisma.members.findMany({
        where: { ID: { in: memberIds } },
        select: { ID: true, DisplayName: true },
      });
      const memberMap = new Map(members.map((m) => [m.ID, m.DisplayName ?? m.ID]));

      const result = redemptions.map((r) => ({
        rewardItemId: r.RewardItemID,
        rewardId: r.RewardID,
        itemTitle: r.Reward.Title,
        redeemedBy: r.RedeemedBy,
        username: memberMap.get(r.RedeemedBy) ?? r.RedeemedBy,
        creationTimestamp: r.RedemptionTimeStamp,
      }));

      res.send(jsonify(result));
    } catch (err) {
      log.error("Failed to fetch pending redemptions:", err);
      res.status(500).send("Failed to load pending redemptions");
    }
  });

  // POST admin/fulfillRedemption/:rewardItemId — mark redemption as fulfilled
  app.post(
    apiPrefix + "fulfillRedemption/:rewardItemId",
    authenticateAdmin,
    async function (req, res) {
      try {
        const rewardItemId = parseInt(req.params.rewardItemId, 10);

        const rewardItem = await global.client.prisma.rewardItem.findUnique({
          where: { RewardItemID: rewardItemId },
        });

        if (!rewardItem || !rewardItem.RedeemedBy) {
          return res.status(404).send("Redemption not found");
        }

        if (rewardItem.FulfilledAt !== null) {
          return res.status(409).send("Redemption already fulfilled");
        }

        await global.client.prisma.rewardItem.update({
          where: { RewardItemID: rewardItemId },
          data: { FulfilledAt: new Date() },
        });

        res.status(204).send();
      } catch (err) {
        log.error("Failed to fulfill redemption:", err);
        res.status(500).send("Failed to fulfill redemption");
      }
    }
  );
}
