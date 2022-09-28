module.exports = {
  name: "channelCreate",
  execute(channel) {
    if (channel instanceof global.client.discord.VoiceChannel) {
      if (channel.guild.id === "530537522355240961") {
        global.client.log("new flaming palm voice channel made" + channel.name);
        global.client.DBconnection.query(
          "INSERT INTO Channel (ID,ChannelName) VALUES (?,?)",
          [channel.id, channel.name],
          function (error, results, fields) {
            if (error != null) {
              global.client.log(error);
            }
          }
        );
      }
    }
  },
};
