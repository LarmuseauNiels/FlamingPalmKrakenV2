import {
  ButtonInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { IslanderView } from "../../islander/IslanderView";
import { IslanderModule } from "../../islander/IslanderModule";
import { levelStats, tierNameFor } from "../../islander/data/balance";
import { createLogger } from "../../utils/logger";

const log = createLogger("IslanderButton");

// Routes islander_* button interactions. customId format: islander_<action>_<ownerId>
//   refresh  → re-render the island (anyone)
//   build    → open a select of buildable buildings (owner only)
//   upgrade  → open a select of upgradeable buildings (owner only)
//   rush     → finish the current build for Currency (owner only)
// See docs/ISLANDER_DESIGN.md §7.2.
export default class IslanderButton implements IHandler {
  name = "islander";

  async execute(interaction: ButtonInteraction) {
    const [, action, ownerId] = interaction.customId.split("_");

    try {
      if (action === "refresh") {
        await interaction.deferUpdate();
        const target = await global.client.users.fetch(ownerId).catch(() => null);
        const message = await IslanderView.build(
          ownerId,
          target?.username ?? "Island",
          interaction.user.id === ownerId
        );
        await interaction.editReply(message);
        return;
      }

      // Everything below mutates an island — only its owner may do so.
      if (interaction.user.id !== ownerId) {
        await interaction.reply({
          content: "That's not your island.",
          ephemeral: true,
        });
        return;
      }

      if (action === "build") return this.openBuildSelect(interaction, ownerId);
      if (action === "upgrade") return this.openUpgradeSelect(interaction, ownerId);
      if (action === "rush") {
        const res = await IslanderModule.rush(ownerId);
        if (!res.ok) {
          await interaction.reply({ content: res.message, ephemeral: true });
          return;
        }
        // Rush succeeded — re-render the island message in place.
        await interaction.deferUpdate();
        const target = await global.client.users.fetch(ownerId).catch(() => null);
        const message = await IslanderView.build(
          ownerId,
          target?.username ?? "Island",
          true
        );
        await interaction.editReply(message);
        return;
      }

      await interaction.reply({
        content: "That action isn't available yet.",
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

  private async openBuildSelect(interaction: ButtonInteraction, ownerId: string) {
    const island = await IslanderModule.prepare(ownerId);
    const options = IslanderModule.buildableLines(island).map((line) => {
      const s = levelStats(line, 1);
      return {
        label: line.tierNames[0],
        value: line.key,
        description: `🪵${s.wood} 🪨${s.stone}${s.food ? ` 🍖${s.food}` : ""} · ${s.time}s`,
      };
    });

    if (!options.length) {
      await interaction.reply({
        content: "Nothing new to build right now — raise your Town Center to unlock more.",
        ephemeral: true,
      });
      return;
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`islander_buildpick_${ownerId}`)
      .setPlaceholder("Choose a building to construct")
      .addOptions(options.slice(0, 25));

    await interaction.reply({
      content: "🏗️ **Build a new building:**",
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
      ephemeral: true,
    });
  }

  private async openUpgradeSelect(interaction: ButtonInteraction, ownerId: string) {
    const island = await IslanderModule.prepare(ownerId);
    const options = IslanderModule.upgradeableLines(island).map(({ line, level, next }) => {
      const s = levelStats(line, next);
      return {
        label: `${tierNameFor(line, level)} → Lv ${next}`,
        value: line.key,
        description: `🪵${s.wood} 🪨${s.stone}${s.food ? ` 🍖${s.food}` : ""} · ${s.time}s`,
      };
    });

    if (!options.length) {
      await interaction.reply({
        content: "Nothing can be upgraded right now (max level or Town Center too low).",
        ephemeral: true,
      });
      return;
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`islander_upgradepick_${ownerId}`)
      .setPlaceholder("Choose a building to upgrade")
      .addOptions(options.slice(0, 25));

    await interaction.reply({
      content: "⏫ **Upgrade a building:**",
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
      ephemeral: true,
    });
  }
}
