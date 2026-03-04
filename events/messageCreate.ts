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
        console.log("Full response:", JSON.stringify(response, null, 2));
        
        if (response && response.length > 0) {
          // Check if we have a valid response object
          const responseContent = response[0]?.content;
          
          if (responseContent && responseContent.length > 0) {
            const textValue = responseContent[0]?.text?.value;
            if (textValue) {
              message.reply(textValue);
            } else {
              console.error("No text.value property in response");
              message.reply("I'm sorry, I couldn't process your request properly.");
            }
          } else {
            console.error("Empty or invalid content array in response");
            message.reply("I'm sorry, I couldn't process your request properly.");
          }
        } else {
          console.error("Empty or invalid response from assistant");
          message.reply("I'm sorry, I couldn't process your request properly.");
        }
      }).catch(error => {
        console.error("Error with assistant.ask:", error);
        message.reply("Sorry, I encountered an error processing your request.");
      });
    }
  }
}
