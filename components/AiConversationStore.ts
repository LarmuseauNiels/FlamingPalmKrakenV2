import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { createLogger } from "../utils/logger";

const log = createLogger("AiConversationStore");

/** Replying to a Kraken answer continues the conversation for this long. */
const REPLY_CONTEXT_TTL_MS = 24 * 60 * 60 * 1000;
/** In DMs a new message continues the last conversation if it is this recent. */
const DM_CONTEXT_TTL_MS = 30 * 60 * 1000;
/** Keep roughly this many messages of history; older turns are dropped. */
const MAX_HISTORY_MESSAGES = 40;
const PRUNE_INTERVAL_MS = 10 * 60 * 1000;

/**
 * An action the AI wants to take that the member must confirm with a button
 * (createRaid, joinRaid, ...). Stored with the bot message that shows the button.
 */
export interface PendingAction {
  tool: string;
  args: any;
  label: string;
  userId: string;
  done?: boolean;
}

export interface StoredConversation {
  messageId: string;
  channelId: string;
  userId: string;
  messages: any[];
  pendingActions: PendingAction[];
}

/**
 * Persists Kraken AI conversations (without the system prompt, which is rebuilt
 * fresh on every turn) in the AiConversation table, so they survive restarts.
 */
export abstract class AiConversationStore {
  private static lastPrune = 0;

  static async get(messageId: string): Promise<StoredConversation | null> {
    const row = await global.client.prisma.aiConversation.findUnique({ where: { MessageId: messageId } });
    if (!row || Date.now() - row.UpdatedAt.getTime() > REPLY_CONTEXT_TTL_MS) return null;
    return this.fromRow(row);
  }

  /** The latest conversation in a DM channel, if it is recent enough to continue. */
  static async getRecentDm(channelId: string, userId: string): Promise<StoredConversation | null> {
    const row = await global.client.prisma.aiConversation.findFirst({
      where: {
        ChannelId: channelId,
        UserId: userId,
        UpdatedAt: { gt: new Date(Date.now() - DM_CONTEXT_TTL_MS) },
      },
      orderBy: { UpdatedAt: "desc" },
    });
    return row ? this.fromRow(row) : null;
  }

  /**
   * Saves the conversation under every message id the answer was sent as (a
   * long answer is split over several messages, and replying to any of them
   * should continue it). Pending actions belong to the message with the buttons.
   */
  static async save(
    messageIds: string[],
    channelId: string,
    userId: string,
    messages: any[],
    pendingActions: PendingAction[] = [],
    buttonMessageId: string = messageIds[messageIds.length - 1]
  ): Promise<void> {
    const serialized = JSON.stringify(this.trim(messages));
    for (const messageId of messageIds) {
      const pending = messageId === buttonMessageId && pendingActions.length > 0 ? JSON.stringify(pendingActions) : null;
      await global.client.prisma.aiConversation.upsert({
        where: { MessageId: messageId },
        create: { MessageId: messageId, ChannelId: channelId, UserId: userId, Messages: serialized, PendingActions: pending },
        update: { Messages: serialized, PendingActions: pending },
      });
    }
    this.prune();
  }

  static async setPendingActions(messageId: string, pendingActions: PendingAction[]): Promise<void> {
    const open = pendingActions.some((a) => !a.done);
    await global.client.prisma.aiConversation.update({
      where: { MessageId: messageId },
      data: { PendingActions: open ? JSON.stringify(pendingActions) : null },
    });
  }

  /** Confirm button per open action, plus one Cancel button for all of them. */
  static buildConfirmRows(pendingActions: PendingAction[]): ActionRowBuilder<ButtonBuilder>[] {
    const buttons = pendingActions
      .map((action, index) => ({ action, index }))
      .filter(({ action }) => !action.done)
      .map(({ action, index }) =>
        new ButtonBuilder()
          .setCustomId(`aiConfirm_${index}`)
          .setLabel(("✅ " + action.label).slice(0, 80))
          .setStyle(ButtonStyle.Success)
      );
    if (buttons.length === 0) return [];
    buttons.push(new ButtonBuilder().setCustomId("aiConfirm_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary));
    return [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)];
  }

  /**
   * Drops the oldest turns so the history stays bounded. Cuts only at a user
   * message, so an assistant tool call is never separated from its results.
   */
  private static trim(messages: any[]): any[] {
    if (messages.length <= MAX_HISTORY_MESSAGES) return messages;
    for (let i = messages.length - MAX_HISTORY_MESSAGES; i < messages.length; i++) {
      if (messages[i].role === "user") return messages.slice(i);
    }
    return messages.slice(-1);
  }

  private static prune(): void {
    if (Date.now() - this.lastPrune < PRUNE_INTERVAL_MS) return;
    this.lastPrune = Date.now();
    global.client.prisma.aiConversation
      .deleteMany({ where: { UpdatedAt: { lt: new Date(Date.now() - REPLY_CONTEXT_TTL_MS) } } })
      .then((r) => r.count > 0 && log.debug(`Pruned ${r.count} expired AI conversations`))
      .catch((err) => log.error("Failed to prune AI conversations:", err));
  }

  private static fromRow(row: any): StoredConversation {
    let messages: any[] = [];
    let pendingActions: PendingAction[] = [];
    try {
      messages = JSON.parse(row.Messages);
      pendingActions = row.PendingActions ? JSON.parse(row.PendingActions) : [];
    } catch (err) {
      log.error(`Corrupt AI conversation ${row.MessageId}:`, err);
    }
    return { messageId: row.MessageId, channelId: row.ChannelId, userId: row.UserId, messages, pendingActions };
  }
}
