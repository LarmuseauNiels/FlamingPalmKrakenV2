import { PendingAction } from "../AiConversationStore";

/** Per-request state the tools need. */
export interface ToolContext {
  authorId: string;
  timezone: string | null;
  pendingActions: PendingAction[];
  /** Where the member is talking to Kraken; absent for Confirm-button runs. */
  channelId?: string;
  isDM?: boolean;
}

/** Runs one tool call. `args` is the model's raw arguments (JSON string or object). */
export type ToolHandler = (args: any, ctx: ToolContext) => Promise<string> | string;
