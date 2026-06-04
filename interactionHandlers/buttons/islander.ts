import { ButtonInteraction } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { IslanderView } from "../../islander/IslanderView";
import { createLogger } from "../../utils/logger";

const log = createLogger("IslanderButton");

// Routes islander_* button interactions. customId format:
//   islander_<action>_<arg>
// Phase 0 handles `refresh`; build/upgrade/train/raid buttons are disabled in
// the UI until their phases land. See docs/ISLANDER_DESIGN.md §7.2 / §12.
export default class IslanderButton implements IHandler {
  name = "islander";

  async execute(interaction: ButtonInteraction) {
    const parts = interaction.customId.split("_");
    const action = parts[1];
    const arg = parts[2];

    try {
      if (action === "refresh") {
        await interaction.deferUpdate();
        const target = await global.client.users.fetch(arg).catch(() => null);
        const message = await IslanderView.build(
          arg,
          target?.username ?? "Island"
        );
        await interaction.editReply(message);
        return;
      }

      // Disabled placeholders shouldn't reach here, but guard anyway.
      await interaction.reply({
        content: "That action isn't available yet — coming in a later update.",
        ephemeral: true,
      });
    } catch (error) {
      log.error(`Failed to handle islander button '${action}':`, error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction
          .reply({ content: "Something went wrong.", ephemeral: true })
          .catch(() => {});
      }
    }
  }
}
