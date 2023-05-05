import express from "express";
import cors from "cors";
import passport from "passport";
import jwt from "jsonwebtoken";
import { legacyEndPoints } from "./ApiFunctions/LegacyEndPoints";
import { jsonify } from "./ApiFunctions/Helpers";
import { memberEndPoints } from "./ApiFunctions/MemberEndPoints";
import bodyParser from "body-parser";
const DiscordStrategy = require("passport-discord").Strategy;
const app = express();
const prompt = "consent";

export class WebApi {
  constructor() {
    const middleware = global.bugsnag.getPlugin("express");
    passport.use(
      new DiscordStrategy(
        {
          clientID: process.env.CLIENT_ID,
          clientSecret: process.env.OAUTHSECRET,
          callbackURL: "callback",
          scope: ["identify", "guilds"],
          prompt: prompt,
        },
        function (accessToken, refreshToken, profile, done) {
          logDiscordLogin(profile);
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
      )
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
      "/callback",
      passport.authenticate("discord", { session: false }),
      function (req, res) {
        let profile: any = req.user;
        let token = jwt.sign(
          {
            id: profile.id,
            username: profile.username,
            avatar: profile.avatar,
          },
          process.env.TOKEN
        );
        res.send(token);
      } // auth success
    );

    legacyEndPoints(app);
    memberEndPoints(app);

    app.use(function (err, req, res, next) {
      console.error(err.stack);
      res.status(500).send("Something broke!");
    });
    app.use(middleware.errorHandler);
    app.listen(3000, () => {
      console.log("WebApi listening on port 3000");
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
  console.log(`Logged discord login: ${profile.username} ${result.Id}`);
}
