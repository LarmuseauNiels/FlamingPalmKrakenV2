import { GoogleGenerativeAI, Tool, GenerativeModel, ChatSession, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { createLogger } from "../utils/logger";

const log = createLogger("GoogleAI");

export class GoogleAI {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private proModel: GenerativeModel;
  private chat: ChatSession;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY || "");
    
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

    this.model = this.genAI.getGenerativeModel(
      { model: "gemini-2.5-flash" },
      { apiVersion: "v1" }
    );

    this.proModel = this.genAI.getGenerativeModel(
      { model: "gemini-2.5-pro" },
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

    const systemInstruction = {
      role: "system",
      parts: [{ text:
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
        "- Use the tools provided to fetch real-time data about events, raids, and the store when asked."
      }],
    };

    // Re-initialize model with instructions and tools
    this.model = this.genAI.getGenerativeModel(
      { model: "gemini-2.5-flash", systemInstruction, tools, safetySettings },
      { apiVersion: "v1" }
    );

    this.proModel = this.genAI.getGenerativeModel(
      { model: "gemini-2.5-pro", systemInstruction, tools, safetySettings },
      { apiVersion: "v1" }
    );

    this.chat = this.model.startChat({
      history: [],
      generationConfig: {
        maxOutputTokens: 1000,
      },
    });
  }

  /**
   * Simple parse method for dates without full assistant overhead
   */
  public async parseDate(input: string, timezone: string): Promise<string | null> {
    try {
      const prompt = `Convert this natural language date/time into an ISO 8601 string: "${input}". 
      Today's date is ${new Date().toISOString()}. 
      Assume the timezone is ${timezone}. 
      Return only the ISO string or "INVALID" if you cannot parse it. Do not include any other text.`;
      
      const result = await this.model.generateContent(prompt);
      const text = result.response.text().trim();
      return text !== "INVALID" ? text : null;
    } catch (error) {
      log.error("Error in Gemini date parsing:", error);
      return null;
    }
  }

  private async wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public async ask(question: string): Promise<string> {
    let retries = 0;
    const maxRetries = 3;

    while (retries <= maxRetries) {
      try {
        log.debug(`Sending question to Gemini: ${question}${retries > 0 ? ` (Retry ${retries})` : ""}`);
        let result = await this.chat.sendMessage(question);
        let response = result.response;

        // Check for blocked content
        if (response.promptFeedback?.blockReason) {
          log.warn(`Gemini blocked the prompt: ${response.promptFeedback.blockReason}`);
          return "I'm sorry, I cannot process that request due to my safety guidelines.";
        }

        // Handle potential function calls
        let calls = response.functionCalls();
        if (calls && calls.length > 0) {
          log.debug("Gemini requested tool calls:", calls);
          const toolOutputs = await Promise.all(
            calls.map(async (call) => {
              const output = await this.handleFunctionCall(call);
              return {
                functionResponse: {
                  name: call.name,
                  response: { content: output },
                },
              };
            })
          );

          // Send tool outputs back to model to get final response
          result = await this.chat.sendMessage(toolOutputs as any);
          response = result.response;
        }

        // Final check for text content
        try {
          return response.text();
        } catch (e) {
          log.error("Failed to extract text from Gemini response:", e);
          if (response.candidates && response.candidates[0]?.finishReason === "SAFETY") {
            return "I'm sorry, my response was cut off due to safety filters.";
          }
          return "I'm sorry, I generated a response but couldn't format it as text.";
        }
      } catch (error: any) {
        const errorCode = error.status || error.response?.status;
        const isRetryable = errorCode === 503 || errorCode === 429;

        if (isRetryable && retries < maxRetries) {
          retries++;
          const delay = Math.pow(2, retries) * 1000;
          log.warn(`Gemini error ${errorCode} (High Demand/Rate Limit). Retrying in ${delay}ms... (Attempt ${retries}/${maxRetries})`);
          await this.wait(delay);
          continue;
        }

        // Final Fallback to Pro model if Flash is overloaded
        if (isRetryable && retries === maxRetries) {
            log.info("Gemini Flash overloaded after all retries. Falling back to Pro model...");
            try {
                // To maintain context, we grab history from the primary chat
                const history = await this.chat.getHistory();
                const proChat = this.proModel.startChat({ history });
                const result = await proChat.sendMessage(question);
                return result.response.text();
            } catch (fallbackError: any) {
                log.error("Pro model fallback also failed:", fallbackError.message);
            }
        }

        log.error("Error in Gemini ask method:", error);
        if (error.response?.data) {
          log.debug("Gemini API Error details:", JSON.stringify(error.response.data));
        }
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
