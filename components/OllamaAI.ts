import OpenAI from "openai";
import { createLogger } from "../utils/logger";

const log = createLogger("OllamaAI");

export class OllamaAI {
  private openai: OpenAI;
  private messages: any[] = [];
  private tools: any[] = [];
  private systemInstructionText: string = "";
  private readonly model = process.env.OLLAMA_MODEL || "gemma4:cloud";

  constructor() {
    this.openai = new OpenAI({
      baseURL: process.env.OLLAMA_BASE_URL || "https://ollama.com/v1",
      apiKey: process.env.OLLAMA_AI_KEY || "",
    });

    this.tools = [
      { type: "function", function: { name: "getEvents", description: "Get the current discord events for the week" } },
      { type: "function", function: { name: "getRaids", description: "Get the current available raids to join" } },
      { type: "function", function: { name: "getStore", description: "Get the current available rewards in the FlamingPalm store" } },
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

    this.messages = [{ role: "system", content: this.systemInstructionText }];
  }

  /**
   * Parses a natural-language date/time string into an ISO 8601 string using Ollama.
   */
  public async parseDate(input: string, timezone: string): Promise<string | null> {
    const now = new Date();
    const nowIso = now.toISOString();

    const systemPrompt =
      `You are a precise date/time parser. Your sole task is to convert natural-language date/time expressions into ISO 8601 strings.\n\n` +
      `Output rules:\n` +
      `- Return ONLY a single ISO 8601 string in this exact format: YYYY-MM-DDTHH:mm:ss±HH:MM\n` +
      `- Include the UTC offset that corresponds to the user's timezone, accounting for DST\n` +
      `- Return exactly the word INVALID if the input cannot reasonably be interpreted as a date or time\n` +
      `- Output nothing else — no explanation, no markdown, no surrounding text\n\n` +
      `Parsing rules:\n` +
      `- Time-only input (e.g. "18:30", "6pm") → use today's date\n` +
      `- Date without year → use the current year; if that date has already passed, use next year\n` +
      `- Relative expressions ("tomorrow", "next Monday", "in 2 hours") → resolve against the current date/time\n` +
      `- When a date/time is ambiguous, prefer the nearest future occurrence`;

    const userPrompt =
      `Current UTC date/time: ${nowIso}\n` +
      `User timezone: ${timezone}\n\n` +
      `Examples (illustrative — "now" = 2026-05-25T20:00:00Z, timezone Europe/Brussels = UTC+2 in summer):\n` +
      `  "18:30"           → 2026-05-25T18:30:00+02:00\n` +
      `  "tomorrow 9am"    → 2026-05-26T09:00:00+02:00\n` +
      `  "15/03 18:30"     → 2026-03-15T18:30:00+01:00\n` +
      `  "next Friday 3pm" → 2026-05-29T15:00:00+02:00\n` +
      `  "in 2 hours"      → 2026-05-25T22:00:00+02:00\n` +
      `  "dog"             → INVALID\n\n` +
      `Parse this input: "${input}"`;

    const maxRetries = 2;

    let retries = 0;
    while (retries <= maxRetries) {
      try {
        const result = await this.openai.chat.completions.create({
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0,
          max_tokens: 30,
        });
        const text = result.choices[0]?.message?.content?.trim() || "INVALID";
        log.debug("Ollama date parsing result:", text);
        if (text.includes("INVALID")) return null;

        const match = text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/);
        if (match) return match[match.length - 1];

        throw new Error("Failed to parse ISO string from response");
      } catch (error: any) {
        const isRetryable = error.status === 503 || error.status === 429 || error.status >= 500 || error.message?.includes("503");

        if (isRetryable && retries < maxRetries) {
          retries++;
          const delay = Math.pow(2, retries) * 1000;
          log.warn(`Ollama date parsing failed, retrying in ${delay}ms... (Attempt ${retries}/${maxRetries}): ${error.message}`);
          await this.wait(delay);
          continue;
        }

        log.error("Error in Ollama date parsing:", error);
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

    this.messages.push({ role: "user", content: question });

    while (retries <= maxRetries) {
      try {
        log.debug(`Sending question to Ollama: ${question}${retries > 0 ? ` (Retry ${retries})` : ""}`);

        let result = await this.openai.chat.completions.create({
          model: this.model,
          messages: this.messages,
          tools: this.tools,
        });

        let responseMessage = result.choices[0].message;
        this.messages.push(responseMessage);

        if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
          log.debug("Ollama requested tool calls:", responseMessage.tool_calls);

          for (const call of responseMessage.tool_calls) {
            if (call.type === "function") {
              const output = await this.handleFunctionCall(call.function);
              this.messages.push({
                tool_call_id: call.id,
                role: "tool",
                name: call.function.name,
                content: output,
              });
            }
          }

          // Send tool outputs back to model to get final response
          result = await this.openai.chat.completions.create({
            model: this.model,
            messages: this.messages,
            tools: this.tools,
          });
          responseMessage = result.choices[0].message;
          this.messages.push(responseMessage);
        }

        return responseMessage.content || "I'm sorry, I generated a response but couldn't format it as text.";
      } catch (error: any) {
        const isRetryable = error.status === 429 || error.status >= 500;

        if (isRetryable && retries < maxRetries) {
          retries++;
          const delay = Math.pow(2, retries) * 1000;
          log.warn(`Ollama error ${error.status}. Retrying in ${delay}ms... (Attempt ${retries}/${maxRetries})`);
          await this.wait(delay);
          continue;
        }

        log.error("Error in Ollama ask method:", error);
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