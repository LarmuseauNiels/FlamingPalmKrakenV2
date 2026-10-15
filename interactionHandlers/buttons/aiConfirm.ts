import { ButtonInteraction } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { AiConversationStore } from "../../components/AiConversationStore";
import { createLogger } from "../../utils/logger";

const log = createLogger("AiConfirmHandler");

/**
 * Confirm/Cancel buttons under a Kraken AI answer (customId aiConfirm_<index>
 * or aiConfirm_cancel). The pending actions live with the conversation row of
 * the message the buttons are on, so they keep working across restarts.
 */
export default class AiConfirmHandler implements IHandler {
  name = "aiConfirm";

  async execute(interaction: ButtonInteraction) {
    const choice = interaction.customId.split("_")[1];
    const conversation = await AiConversationStore.get(interaction.message.id);
    const actions = conversation?.pendingActions ?? [];
    const open = actions.filter((a) => !a.done);

    if (!conversation || open.length === 0) {
      await interaction.update({ components: [] });
      await interaction.followUp({ content: "This request has expired. Ask me again if you still want it.", ephemeral: true });
      return;
    }
    if (open[0].userId !== interaction.user.id) {
      await interaction.reply({ content: `Only <@${open[0].userId}> can confirm this.`, ephemeral: true });
      return;
    }

    if (choice === "cancel") {
      open.forEach((a) => (a.done = true));
      await AiConversationStore.setPendingActions(interaction.message.id, actions);
      await interaction.update({ components: [] });
      await interaction.followUp({ content: "Cancelled — nothing was changed.", ephemeral: true });
      await this.remember(conversation, interaction.message.id, `(I pressed Cancel on: ${open.map((a) => a.label).join(", ")})`, "Okay, cancelled.");
      return;
    }

    const action = actions[parseInt(choice)];
    if (!action || action.done) {
      await interaction.reply({ content: "That has already been handled.", ephemeral: true });
      return;
    }

    // Mark it done and drop its button before running, so a double click can't run it twice.
    action.done = true;
    await AiConversationStore.setPendingActions(interaction.message.id, actions);
    await interaction.update({ components: AiConversationStore.buildConfirmRows(actions) });

    let result: string;
    try {
      result = await global.client.ollamaAI.runConfirmedAction(action);
    } catch (err) {
      log.error(`Confirmed AI action ${action.tool} failed:`, err);
      result = "Sorry, something went wrong doing that. Please try again later.";
    }
    log.info(`User ${interaction.user.id} confirmed ${action.tool}: ${result}`);

    const sent = await interaction.followUp({ content: `✅ **${action.label}**\n${result}`, allowedMentions: { parse: ["users"] } });
    await this.remember(conversation, sent.id, `(I pressed Confirm: ${action.label})`, result);
  }

  /** Adds the button press to the conversation, so a reply to the result can continue it. */
  private async remember(conversation: any, messageId: string, userNote: string, outcome: string) {
    const messages = [...conversation.messages, { role: "user", content: userNote }, { role: "assistant", content: outcome }];
    await AiConversationStore.save([messageId], conversation.channelId, conversation.userId, messages).catch((e) =>
      log.error("Failed to store AI conversation after confirmation:", e)
    );
  }
}
