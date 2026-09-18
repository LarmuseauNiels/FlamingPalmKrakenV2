import { ButtonInteraction } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { createLogger } from "../../utils/logger";

const log = createLogger("OpenStore");

/**
 * Launches the storefront Activity from a button (interaction response type 12,
 * LAUNCH_ACTIVITY). This is the contextual launch path — the other one is the
 * entry point command registered in deploy-commands.ts, which Discord handles
 * without ever calling the bot.
 */
export default class OpenStore implements IHandler {
  name = "openStore";

  async execute(interaction: ButtonInteraction) {
    try {
      await interaction.launchActivity();
    } catch (error) {
      log.error("Failed to launch the store activity:", error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction
          .reply({
            content:
              "Couldn't open the store here — use the website link instead.",
            ephemeral: true,
          })
          .catch((err) => log.error("Failed to reply after launch failure:", err));
      }
    }
  }
}
