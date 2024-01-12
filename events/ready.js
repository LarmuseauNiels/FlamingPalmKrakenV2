const { Collection } = require("discord.js");

module.exports = {
  name: "ready",
  once: true,
  execute(client) {
    client.logChannel = client.channels.cache.get("1126413976155205713");
    client.updateChannel = client.channels.cache.get("1194590523277725716");
    client.log(
      `Ready! Logged in as ${
        client.user.tag
      }, version ${process.env.CAPROVER_GIT_COMMIT_SHA.slice(0, 7)}`
    );
    require("../modules/statistics.js")(client);
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
    client.user.setActivity({
      name: "flamingpalm.com",
      type: "WATCHING",
      url: "https://flamingpalm.com",
    });
  },
};
