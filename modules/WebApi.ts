import express from "express";
import { createLogger } from "../utils/logger";

const log = createLogger("WebApi");
import cors from "cors";
import passport from "passport";
import jwt from "jsonwebtoken";
import { legacyEndPoints } from "./ApiFunctions/LegacyEndPoints";
import { jsonify } from "./ApiFunctions/Helpers";
import { memberEndPoints } from "./ApiFunctions/MemberEndPoints";
import { profileEndPoints } from "./ApiFunctions/ProfileEndPoints";
import { shopEndPoints } from "./ApiFunctions/ShopEndPoints";
import bodyParser from "body-parser";
import { adminEndPoints } from "./ApiFunctions/AdminEndPoints";
import { raidEndPoints } from "./ApiFunctions/RaidEndPoints";
import { Strategy as DiscordStrategy } from "passport-discord-auth";
const app = express();
const prompt = "consent";

export class WebApi {
  constructor() {
    const middleware = global.bugsnag.getPlugin("express");
    passport.use(
      new DiscordStrategy(
        {
          clientId: process.env.CLIENT_ID,
          clientSecret: process.env.OAUTHSECRET,
          callbackUrl: process.env.CALLBACK_URL,
          scope: ["identify", "guilds"],
        },
        function (accessToken, refreshToken, profile, done) {
          logDiscordLogin(profile).catch((err) =>
            log.error("Failed to log discord login for " + profile.username + ":", err)
          );
          if (profile.guilds.map((g) => g.id).includes(process.env.GUILD_ID)) {
            process.nextTick(function () {
              return done(null, profile);
            });
          } else {
            global.client.log(
              `User not in guild tried logging in: ${profile.username}`
            );
            return done(null, null);
          }
        }
      ) as any
    );

    app.use(middleware.requestHandler);
    app.use(cors());
    app.use(passport.initialize());
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.json());

    //auth test
    app.get(
      "/auth",
      passport.authenticate("discord", {
        scope: ["identify", "guilds"],
        prompt: prompt,
      }),
      function (req, res) {}
    );
    app.get(
      "/login",
      passport.authenticate("discord", { session: false }),
      async function (req, res) {
        let profile: any = req.user;
        let token = jwt.sign(
          {
            id: profile.id,
            username: profile.username,
            avatar: profile.avatar,
          },
          process.env.JWT_SECRET
        );
        res.send(jsonify(token));
      } // auth success
    );

    // Health check
    app.get("/", (req, res) => {
      res.send(jsonify({ uptime: process.uptime() }));
    });

    legacyEndPoints(app);
    memberEndPoints(app);
    profileEndPoints(app);
    shopEndPoints(app);
    adminEndPoints(app);
    raidEndPoints(app);

    app.use(function (err, req, res, next) {
      log.error("Unhandled Express error:", err.stack);
      res.status(500).send("Something broke!");
    });
    app.use(middleware.errorHandler);
    app.listen(3000, () => {
      log.info("WebApi listening on port 3000");
    });
  }
}

async function logDiscordLogin(profile) {
  let result = await global.client.prisma.login_History.create({
    data: {
      UserID: profile.id,
      DiscordProfile: jsonify(profile),
    },
  });
  //update avatar is user
  await global.client.prisma.members.update({
    where: {
      ID: profile.id,
    },
    data: {
      avatar: profile.avatar,
    },
  });

  log.info(`Logged discord login: ${profile.username} ${result.Id}`);
}
