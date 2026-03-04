import { jsonify } from "./Helpers";
export function legacyEndPoints(app) {
  app.get("/events", function (req, res) {
    if (globalThis.client.events == null) {
      globalThis.client.guilds.fetch(process.env.GUILD_ID).then((guild) => {
        guild.scheduledEvents.fetch().then((events) => {
          res.send(jsonify(events));
        });
      });
    } else {
      res.send(jsonify(globalThis.client.events));
    }
  });
}
