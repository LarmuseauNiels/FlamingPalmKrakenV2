import { Message } from "discord.js";
import { IEvent } from "../interfaces/IEvent";

export default class messageCreate implements IEvent {
  name = "messageCreate";
  execute(message: Message) {
    // ...existing code...
    if (message.channelId === process.env.MEMES_CHANNEL) {
      message.react("👍").then(console.log).catch(console.error);
      message.react("👎").then(console.log).catch(console.error);
    }

    if (message.mentions.has(global.client.user)) {
      console.log("Message mentions me" + message.content);
      global.client.assistant.ask(message.content).then((response: any) => {
        console.log(response[0].content);
        message.reply(response[0].content[0].text.value);
      });
    }
  }
}
