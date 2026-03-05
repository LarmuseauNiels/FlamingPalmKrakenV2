import { jsonify } from "./Helpers";
import { createLogger } from "../../utils/logger";

const log = createLogger("LegacyEndPoints");

export function legacyEndPoints(app) {
  app.get("/events", function (req, res) {
    if (globalThis.client.events == null) {
      globalThis.client.guilds
        .fetch(process.env.GUILD_ID)
        .then((guild) => {
          guild.scheduledEvents
            .fetch()
            .then((events) => {
              res.send(jsonify(events));
            })
            .catch((err) => {
              log.error("Failed to fetch scheduled events:", err);
              res.status(500).send("Failed to load events");
            });
        })
        .catch((err) => {
          log.error("Failed to fetch guild:", err);
          res.status(500).send("Failed to load events");
        });
    } else {
      res.send(jsonify(globalThis.client.events));
    }
  });
}
