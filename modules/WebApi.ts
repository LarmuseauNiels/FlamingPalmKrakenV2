import express from "express";
import cors from "cors";
import passport from "passport";
import session from "express-session";
import jwt from "jsonwebtoken";
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
          logDiscordLogin(profile);
          if (profile.guilds.map((g) => g.id).includes(process.env.GUILD_ID)) {
            process.nextTick(function () {
              return done(null, profile.id);
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
        let token = jwt.sign({ userId: req.user }, process.env.TOKEN);
        res.send(token);
      } // auth success
    );
    app.post("/profile", authenticateToken, function (req, res) {
      res.send(jsonify(req.user));
    });

    app.get("/test", function (req, res) {});

    legacyEndPoints(app);
    app.get("/", function (req, res) {
      res.send("KRAKEN API");
    });
    this.load();
  }

  load() {
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

const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  console.log(token);

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, process.env.TOKEN as string, (err: any, user: any) => {
    console.log(err);

    if (err) return res.sendStatus(403);

    req.user = user;

    next();
  });
}
