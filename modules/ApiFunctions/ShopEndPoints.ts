import type { Express } from "express";
import { TextChannel } from "discord.js";
import type { RewardItem } from "@prisma/client";
import { authenticateToken, jsonify, authUser, AuthUser } from "./Helpers";
import { createLogger } from "../../utils/logger";

const log = createLogger("ShopEndPoints");

export function shopEndPoints(app: Express) {
  let apiPrefix = "/members/";

  app.get(apiPrefix + "points", authenticateToken, async function (req, res) {
    let points = await global.client.prisma.points.findUnique({
      where: { userid: authUser(req).id },
    });
    if (!points || points.Blocked) res.send(jsonify(0));
    else res.send(jsonify(points.TotalPoints));
  });

  app.get(apiPrefix + "pointHistory", authenticateToken, function (req, res) {
    const user = authUser(req);
    global.client.prisma.pointHistory
      .findMany({
        where: { userid: user.id },
        orderBy: { TimeStamp: "desc" } as any,
      })
      .then((pointHistory) => {
        return res.send(
          jsonify(
            pointHistory.map((item) => ({
              points: item.points,
              timestamp: item.TimeStamp,
              comment: item.comment,
            }))
          )
        );
      })
      .catch((err) => {
        log.error("Failed to fetch point history:", err);
        res.status(500).send("Failed to load point history");
      });
  });

  app.get(
    apiPrefix + "shopItems",
    authenticateToken,
    async function (req, res) {
      const shopItems = await global.client.prisma.reward.findMany({
        where: { visible: true },
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

      let result = shopItems.map((item) => ({
        id: item.RewardID,
        title: item.Title,
        description: item.Description,
        price: item.Price,
        image: item.imageurl,
        stock: item.RewardItem.length,
        nonSalePrice: item.nonSalePrice,
      }));

      return res.send(jsonify(result));
    }
  );

  app.post(apiPrefix + "redeemItem", authenticateToken, async function (req, res) {
    const rewardId = Number(req.body?.rewardId);
    const user = authUser(req);
    if (!Number.isInteger(rewardId) || rewardId <= 0) return res.status(400).send("No rewardId");

    // One transaction: the key is claimed only while still free, points are
    // taken only while the balance still covers the price, and any failure
    // rolls back both. This used to be separate steps, so two quick redeems
    // could hand out (and charge for) the same key, the balance could go
    // negative, and a failed deduction left the key claimed for free.
    let redeemed: { item: RewardItem; title: string; price: number };
    try {
      redeemed = await global.client.prisma.$transaction(async (tx) => {
        const rewardItem = await tx.rewardItem.findFirst({
          where: { RewardID: rewardId, RedeemedBy: { equals: "" } },
          orderBy: { RewardItemID: "asc" },
          include: { Reward: true },
        });
        if (!rewardItem) throw new RedeemRefused("No items left");

        const points = await tx.points.findUnique({ where: { userid: user.id } });
        if (!points) throw new RedeemRefused("No points account found");
        if (points.Blocked) throw new RedeemRefused("You are blocked from redeeming items");
        const price = rewardItem.Reward.Price;
        if (price > points.TotalPoints) throw new RedeemRefused("Not enough points");

        const claimed = await tx.rewardItem.updateMany({
          where: { RewardItemID: rewardItem.RewardItemID, RedeemedBy: "" },
          data: { RedeemedBy: user.id, RedemptionTimeStamp: new Date() },
        });
        // Someone else claimed this key between our read and write.
        if (claimed.count === 0) throw new RedeemRefused("That item was just taken — please try again");

        const paid = await tx.points.updateMany({
          where: { userid: user.id, TotalPoints: { gte: price } },
          data: {
            TotalPoints: { decrement: price },
            lastComment: "Redeemed " + rewardItem.Reward.Title,
          },
        });
        if (paid.count === 0) throw new RedeemRefused("Not enough points");

        const item = await tx.rewardItem.findUniqueOrThrow({ where: { RewardItemID: rewardItem.RewardItemID } });
        return { item, title: rewardItem.Reward.Title, price };
      });
    } catch (err) {
      if (err instanceof RedeemRefused) return res.status(400).send(err.message);
      log.error("Failed to process redemption:", err);
      return res.status(500).send("Failed to process redemption");
    }

    log.info("Reward item redeemed:", redeemed.item.RewardItemID);
    res.send(jsonify(redeemed.item));
    // After the response: a notification problem must never turn a completed
    // purchase into an error for the member (it used to return 500 here).
    sendPurchaseToDiscord(redeemed.item, user, redeemed.title, redeemed.price);
  });

}

/** A redemption the member can't make (stock, points, block); shown to them as a 400. */
class RedeemRefused extends Error {}

const PURCHASES_CHANNEL_ID = "1128264366182125664";

function sendPurchaseToDiscord(item: RewardItem, user: AuthUser, rewardTitle: string, price: number) {
  // Embed field values must be non-empty strings; the order ID used to be a
  // number and the redemption text could be null, both rejected by Discord.
  const embed = {
    color: 0x0099ff,
    title: "New Purchase",
    description: `${user.username} has purchased ${rewardTitle}`,
    fields: [
      { name: "Order ID", value: String(item.RewardItemID), inline: false },
      { name: "Game", value: rewardTitle || "—", inline: false },
      { name: "Redemption Text", value: item.RedemptionText || "—" },
      { name: "Price", value: `${price}` },
      { name: "Redeemed By", value: `${user.username} (${user.id})` },
    ],
  };
  const channel = global.client.channels.cache.get(PURCHASES_CHANNEL_ID) as TextChannel | undefined;
  if (!channel) {
    log.error(`Purchases channel ${PURCHASES_CHANNEL_ID} is not cached; purchase ${item.RewardItemID} not announced`);
    return;
  }
  channel
    .send({ embeds: [embed] })
    .catch((err) => log.error("Failed to send purchase notification to Discord:", err));
}
