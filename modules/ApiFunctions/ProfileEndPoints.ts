import { authenticateToken, jsonify } from "./Helpers";
import Rank from "../profile";
import { createLogger } from "../../utils/logger";

const log = createLogger("ProfileEndPoints");

export function profileEndPoints(app) {
  let apiPrefix = "/members/";

  // Dev tool: render a profile card with query-param overrides
  app.get("/profileTester", async function (req, res) {
    var achievements = [];
    if (req.query.achievement1) achievements.push({ icon: `assets/badges/${req.query.achievement1}.png` });
    if (req.query.achievement2) achievements.push({ icon: `assets/badges/${req.query.achievement2}.png` });
    if (req.query.achievement3) achievements.push({ icon: `assets/badges/${req.query.achievement3}.png` });
    if (req.query.achievement4) achievements.push({ icon: `assets/badges/${req.query.achievement4}.png` });
    if (req.query.achievement5) achievements.push({ icon: `assets/badges/${req.query.achievement5}.png` });

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
    res.set("Content-Type", "image/png");
    res.send(data);
  });

  app.get(apiPrefix + "profileImage", authenticateToken, function (req, res) {
    let user = req.user;
    global.client.achievementsModule
      .GetProfileBlob(user.id)
      .then((blob) => {
        res.set("Content-Type", "image/png");
        res.send(blob);
      })
      .catch((err) => {
        log.error("Failed to get profile blob:", err);
        res.status(500).send("Failed to load profile image");
      });
  });

  app.post(
    apiPrefix + "setProfileImage",
    authenticateToken,
    function (req, res) {
      let user = req.user;
      const { profile } = req.body;
      if (!profile) return res.status(400).send("No profile data");
      // @ts-ignore
      global.client.prisma.profile
        .update({
          where: { userid: user.id },
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
        })
        .catch((err) => {
          log.error("Failed to update profile image:", err);
          res.status(500).send("Failed to update profile image");
        });
    }
  );

  app.post(apiPrefix + "setBackground", authenticateToken, function (req, res) {
    let user = req.user;
    const body = req.body;
    if (!body) return res.status(400).send("No profile data");
    // @ts-ignore
    global.client.prisma.profile
      .upsert({
        where: { userid: user.id },
        update: { BackgroundImage: body.fileName },
        create: { userid: user.id, BackgroundImage: body.fileName },
      })
      .then(() => {
        res.send(true);
      })
      .catch((err) => {
        log.error("Failed to set background:", err);
        res.status(500).send("Failed to update background");
      });
  });

  app.post(apiPrefix + "setBadge", authenticateToken, function (req, res) {
    let user = req.user;
    const body = req.body;
    if (!body) return res.status(400).send("No profile data");

    let slot = body.slot;
    let badge = body.fileName == "" ? null : body.fileName;
    const achievementField = `Achievement${slot >= 2 && slot <= 5 ? slot : 1}`;
    // @ts-ignore
    global.client.prisma.profile
      .upsert({
        where: { userid: user.id },
        update: { [achievementField]: badge },
        create: { userid: user.id, [achievementField]: badge },
      })
      .then(() => {
        res.send(true);
      })
      .catch((err) => {
        log.error("Failed to set badge:", err);
        res.status(500).send("Failed to update badge");
      });
  });

  app.get(apiPrefix + "getLevel", authenticateToken, async function (req, res) {
    let member = await global.client.prisma.members.findFirst({
      where: { ID: req.user.id },
    });
    let level = global.client.achievementsModule.getLevel(member.XP);
    res.send(jsonify(level));
  });

  app.get(
    apiPrefix + "getBadgeUnlocks",
    authenticateToken,
    async function (req, res) {
      let member = await global.client.prisma.members.findFirst({
        where: { ID: req.user.id },
        include: { Achievement_History: true },
      });
      let badges = global.client.achievementsModule.getBadgeUnlocks(
        member.Achievement_History
      );
      res.send(jsonify(badges));
    }
  );
}
