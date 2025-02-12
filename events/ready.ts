import {
  ActivityOptions,
  ActivityType,
  Collection,
  Guild,
  GuildScheduledEvent,
  TextChannel,
} from "discord.js";
import { FpgClient } from "../domain/FpgClient";

module.exports = {
  name: "ready",
  once: true,
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
      }, version ${process.env.CAPROVER_GIT_COMMIT_SHA!.slice(0, 7)}`
    );
    require("../modules/statistics.js")(client);
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
        .catch((error) => console.log(error));
    }
    client.guilds.fetch(process.env.GUILD_ID!).then((guild: Guild) => {
      guild.scheduledEvents
        .fetch()
        .then((events: Collection<string, GuildScheduledEvent>) => {
          client.events = events;
          client.cachUpdated = Date.now();
        });
    });
  },
};
