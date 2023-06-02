const { EmbedBuilder } = require("discord.js");
module.exports = {
  name: "messageDelete",
  execute(msg) {
    console.log(msg);
    /*
    const removedMessageEmbed = new EmbedBuilder()
      .setTitle("Message removed")
      .setDescription(`${msg?.author?.username}'s message has been removed`)
      .addFields(
        { name: "Message", value: msg?.cleanContent, inline: false },
        { name: "Channel", value: msg.channel?.name, inline: false }
      )
      .setColor("#FF0000")
      .setTimestamp();

    global.client.logChannel.send({ embeds: [removedMessageEmbed] });

     */
  },
};
