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
import { config } from "../config";
import initStatistics from "../modules/statistics";

export default class ready implements IEvent {
  name = "ready";
  once = true;
  async execute(client: FpgClient) {
    // Set up the client's log channel and update channel
    client.logChannel = client.channels.cache.get(
      config.channels.log
    ) as TextChannel;
    client.updateChannel = client.channels.cache.get(
      config.channels.updates
    ) as TextChannel;
    client.lfg = client.channels.cache.get(
      config.channels.lfg
    ) as TextChannel;

    client.log(
      `Ready! Logged in as ${
        client.user!.tag
      }, version ${process.env.CAPROVER_GIT_COMMIT_SHA!.slice(0, 7)}`
    );
    initStatistics(client);

    const guildInvites: Collection<string, any> = new Collection();
    client.invites = guildInvites;

    client.user.setActivity("flamingpalm.com", {
      type: ActivityType.Watching,
    } as ActivityOptions);

    // Fetch invites for every guild
    for (const guild of client.guilds.cache.values()) {
      try {
        const invites = await guild.invites.fetch();
        client.invites.set(guild.id, invites);
      } catch (error) {
        console.log(error);
      }
    }

    // Fetch scheduled events
    try {
      const guild = await client.guilds.fetch(config.guildId);
      const events = await guild.scheduledEvents.fetch();
      client.events = events;
    } catch (error) {
      console.log(error);
    }
  }
}
