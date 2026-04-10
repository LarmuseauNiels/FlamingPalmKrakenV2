import { Message } from "discord.js";
import { IEvent } from "../interfaces/IEvent";
import { createLogger } from "../utils/logger";

const log = createLogger("MessageCreate");

export default class messageCreate implements IEvent {
  name = "messageCreate";
  execute(message: Message) {
    // ...existing code...
    if (message.channelId === process.env.MEMES_CHANNEL) {
      message.react("👍").then(() => log.debug("Reacted with thumbs up")).catch((e) => log.error("Failed to react:", e));
      message.react("👎").then(() => log.debug("Reacted with thumbs down")).catch((e) => log.error("Failed to react:", e));
    }

    if (message.mentions.has(global.client.user)) {
      log.info("Message mentions bot: " + message.content);
      global.client.googleAI.ask(message.content).then((response: string) => {
        if (response) {
            message.reply(response).catch((e) => log.error("Failed to reply with response:", e));
        } else {
          log.error("Empty or invalid response from Google AI");
          message.reply("I'm sorry, I couldn't process your request properly.").catch((e) => log.error("Failed to reply with error message:", e));
        }
      }).catch(error => {
        log.error("Error with googleAI.ask:", error);
        message.reply("Sorry, I encountered an error processing your request.").catch((e) => log.error("Failed to reply with error message:", e));
      });
    }
  }
}
