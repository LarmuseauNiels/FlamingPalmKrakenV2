import express from "express";
import cors from "cors";
import passport from "passport";
import session from "express-session";

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
    let jsonify = this.jsonify;
    passport.use(
      new DiscordStrategy(
        {
          clientID: "534686392589221898",
          clientSecret: process.env.oauthSecret,
          callbackURL: "callback",
          scope: ["identify", "guilds"],
          prompt: prompt,
        },
        function (accessToken, refreshToken, profile, done) {
          process.nextTick(function () {
            return done(null, profile);
          });
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

    this.setLegacyEndPoints();
    this.load();
  }

  setLegacyEndPoints() {
    let jsonify = this.jsonify;
    app.get("/activity", async function (req, res) {
      let results = await globalThis.client.prisma
        .$queryRaw`select timestamp,count(*) as online from VoiceConnected  WHERE VoiceConnected.TimeStamp >= curdate() - INTERVAL DAYOFWEEK(curdate())+6 DAY  group by timestamp`;
      res.send(jsonify(results));
    });

    app.get("/activityFromDate/:date", async function (req, res) {
      var date = req.params["date"];
      let results = await globalThis.client.prisma
        .$queryRaw`select timestamp,count(*) as online from VoiceConnected  WHERE date(TimeStamp) = ${date}  group by timestamp `;
      res.send(jsonify(results));
    });

    app.get("/userActivityDate/:date", async function (req, res) {
      var date = req.params["date"];
      let results = await globalThis.client.prisma
        .$queryRaw`SELECT Members.DisplayName as name, count(*) as y FROM VoiceConnected LEFT JOIN Members ON VoiceConnected.ID = Members.ID 
     WHERE date(TimeStamp) = ${date} GROUP BY VoiceConnected.ID order by y desc`;
      res.send(jsonify(results));
    });

    app.get("/channelActivity", async function (req, res) {
      let results = await globalThis.client.prisma
        .$queryRaw`select ChannelName as name, count(*) as y from VoiceConnected
     WHERE VoiceConnected.TimeStamp >= curdate() - INTERVAL DAYOFWEEK(curdate())+6 DAY group by ChannelName`;
      res.send(jsonify(results));
    });

    app.get("/userActivity", async function (req, res) {
      let results = await globalThis.client.prisma
        .$queryRaw`SELECT Members.DisplayName as name, count(*) as y FROM VoiceConnected LEFT JOIN Members ON VoiceConnected.ID = Members.ID 
     WHERE VoiceConnected.TimeStamp >= curdate() - INTERVAL DAYOFWEEK(curdate())+6 DAY GROUP BY VoiceConnected.ID order by y desc`;
      res.send(jsonify(results));
    });

    app.get("/userActivityAll", async function (req, res) {
      let results = await globalThis.client.prisma
        .$queryRaw`SELECT Members.DisplayName as name, count(*) as y FROM VoiceConnected LEFT JOIN Members ON VoiceConnected.ID = Members.ID 
     GROUP BY VoiceConnected.ID order by y desc`;
      res.send(jsonify(results));
    });

    app.get("/userOnlineTimes/:userId", async function (req, res) {
      var userId = req.params["userId"];
      let results = await globalThis.client.prisma
        .$queryRaw`SELECT timestamp, 1 as online FROM VoiceConnected
    JOIN Channel on Channel.ID = VoiceConnected.ChannelID 
    WHERE VoiceConnected.TimeStamp >= curdate() - INTERVAL DAYOFWEEK(curdate())+6 DAY AND VoiceConnected.ID = ${userId}`;
      res.send(jsonify(results));
    });

    app.get("/userInfo/:userId", async function (req, res) {
      var userId = req.params["userId"];
      let results = await globalThis.client.prisma
        .$queryRaw`SELECT * FROM Members where ID =  ${userId}`;
      res.send(jsonify(results));
    });

    app.get("/PossibleYears", async function (req, res) {
      let results = await globalThis.client.prisma
        .$queryRaw`select DISTINCT YEAR(timestamp) from VoiceConnected`;
      res.send(jsonify(results));
    });

    app.get("/YearActivity/:year", async function (req, res) {
      var year = req.params["year"];
      let results = await globalThis.client.prisma
        .$queryRaw`select  MONTH(timestamp) as month, DAY(timestamp) as day ,YEAR(timestamp) as year, count(*) as online from VoiceConnected 
      Where YEAR(timestamp) = ${year} group by year,month, day`;
      res.send(jsonify(results));
    });

    app.get("/events", function (req, res) {
      if (globalThis.client.events == null) {
        client.guilds.fetch("530537522355240961").then((guild) => {
          guild.scheduledEvents.fetch().then((events) => {
            res.send(jsonify(events));
          });
        });
      } else {
        res.send(jsonify(globalThis.client.events));
      }
    });
  }

  jsonify(obj) {
    return JSON.stringify(obj, (key, value) =>
      typeof value === "bigint" ? Number(value) : value
    );
  }

  load() {
    app.listen(3000, () => {
      console.log("WebApi listening on port 3000");
    });
  }
}
