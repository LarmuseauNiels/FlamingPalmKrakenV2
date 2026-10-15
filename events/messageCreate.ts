import { Message } from "discord.js";
import { IEvent } from "../interfaces/IEvent";
import { createLogger } from "../utils/logger";
import { AiConversationStore, StoredConversation } from "../components/AiConversationStore";
import { splitMessage } from "../utils/DiscordText";

const log = createLogger("MessageCreate");

/** Discord's typing indicator lasts ~10s, so refresh it a bit sooner. */
const TYPING_REFRESH_MS = 8000;
/** How much of a replied-to message to show the AI. */
const MAX_REFERENCED_CHARS = 1500;

export default class messageCreate implements IEvent {
  name = "messageCreate";
  async execute(message: Message) {
    if (message.author.bot) return;

    if (message.channelId === process.env.MEMES_CHANNEL) {
      message.react("👍").then(() => log.debug("Reacted with thumbs up")).catch((e) => log.error("Failed to react:", e));
      message.react("👎").then(() => log.debug("Reacted with thumbs down")).catch((e) => log.error("Failed to react:", e));
    }

    try {
      await this.handleAiMessage(message);
    } catch (error) {
      log.error("Error handling AI message:", error);
      message.reply("Sorry, I encountered an error processing your request.").catch((e) => log.error("Failed to reply with error message:", e));
    }
  }

  /**
   * Answers the message with Kraken AI when it is meant for the bot:
   * 1. Sent in a DM (direct conversation with the bot)
   * 2. @-mention of the bot (fresh question, or about the message it replies to)
   * 3. Reply to one of the bot's AI answers (follow-up conversation)
   */
  private async handleAiMessage(message: Message) {
    const botId = global.client.user.id;
    const isDM = !message.guild;
    const isMention = message.mentions.has(global.client.user, { ignoreEveryone: true });

    let conversation: StoredConversation | null = null;
    if (message.reference?.messageId && message.mentions.repliedUser?.id === botId) {
      conversation = await AiConversationStore.get(message.reference.messageId);
    }

    if (!isDM && !isMention && !conversation) return;

    // In DMs a plain follow-up continues the last recent conversation.
    if (!conversation && isDM && !message.reference) {
      conversation = await AiConversationStore.getRecentDm(message.channelId, message.author.id);
    }

    log.info("Message for Kraken AI: " + message.content);

    let question = this.cleanContent(message);
    // "@Kraken what does this mean?" as a reply: show the AI what they're replying to.
    if (!conversation && message.reference?.messageId) {
      const referenced = await message.fetchReference().catch(() => null);
      const quoted = referenced ? this.describeMessage(referenced) : "";
      if (quoted) {
        question = `(I'm replying to this message from ${this.nameOf(referenced)}:\n"""\n${quoted}\n""")\n\n${question}`;
      }
    }
    if (!question) question = "(The member mentioned you without saying anything else.)";

    const stopTyping = this.keepTyping(message);
    let result;
    try {
      result = await global.client.ollamaAI.ask(question, {
        authorId: message.author.id,
        authorName: this.nameOf(message),
        isDM,
        history: conversation?.messages,
      });
    } finally {
      stopTyping();
    }

    if (!result.response) {
      log.error("Empty or invalid response from Ollama AI");
      await message.reply("I'm sorry, I couldn't process your request properly.");
      return;
    }

    // Long answers are split over several messages; Confirm buttons go on the last one.
    const chunks = splitMessage(result.response);
    const components = AiConversationStore.buildConfirmRows(result.pendingActions);
    const allowedMentions = { parse: ["users" as const], repliedUser: true };
    const sentIds: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const last = i === chunks.length - 1;
      const options = { content: chunks[i], components: last ? components : [], allowedMentions };
      const sent = i === 0 ? await message.reply(options) : await (message.channel as any).send(options);
      sentIds.push(sent.id);
    }

    await AiConversationStore.save(sentIds, message.channelId, message.author.id, result.messages, result.pendingActions).catch((e) =>
      log.error("Failed to store AI conversation:", e)
    );
  }

  /** Strips the bot's own mention and turns other mentions into readable @names. */
  private cleanContent(message: Message): string {
    const botId = global.client.user.id;
    const botRoleId = message.guild?.members.me?.roles.botRole?.id;
    let text = message.content.replace(new RegExp(`<@!?${botId}>`, "g"), "");
    if (botRoleId) text = text.replace(new RegExp(`<@&${botRoleId}>`, "g"), "");
    text = text.replace(/<@!?(\d+)>/g, (match, id) => {
      const member = message.mentions.members?.get(id);
      const user = message.mentions.users.get(id);
      return member ? `@${member.displayName}` : user ? `@${user.globalName ?? user.username}` : match;
    });
    return text.trim();
  }

  /** The text of a message, including its embeds (raid lists, announcements, ...). */
  private describeMessage(msg: Message): string {
    const parts: string[] = [];
    if (msg.content) parts.push(msg.content);
    for (const embed of msg.embeds) {
      if (embed.title) parts.push(embed.title);
      if (embed.description) parts.push(embed.description);
      for (const field of embed.fields) parts.push(`${field.name}: ${field.value}`);
    }
    const text = parts.join("\n").trim();
    return text.length > MAX_REFERENCED_CHARS ? text.slice(0, MAX_REFERENCED_CHARS) + "…" : text;
  }

  private nameOf(msg: Message): string {
    return msg.member?.displayName ?? msg.author.globalName ?? msg.author.username;
  }

  /** Shows "Kraken is typing…" until the returned function is called. */
  private keepTyping(message: Message): () => void {
    const channel: any = message.channel;
    if (typeof channel.sendTyping !== "function") return () => {};
    const type = () => channel.sendTyping().catch((e) => log.debug("Failed to send typing indicator:", e));
    type();
    const timer = setInterval(type, TYPING_REFRESH_MS);
    return () => clearInterval(timer);
  }
}
