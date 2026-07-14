import OpenAI from "openai";
import { createLogger } from "../utils/logger";
import { RaidModule } from "../modules/RaidModule";
import { RaidScheduler } from "../modules/RaidScheduler";
import { ChannelUpdates } from "../islander/ChannelUpdates";
import { TimeParser } from "../utils/TimeParser";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PelicanStatusMonitor: any = require("../modules/PelicanStatusMonitor.js");

const log = createLogger("OllamaAI");

export class OllamaAI {
  private openai: OpenAI;
  private tools: any[] = [];
  private systemInstructionText: string = "";
  private conversationContexts: Map<string, { messages: any[]; timestamp: number }> = new Map();
  private readonly CONTEXT_TTL_MS = 30 * 60 * 1000; // 30 minutes
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
      {
        type: "function",
        function: {
          name: "getRaidDetails",
          description: "Get detailed information about a specific raid, including signed-up members and scheduling options with vote counts. Use this when a member asks about a specific raid by name or when they want to know who's in a raid or what time options are proposed.",
          parameters: {
            type: "object",
            properties: {
              raidId: {
                type: "number",
                description: "The numeric ID of the raid",
              },
            },
            required: ["raidId"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "getUpcomingRaids",
          description: "Get raids that have been confirmed and scheduled (a time slot was selected and the raid is upcoming). Use this when a member asks what raids are coming up or what's scheduled.",
        },
      },
      {
        type: "function",
        function: {
          name: "createRaid",
          description: "Create a new raid. Only use this after confirming the title and minimum players with the user. The raid creator is automatically set to the user who requested it.",
          parameters: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "The name of the raid or game",
              },
              minPlayers: {
                type: "number",
                description: "The minimum number of players needed to start scheduling (default: 4)",
              },
            },
            required: ["title"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "getTimestamp",
          description: "Convert a natural-language date/time into Discord timestamp tags using the user's configured timezone. Returns the timestamp in multiple Discord formats (short time, long time, short date, long date, short date/time, long date/time, relative). Use this when a user asks for a timestamp or wants to convert a time into Discord's timestamp format.",
          parameters: {
            type: "object",
            properties: {
              datetime: {
                type: "string",
                description: "The date and/or time to convert, e.g. '15/03 18:30', 'tomorrow 9am', 'March 15 6:30pm', '18:30'",
              },
            },
            required: ["datetime"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "getMemberPoints",
          description: "Get the current palm tree points balance and recent point history for the user who asked. Use this when a member asks how many points they have or about their recent point transactions.",
        },
      },
      {
        type: "function",
        function: {
          name: "getGameServerStatus",
          description: "Get the current status of all game servers (Pelican-managed). Shows server name, online state, address, uptime, CPU and RAM usage. Use this when a member asks if a game server is up or about server status.",
        },
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
      "- Use the tools provided to fetch real-time data about events, raids, the store, and scheduled raids when asked. " +
      "If a member mentions a raid by name or asks about a specific raid, use getRaids first to find the raid ID, then use getRaidDetails for full information.\n" +
      "- When a member asks you to create a new raid, ALWAYS confirm the title and minimum number of players with them before calling the createRaid tool. " +
      "Default to 4 minimum players if the member doesn't specify. Only call createRaid after the member confirms.\n" +
      "- When a member asks for a Discord timestamp or wants to convert a time, use the getTimestamp tool with their date/time input.\n" +
      "- When a member asks about their palm tree points balance, use the getMemberPoints tool.\n" +
      "- When a member asks about game server status (e.g. 'is the Minecraft server up?'), use the getGameServerStatus tool.";
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

  private cleanupExpiredContexts(): void {
    const now = Date.now();
    for (const [key, entry] of this.conversationContexts) {
      if (now - entry.timestamp > this.CONTEXT_TTL_MS) {
        this.conversationContexts.delete(key);
      }
    }
  }

  public storeContext(messageId: string, messages: any[]): void {
    this.conversationContexts.set(messageId, { messages, timestamp: Date.now() });
  }

  public hasContext(messageId: string): boolean {
    return this.conversationContexts.has(messageId);
  }

  public async ask(question: string, contextId?: string, authorId?: string): Promise<{ response: string; messages: any[] }> {
    this.cleanupExpiredContexts();

    // Load existing conversation context if this is a reply to a bot message
    let messages: any[];
    if (contextId && this.conversationContexts.has(contextId)) {
      messages = [...this.conversationContexts.get(contextId)!.messages];
      log.debug(`Loaded conversation context from message ${contextId} (${messages.length} messages)`);
    } else {
      messages = [{ role: "system", content: this.systemInstructionText }];
    }

    messages.push({ role: "user", content: question });

    let retries = 0;
    const maxRetries = 1;
    const maxToolRounds = 5;

    for (let round = 0; round <= maxToolRounds; round++) {
      try {
        log.debug(`Sending question to Ollama (round ${round}): ${question}`);

        let result = await this.openai.chat.completions.create({
          model: this.model,
          messages: messages,
          tools: this.tools,
        });

        let responseMessage = result.choices[0].message;
        messages.push(responseMessage);

        if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) {
          // No more tool calls — return the final text response
          return {
            response: responseMessage.content || "I'm sorry, I generated a response but couldn't format it as text.",
            messages,
          };
        }

        log.debug("Ollama requested tool calls:", responseMessage.tool_calls);

        for (const call of responseMessage.tool_calls) {
          if (call.type === "function") {
            const output = await this.handleFunctionCall(call.function, authorId);
            messages.push({
              tool_call_id: call.id,
              role: "tool",
              name: call.function.name,
              content: output,
            });
          }
        }
        // Loop back to send tool outputs and get next response
      } catch (error: any) {
        const isRetryable = error.status === 429 || error.status >= 500;

        if (isRetryable && retries < maxRetries) {
          retries++;
          const delay = Math.pow(2, retries) * 1000;
          log.warn(`Ollama error ${error.status}. Retrying in ${delay}ms... (Attempt ${retries}/${maxRetries})`);
          await this.wait(delay);
          round--; // retry the same round
          continue;
        }

        log.error("Error in Ollama ask method:", error);
        return {
          response: "Sorry, I encountered an error while processing your request.",
          messages,
        };
      }
    }

    return {
      response: "Sorry, I reached the maximum number of tool calls without getting a final answer. Please try rephrasing your question.",
      messages,
    };
  }

  private async handleFunctionCall(call: any, authorId?: string): Promise<string> {
    switch (call.name) {
      case "getEvents":
        return await this.getEventsString();
      case "getRaids":
        return await this.getRaidsString();
      case "getStore":
        return await this.getStoreString();
      case "getRaidDetails":
        return await this.getRaidDetailsString(call.arguments);
      case "getUpcomingRaids":
        return await this.getUpcomingRaidsString();
      case "createRaid":
        return await this.createRaidString(call.arguments, authorId || "");
      case "getTimestamp":
        return await this.getTimestampString(call.arguments, authorId || "");
      case "getMemberPoints":
        return await this.getMemberPointsString(authorId || "");
      case "getGameServerStatus":
        return await this.getGameServerStatusString();
      default:
        return "Tool not found.";
    }
  }

  private async getRaidDetailsString(rawArgs: string | object): Promise<string> {
    let args: any;
    try {
      args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
    } catch {
      return "Invalid arguments for getRaidDetails.";
    }
    const raidId = args?.raidId;
    if (!raidId || typeof raidId !== "number") {
      return "A valid numeric raid ID is required.";
    }

    const raid = await globalThis.client.prisma.raids.findFirst({
      where: { ID: raidId },
      include: {
        RaidAttendees: true,
        RaidSchedulingOption: { include: { RaidAvailability: true } },
      },
    });

    if (!raid) {
      return `Raid ${raidId} not found.`;
    }

    const statusMap: Record<number, string> = {
      1: "Open (collecting attendees)",
      2: "Scheduling (voting on times)",
      3: "Scheduled (confirmed)",
      4: "Cancelled",
    };
    const statusText = statusMap[raid.Status ?? 1] ?? "Unknown";

    let string = `Raid: ${raid.Title}\n`;
    string += `ID: ${raid.ID}\n`;
    string += `Status: ${statusText}\n`;
    string += `Creator: ${global.client.idToName(raid.Creator) ?? raid.Creator}\n`;
    string += `Min Players: ${raid.MinPlayers ?? 4}\n`;
    string += `Created: ${new Date(raid.CreationTime ?? Date.now()).toLocaleString()}\n`;

    // Attendees
    string += `\nAttendees (${raid.RaidAttendees.length}):\n`;
    if (raid.RaidAttendees.length === 0) {
      string += "  No one has signed up yet.\n";
    } else {
      raid.RaidAttendees.forEach((a: any) => {
        const name = global.client.idToName(a.MemberId) ?? a.MemberId;
        string += `  - ${name}\n`;
      });
    }

    // Scheduling options
    if (raid.RaidSchedulingOption && raid.RaidSchedulingOption.length > 0) {
      string += `\nScheduling Options:\n`;
      raid.RaidSchedulingOption.forEach((opt: any) => {
        const time = new Date(opt.Timestamp).toLocaleString();
        const selected = opt.IsSelected ? " [SELECTED]" : "";
        const voteCount = opt.RaidAvailability?.length ?? 0;
        string += `  ${time}${selected} — ${voteCount} vote(s)\n`;
      });
    }

    return string;
  }

  private async getUpcomingRaidsString(): Promise<string> {
    const now = new Date();
    const raids = await globalThis.client.prisma.raids.findMany({
      where: { Status: 3 },
      include: {
        RaidAttendees: true,
        RaidSchedulingOption: { where: { IsSelected: true } },
      },
    });

    const upcoming = raids.filter((r) =>
      r.RaidSchedulingOption.some(
        (opt) => opt.Timestamp > now
      )
    );

    if (upcoming.length === 0) {
      return "No upcoming scheduled raids found.";
    }

    // Sort by earliest scheduled time
    upcoming.sort((a, b) => {
      const aTime = a.RaidSchedulingOption.find((o) => o.IsSelected)?.Timestamp ?? new Date(0);
      const bTime = b.RaidSchedulingOption.find((o) => o.IsSelected)?.Timestamp ?? new Date(0);
      return aTime.getTime() - bTime.getTime();
    });

    let string = "";
    upcoming.forEach((raid) => {
      const selectedOpt = raid.RaidSchedulingOption.find((o) => o.IsSelected);
      const time = selectedOpt ? new Date(selectedOpt.Timestamp).toLocaleString() : "Unknown time";
      string += `Raid: ${raid.Title} - ID: ${raid.ID} - When: ${time} - Attendees: ${raid.RaidAttendees.length}/${raid.MinPlayers ?? 4}\n`;
    });
    return string;
  }

  private async getMemberPointsString(authorId: string): Promise<string> {
    if (!authorId) {
      return "Unable to determine which member is asking.";
    }

    // Fetch current points balance
    const points = await globalThis.client.prisma.points.findUnique({
      where: { userid: authorId },
    });

    // Fetch recent point history (last 10 entries)
    const history = await globalThis.client.prisma.pointHistory.findMany({
      where: { userid: authorId },
      orderBy: { TimeStamp: "desc" },
      take: 10,
    });

    const totalPoints = points?.TotalPoints ?? 0;
    const memberName = global.client.idToName(authorId) ?? "Unknown member";

    let string = `Member: ${memberName}\n`;
    string += `Total palm tree points: ${totalPoints}\n`;

    if (points?.lastComment) {
      string += `Last transaction: ${points.lastComment}\n`;
    }

    if (history.length > 0) {
      string += `\nRecent point history (last ${history.length}):\n`;
      history.forEach((entry: any) => {
        const date = new Date(entry.TimeStamp).toLocaleDateString();
        string += `  ${date}: ${entry.points > 0 ? "+" : ""}${entry.points} — ${entry.comment}\n`;
      });
    } else {
      string += "\nNo recent point history found.";
    }

    return string;
  }

  private async getGameServerStatusString(): Promise<string> {
    try {
      return await PelicanStatusMonitor.getServerStatuses();
    } catch (err: any) {
      log.error("Failed to fetch game server status:", err);
      return "Failed to fetch game server status. Please try again later.";
    }
  }

  private async createRaidString(rawArgs: string | object, authorId: string): Promise<string> {
    let args: any;
    try {
      args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
    } catch {
      return "Invalid arguments for createRaid.";
    }

    const title = args?.title;
    if (!title || typeof title !== "string") {
      return "A raid title is required.";
    }

    const minPlayers = typeof args?.minPlayers === "number" ? args.minPlayers : 4;

    try {
      const raid = await globalThis.client.prisma.raids.create({
        data: {
          Title: title,
          MinPlayers: minPlayers,
          Creator: authorId,
        },
      });

      // Auto-enlist the creator and check scheduling (same flow as /create-raid)
      try {
        await RaidModule.AddAttendeeToRaid(raid.ID, authorId);
        await RaidScheduler.SchedulingCreationCheck(raid.ID);
      } catch (err) {
        log.error("Failed to auto-enlist raid creator:", err);
      }

      // Post the updated raid list to the raid channel
      ChannelUpdates.MessageWithRaid("New raid created: " + title).catch((err) =>
        log.error("Failed to send raid channel update:", err)
      );

      return `Successfully created raid "${title}" (ID: ${raid.ID}) with a minimum of ${minPlayers} players. The creator has been automatically enlisted and the raid has been posted to the raid channel.`;
    } catch (err) {
      log.error("Failed to create raid:", err);
      return "Failed to create the raid. Please try again or use /create-raid instead.";
    }
  }

  private async getTimestampString(rawArgs: string | object, authorId: string): Promise<string> {
    let args: any;
    try {
      args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
    } catch {
      return "Invalid arguments for getTimestamp.";
    }

    const datetimeInput = args?.datetime;
    if (!datetimeInput || typeof datetimeInput !== "string") {
      return "A date/time input is required.";
    }

    // Look up the user's timezone
    let timezone = "UTC";
    let timezoneWasSet = false;
    try {
      const member = await globalThis.client.prisma.members.findUnique({
        where: { ID: authorId },
        select: { Timezone: true },
      });
      if (member?.Timezone) {
        timezone = member.Timezone;
        timezoneWasSet = true;
      }
    } catch (err) {
      log.error("Failed to fetch member timezone for timestamp:", err);
    }

    const parsed = await TimeParser.parse(datetimeInput, timezone);

    if (!parsed.isValid()) {
      const tzNote = timezoneWasSet
        ? `Timezone: ${timezone}`
        : "No timezone set (using UTC). The user can set their timezone with /set-timezone.";
      return `Could not parse "${datetimeInput}" as a date/time. ${tzNote}`;
    }

    const unixSeconds = parsed.unix();

    const formats = [
      { label: "Short time", code: "t", example: "9:41 PM" },
      { label: "Long time", code: "T", example: "9:41:30 PM" },
      { label: "Short date", code: "d", example: "30/06/2021" },
      { label: "Long date", code: "D", example: "30 June 2021" },
      { label: "Short date/time", code: "f", example: "30 June 2021 9:41 PM" },
      { label: "Long date/time", code: "F", example: "Wednesday, 30 June 2021 9:41 PM" },
      { label: "Relative", code: "R", example: "in 2 hours" },
    ];

    let string = `Timestamps for "${datetimeInput}" (Timezone: ${timezoneWasSet ? timezone : "UTC (not set)"}):\n`;
    formats.forEach((f) => {
      const tag = `<t:${unixSeconds}:${f.code}>`;
      string += `${f.label}: ${tag} — copy: \`${tag}\`\n`;
    });

    return string;
  }

  private async getRaidsString(): Promise<string> {
    const raids = await globalThis.client.prisma.raids.findMany({
      include: { RaidAttendees: true },
      where: { Status: 1 },
    });
    let string = "";
    raids.forEach((raid) => {
      string += `Raid: ${raid.Title} - ID: ${raid.ID} - Attendees: ${raid.RaidAttendees.length}/${raid.MinPlayers} \n`;
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