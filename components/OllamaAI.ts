import OpenAI from "openai";
import moment from "moment-timezone";
import { createLogger } from "../utils/logger";
import { PendingAction } from "./AiConversationStore";
import { ToolContext } from "./ai/types";
import { SYSTEM_PROMPT, TOOL_DEFINITIONS } from "./ai/toolDefinitions";
import { TOOL_HANDLERS } from "./ai/toolRegistry";
import { CONFIRMED_TOOLS, requestConfirmation } from "./ai/confirmation";
import { getMemberTimezone } from "./ai/toolHelpers";

const log = createLogger("OllamaAI");

/**
 * Per-request timeout. The SDK default is 10 minutes, far past the point where
 * a member waiting on "Kraken is typing…" has given up.
 */
const OLLAMA_REQUEST_TIMEOUT_MS = 60_000;
/**
 * Most tool calls the model may make in one round. Each runs a DB query or an
 * API call, so a model looping on calls must not fan out without limit.
 */
const MAX_TOOL_CALLS_PER_ROUND = 8;

/** Who is asking and what conversation they are continuing. */
export interface AskContext {
  authorId: string;
  authorName: string;
  isDM: boolean;
  /** Channel the message was sent in (DM or server channel). */
  channelId?: string;
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

export class OllamaAI {
  private openai: OpenAI;
  private readonly model = process.env.OLLAMA_MODEL || "gemma4:cloud";

  constructor() {
    this.openai = new OpenAI({
      baseURL: process.env.OLLAMA_BASE_URL || "https://ollama.com/v1",
      apiKey: process.env.OLLAMA_AI_KEY || "",
      timeout: OLLAMA_REQUEST_TIMEOUT_MS,
      // ask() and parseDate() run their own backoff; SDK retries on top of
      // those multiplied the attempts (and the wait) up to 3x.
      maxRetries: 0,
    });
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

  /**
   * Answers a member's message. `ctx.history` is the stored conversation being
   * continued (without system prompt). The returned `messages` are what to store
   * for the next turn; `pendingActions` need a Confirm button under the reply.
   */
  public async ask(question: string, ctx: AskContext): Promise<AskResult> {
    const timezone = await getMemberTimezone(ctx.authorId);
    const history = ctx.history ?? [];
    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: this.buildContextPrompt(ctx, timezone) },
      ...history,
      { role: "user", content: question },
    ];
    // Everything after the two system messages is the conversation to store.
    const conversation = () => messages.slice(2);
    const toolCtx: ToolContext = {
      authorId: ctx.authorId,
      timezone,
      pendingActions: [],
      channelId: ctx.channelId,
      isDM: ctx.isDM,
    };

    let retries = 0;
    const maxRetries = 1;
    const maxToolRounds = 5;

    for (let round = 0; round <= maxToolRounds; round++) {
      try {
        log.debug(`Sending question to Ollama (round ${round}): ${question}`);

        let result = await this.openai.chat.completions.create({
          model: this.model,
          messages: messages,
          tools: TOOL_DEFINITIONS,
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

        for (const [index, call] of responseMessage.tool_calls.entries()) {
          if (index >= MAX_TOOL_CALLS_PER_ROUND) {
            // Every tool_call_id still needs a reply or the next request is invalid.
            messages.push({
              tool_call_id: call.id,
              role: "tool",
              name: call.type === "function" ? call.function.name : "unknown",
              content: `Skipped: at most ${MAX_TOOL_CALLS_PER_ROUND} tool calls per step.`,
            });
            continue;
          }
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
    if (CONFIRMED_TOOLS.has(call.name)) {
      return await requestConfirmation(call.name, call.arguments, ctx);
    }
    return await this.runTool(call.name, call.arguments, ctx);
  }

  /** Runs an action the member confirmed with its button. Returns a message for the member. */
  public async runConfirmedAction(action: PendingAction): Promise<string> {
    const timezone = await getMemberTimezone(action.userId);
    return await this.runTool(action.tool, action.args, { authorId: action.userId, timezone, pendingActions: [] });
  }

  private async runTool(name: string, args: any, ctx: ToolContext): Promise<string> {
    const handler = TOOL_HANDLERS[name];
    if (!handler) {
      log.warn(`Model called unknown tool "${name}"`);
      return "Tool not found.";
    }
    return await handler(args, ctx);
  }
}
