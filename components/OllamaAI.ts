import OpenAI from "openai";
import { createLogger } from "../utils/logger";
import { RaidModule } from "../modules/RaidModule";
import { RaidScheduler } from "../modules/RaidScheduler";
import { ChannelUpdates } from "../islander/ChannelUpdates";
import { TimeParser } from "../utils/TimeParser";
import { getSteamGameInfo } from "../modules/SteamModule";
import { RaidRuleError } from "../modules/RaidScheduler";
import { PendingAction } from "./AiConversationStore";
import moment from "moment-timezone";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PelicanStatusMonitor: any = require("../modules/PelicanStatusMonitor.js");

const log = createLogger("OllamaAI");

/** Who is asking and what conversation they are continuing. */
export interface AskContext {
  authorId: string;
  authorName: string;
  isDM: boolean;
  /** Stored conversation being continued (no system prompt), if any. */
  history?: any[];
}

export interface AskResult {
  response: string;
  /** The conversation to store for the next turn (no system prompt). */
  messages: any[];
  /** Actions waiting for the member to press a Confirm button. */
  pendingActions: PendingAction[];
}

/** Per-request state the tools need. */
interface ToolContext {
  authorId: string;
  timezone: string | null;
  pendingActions: PendingAction[];
}

export class OllamaAI {
  private openai: OpenAI;
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
          description: "Create a new raid. This does not create it straight away: it shows the member a Confirm button under your reply. The raid creator is automatically set to the user who requested it.",
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
          description: "Get the current status of all game servers (Pelican-managed). Shows server name, online state, address, uptime, CPU and RAM usage, and live player count and player names where available. Use this when a member asks if a game server is up, about server status, or how many / which players are online.",
        },
      },
      {
        type: "function",
        function: {
          name: "joinRaid",
          description: "Join an open raid on behalf of the user. This shows the member a Confirm button under your reply; they are only signed up once they press it. Use getRaids to find the raid ID if needed before calling this tool.",
          parameters: {
            type: "object",
            properties: {
              raidId: {
                type: "number",
                description: "The numeric ID of the raid to join",
              },
            },
            required: ["raidId"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "getTimezone",
          description: "Get the currently configured IANA timezone for the user who asked. Use this when a member asks what their current timezone is set to, or wants to verify their timezone is correct before setting a new one.",
        },
      },
      {
        type: "function",
        function: {
          name: "setTimezone",
          description: "Set the user's timezone so the bot can parse date/time inputs correctly. The timezone must be a valid IANA timezone name (e.g. Europe/Brussels, America/New_York, Asia/Tokyo). Use this when a user asks to set or change their timezone.",
          parameters: {
            type: "object",
            properties: {
              timezone: {
                type: "string",
                description: "A valid IANA timezone name (e.g. Europe/Brussels, America/New_York, Asia/Tokyo)",
              },
            },
            required: ["timezone"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "leaveRaid",
          description: "Remove the user from a raid they are signed up for. This shows the member a Confirm button under your reply; they only leave once they press it. Use getMyRaids, getRaids or getRaidDetails to find the raid ID if needed before calling this tool.",
          parameters: {
            type: "object",
            properties: {
              raidId: {
                type: "number",
                description: "The numeric ID of the raid to leave",
              },
            },
            required: ["raidId"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "getSteamGameInfo",
          description: "Look up information about a video game on Steam by name — description, genres, price, release date, developer/publisher and review score. Use this when a member asks about a game, whether it's on Steam, how much it costs, or what it's about.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The name of the game to look up on Steam",
              },
            },
            required: ["query"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "startGameServer",
          description: "Start an offline game server (Pelican-managed) on behalf of the user. Only members with the server starter or server manager role may do this; the tool checks the role itself and reports if the user lacks it. Use this when a member asks to start or boot up a game server. Use getGameServerStatus first if you need the exact server name.",
          parameters: {
            type: "object",
            properties: {
              serverName: {
                type: "string",
                description: "The name (or a unique part of the name) of the game server to start",
              },
            },
            required: ["serverName"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "manageGameServer",
          description: "Restart or stop a running game server (Pelican-managed) on behalf of the user. Only members with the server manager role may do this; the tool checks the role itself and reports if the user lacks it. This shows the member a Confirm button under your reply (it disconnects anyone playing), so the action only happens once they press it.",
          parameters: {
            type: "object",
            properties: {
              serverName: {
                type: "string",
                description: "The name (or a unique part of the name) of the game server",
              },
              action: {
                type: "string",
                enum: ["restart", "stop"],
                description: "The power action to perform",
              },
            },
            required: ["serverName", "action"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "getMyRaids",
          description: "Get the raids the member who asked is signed up for: open raids still gathering players, raids in scheduling (with each time option, its letter, and whether the member has voted on it yet) and upcoming scheduled raids. Use this when a member asks what they're signed up for, when their next raid is, or what they still need to vote on.",
        },
      },
      {
        type: "function",
        function: {
          name: "setRaidAvailability",
          description: "Record which time options the member can or cannot make for a raid in scheduling (Status 2), the same as voting in the scheduling DM or on the raid board. Options are identified by their letter from getRaidDetails or getMyRaids. Only the options listed are changed; others keep their current vote. Use this when a member tells you when they are (or aren't) available for a raid.",
          parameters: {
            type: "object",
            properties: {
              raidId: {
                type: "number",
                description: "The numeric ID of the raid",
              },
              available: {
                type: "array",
                items: { type: "string" },
                description: "Letters of the time options the member CAN make, e.g. [\"A\", \"C\"]",
              },
              unavailable: {
                type: "array",
                items: { type: "string" },
                description: "Letters of the time options the member can NOT make",
              },
            },
            required: ["raidId"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "suggestRaidTime",
          description: "Suggest a new time option for a raid in scheduling (Status 2) when none of the existing options suit the member. The member is counted as available for it and every attendee is notified. This shows the member a Confirm button with the parsed time first. Pass the time in the member's own words.",
          parameters: {
            type: "object",
            properties: {
              raidId: {
                type: "number",
                description: "The numeric ID of the raid",
              },
              datetime: {
                type: "string",
                description: "The date and time to suggest, e.g. 'Friday 20:00', '17/10 19:30', 'tomorrow 9pm'",
              },
            },
            required: ["raidId", "datetime"],
          },
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
      "- Confirm buttons: createRaid, joinRaid, leaveRaid, manageGameServer and suggestRaidTime never act straight away. Calling them puts a Confirm button under your reply, and the action only happens when the member presses it. " +
      "So call them as soon as the member's intent is clear — only ask a question first when something is genuinely ambiguous (e.g. which of two raids they mean) — and then tell them to press the button. " +
      "Never say one of these actions is done; say it is waiting for their confirmation.\n" +
      "- When a member asks you to create a new raid, call createRaid. Default to 4 minimum players if the member doesn't specify.\n" +
      "- When a member asks for a Discord timestamp or wants to convert a time, use the getTimestamp tool with their date/time input.\n" +
      "- When a member asks about their palm tree points balance, use the getMemberPoints tool.\n" +
      "- When a member asks about game server status (e.g. 'is the Minecraft server up?'), use the getGameServerStatus tool. Also use it when they ask who or how many people are playing on a server.\n" +
      "- When a member asks to join a raid, use getRaids to find the raid ID if needed, then call joinRaid. Only join raids that are open (Status 1).\n" +
      "- When a member asks to leave a raid, use getMyRaids or getRaids to find the raid ID if needed, then call leaveRaid.\n" +
      "- When a member asks what they're signed up for, when their next raid is, or what they still have to vote on, use getMyRaids.\n" +
      "- When a member says when they can or can't play for a raid that is in scheduling, look up its time options (getMyRaids or getRaidDetails), match what they said to the option letters in their timezone, and call setRaidAvailability. " +
      "If no existing option fits and they named a specific time, offer to suggest it with suggestRaidTime.\n" +
      "- When a member asks to set or change their timezone, use the setTimezone tool with a valid IANA timezone name (e.g. Europe/Brussels, America/New_York).\n" +
      "- When a member asks what their current timezone is, or wants to check it before changing it, use the getTimezone tool. If they then want to change it, chain directly into the setTimezone tool without re-asking.\n" +
      "- When a member asks about a video game (what it's about, its price, whether it's on Steam), use the getSteamGameInfo tool with the game's name.\n" +
      "- When a member asks to start a game server, call the startGameServer tool with the server's name. If you're unsure which server they mean, use getGameServerStatus to list them and ask.\n" +
      "- When a member asks to restart or stop a game server, call the manageGameServer tool (it asks them to confirm with a button).\n\n" +
      "Times: tool results give times in the member's timezone followed by a Discord timestamp tag like <t:1760000000:F>. When you mention a specific time, include that tag — Discord shows it to every reader in their own timezone.\n\n" +
      "Formatting: you are writing Discord messages. Use Discord markdown (bold, lists, code) but no tables, and keep answers short — a few lines unless the member asked for detail.\n\n" +
      "Conversation context: in direct messages the conversation continues by itself for 30 minutes. In server channels you only see earlier messages when the member uses Discord's reply feature on one of your messages; " +
      "if a follow-up in a server channel seems to be missing context, briefly mention they can reply to your message to continue the conversation.";
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

  /** Builds the per-turn context the model can't know by itself: now, who's asking, their timezone. */
  private buildContextPrompt(ctx: AskContext, timezone: string | null): string {
    const zone = timezone ?? "UTC";
    const now = moment.tz(zone);
    let text = "Current context:\n";
    text += `- Now: ${now.format("dddd D MMMM YYYY, HH:mm")} in ${zone} (${now.toISOString()})\n`;
    text += `- Member talking to you: ${ctx.authorName} (Discord ID ${ctx.authorId})\n`;
    text += timezone
      ? `- Their timezone: ${timezone}. Interpret times they mention in this timezone.\n`
      : "- Their timezone: not set, so times are shown in UTC. If they talk about times, suggest setting their timezone (you can do it with setTimezone).\n";
    text += ctx.isDM ? "- Channel: direct message with you\n" : "- Channel: a server channel, visible to other members\n";
    return text;
  }

  private async getMemberTimezone(authorId: string): Promise<string | null> {
    try {
      const member = await globalThis.client.prisma.members.findUnique({
        where: { ID: authorId },
        select: { Timezone: true },
      });
      const validTimezones: string[] = (Intl as any).supportedValuesOf("timeZone");
      return member?.Timezone && validTimezones.includes(member.Timezone) ? member.Timezone : null;
    } catch (err) {
      log.error("Failed to fetch member timezone:", err);
      return null;
    }
  }

  /** "Fri 17 Oct 2026 19:00 Europe/Brussels (<t:...:F>)" — readable for the model, tagged for Discord. */
  private formatTime(date: Date, timezone: string | null): string {
    const zone = timezone ?? "UTC";
    const unix = Math.floor(date.getTime() / 1000);
    return `${moment.tz(date, zone).format("ddd D MMM YYYY HH:mm")} ${zone} (<t:${unix}:F>)`;
  }

  /**
   * Answers a member's message. `ctx.history` is the stored conversation being
   * continued (without system prompt). The returned `messages` are what to store
   * for the next turn; `pendingActions` need a Confirm button under the reply.
   */
  public async ask(question: string, ctx: AskContext): Promise<AskResult> {
    const timezone = await this.getMemberTimezone(ctx.authorId);
    const history = ctx.history ?? [];
    const messages: any[] = [
      { role: "system", content: this.systemInstructionText },
      { role: "system", content: this.buildContextPrompt(ctx, timezone) },
      ...history,
      { role: "user", content: question },
    ];
    // Everything after the two system messages is the conversation to store.
    const conversation = () => messages.slice(2);
    const toolCtx: ToolContext = { authorId: ctx.authorId, timezone, pendingActions: [] };

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
            messages: conversation(),
            pendingActions: toolCtx.pendingActions,
          };
        }

        log.debug("Ollama requested tool calls:", responseMessage.tool_calls);

        for (const call of responseMessage.tool_calls) {
          if (call.type === "function") {
            const output = await this.handleFunctionCall(call.function, toolCtx);
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
          messages: conversation(),
          pendingActions: [],
        };
      }
    }

    return {
      response: "Sorry, I reached the maximum number of tool calls without getting a final answer. Please try rephrasing your question.",
      messages: conversation(),
      pendingActions: [],
    };
  }

  private async handleFunctionCall(call: any, ctx: ToolContext): Promise<string> {
    if (OllamaAI.CONFIRMED_TOOLS.has(call.name)) {
      return await this.requestConfirmation(call.name, call.arguments, ctx);
    }
    return await this.runTool(call.name, call.arguments, ctx);
  }

  /** Runs an action the member confirmed with its button. Returns a message for the member. */
  public async runConfirmedAction(action: PendingAction): Promise<string> {
    const timezone = await this.getMemberTimezone(action.userId);
    return await this.runTool(action.tool, action.args, { authorId: action.userId, timezone, pendingActions: [] });
  }

  private async runTool(name: string, args: any, ctx: ToolContext): Promise<string> {
    const authorId = ctx.authorId;
    switch (name) {
      case "getEvents":
        return await this.getEventsString(ctx.timezone);
      case "getRaids":
        return await this.getRaidsString();
      case "getStore":
        return await this.getStoreString();
      case "getRaidDetails":
        return await this.getRaidDetailsString(args, ctx);
      case "getUpcomingRaids":
        return await this.getUpcomingRaidsString(ctx.timezone);
      case "createRaid":
        return await this.createRaidString(args, authorId || "");
      case "getTimestamp":
        return await this.getTimestampString(args, authorId || "");
      case "getMemberPoints":
        return await this.getMemberPointsString(authorId || "");
      case "getGameServerStatus":
        return await this.getGameServerStatusString();
      case "joinRaid":
        return await this.joinRaidString(args, authorId || "");
      case "setTimezone":
        return await this.setTimezoneString(args, authorId || "");
      case "getTimezone":
        return await this.getTimezoneString(authorId || "");
      case "leaveRaid":
        return await this.leaveRaidString(args, authorId || "");
      case "getSteamGameInfo":
        return await this.getSteamGameInfoString(args);
      case "startGameServer":
        return await this.startGameServerString(args, authorId || "");
      case "manageGameServer":
        return await this.manageGameServerString(args, authorId || "");
      case "getMyRaids":
        return await this.getMyRaidsString(ctx);
      case "setRaidAvailability":
        return await this.setRaidAvailabilityString(args, ctx);
      case "suggestRaidTime":
        return await this.suggestRaidTimeString(args, ctx);
      default:
        return "Tool not found.";
    }
  }

  /** Tools that change something for the member only run after they press a Confirm button. */
  private static readonly CONFIRMED_TOOLS = new Set(["createRaid", "joinRaid", "leaveRaid", "manageGameServer", "suggestRaidTime"]);
  private static readonly MAX_PENDING_ACTIONS = 4;

  /**
   * Checks a confirmable action up front (so the member never gets a button
   * that is bound to fail) and queues its Confirm button. The tool runs for
   * real — re-checking everything — when the button is pressed.
   */
  private async requestConfirmation(name: string, rawArgs: string | object, ctx: ToolContext): Promise<string> {
    const args = this.parseArgs(rawArgs);
    if (!args) return `Invalid arguments for ${name}.`;
    if (!ctx.authorId) return "Unable to determine which member is asking.";

    let checked: { error: string } | { label: string; args: any };
    try {
      checked = await this.checkConfirmable(name, args, ctx);
    } catch (err) {
      log.error(`Failed to check ${name}:`, err);
      return "Something went wrong preparing that action. Please try again later.";
    }
    if ("error" in checked) return checked.error;

    const key = name + JSON.stringify(checked.args);
    if (ctx.pendingActions.some((a) => a.tool + JSON.stringify(a.args) === key)) {
      return `A Confirm button for "${checked.label}" is already queued.`;
    }
    if (ctx.pendingActions.length >= OllamaAI.MAX_PENDING_ACTIONS) {
      return "Too many actions to confirm at once. Ask the member to confirm these first, then do the rest.";
    }
    ctx.pendingActions.push({ tool: name, args: checked.args, label: checked.label, userId: ctx.authorId });
    return `Waiting for confirmation: a Confirm button labelled ${checked.label} will be shown under your reply. Tell the member to press it. The action has NOT happened yet.`;
  }

  private async checkConfirmable(name: string, args: any, ctx: ToolContext): Promise<{ error: string } | { label: string; args: any }> {
    switch (name) {
      case "createRaid": {
        const title = typeof args.title === "string" ? args.title.trim() : "";
        if (!title) return { error: "A raid title is required." };
        const minPlayers = typeof args.minPlayers === "number" && args.minPlayers >= 1 ? Math.floor(args.minPlayers) : 4;
        return { label: `Create raid "${title}" (min ${minPlayers})`, args: { title, minPlayers } };
      }
      case "joinRaid":
      case "leaveRaid": {
        if (typeof args.raidId !== "number") return { error: "A valid numeric raid ID is required." };
        const raid = await globalThis.client.prisma.raids.findFirst({
          where: { ID: args.raidId },
          include: { RaidAttendees: { where: { MemberId: ctx.authorId } } },
        });
        if (!raid) return { error: `Raid ${args.raidId} not found.` };
        const signedUp = raid.RaidAttendees.length > 0;
        if (name === "joinRaid") {
          if (raid.Status !== 1) return { error: `Cannot join "${raid.Title}" — it is no longer open for sign-ups.` };
          if (signedUp) return { error: `The member is already signed up for "${raid.Title}".` };
          return { label: `Join "${raid.Title}"`, args: { raidId: raid.ID } };
        }
        if (!signedUp) return { error: `The member is not signed up for "${raid.Title}".` };
        return { label: `Leave "${raid.Title}"`, args: { raidId: raid.ID } };
      }
      case "manageGameServer": {
        if (typeof args.serverName !== "string" || !args.serverName) return { error: "Please provide the name of the game server." };
        if (args.action !== "restart" && args.action !== "stop") return { error: 'The action must be either "restart" or "stop".' };
        const roleId = process.env.PELICAN_MANAGE_ROLE_ID;
        if (!roleId) return { error: "Restarting or stopping game servers through Kraken is not enabled." };
        const denied = await this.checkMemberHasAnyRole(ctx.authorId, [roleId], "restart or stop game servers");
        if (denied) return { error: denied };
        const verb = args.action === "restart" ? "Restart" : "Stop";
        return { label: `${verb} ${args.serverName}`, args: { serverName: args.serverName, action: args.action } };
      }
      case "suggestRaidTime": {
        if (typeof args.raidId !== "number") return { error: "A valid numeric raid ID is required." };
        if (typeof args.datetime !== "string" || !args.datetime) return { error: "A date/time to suggest is required." };
        const denied = await this.checkSchedulingAttendee(args.raidId, ctx.authorId);
        if (denied) return { error: denied };
        const zone = ctx.timezone ?? "UTC";
        const parsed = await TimeParser.parse(args.datetime, zone);
        if (!parsed.isValid()) return { error: `Could not understand "${args.datetime}" as a date/time (timezone ${zone}).` };
        if (parsed.valueOf() <= Date.now()) return { error: `${this.formatTime(parsed.toDate(), ctx.timezone)} is in the past.` };
        return {
          label: `Suggest ${parsed.clone().tz(zone).format("ddd D MMM HH:mm")} (${zone})`,
          args: { raidId: args.raidId, timestamp: parsed.toISOString() },
        };
      }
      default:
        return { error: "Tool not found." };
    }
  }

  private parseArgs(rawArgs: string | object): any {
    try {
      const args = typeof rawArgs === "string" ? JSON.parse(rawArgs || "{}") : rawArgs;
      return args && typeof args === "object" ? args : null;
    } catch {
      return null;
    }
  }

  private async getSteamGameInfoString(rawArgs: string | object): Promise<string> {
    let args: any;
    try {
      args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
    } catch {
      return "Invalid arguments for getSteamGameInfo.";
    }
    const query = args?.query;
    if (!query || typeof query !== "string") {
      return "Please provide a game name to look up.";
    }
    try {
      return await getSteamGameInfo(query);
    } catch (error) {
      log.error("getSteamGameInfo failed", error);
      return "Sorry, I couldn't look up that game on Steam right now.";
    }
  }

  private async getRaidDetailsString(rawArgs: string | object, ctx: ToolContext): Promise<string> {
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
    string += `Created: ${this.formatTime(new Date(raid.CreationTime ?? Date.now()), ctx.timezone)}\n`;

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
      string += `\nScheduling Options (letter — time — who can make it):\n`;
      [...raid.RaidSchedulingOption]
        .sort((a: any, b: any) => (a.Timestamp?.getTime() ?? 0) - (b.Timestamp?.getTime() ?? 0))
        .forEach((opt: any) => {
          const time = opt.Timestamp ? this.formatTime(opt.Timestamp, ctx.timezone) : "Unknown time";
          const selected = opt.IsSelected ? " [SELECTED]" : "";
          const voters = (opt.RaidAvailability ?? []).map((v: any) => global.client.idToName(v.MemberId) ?? v.MemberId);
          const mine = (opt.RaidAvailability ?? []).some((v: any) => v.MemberId === ctx.authorId) ? " [you voted for this]" : "";
          string += `  ${opt.Option ?? "?"} — ${time}${selected}${mine} — ${voters.length} vote(s)${voters.length ? ": " + voters.join(", ") : ""}\n`;
        });
    }

    return string;
  }

  private async getUpcomingRaidsString(timezone: string | null): Promise<string> {
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
      const time = selectedOpt ? this.formatTime(selectedOpt.Timestamp, timezone) : "Unknown time";
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

  private async startGameServerString(rawArgs: string | object, authorId: string): Promise<string> {
    let args: any;
    try {
      args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
    } catch {
      return "Invalid arguments for startGameServer.";
    }
    const serverName = args?.serverName;
    if (!serverName || typeof serverName !== "string") {
      return "Please provide the name of the game server to start.";
    }

    // Server managers may also start servers
    const roleIds = [process.env.PELICAN_START_ROLE_ID, process.env.PELICAN_MANAGE_ROLE_ID].filter(Boolean) as string[];
    if (roleIds.length === 0) {
      return "Starting game servers through Kraken is not enabled.";
    }

    const denied = await this.checkMemberHasAnyRole(authorId, roleIds, "start game servers");
    if (denied) return denied;

    const result = await PelicanStatusMonitor.powerServer(serverName, "start");
    log.info(`User ${authorId} asked to start game server "${serverName}": ${result}`);
    return result;
  }

  private async manageGameServerString(rawArgs: string | object, authorId: string): Promise<string> {
    let args: any;
    try {
      args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
    } catch {
      return "Invalid arguments for manageGameServer.";
    }
    const serverName = args?.serverName;
    const action = args?.action;
    if (!serverName || typeof serverName !== "string") {
      return "Please provide the name of the game server.";
    }
    if (action !== "restart" && action !== "stop") {
      return 'The action must be either "restart" or "stop".';
    }

    const roleId = process.env.PELICAN_MANAGE_ROLE_ID;
    if (!roleId) {
      return "Restarting or stopping game servers through Kraken is not enabled.";
    }

    const denied = await this.checkMemberHasAnyRole(authorId, [roleId], "restart or stop game servers");
    if (denied) return denied;

    const result = await PelicanStatusMonitor.powerServer(serverName, action);
    log.info(`User ${authorId} asked to ${action} game server "${serverName}": ${result}`);
    return result;
  }

  /**
   * Returns null when the guild member has at least one of `roleIds`,
   * otherwise a message for the model explaining why the action was refused.
   */
  private async checkMemberHasAnyRole(authorId: string, roleIds: string[], actionLabel: string): Promise<string | null> {
    try {
      const guild = await global.client.guilds.fetch(process.env.GUILD_ID!);
      const member = await guild.members.fetch(authorId).catch(() => null);
      if (!member || !roleIds.some((id) => member.roles.cache.has(id))) {
        return `This member does not have the role required to ${actionLabel}. Tell them to ask an admin.`;
      }
      return null;
    } catch (err: any) {
      log.error("Failed to verify game server role:", err);
      return "Couldn't verify the member's permissions right now. Please try again later.";
    }
  }

  private async getGameServerStatusString(): Promise<string> {
    try {
      return await PelicanStatusMonitor.getServerStatuses();
    } catch (err: any) {
      log.error("Failed to fetch game server status:", err);
      return "Failed to fetch game server status. Please try again later.";
    }
  }

  private async joinRaidString(rawArgs: string | object, authorId: string): Promise<string> {
    let args: any;
    try {
      args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
    } catch {
      return "Invalid arguments for joinRaid.";
    }

    const raidId = args?.raidId;
    if (!raidId || typeof raidId !== "number") {
      return "A valid numeric raid ID is required.";
    }

    if (!authorId) {
      return "Unable to determine which member is joining.";
    }

    // Check the raid exists and is open (Status 1)
    const raid = await globalThis.client.prisma.raids.findFirst({
      where: { ID: raidId },
      include: { RaidAttendees: true },
    });

    if (!raid) {
      return `Raid ${raidId} not found.`;
    }

    if (raid.Status !== 1) {
      const statusMap: Record<number, string> = {
        2: "currently in the scheduling phase",
        3: "already scheduled",
        4: "cancelled",
      };
      return `Cannot join "${raid.Title}" — this raid is ${statusMap[raid.Status ?? 1] ?? "not open for joining"}.`;
    }

    // Check if already joined
    const alreadyJoined = raid.RaidAttendees.some((a: any) => a.MemberId === authorId);
    if (alreadyJoined) {
      return `You are already signed up for "${raid.Title}".`;
    }

    try {
      await RaidModule.AddUserToRaid(authorId, raidId);
      const attendeeCount = raid.RaidAttendees.length + 1;
      return `Successfully joined "${raid.Title}" (ID: ${raidId}). You are attendee ${attendeeCount} of ${raid.MinPlayers ?? 4} needed. The raid channel has been updated.`;
    } catch (err: any) {
      // Handle unique constraint violation (already joined)
      if (err?.code === "P2002") {
        return `You are already signed up for "${raid.Title}".`;
      }
      log.error("Failed to join raid:", err);
      return "Failed to join the raid. Please try again or use the raid channel directly.";
    }
  }

  private async getTimezoneString(authorId: string): Promise<string> {
    if (!authorId) {
      return "Unable to determine which member is requesting their timezone.";
    }

    try {
      const member = await globalThis.client.prisma.members.findUnique({
        where: { ID: authorId },
        select: { Timezone: true, DisplayName: true },
      });

      if (!member) {
        return "You don't have a timezone configured yet. Use the setTimezone tool with a valid IANA timezone name (e.g. Europe/Brussels, America/New_York) to set one.";
      }

      if (!member.Timezone) {
        return "You don't have a timezone configured yet. Use the setTimezone tool with a valid IANA timezone name (e.g. Europe/Brussels, America/New_York) to set one.";
      }

      // Validate the stored value is still a recognized IANA timezone
      const validTimezones: string[] = (Intl as any).supportedValuesOf("timeZone");
      if (!validTimezones.includes(member.Timezone)) {
        return `Your timezone is currently set to "${member.Timezone}", but this is not a recognised IANA timezone anymore. Please set a new one using the setTimezone tool (e.g. Europe/Brussels, America/New_York).`;
      }

      // Show the user-friendly current time in their zone so they can sanity-check it
      const now = new Date();
      const localTime = now.toLocaleString("en-GB", { timeZone: member.Timezone, dateStyle: "full", timeStyle: "long" });

      return `Your timezone is currently set to ${member.Timezone}. The current time there is ${localTime}. If this looks wrong, tell me your new timezone and I'll update it.`;
    } catch (err) {
      log.error("Failed to get timezone:", err);
      return "Failed to retrieve your timezone. Please try again or use /set-timezone to set it.";
    }
  }

  private async setTimezoneString(rawArgs: string | object, authorId: string): Promise<string> {
    let args: any;
    try {
      args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
    } catch {
      return "Invalid arguments for setTimezone.";
    }

    const timezone = args?.timezone;
    if (!timezone || typeof timezone !== "string") {
      return "A valid IANA timezone name is required (e.g. Europe/Brussels, America/New_York).";
    }

    // Validate against IANA timezone list
    const validTimezones: string[] = (Intl as any).supportedValuesOf("timeZone");
    if (!validTimezones.includes(timezone)) {
      return `"${timezone}" is not a valid IANA timezone. Examples of valid timezones: Europe/Brussels, America/New_York, Asia/Tokyo, Australia/Sydney.`;
    }

    if (!authorId) {
      return "Unable to determine which member is setting their timezone.";
    }

    try {
      await globalThis.client.prisma.members.upsert({
        where: { ID: authorId },
        update: { Timezone: timezone },
        create: { ID: authorId, Timezone: timezone },
      });

      return `Your timezone has been set to ${timezone}. The bot will now use this timezone when parsing date/time inputs for you (e.g. timestamps and raid scheduling).`;
    } catch (err) {
      log.error("Failed to set timezone:", err);
      return "Failed to set your timezone. Please try again or use /set-timezone.";
    }
  }

  private async leaveRaidString(rawArgs: string | object, authorId: string): Promise<string> {
    let args: any;
    try {
      args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
    } catch {
      return "Invalid arguments for leaveRaid.";
    }

    const raidId = args?.raidId;
    if (!raidId || typeof raidId !== "number") {
      return "A valid numeric raid ID is required.";
    }

    if (!authorId) {
      return "Unable to determine which member is leaving.";
    }

    // Check the raid exists and the user is signed up
    const raid = await globalThis.client.prisma.raids.findFirst({
      where: { ID: raidId },
      include: { RaidAttendees: true },
    });

    if (!raid) {
      return `Raid ${raidId} not found.`;
    }

    const isSignedUp = raid.RaidAttendees.some((a: any) => a.MemberId === authorId);
    if (!isSignedUp) {
      return `You are not signed up for "${raid.Title}".`;
    }

    try {
      await globalThis.client.prisma.raidAttendees.delete({
        where: {
          RaidId_MemberId: {
            RaidId: raidId,
            MemberId: authorId,
          },
        },
      });

      // Post a channel update so the raid list reflects the change
      ChannelUpdates.MessageWithRaid(`<@${authorId}> has left the raid: ${raid.Title}`).catch((err) =>
        log.error("Failed to send raid channel update after leaving:", err)
      );

      const remaining = raid.RaidAttendees.length - 1;
      return `Successfully left "${raid.Title}". There are now ${remaining} attendee(s) signed up.`;
    } catch (err: any) {
      // Handle record not found (already left)
      if (err?.code === "P2025") {
        return `You are not signed up for "${raid.Title}".`;
      }
      log.error("Failed to leave raid:", err);
      return "Failed to leave the raid. Please try again or use the raid channel directly.";
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

  private async getEventsString(timezone: string | null): Promise<string> {
    let string = "";
    if (globalThis.client.events) {
      for (let e of globalThis.client.events) {
        let event = globalThis.client.events.get(e[0]);
        string += `Event: ${event.name} - Date: ${this.formatTime(
          new Date(event.scheduledStartTimestamp),
          timezone
        )} - Description: ${event.description} - Link: ${event.url} \n`;
      }
    }
    return string || "No upcoming events found.";
  }

  private async getStoreString(): Promise<string> {
    let rewards = await global.client.prisma.reward.findMany({
      include: {
        RewardItem: { where: { RedeemedBy: "" }, select: { RewardItemID: true } },
      },
      orderBy: { Price: "asc" },
    });
    let string = "";
    rewards.forEach((reward) => {
      if (reward.visible) {
        let stock = reward.RewardItem.length;
        if (stock === 0) string += `Reward: ${reward.Title} - Out of stock \n`;
        else {
          string += `Reward: ${reward.Title} - Price: ${reward.Price} palm trees \n`;
        }
      }
    });
    return string || "Store is currently empty.";
  }

  /** Voting is for signed-up members of a raid that is still in scheduling (same rule as the raid board). */
  private async checkSchedulingAttendee(raidId: number, memberId: string): Promise<string | null> {
    const raid = await globalThis.client.prisma.raids.findUnique({
      where: { ID: raidId },
      include: { RaidAttendees: { where: { MemberId: memberId } } },
    });
    if (!raid) return `Raid ${raidId} not found.`;
    if (raid.Status !== 2) return `"${raid.Title}" is not in scheduling, so there are no times to vote on.`;
    if (raid.RaidAttendees.length === 0) return `Only members signed up for "${raid.Title}" can vote on its times.`;
    return null;
  }

  private async getMyRaidsString(ctx: ToolContext): Promise<string> {
    if (!ctx.authorId) return "Unable to determine which member is asking.";

    const raids = await globalThis.client.prisma.raids.findMany({
      where: { Status: { in: [1, 2, 3] }, RaidAttendees: { some: { MemberId: ctx.authorId } } },
      include: {
        RaidAttendees: true,
        RaidSchedulingOption: { include: { RaidAvailability: true } },
      },
    });

    const now = Date.now();
    const open = raids.filter((r) => r.Status === 1);
    const scheduling = raids.filter((r) => r.Status === 2);
    const scheduled = raids
      .map((r) => ({ raid: r, time: r.RaidSchedulingOption.find((o) => o.IsSelected)?.Timestamp }))
      .filter((r) => r.time && r.time.getTime() > now)
      .sort((a, b) => a.time.getTime() - b.time.getTime());

    if (open.length + scheduling.length + scheduled.length === 0) {
      return "The member is not signed up for any open, scheduling or upcoming raids.";
    }

    let string = "";
    if (scheduled.length > 0) {
      string += "Upcoming scheduled raids:\n";
      scheduled.forEach(({ raid, time }) => {
        string += `  ${raid.Title} (ID ${raid.ID}) — ${this.formatTime(time, ctx.timezone)} — ${raid.RaidAttendees.length} attendees\n`;
      });
    }
    if (scheduling.length > 0) {
      string += "\nRaids in scheduling (voting on times):\n";
      scheduling.forEach((raid) => {
        const voted = raid.RaidSchedulingOption.some((o) => o.RaidAvailability.some((v) => v.MemberId === ctx.authorId));
        string += `  ${raid.Title} (ID ${raid.ID})${voted ? "" : " — THE MEMBER HAS NOT VOTED YET"}\n`;
        [...raid.RaidSchedulingOption]
          .sort((a, b) => (a.Timestamp?.getTime() ?? 0) - (b.Timestamp?.getTime() ?? 0))
          .forEach((opt) => {
            const mine = opt.RaidAvailability.some((v) => v.MemberId === ctx.authorId) ? " [member is available]" : "";
            const time = opt.Timestamp ? this.formatTime(opt.Timestamp, ctx.timezone) : "Unknown time";
            string += `    ${opt.Option ?? "?"} — ${time} — ${opt.RaidAvailability.length}/${raid.RaidAttendees.length} available${mine}\n`;
          });
      });
    }
    if (open.length > 0) {
      string += "\nOpen raids still gathering players:\n";
      open.forEach((raid) => {
        string += `  ${raid.Title} (ID ${raid.ID}) — ${raid.RaidAttendees.length}/${raid.MinPlayers ?? 4} players\n`;
      });
    }
    return string.trim();
  }

  private async setRaidAvailabilityString(rawArgs: string | object, ctx: ToolContext): Promise<string> {
    const args = this.parseArgs(rawArgs);
    if (!args) return "Invalid arguments for setRaidAvailability.";
    const raidId = args.raidId;
    if (typeof raidId !== "number") return "A valid numeric raid ID is required.";
    if (!ctx.authorId) return "Unable to determine which member is voting.";

    const toLetters = (v: any): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim().toUpperCase()).filter(Boolean) : []);
    const available = toLetters(args.available);
    const unavailable = toLetters(args.unavailable);
    if (available.length + unavailable.length === 0) return "Give at least one option letter in available or unavailable.";
    if (available.some((l) => unavailable.includes(l))) return "An option can't be both available and unavailable.";

    const denied = await this.checkSchedulingAttendee(raidId, ctx.authorId);
    if (denied) return denied;

    const options = await globalThis.client.prisma.raidSchedulingOption.findMany({ where: { RaidId: raidId } });
    const byLetter = new Map(options.map((o) => [String(o.Option).toUpperCase(), o]));
    const unknown = [...available, ...unavailable].filter((l) => !byLetter.has(l));
    if (unknown.length > 0) {
      return `Unknown option letter(s): ${unknown.join(", ")}. Valid options are: ${[...byLetter.keys()].sort().join(", ")}.`;
    }

    try {
      for (const letter of available) {
        const optionId = byLetter.get(letter).ID;
        await globalThis.client.prisma.raidAvailability.upsert({
          where: { SchedulingOptionId_MemberId: { SchedulingOptionId: optionId, MemberId: ctx.authorId } },
          create: { SchedulingOptionId: optionId, MemberId: ctx.authorId },
          update: {},
        });
      }
      if (unavailable.length > 0) {
        await globalThis.client.prisma.raidAvailability.deleteMany({
          where: { MemberId: ctx.authorId, SchedulingOptionId: { in: unavailable.map((l) => byLetter.get(l).ID) } },
        });
      }
      await RaidScheduler.recheckRaid(raidId);
    } catch (err) {
      log.error("Failed to set raid availability:", err);
      return "Failed to save the vote. Please try again, or vote in the scheduling DM or on the raid board.";
    }

    let string = "Vote saved.";
    if (available.length) string += ` Available: ${available.join(", ")}.`;
    if (unavailable.length) string += ` Not available: ${unavailable.join(", ")}.`;

    // The vote may have been the one that settled the time.
    const raid = await globalThis.client.prisma.raids.findUnique({
      where: { ID: raidId },
      include: { RaidSchedulingOption: { where: { IsSelected: true } } },
    });
    const selected = raid?.RaidSchedulingOption[0]?.Timestamp;
    if (raid?.Status === 3 && selected) {
      string += ` That completed the vote: "${raid.Title}" is now scheduled for ${this.formatTime(selected, ctx.timezone)} and everyone has been notified.`;
    }
    return string;
  }

  private async suggestRaidTimeString(rawArgs: string | object, ctx: ToolContext): Promise<string> {
    const args = this.parseArgs(rawArgs);
    const raidId = args?.raidId;
    const timestamp = args?.timestamp ? new Date(args.timestamp) : null;
    if (typeof raidId !== "number" || !timestamp || isNaN(timestamp.getTime())) {
      return "Invalid arguments for suggestRaidTime.";
    }

    const denied = await this.checkSchedulingAttendee(raidId, ctx.authorId);
    if (denied) return denied;

    try {
      const option = await RaidScheduler.suggestTime(raidId, ctx.authorId, timestamp);
      return `Suggested ${this.formatTime(timestamp, ctx.timezone)} as option ${option.Option} and marked you available for it. The other attendees have been notified.`;
    } catch (err) {
      if (err instanceof RaidRuleError) return err.message;
      log.error("Failed to suggest raid time:", err);
      return "Failed to suggest that time. Please try again, or use the raid board.";
    }
  }
}
