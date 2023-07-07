const { EmbedBuilder, TextChannel } = require("discord.js");
module.exports = {
  name: "messageDelete",
  execute(msg) {
    console.log(msg);
    /*
    const removedMessageEmbed = new EmbedBuilder()
      .setTitle("Message removed")
      .setDescription(`${msg?.author?.username}'s message has been removed`)
      .addFields([
        {
          name: "Author ID",
          value: msg.author.id,
          inline: true,
        },
        {
          name: "Channel",
          value: msg.channel.name,
          inline: true,
        },
        {
          name: "Channel ID",
          value: msg.channelId,
          inline: true,
        },
        {
          name: "Sent",
          value: msg.createdAt,
          inline: true,
        },
        {
          name: "Content",
          value: msg.content,
          inline: false,
        },
      ])
      .setColor("#FF0000")
      .setTimestamp();

    let channel = global.client.channels.cache.get("1126413976155205713");
    if (channel instanceof TextChannel) {
      channel.send({ embeds: [removedMessageEmbed] });
    }
      */
  },
};
