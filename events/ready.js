const { Collection } = require("discord.js");

module.exports = {
  name: "ready",
  once: true,
  execute(client) {
    client.logChannel = client.channels.cache.get("894190067747262464");
    client.log(
      `Ready! Logged in as ${
        client.user.tag
      }, version ${process.env.CAPROVER_GIT_COMMIT_SHA.slice(0, 7)}`
    );
    client.channels
      .fetch("561128481384300554")
      .then()
      .then((channel) => channel.messages.fetch({ limit: 100 }))
      .catch((err) => client.log(err));
    require("../modules/statistics.js")(client);
    require("../modules/webapi.js")(client);
    // Collection is an enhanced Map which we are going to save our invites to.
    const guildInvites = new Collection();
    client.invites = guildInvites;
    // Next, we are going to fetch invites for every guild and add them to our map.
    for (const guild of client.guilds.cache.values()) {
      guild.invites
        .fetch()
        .then((invite) => client.invites.set(guild.id, invite))
        .catch((error) => console.log(error));
    }
  },
};
