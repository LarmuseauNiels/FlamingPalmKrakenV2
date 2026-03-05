import { TextChannel } from "discord.js";
import { authenticateToken, jsonify } from "./Helpers";
import { createLogger } from "../../utils/logger";

const log = createLogger("ShopEndPoints");

export function shopEndPoints(app) {
  let apiPrefix = "/members/";

  app.get(apiPrefix + "points", authenticateToken, async function (req, res) {
    let points = await global.client.prisma.points.findFirst({
      where: { userid: req.user.id },
    });
    if (points.Blocked) res.send(jsonify(0));
    else res.send(jsonify(points.TotalPoints));
  });

  app.get(apiPrefix + "pointHistory", authenticateToken, function (req, res) {
    let user = req.user;
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

  app.post(apiPrefix + "redeemItem", authenticateToken, function (req, res) {
    const { rewardId } = req.body;
    let user = req.user;
    if (!rewardId) return res.status(400).send("No rewardId");
    if (!user) return res.status(400).send("No user");

    global.client.prisma.rewardItem
      .findFirst({
        where: {
          RewardID: rewardId,
          RedeemedBy: { equals: "" },
        },
        orderBy: { RewardItemID: "asc" } as any,
        include: { Reward: true },
      })
      .then(async (rewardItem) => {
        log.debug("Reward item found:", rewardItem?.RewardItemID);
        if (!rewardItem) {
          return res.status(400).send("No items left");
        }

        let points = await global.client.prisma.points.findUnique({
          where: { userid: user.id },
        });

        if (points.Blocked) {
          return res.status(400).send("You are blocked from redeeming items");
        }
        if (rewardItem.Reward.Price > points.TotalPoints) {
          return res.status(400).send("Not enough points");
        }

        global.client.prisma.rewardItem
          .update({
            where: { RewardItemID: rewardItem.RewardItemID },
            data: {
              RedeemedBy: user.id,
              RedemptionTimeStamp: new Date(),
            },
          })
          .then((updatedRewardItem) => {
            log.info("Reward item redeemed:", updatedRewardItem?.RewardItemID);
            global.client.prisma.points
              .update({
                where: { userid: user.id },
                data: {
                  TotalPoints: { decrement: rewardItem.Reward.Price },
                  lastComment: "Redeemed " + rewardItem.Reward.Title,
                },
              })
              .then(() => {
                sendPurchaseToDiscord(
                  updatedRewardItem,
                  user,
                  rewardItem.Reward.Title,
                  rewardItem.Reward.Price
                );
                return res.send(jsonify(updatedRewardItem));
              })
              .catch((err) => {
                log.error("Failed to deduct points:", err);
                res.status(500).send("Failed to process redemption");
              });
          })
          .catch((err) => {
            log.error("Failed to update reward item:", err);
            res.status(500).send("Failed to process redemption");
          });
      })
      .catch((err) => {
        log.error("Failed to find reward item:", err);
        res.status(500).send("Failed to process redemption");
      });
  });
}

function sendPurchaseToDiscord(updatedRewardItem, user, rewardTitle, price) {
  const embed = {
    color: 0x0099ff,
    title: "New Purchase",
    description: `${user.username} has purchased ${rewardTitle}`,
    fields: [
      { name: "Order ID", value: updatedRewardItem.RewardItemID, inline: false },
      { name: "Game", value: rewardTitle, inline: false },
      { name: "Redemption Text", value: updatedRewardItem.RedemptionText },
      { name: "Price", value: `${price}` },
      { name: "Redeemed By", value: `${user.username} (${user.id})` },
    ],
  };
  (global.client.channels.cache.get("1128264366182125664") as TextChannel)
    .send({ embeds: [embed] })
    .catch((err) => log.error("Failed to send purchase notification to Discord:", err));
}
