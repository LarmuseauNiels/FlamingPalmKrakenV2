import { jsonify, authenticateToken } from "./Helpers";

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
          ID: user.id,
        },
        orderBy: {
          Timestamp: "desc",
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
              RewardItem: {
                where: {
                  RedeemedBy: null,
                },
              },
            } as any,
          },
        },
      })
      .then((shopItems) => {
        return res.send(jsonify(shopItems));
      });
  });

  app.post(apiPrefix + "redeemItem", authenticateToken, function (req, res) {
    const { rewardId } = req.body;
  });
}
