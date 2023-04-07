import express from "express";
import cors from "cors";
import passport from "passport";
import session from "express-session";
import { legacyEndPoints } from "./ApiFunctions/LegacyEndPoints";
import { jsonify } from "./ApiFunctions/Helpers";

const DiscordStrategy = require("passport-discord").Strategy;

const app = express();
const prompt = "consent";

export class WebApi {
  constructor() {
    passport.serializeUser(function (user, done) {
      done(null, user);
    });
    passport.deserializeUser(function (obj, done) {
      done(null, obj);
    });
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
          global.client.prisma.login_History.create({
            data: {
              UserID: profile.id,
              DiscordProfile: profile,
            },
          });
          if (profile.guilds.map((g) => g.id).includes(process.env.GUILD_ID)) {
            process.nextTick(function () {
              return done(null, profile);
            });
          } else {
            global.client.log(
              "User not in guild tried logging in: " +
                profile.username +
                " " +
                profile.id
            );
            return done(null, null);
          }
        }
      )
    );
    app.use(cors());
    app.use(
      session({
        secret: process.env.oauthSecret,
        resave: false,
        saveUninitialized: false,
        //cookie: { secure: true },
      })
    );
    app.use(passport.initialize());
    app.use(passport.session());

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
      passport.authenticate("discord", {
        failureRedirect: "/",
      }),
      function (req, res) {
        res.redirect("/test");
      } // auth success
    );

    app.get("/test", checkAuth, function (req, res) {
      res.send(jsonify(req.user));
    });

    app.get("/", function (req, res) {
      res.send("KRAKEN API");
    });

    function checkAuth(req, res, next) {
      if (req.isAuthenticated()) return next();
      res.send("not logged in :(");
    }

    legacyEndPoints(app);
    this.load();
  }

  load() {
    app.listen(3000, () => {
      console.log("WebApi listening on port 3000");
    });
  }
}
