import {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  EmbedBuilder,
  PermissionFlagsBits,
  Interaction,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { createLogger } from "../../utils/logger";

const log = createLogger("RemoveHandler");

const EMBED_FIELD_MAX_CHARS = 1024;

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(0, maxChars - 1) + "…" : text;
}

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

    const message = interaction.targetMessage;
    const { author, channel } = message;
    const { user: interactionUser } = interaction;
    // Embed field values must be 1–1024 characters, or discord.js throws and
    // the message was never removed: long messages and image-only posts.
    const content = message.content ? truncate(message.content, EMBED_FIELD_MAX_CHARS) : "(no text)";
    const channelName = "name" in channel && channel.name ? channel.name : "unknown channel";

    const removedMessageEmbed = new EmbedBuilder()
      .setTitle("Message removed")
      .setDescription(`${author.username}'s message has been removed by ${interactionUser.username}`)
      .addFields(
        { name: "Message", value: content, inline: false },
        { name: "Channel", value: channelName, inline: false }
      )
      .setColor("#FF0000")
      .setTimestamp();

    const userMessageEmbed = new EmbedBuilder()
      .setTitle("Your message has been removed")
      .setDescription(`Your message has been removed by ${interactionUser.username}`)
      .addFields(
        { name: "Message", value: content, inline: false },
        { name: "Channel", value: channelName, inline: false }
      )
      .setColor("#FF0000")
      .setTimestamp();

    await message.delete();
    await interaction.reply({ content: "Message removed", ephemeral: true });

    // Best effort: the removal already happened. Members with closed DMs
    // still get removed; the log channel may be unset during startup.
    global.client.logChannel
      ?.send({ embeds: [removedMessageEmbed] })
      .catch((err) => log.error("Failed to log removed message:", err));
    author
      .send({ embeds: [userMessageEmbed] })
      .catch((err) => log.warn(`Couldn't DM ${author.username} about the removed message:`, err?.message ?? err));
  }
}
