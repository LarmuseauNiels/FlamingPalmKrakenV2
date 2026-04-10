import { GoogleGenerativeAI, Tool, GenerativeModel, ChatSession, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import OpenAI from "openai";
import { createLogger } from "../utils/logger";

const log = createLogger("GoogleAI");

export class GoogleAI {
  private genAI: GoogleGenerativeAI;
  private openai: OpenAI;
  private proModel: GenerativeModel;
  private openAiMessages: any[] = [];
  private openAiTools: any[] = [];
  private systemInstructionText: string = "";

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY || "");
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

    const tools: Tool[] = [
      {
        functionDeclarations: [
          {
            name: "getEvents",
            description: "Get the current discord events for the week",
          },
          {
            name: "getRaids",
            description: "Get the current available raids to join",
          },
          {
            name: "getStore",
            description: "Get the current available rewards in the FlamingPalm store",
          },
        ],
      },
    ];

    this.openAiTools = [
      { type: "function", function: { name: "getEvents", description: "Get the current discord events for the week" } },
      { type: "function", function: { name: "getRaids", description: "Get the current available raids to join" } },
      { type: "function", function: { name: "getStore", description: "Get the current available rewards in the FlamingPalm store" } },
    ];

    // Removed this.model gemini-2.5-pro initialization

    this.proModel = this.genAI.getGenerativeModel(
      { model: "gemini-3-flash-preview" },
      { apiVersion: "v1" }
    );

    const safetySettings = [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
    ];

    this.systemInstructionText = 
      "You are a helpful assistant in the form of a discord bot called Kraken in the gaming clan FlamingPalm. " +
      "You help members with questions about the clan and finding info about the upcoming events.\n\n" +
      "About FlamingPalm:\n" +
      "The Flaming Palm is a gaming community that specializes in organizing and hosting events to foster unity among our members. " +
      "We are an active community involved in a variety of games and warmly welcome new members to join us.\n\n" +
      "Rules:\n" +
      "- Respect is Key: Treat all members with respect. Bullying, harassment, and hate speech are strictly prohibited.\n" +
      "- No Spam: Avoid spamming in any channel.\n" +
      "- No Recruitment: Do not recruit for other clans or communities within our Discord.\n" +
      "- NSFW Content: NSFW content is not allowed.\n" +
      "- No Extreme Toxicity: Maintain a friendly and welcoming demeanor.\n" +
      "Failure to comply with these rules can result in warnings or bans.\n\n" +
      "Common Tasks:\n" +
      "- Anyone can create a new raid using /create-raid!\n" +
      "- Members earn 'palm tree' points for participating in events, redeemable at https://flamingpalm.com.\n" +
      "- Use the tools provided to fetch real-time data about events, raids, and the store when asked.";

    const systemInstruction = {
      role: "system",
      parts: [{
        text: this.systemInstructionText
      }],
    };

    // Removed this.model gemini-2.5-flash re-initialization

    this.proModel = this.genAI.getGenerativeModel({
      model: "gemma-4-31b-it",
      systemInstruction,
      tools,
      safetySettings,
    });

    this.openAiMessages = [{ role: "system", content: this.systemInstructionText }];
  }

  /**
   * Simple parse method for dates without full assistant overhead
   */
  public async parseDate(input: string, timezone: string): Promise<string | null> {
    const now = new Date();
    const nowStr = `${now.toDateString()} ${now.toTimeString()}`;
    const prompt = `Convert this natural language date/time into an ISO 8601 (JSON format) string: "${input}". 
    The current date and time is ${nowStr}. 
    Assume the user's local timezone is ${timezone}. 
    Return only the ISO string or "INVALID" if you cannot parse it. Do not include any other text.`;

    const maxRetries = 2; // For each model

    let retries = 0;
    while (retries <= maxRetries) {
      try {
        // Primary attempt: OpenAI
        const result = await this.openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
        });
        const text = result.choices[0]?.message?.content?.trim() || "INVALID";
        if (text.includes("INVALID")) return null;
        
        const match = text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/);
        if (match) return match[0];
        
        throw new Error("Failed to parse ISO string from response");
      } catch (error: any) {
        const isRetryable = error.status === 503 || error.status === 429 || error.message?.includes("503");

        if (isRetryable && retries < maxRetries) {
          retries++;
          const delay = Math.pow(2, retries) * 1000;
          log.warn(`OpenAI date parsing failed, retrying in ${delay}ms... (Attempt ${retries}/${maxRetries}): ${error.message}`);
          await this.wait(delay);
          continue;
        }

        log.warn(`OpenAI date parsing failed, trying Gemini fallback: ${error.message}`);

        let geminiRetries = 0;
        while (geminiRetries <= maxRetries) {
          try {
            // Fallback: Gemini
            const result = await this.proModel.generateContent(prompt);
            const text = result.response.text().trim();
            if (text.includes("INVALID")) return null;
            
            const match = text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/);
            if (match) return match[0];
            
            throw new Error("Failed to parse ISO string from fallback response");
          } catch (fallbackError: any) {
            const fallbackErrorCode = fallbackError.status || fallbackError.response?.status;
            const fallbackIsRetryable = fallbackErrorCode === 503 || fallbackErrorCode === 429 || fallbackError.message?.includes("503") || fallbackError.message?.includes("429");

            if (fallbackIsRetryable && geminiRetries < maxRetries) {
              geminiRetries++;
              const delay = Math.pow(2, geminiRetries) * 1000;
              log.warn(`Gemini date parsing failed, retrying in ${delay}ms... (Attempt ${geminiRetries}/${maxRetries}): ${fallbackError.message}`);
              await this.wait(delay);
              continue;
            }

            log.error("Error in AI date parsing (OpenAI and Gemini failed):", fallbackError);
            return null;
          }
        }
        return null;
      }
    }
    return null;
  }

  private async wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public async ask(question: string): Promise<string> {
    let retries = 0;
    const maxRetries = 1;

    this.openAiMessages.push({ role: "user", content: question });

    while (retries <= maxRetries) {
      try {
        log.debug(`Sending question to OpenAI: ${question}${retries > 0 ? ` (Retry ${retries})` : ""}`);
        
        let result = await this.openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: this.openAiMessages,
          tools: this.openAiTools,
        });

        let responseMessage = result.choices[0].message;
        this.openAiMessages.push(responseMessage);

        if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
          log.debug("OpenAI requested tool calls:", responseMessage.tool_calls);
          
          for (const call of responseMessage.tool_calls) {
            if (call.type === "function") {
              const output = await this.handleFunctionCall(call.function);
              this.openAiMessages.push({
                tool_call_id: call.id,
                role: "tool",
                name: call.function.name,
                content: output,
              });
            }
          }

          // Send tool outputs back to model to get final response
          result = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: this.openAiMessages,
            tools: this.openAiTools,
          });
          responseMessage = result.choices[0].message;
          this.openAiMessages.push(responseMessage);
        }

        return responseMessage.content || "I'm sorry, I generated a response but couldn't format it as text.";
      } catch (error: any) {
        const isRetryable = error.status === 429 || error.status >= 500;

        if (isRetryable && retries < maxRetries) {
          retries++;
          const delay = Math.pow(2, retries) * 1000;
          log.warn(`OpenAI error ${error.status}. Retrying in ${delay}ms... (Attempt ${retries}/${maxRetries})`);
          await this.wait(delay);
          continue;
        }

        // Final Fallback to Gemini if OpenAI is overloaded
        if (isRetryable && retries === maxRetries) {
          log.info("OpenAI overloaded after all retries. Falling back to Gemini model...");
          try {
            // Reconstruct Gemini history from OpenAI messages (ignore tool calls for simplicity)
            const geminiHistory: any[] = [];
            for (const msg of this.openAiMessages) {
              if (msg.role === "user" && msg.content && typeof msg.content === "string") {
                 geminiHistory.push({ role: "user", parts: [{ text: msg.content }] });
              } else if (msg.role === "assistant" && msg.content && typeof msg.content === "string") {
                 geminiHistory.push({ role: "model", parts: [{ text: msg.content }] });
              }
            }
            // The last msg is the fallback question we want to ask
            const lastUserMsg = geminiHistory.pop();
            const fallbackQuestion = lastUserMsg ? lastUserMsg.parts[0].text : question;

            const fallbackChat = this.proModel.startChat({ history: geminiHistory });
            const fallbackResult = await fallbackChat.sendMessage(fallbackQuestion);
            
            return fallbackResult.response.text();
          } catch (fallbackError: any) {
            log.error("Gemini model fallback also failed:", fallbackError.message);
          }
        }

        log.error("Error in OpenAI ask method:", error);
        return "Sorry, I encountered an error while processing your request.";
      }
    }
    return "Sorry, the AI service is currently overloaded. Please try again in a moment.";
  }

  private async handleFunctionCall(call: any): Promise<string> {
    switch (call.name) {
      case "getEvents":
        return await this.getEventsString();
      case "getRaids":
        return await this.getRaidsString();
      case "getStore":
        return await this.getStoreString();
      default:
        return "Tool not found.";
    }
  }

  private async getRaidsString(): Promise<string> {
    const raids = await globalThis.client.prisma.raids.findMany({
      include: { RaidAttendees: true },
      where: { Status: 1 },
    });
    let string = "";
    raids.forEach((raid) => {
      string += `Raid: ${raid.Title} - Attendees: ${raid.RaidAttendees.length}/${raid.MinPlayers} \n`;
    });
    return string || "No open raids found.";
  }

  private async getEventsString(): Promise<string> {
    let string = "";
    if (globalThis.client.events) {
      for (let e of globalThis.client.events) {
        let event = globalThis.client.events.get(e[0]);
        string += `Event: ${event.name} - Date: ${new Date(
          event.scheduledStartTimestamp
        ).toString()} - Description: ${event.description} - Link: ${event.url} \n`;
      }
    }
    return string || "No upcoming events found.";
  }

  private async getStoreString(): Promise<string> {
    let rewards = await global.client.prisma.reward.findMany({
      include: { RewardItem: true },
      orderBy: { Price: "asc" },
    });
    let string = "";
    rewards.forEach((reward) => {
      if (reward.visible) {
        let stock = reward.RewardItem.filter((x) => x.RedeemedBy === "").length;
        if (stock === 0) string += `Reward: ${reward.Title} - Out of stock \n`;
        else {
          string += `Reward: ${reward.Title} - Price: ${reward.Price} palm trees \n`;
        }
      }
    });
    return string || "Store is currently empty.";
  }
}
