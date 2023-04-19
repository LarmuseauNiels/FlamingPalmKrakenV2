const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
module.exports = {
  name: "info",
  data: new ContextMenuCommandBuilder()
    .setName("remove")
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    //remove the message
    interaction.channel.messages.fetch(interaction.targetId).then((message) => {
      const { author, content, channel } = message;
      const { user: interactionUser } = interaction;

      const removedMessageEmbed = new EmbedBuilder()
        .setTitle("Message removed")
        .setDescription(
          `${author.displayName}'s message has been removed by ${interactionUser.displayName}`
        )
        .addFields(
          { name: "Message", value: content, inline: false },
          { name: "Channel", value: channel.name, inline: false }
        )
        .setColor("#FF0000")
        .setTimestamp();

      global.client.logChannel.send({ embeds: [removedMessageEmbed] });

      const userMessageEmbed = new EmbedBuilder()
        .setTitle("Your message has been removed")
        .setDescription(
          `Your message has been removed by ${interactionUser.displayName}`
        )
        .addFields(
          { name: "Message", value: content, inline: false },
          { name: "Channel", value: channel.name, inline: false }
        )
        .setColor("#FF0000")
        .setTimestamp();

      author.send({ embeds: [userMessageEmbed] });

      message.delete();
    });
    //send a message to the channel
    interaction.reply({ content: "Message removed", ephemeral: true });
  },
  isGuild: true,
};
