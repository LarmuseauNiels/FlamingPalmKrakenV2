const { EmbedBuilder, TextChannel } = require("discord.js");
module.exports = {
  name: "messageDelete",
  execute(msg) {
    console.log(msg);

    let channel = global.client.channels.cache.get("1126413976155205713");
    if (channel instanceof TextChannel) {
      channel.send("```json\n" + JSON.stringify(msg) + "```");
    }
  },
};
