import {
  ActivityOptions,
  ActivityType,
  Collection,
  Guild,
  GuildScheduledEvent,
  TextChannel,
} from "discord.js";
import { FpgClient } from "../components/FpgClient";
import { IEvent } from "../interfaces/IEvent";
import { createLogger } from "../utils/logger";

const log = createLogger("ClientReady");

export default class ready implements IEvent {
  name = "clientReady";
  once = true;
  execute(client: FpgClient) {
    // Set up the client's log channel and update channel
    client.logChannel = client.channels.cache.get(
      "1126413976155205713"
    ) as TextChannel;
    client.updateChannel = client.channels.cache.get(
      "1194590523277725716"
    ) as TextChannel;
    client.lfg = client.channels.cache.get(
      "1221531160568659968"
    ) as TextChannel;

    client.log(
      `Ready! Logged in as ${
        client.user!.tag
      }, version ${(process.env.CAPROVER_GIT_COMMIT_SHA ?? "unknown").slice(0, 7)}`
    );
    // Some of these are async (initial fetches before scheduling); a failed
    // start must be logged, not left as an unhandled rejection.
    for (const moduleName of ["statistics", "VintageStoryStatus", "PelicanStatusMonitor", "SparkReminder", "RaidReminders"]) {
      Promise.resolve()
        .then(() => require(`../modules/${moduleName}.js`)(client))
        .catch((error) => log.error(`Failed to start module ${moduleName}:`, error));
    }
    // Collection is an enhanced Map which we are going to save our invites to.
    const guildInvites: Collection<string, any> = new Collection();
    client.invites = guildInvites;

    client.user.setActivity("flamingpalm.com", {
      type: ActivityType.Watching,
    } as ActivityOptions);

    // Next, we are going to fetch invites for every guild and add them to our map.
    for (const guild of client.guilds.cache.values()) {
      guild.invites
        .fetch()
        .then((invites) => client.invites.set(guild.id, invites))
        .catch((error) => log.error("Failed to fetch guild invites:", error));
    }
    client.guilds
      .fetch(process.env.GUILD_ID!)
      .then((guild: Guild) => {
        guild.scheduledEvents
          .fetch()
          .then((events: Collection<string, GuildScheduledEvent>) => {
            client.events = events;
          })
          .catch((error) =>
            log.error("Failed to fetch guild scheduled events:", error)
          );
      })
      .catch((error) => log.error("Failed to fetch guild:", error));
  }
}
