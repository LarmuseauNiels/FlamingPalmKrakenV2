import { authenticateToken, jsonify } from "./Helpers";
import Rank from "../profile";
import { DashBoardModel } from "./ViewModels/dash-board-model";
import { TextChannel } from "discord.js";
import { config } from "../../config";

export function memberEndPoints(app: any) {
  let apiPrefix = "/members/";

  app.post(apiPrefix + "profile", authenticateToken, function (req: any, res: any) {
    res.send(jsonify(req.user));
  });

  app.get(apiPrefix + "points", authenticateToken, async function (req: any, res: any) {
    let points = await global.client.prisma.points.findFirst({
      where: {
        userid: req.user.id,
      },
    });
    if (points.Blocked) res.send(jsonify(0));
    else res.send(jsonify(points.TotalPoints));
  });

  app.get("/", (req: any, res: any) => {
    //return current uptime
    res.send(jsonify({ uptime: process.uptime() }));
  });

  //getLibrary for user
  app.get(apiPrefix + "library", authenticateToken, function (req: any, res: any) {
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

  app.get(apiPrefix + "pointHistory", authenticateToken, function (req: any, res: any) {
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
        return res.send(
          jsonify(
            pointHistory.map((item) => {
              return {
                points: item.points,
                timestamp: item.TimeStamp,
                comment: item.comment,
              };
            })
          )
        );
      });
  });

  app.get(
    apiPrefix + "shopItems",
    authenticateToken,
    async function (req: any, res: any) {
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
          id: item.RewardID,
          title: item.Title,
          description: item.Description,
          price: item.Price,
          image: item.imageurl,
          stock: item.RewardItem.length,
          nonSalePrice: item.nonSalePrice,
        };
      });

      return res.send(jsonify(result));
    }
  );

  app.get("/profileTester", async function (req: any, res: any) {
    var achievements = [];
    if (req.query.achievement1) {
      achievements.push({
        icon: `assets/badges/${req.query.achievement1}.png`,
      });
    }
    if (req.query.achievement2) {
      achievements.push({
        icon: `assets/badges/${req.query.achievement2}.png`,
      });
    }
    if (req.query.achievement3) {
      achievements.push({
        icon: `assets/badges/${req.query.achievement3}.png`,
      });
    }
    if (req.query.achievement4) {
      achievements.push({
        icon: `assets/badges/${req.query.achievement4}.png`,
      });
    }
    if (req.query.achievement5) {
      achievements.push({
        icon: `assets/badges/${req.query.achievement5}.png`,
      });
    }

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
      .setAchievements(achievements);
    if (req.query.backgroundImage) {
      rank
        .setOverlay("#2b2f35", 0.4)
        .setBackground("IMAGE", `assets/${req.query.backgroundImage}.png`);
    }

    let data = await rank.build();
    // set the content type to PNG
    res.set("Content-Type", "image/png");
    res.send(data);
  });

  app.post(apiPrefix + "redeemItem", authenticateToken, async function (req: any, res: any) {
    const { rewardId } = req.body;
    const user = req.user;
    if (!rewardId) return res.status(400).send("No rewardId");
    if (!user) return res.status(400).send("No user");

    const rewardItem = await global.client.prisma.rewardItem.findFirst({
      where: {
        RewardID: rewardId,
        RedeemedBy: { equals: "" },
      },
      orderBy: { RewardItemID: "asc" } as any,
      include: { Reward: true },
    });

    if (!rewardItem) return res.status(400).send("No items left");

    const points = await global.client.prisma.points.findUnique({
      where: { userid: user.id },
    });

    if (points.Blocked) return res.status(400).send("You are blocked from redeeming items");
    if (rewardItem.Reward.Price > points.TotalPoints) return res.status(400).send("Not enough points");

    const updatedRewardItem = await global.client.prisma.rewardItem.update({
      where: { RewardItemID: rewardItem.RewardItemID },
      data: {
        RedeemedBy: user.id,
        RedemptionTimeStamp: new Date(),
      },
    });

    await global.client.prisma.points.update({
      where: { userid: user.id },
      data: {
        TotalPoints: { decrement: rewardItem.Reward.Price },
        lastComment: "Redeemed " + rewardItem.Reward.Title,
      },
    });

    sendPurchaseToDiscord(updatedRewardItem, user, rewardItem.Reward.Title, rewardItem.Reward.Price);
    return res.send(jsonify(updatedRewardItem));
  });

  function sendPurchaseToDiscord(updatedRewardItem: any, user: any, rewardTitle: string, price: number) {
    const embed = {
      color: 0x0099ff,
      title: "New Purchase",
      description: `${user.username} has purchased ${rewardTitle}`,
      fields: [
        {
          name: "Order ID",
          value: updatedRewardItem.RewardItemID,
          inline: false,
        },
        {
          name: "Game",
          value: rewardTitle,
          inline: false,
        },
        {
          name: "Redemption Text",
          value: updatedRewardItem.RedemptionText,
        },
        {
          name: "Price",
          value: `${price}`,
        },
        {
          name: "Redeemed By",
          value: `${user.username} (${user.id})`,
        },
      ],
    };
    (
      global.client.channels.cache.get(config.channels.purchases) as TextChannel
    ).send({ embeds: [embed] });
  }

  app.get(apiPrefix + "profileImage", authenticateToken, function (req: any, res: any) {
    let user = req.user;
    global.client.achievementsModule.GetProfileBlob(user.id).then((blob) => {
      res.set("Content-Type", "image/png");
      res.send(blob);
    });
  });

  app.post(
    apiPrefix + "setProfileImage",
    authenticateToken,
    function (req: any, res: any) {
      let user = req.user;
      const { profile } = req.body;
      if (!profile) return res.status(400).send("No profile data");
      // @ts-ignore
      global.client.prisma.profile
        .update({
          where: {
            userid: user.id,
          },
          data: {
            StatusColor: profile.StatusColor,
            BackgroundImage: profile.BackgroundImage,
            ProgressBarColor: profile.ProgressBarColor,
            Achievement1: profile.Achievement1,
            Achievement2: profile.Achievement2,
            Achievement3: profile.Achievement3,
            Achievement4: profile.Achievement4,
            Achievement5: profile.Achievement5,
          },
        })
        .then(() => {
          res.send("ok");
        });
    }
  );

  app.post(apiPrefix + "setBackground", authenticateToken, function (req: any, res: any) {
    let user = req.user;
    const body = req.body;
    if (!body) return res.status(400).send("No profile data");
    // @ts-ignore
    global.client.prisma.profile
      .upsert({
        where: {
          userid: user.id,
        },
        update: {
          BackgroundImage: body.fileName,
        },
        create: {
          userid: user.id,
          BackgroundImage: body.fileName,
        },
      })
      .then(() => {
        res.send(true);
      });
  });

  app.post(apiPrefix + "setBadge", authenticateToken, async function (req: any, res: any) {
    const user = req.user;
    const body = req.body;
    if (!body) return res.status(400).send("No profile data");

    const slot = body.slot ?? 1;
    const badge = body.fileName === "" ? null : body.fileName;
    const fieldName = `Achievement${Math.min(Math.max(slot, 1), 5)}`;

    await global.client.prisma.profile.upsert({
      where: { userid: user.id },
      update: { [fieldName]: badge },
      create: { userid: user.id, [fieldName]: badge },
    });
    res.send(true);
  });

  app.get(apiPrefix + "getLevel", authenticateToken, async function (req: any, res: any) {
    let member = await global.client.prisma.members.findFirst({
      where: {
        ID: req.user.id,
      },
    });
    let level = global.client.achievementsModule.getLevel(member.XP);
    res.send(jsonify(level));
  });

  app.get(
    apiPrefix + "getBadgeUnlocks",
    authenticateToken,
    async function (req: any, res: any) {
      let member = await global.client.prisma.members.findFirst({
        where: {
          ID: req.user.id,
        },
        include: {
          Achievement_History: true,
        },
      });

      let badges = global.client.achievementsModule.getBadgeUnlocks(
        member.Achievement_History
      );
      res.send(jsonify(badges));
    }
  );

  app.get(
    apiPrefix + "dashboard",
    authenticateToken,
    async function (req: any, res: any) {
      let dashboard = new DashBoardModel();
      let points = await global.client.prisma.points.findFirst({
        where: {
          userid: req.user.id,
        },
      });
      dashboard.dashboardPoints = points.TotalPoints;

      let raids = await global.client.prisma.raids.findMany({
        include: {
          RaidAttendees: true,
        },
        where: {
          Status: {
            equals: 1,
          },
        },
        take: 5,
      });

      dashboard.raids = raids.map((raid) => {
        return {
          ID: raid.ID,
          Title: raid.Title,
          MinPlayers: raid.MinPlayers,
          CreationTime: raid.CreationTime,
          Status: raid.Status,
          Attending: raid.RaidAttendees.length,
        };
      });

      let pointHistory = await global.client.prisma.pointHistory.findMany({
        where: {
          userid: req.user.id,
        },
        take: 5,
        orderBy: {
          TimeStamp: "desc",
        } as any,
      });
      dashboard.pointHistory = pointHistory;

      res.send(jsonify(dashboard));
    }
  );
}
