import { jsonify, authenticateToken } from "./Helpers";
import Rank from "../../islander/profile";
import { EmbedBuilder } from "discord.js";

export function memberEndPoints(app) {
  let apiPrefix = "/members/";

  app.post(apiPrefix + "profile", authenticateToken, function (req, res) {
    res.send(jsonify(req.user));
  });

  app.get("/", (req, res) => {
    //return current uptime
    res.send(jsonify({ uptime: process.uptime() }));
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
      });
  });

  app.get(apiPrefix + "pointHistory", authenticateToken, function (req, res) {
    let user = req.user;
    global.client.prisma.pointHistory
      .findMany({
        take: 25,
        where: {
          userid: user.id,
        },
        orderBy: {
          TimeStamp: "desc",
        } as any,
      })
      .then((pointHistory) => {
        return res.send(jsonify(pointHistory));
      });
  });

  app.get(
    apiPrefix + "shopItems",
    authenticateToken,
    async function (req, res) {
      const shopItems = await global.client.prisma.reward.findMany({
        where: {
          visible: true,
        },
        select: {
          RewardID: true,
          Title: true,
          Description: true,
          Price: true,
          imageurl: true,
          nonSalePrice: true,
          RewardItem: {
            where: {
              RedeemedBy: "",
            },
            select: {
              RewardItemID: true,
            },
          },
        },
      });

      let result = shopItems.map((item) => {
        return {
          Id: item.RewardID,
          Title: item.Title,
          Description: item.Description,
          Price: item.Price,
          imageurl: item.imageurl,
          nonSalePrice: item.nonSalePrice,
          stock: item.RewardItem.length,
        };
      });

      return res.send(jsonify(result));
    }
  );

  app.get("/profileTester", async function (req, res) {
    const rank = new Rank()
      .setUsername("Kraken")
      .setAvatar(
        "https://cdn.discordapp.com/avatars/534686392589221898/cb24eca24fbf24e075d2eca04102e070"
      )
      .setCurrentXP(9845)
      .setRequiredXP(1200)
      .setRank(1, "RANK", false)
      .setLevel(473, "LEVEL", true)
      .setCustomStatusColor(req.query.statusColor ?? "#FF0000")
      .setProgressBar(req.query.progressBarColor ?? "#FF0000", "COLOR")
      .setBackground("COLOR", req.query.backgroundColor ?? "#2b2f35")
      .setAchievements([]);
    if (req.query.backgroundImage) {
      rank
        .setOverlay("#2b2f35", 0.4)
        .setBackground(
          "IMAGE",
          `achievementIcons/${req.query.backgroundImage}.png`
        );
    }
    if (req.query.achievement) {
      rank.setAchievements([
        {
          imagePath: `achievementIcons/${req.query.achievement}.png`,
        },
      ]);
    }

    let data = await rank.build();
    // set the content type to PNG
    res.set("Content-Type", "image/png");
    res.send(data);
  });

  app.post(apiPrefix + "redeemItem", authenticateToken, function (req, res) {
    const { rewardId } = req.body;
    let user = req.user;
    if (!rewardId) return res.status(400).send("No rewardId");
    if (!user) return res.status(400).send("No user");
    global.client.prisma.rewardItem
      .findFirst({
        where: {
          RewardID: rewardId,
          RedeemedBy: {
            equals: "",
          },
        },
        orderBy: {
          RewardItemID: "asc",
        } as any,
        include: {
          Reward: true,
        },
      })
      .then(async (rewardItem) => {
        console.log(rewardItem);
        if (!rewardItem) {
          return res.status(400).send("No items left");
        }

        let userPoints = (
          await global.client.prisma.points.findUnique({
            where: {
              userid: user.id,
            },
            select: {
              TotalPoints: true,
            },
          })
        ).TotalPoints;

        if (rewardItem.Reward.Price > userPoints) {
          return res.status(400).send("Not enough points");
        }
        global.client.prisma.rewardItem
          .update({
            where: {
              RewardItemID: rewardItem.RewardItemID,
            },
            data: {
              RedeemedBy: user.id,
              RedemptionTimeStamp: new Date(),
            },
          })
          .then((updatedRewardItem) => {
            console.log(updatedRewardItem);
            global.client.prisma.points
              .update({
                where: {
                  userid: user.id,
                },
                data: {
                  TotalPoints: {
                    decrement: rewardItem.Reward.Price,
                  },
                  lastComment: "Redeemed " + rewardItem.Reward.Title,
                },
              })
              .then((updatedPoints) => {
                sendPurchaseToDiscord(
                  updatedRewardItem,
                  user,
                  rewardItem.Reward.Title,
                  rewardItem.Reward.Price
                );
                return res.send(jsonify(updatedRewardItem));
              });
          });
      });
  });

  function sendPurchaseToDiscord(updatedRewardItem, user, rewardTitle, price) {
    const embed = new EmbedBuilder()
      .setColor("#CCCCFF")
      .setTitle("New Purchase")
      .setDescription(`${user.username} has purchased ${rewardTitle}`)
      .addFields(
        {
          name: "Order ID",
          value: updatedRewardItem.RewardItemID,
        },
        {
          name: "Game",
          value: rewardTitle,
        },
        {
          name: "Redemption Text",
          value: updatedRewardItem.RedemptionText,
        },
        {
          name: "Redeemed At",
          value: updatedRewardItem.RedemptionTimeStamp,
        },
        {
          name: "Price",
          value: price,
        },
        {
          name: "Redeemed By",
          value: `${user.username} (${user.id})`,
        }
      );

    global.client.channels.cache
      .get("903358430922825748")
      .send({ embeds: [embed] });
  }
}
