import {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  EmbedBuilder,
  PermissionFlagsBits,
  Message,
  Interaction,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";

export default class RemoveHandler implements IHandler {
  name = "remove";
  isGuild = true;
  data = new ContextMenuCommandBuilder()
    .setName("remove")
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ) as ContextMenuCommandBuilder;

  async execute(interaction: Interaction) {
    if (!interaction.isMessageContextMenuCommand()) return;

    const message = await interaction.channel.messages.fetch(
      interaction.targetId
    );
    const { author, content, channel } = message;
    const { user: interactionUser } = interaction;

    const removedMessageEmbed = new EmbedBuilder()
      .setTitle("Message removed")
      .setDescription(
        `${author.username}'s message has been removed by ${interactionUser.username}`
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
        `Your message has been removed by ${interactionUser.username}`
      )
      .addFields(
        { name: "Message", value: content, inline: false },
        { name: "Channel", value: channel.name, inline: false }
      )
      .setColor("#FF0000")
      .setTimestamp();

    author.send({ embeds: [userMessageEmbed] });

    message.delete();
    interaction.reply({ content: "Message removed", ephemeral: true });
  }
}
