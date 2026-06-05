import {
  StringSelectMenuInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { IslanderModule } from "../../islander/IslanderModule";
import { unitByKey } from "../../islander/data/balance";
import { createLogger } from "../../utils/logger";

const log = createLogger("IslanderSelect");

// Handles the build/upgrade/train select menus opened by the islander buttons.
// customId: islander_<buildpick|upgradepick|trainpick>_<ownerId>; value = key.
export default class IslanderSelect implements IHandler {
  name = "islander";

  async execute(interaction: StringSelectMenuInteraction) {
    const [, kind, ownerId] = interaction.customId.split("_");
    const choice = interaction.values[0];

    try {
      if (interaction.user.id !== ownerId) {
        await interaction.reply({ content: "That's not your island.", ephemeral: true });
        return;
      }

      if (kind === "trainpick") {
        // Ask for a quantity via a modal.
        const def = unitByKey(choice);
        const modal = new ModalBuilder()
          .setCustomId(`islander_trainqty_${ownerId}_${choice}`)
          .setTitle(`Train ${def?.name ?? "units"}`)
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("qty")
                .setLabel("How many?")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("e.g. 5")
                .setRequired(true)
            )
          );
        await interaction.showModal(modal);
        return;
      }

      const res =
        kind === "buildpick"
          ? await IslanderModule.startBuild(ownerId, choice)
          : await IslanderModule.startUpgrade(ownerId, choice);

      // Replace the ephemeral select with the result; user can Refresh to update.
      await interaction.update({ content: res.message, components: [] });
    } catch (error) {
      log.error(`Failed to handle islander select '${kind}':`, error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction
          .reply({ content: "Something went wrong.", ephemeral: true })
          .catch(() => {});
      }
    }
  }
}
