import { Message } from "discord.js";
import { IEvent } from "../interfaces/IEvent";
import { createLogger } from "../utils/logger";

const log = createLogger("MessageCreate");

export default class messageCreate implements IEvent {
  name = "messageCreate";
  execute(message: Message) {
    if (message.author.bot) return;

    if (message.channelId === process.env.MEMES_CHANNEL) {
      message.react("👍").then(() => log.debug("Reacted with thumbs up")).catch((e) => log.error("Failed to react:", e));
      message.react("👎").then(() => log.debug("Reacted with thumbs down")).catch((e) => log.error("Failed to react:", e));
    }

    // Determine if this message should trigger the bot:
    // 1. @-mention of the bot (fresh question or reply with mention)
    // 2. Reply to a previous bot message (follow-up conversation)
    let contextId: string | undefined;
    if (message.reference?.messageId) {
      contextId = message.reference.messageId;
    }

    const isMention = message.mentions.has(global.client.user);
    const isReplyToBot = contextId ? global.client.ollamaAI.hasContext(contextId) : false;

    if (!isMention && !isReplyToBot) return;

    log.info("Message mentions bot: " + message.content);

    global.client.ollamaAI.ask(message.content, contextId).then((result: { response: string; messages: any[] }) => {
      if (result.response) {
        message.reply(result.response).then((sentMessage: Message) => {
          // Store the conversation context under the bot's reply message ID
          global.client.ollamaAI.storeContext(sentMessage.id, result.messages);
        }).catch((e) => log.error("Failed to reply with response:", e));
      } else {
        log.error("Empty or invalid response from Ollama AI");
        message.reply("I'm sorry, I couldn't process your request properly.").catch((e) => log.error("Failed to reply with error message:", e));
      }
    }).catch(error => {
      log.error("Error with ollamaAI.ask:", error);
      message.reply("Sorry, I encountered an error processing your request.").catch((e) => log.error("Failed to reply with error message:", e));
    });
  }
}