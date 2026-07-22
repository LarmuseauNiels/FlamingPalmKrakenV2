import { authenticateAdmin, authenticateToken, jsonify } from "./Helpers";
import Rank from "../profile";
import { createLogger } from "../../utils/logger";

const log = createLogger("ProfileEndPoints");

// Allowlists for the /profileTester dev endpoint. These mirror the files that
// actually exist under assets/, so query params can't be used to read arbitrary
// files from disk (path traversal). Keep these in sync when badges/backgrounds
// are added or removed.
const VALID_BADGES = new Set([
  "admiral",
  "arma5",
  "crusader",
  "island",
  "microphone",
  "party5",
  "raid5",
  "refReg1",
  "rocket",
  "ship",
  "silk_road",
  "sold",
  "spanish_conquistador",
  "submarine",
  "tank",
]);

const VALID_BACKGROUNDS = new Set([
  "alpine_tundra",
  "arctic1",
  "arctic2",
  "bayou",
  "bayou2",
  "city",
  "crusaders_marching_to_jerusalem",
  "desert",
  "jungle",
  "kingdom",
  "lake",
  "messerschmitt",
  "roman_horses",
  "roman_soldiers",
  "savanna",
  "space",
  "spaceship",
  "spitfire",
  "submarine",
  "tank",
  "tropical_islands",
  "volcano",
]);

// Loose hex color validation: #RGB, #RGBA, #RRGGBB, or #RRGGBBAA. Used for the
// color query params on /profileTester so an attacker can't smuggle arbitrary
// strings into the canvas renderer.
const HEX_COLOR = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function safeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR.test(value) ? value : fallback;
}

export function profileEndPoints(app) {
  let apiPrefix = "/members/";

  // Dev tool: render a profile card with query-param overrides.
  // Gated to non-production + admin auth to prevent abuse, and all query
  // params are validated against allowlists to prevent path traversal.
  app.get("/profileTester", authenticateAdmin, async function (req, res) {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).send("Not available");
    }

    const achievements: { imagePath: string }[] = [];
    for (const slot of ["achievement1", "achievement2", "achievement3", "achievement4", "achievement5"]) {
      const raw = req.query[slot];
      if (typeof raw === "string" && VALID_BADGES.has(raw)) {
        achievements.push({ imagePath: `assets/badges/${raw}.png` });
      }
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
      .setCustomStatusColor(safeColor(req.query.statusColor, "#FF0000"))
      .setProgressBar(safeColor(req.query.progressBarColor, "#FF0000"), "COLOR")
      .setBackground("COLOR", safeColor(req.query.backgroundColor, "#2b2f35"))
      .setAchievements(achievements);

    const bgRaw = req.query.backgroundImage;
    if (typeof bgRaw === "string" && VALID_BACKGROUNDS.has(bgRaw)) {
      rank
        .setOverlay("#2b2f35", 0.4)
        .setBackground("IMAGE", `assets/${bgRaw}.png`);
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
        .upsert({
          where: { userid: user.id },
          update: {
            StatusColor: profile.StatusColor,
            BackgroundImage: profile.BackgroundImage,
            ProgressBarColor: profile.ProgressBarColor,
            Achievement1: profile.Achievement1,
            Achievement2: profile.Achievement2,
            Achievement3: profile.Achievement3,
            Achievement4: profile.Achievement4,
            Achievement5: profile.Achievement5,
          },
          create: {
            userid: user.id,
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
