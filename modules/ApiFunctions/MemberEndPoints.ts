import { jsonify, authenticateToken } from "./Helpers";
import Rank from "../../islander/profile";

export function memberEndPoints(app) {
  let apiPrefix = "/members/";

  app.post(apiPrefix + "profile", authenticateToken, function (req, res) {
    res.send(jsonify(req.user));
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

  app.get(apiPrefix + "shopItems", authenticateToken, function (req, res) {
    global.client.prisma.reward
      .findMany({
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
          _count: {
            select: {
              RewardItem: {},
            } as any,
          },
        },
      })
      .then((shopItems) => {
        return res.send(jsonify(shopItems));
      });
  });

  app.post("profileTester", async function (req, res) {
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

    let data = rank.build();
    res.send(data);
  });

  app.post(apiPrefix + "redeemItem", authenticateToken, function (req, res) {
    const { rewardId } = req.body;
    let user = req.user;
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
      .then((rewardItem) => {
        console.log(rewardItem);
        if (!rewardItem) {
          return res.status(400).send("No items left");
        }
        if (rewardItem.Reward.Price > user.Points) {
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
            global.client.prisma.points.update({
              where: {
                userid: user.id,
              },
              data: {
                TotalPoints: {
                  decrement: rewardItem.Reward.Price,
                },
                lastComment: "Redeemed " + rewardItem.Reward.Title,
              },
            });

            return res.send(jsonify(updatedRewardItem));
          });
      });
  });
}
