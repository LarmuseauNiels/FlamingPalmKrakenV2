import axios from "axios";
import express from "express";
import jwt from "jsonwebtoken";
import path from "path";
import { jsonify } from "./Helpers";
import { createLogger } from "../../utils/logger";

const log = createLogger("ActivityEndPoints");

const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_USER_URL = "https://discord.com/api/users/@me";
const HTTP_TIMEOUT_MS = 10000;

/**
 * Built Activity SPA (see ../../activity). At runtime this file lives in
 * bin/modules/ApiFunctions, so three levels up is the app root.
 */
const ACTIVITY_DIST = path.join(__dirname, "..", "..", "..", "activity", "dist");

/**
 * Discord Activity endpoints.
 *
 * An Activity runs in a sandboxed iframe and *cannot* use the redirect-based
 * Passport flow in WebApi.ts — there is nowhere to redirect to. Instead the
 * client calls `discordSdk.commands.authorize()`, receives an OAuth `code`,
 * and posts it here; we exchange it for an access token server-side and hand
 * back both that token (the SDK needs it for `authenticate()`) and our own JWT
 * (every existing /members/* endpoint already accepts it).
 *
 * Guild membership is checked against the bot's own guild cache rather than the
 * `guilds` OAuth scope, so the Activity only ever needs `identify`.
 */
export function activityEndPoints(app) {
  const apiPrefix = "/api/activity/";

  // GET /api/activity/config — bootstrap values the SPA needs before it can
  // construct the SDK. Served at runtime so CLIENT_ID never has to be baked
  // into the bundle at build time (CapRover injects env at run time, not build).
  app.get(apiPrefix + "config", function (req, res) {
    res.send(jsonify({ clientId: process.env.CLIENT_ID }));
  });

  // POST /api/activity/token — exchange an Activity OAuth code for a JWT.
  app.post(apiPrefix + "token", async function (req, res) {
    const code = req.body?.code;

    if (!code || typeof code !== "string") {
      return res.status(400).send("Missing code");
    }

    try {
      const form = new URLSearchParams({
        client_id: process.env.CLIENT_ID as string,
        client_secret: process.env.OAUTHSECRET as string,
        grant_type: "authorization_code",
        code,
      });

      const tokenResponse = await axios.post(DISCORD_TOKEN_URL, form.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: HTTP_TIMEOUT_MS,
      });

      const accessToken = tokenResponse.data?.access_token;
      if (!accessToken) {
        log.error("Discord token exchange returned no access_token");
        return res.status(502).send("Discord did not return an access token");
      }

      const userResponse = await axios.get(DISCORD_USER_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: HTTP_TIMEOUT_MS,
      });

      const profile = userResponse.data;
      if (!profile?.id) {
        log.error("Discord /users/@me returned no id");
        return res.status(502).send("Could not identify user");
      }

      if (!(await isGuildMember(profile.id))) {
        log.warn(`Non-member tried to open the Activity: ${profile.username} (${profile.id})`);
        return res.status(403).send("You must be a member of the FlamingPalm server");
      }

      const token = jwt.sign(
        {
          id: profile.id,
          username: profile.username,
          avatar: profile.avatar,
        },
        process.env.JWT_SECRET as string,
        { expiresIn: "7d" }
      );

      recordActivityLogin(profile).catch((err) =>
        log.error("Failed to record activity login for " + profile.username + ":", err)
      );

      res.send(jsonify({ access_token: accessToken, token }));
    } catch (err) {
      // Bad/expired codes come back as a 400 from Discord — that's a client
      // problem, not ours, so don't log it as an error or page Bugsnag.
      const status = (err as any)?.response?.status;
      if (status === 400 || status === 401) {
        log.warn("Activity token exchange rejected by Discord:", (err as any)?.response?.data);
        return res.status(401).send("Invalid or expired authorization code");
      }
      log.error("Failed to exchange activity token:", err);
      res.status(500).send("Failed to authenticate");
    }
  });

  // GET /api/activity/images/reward/:id — a reward's image, fetched by us.
  //
  // The Activity's CSP only lets the page load from our own mapped origin, and
  // reward art lives on arbitrary hosts (Steam, imgur, …) that we can't all
  // add as portal URL mappings. So the page asks for the image *by reward ID*
  // and we fetch the stored URL server-side. Taking an ID rather than a URL
  // keeps this from being an open proxy: it can only ever fetch URLs an admin
  // put on a reward. No auth — an <img> can't send a bearer token, and these
  // images are public on the website anyway.
  app.get(apiPrefix + "images/reward/:id", async function (req, res) {
    const rewardId = parseInt(req.params.id, 10);
    if (!Number.isInteger(rewardId)) return res.sendStatus(400);

    try {
      const reward = await global.client.prisma.reward.findUnique({
        where: { RewardID: rewardId },
        select: { imageurl: true, visible: true },
      });
      if (!reward?.visible || !reward.imageurl) return res.sendStatus(404);
      await sendProxiedImage(reward.imageurl, res);
    } catch (err) {
      log.error("Failed to proxy reward image " + rewardId + ":", err);
      if (!res.headersSent) res.sendStatus(500);
    }
  });

  // GET /api/activity/images/avatar/:userId/:hash — a Discord avatar. The host
  // is fixed and both path parts are validated, so nothing else is reachable.
  app.get(apiPrefix + "images/avatar/:userId/:hash", async function (req, res) {
    const { userId, hash } = req.params;
    if (!/^\d{5,25}$/.test(userId) || !/^(a_)?[0-9a-f]{32}$/.test(hash)) {
      return res.sendStatus(400);
    }
    try {
      await sendProxiedImage(
        `https://cdn.discordapp.com/avatars/${userId}/${hash}.png?size=64`,
        res
      );
    } catch (err) {
      log.error("Failed to proxy avatar for " + userId + ":", err);
      if (!res.headersSent) res.sendStatus(500);
    }
  });

  // Static hosting for the built SPA.
  //
  // Discord loads an Activity from the ROOT of the domain named in the root URL
  // mapping, so the SPA must be served at "/" — that single mapping then covers
  // the page, its assets, and every /members/* call the page makes. Serving it
  // only under /activity would hand Discord whatever "/" returns instead.
  //
  // activityEndPoints() is called last in WebApi, so every API route is already
  // registered and a file on disk can never shadow one. express.static only
  // matches paths that exist on disk; everything else falls through.
  app.use(express.static(ACTIVITY_DIST));

  // Alias, so the SPA is also reachable at /activity for debugging in a normal
  // browser without disturbing whatever is at the root.
  app.use("/activity", express.static(ACTIVITY_DIST));

  // Reached only when activity/dist is missing (express.static above serves
  // index.html for "/" whenever it exists). Keeps the old uptime payload so a
  // deploy without the SPA built doesn't turn the root into a 404.
  app.get("/", function (req, res) {
    res.send(jsonify({ uptime: process.uptime() }));
  });

  // SPA fallback for the /activity alias. Skips asset-looking paths so a missing
  // bundle 404s honestly instead of returning HTML with a .js content type.
  app.get("/activity/*", function (req, res, next) {
    if (path.extname(req.path)) return next();
    res.sendFile(path.join(ACTIVITY_DIST, "index.html"), (err) => {
      if (err) next(err);
    });
  });
}

/**
 * Authoritative membership check via the bot's own guild, so the Activity only
 * needs the `identify` scope. Throws DiscordAPIError 10007 for non-members.
 */
async function isGuildMember(userId: string): Promise<boolean> {
  try {
    const guild = global.client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) {
      log.error("GUILD_ID is not in the bot's guild cache — cannot verify membership");
      return false;
    }
    const member = await guild.members.fetch(userId);
    return !!member;
  } catch (err) {
    log.debug(`Guild membership lookup failed for ${userId}:`, (err as any)?.message);
    return false;
  }
}

/**
 * Mirrors logDiscordLogin in WebApi.ts, but best-effort: uses updateMany so a
 * member row that doesn't exist yet doesn't throw P2025.
 */
async function recordActivityLogin(profile) {
  const result = await global.client.prisma.login_History.create({
    data: {
      UserID: profile.id,
      DiscordProfile: jsonify(profile),
    },
  });

  await global.client.prisma.members.updateMany({
    where: { ID: profile.id },
    data: { avatar: profile.avatar },
  });

  log.info(`Logged activity login: ${profile.username} ${result.Id}`);
}

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Fetches an image and relays it. Only http(s), only responses that really are
 * images (so a bad URL can't be used to read some other page through us), and
 * capped in size. Upstream failures become a 404 — the page drops broken
 * images anyway, and a dead Steam link isn't our error to page Bugsnag about.
 */
async function sendProxiedImage(url: string, res): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    res.sendStatus(404);
    return;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    res.sendStatus(404);
    return;
  }

  let upstream;
  try {
    upstream = await axios.get<ArrayBuffer>(parsed.toString(), {
      responseType: "arraybuffer",
      timeout: HTTP_TIMEOUT_MS,
      maxContentLength: IMAGE_MAX_BYTES,
      maxRedirects: 3,
    });
  } catch (err) {
    log.warn(`Image fetch failed for ${parsed.host}:`, (err as any)?.message);
    res.sendStatus(404);
    return;
  }

  const type = String(upstream.headers["content-type"] ?? "");
  // SVG can carry script, and we'd be serving it from our own origin — refuse.
  if (!type.startsWith("image/") || type.includes("svg")) {
    log.warn(`Refusing to proxy non-image (${type || "no type"}) from ${parsed.host}`);
    res.sendStatus(404);
    return;
  }

  res.set({
    "Content-Type": type,
    // Rewards and avatars rarely change; let the client and Discord's proxy
    // cache them so each store load doesn't refetch every image through us.
    "Cache-Control": "public, max-age=86400",
    "X-Content-Type-Options": "nosniff",
  });
  res.send(Buffer.from(upstream.data));
}
