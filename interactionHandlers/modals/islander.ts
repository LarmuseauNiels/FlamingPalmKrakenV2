import { ModalSubmitInteraction } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { IslanderModule } from "../../islander/IslanderModule";
import { createLogger } from "../../utils/logger";

const log = createLogger("IslanderModal");

// Handles the training-quantity modal opened from the train select menu.
// customId: islander_trainqty_<ownerId>_<unitKey>
export default class IslanderModal implements IHandler {
  name = "islander";

  async execute(interaction: ModalSubmitInteraction) {
    const [, kind, ownerId, unitKey] = interaction.customId.split("_");

    try {
      if (kind !== "trainqty" && kind !== "exchangeqty") return;
      if (interaction.user.id !== ownerId) {
        await interaction.reply({ content: "That's not your island.", ephemeral: true });
        return;
      }

      const raw = interaction.fields.getTextInputValue("qty").trim();
      const qty = parseInt(raw, 10);
      if (!Number.isFinite(qty) || qty < 1) {
        await interaction.reply({ content: "Please enter a whole number of 1 or more.", ephemeral: true });
        return;
      }

      const res =
        kind === "exchangeqty"
          ? await IslanderModule.exchangePoints(ownerId, qty)
          : await IslanderModule.trainUnit(ownerId, unitKey, qty);
      await interaction.reply({ content: res.message, ephemeral: true });
    } catch (error) {
      log.error("Failed to handle islander train modal:", error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction
          .reply({ content: "Something went wrong.", ephemeral: true })
          .catch(() => {});
      }
    }
  }
}
