import {
  ButtonInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { IslanderView } from "../../islander/IslanderView";
import { IslanderModule } from "../../islander/IslanderModule";
import { CombatModule } from "../../islander/CombatModule";
import { IslanderEmbeds } from "../../islander/IslanderEmbeds";
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

      // Raid / scout act AGAINST ownerId (the target), so the attacker is the
      // clicker — these must run before the owner check below.
      if (action === "raid") return this.doRaid(interaction, ownerId);
      if (action === "scout") return this.doScout(interaction, ownerId);

      // Everything below mutates the clicker's OWN island.
      if (interaction.user.id !== ownerId) {
        await interaction.reply({
          content: "That's not your island.",
          ephemeral: true,
        });
        return;
      }

      if (action === "build") return this.openBuildSelect(interaction, ownerId);
      if (action === "upgrade") return this.openUpgradeSelect(interaction, ownerId);
      if (action === "train") return this.openTrainSelect(interaction, ownerId);
      if (action === "repair") {
        const res = await IslanderModule.repairWalls(ownerId);
        if (!res.ok) {
          await interaction.reply({ content: res.message, ephemeral: true });
          return;
        }
        await interaction.deferUpdate();
        const target = await global.client.users.fetch(ownerId).catch(() => null);
        await interaction.editReply(
          await IslanderView.build(ownerId, target?.username ?? "Island", true)
        );
        return;
      }
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

  private async openTrainSelect(interaction: ButtonInteraction, ownerId: string) {
    const island = await IslanderModule.prepare(ownerId);
    const caps = IslanderModule.unitCaps(island);
    const free = IslanderModule.freePopulation(island);
    const options = IslanderModule.trainableUnits(island).map((u) => ({
      label: `${u.name} (${u.type === 1 ? "naval" : "land"})`,
      value: u.key,
      description: `🪵${u.wood}${u.food ? ` 🍖${u.food}` : ""}${u.currency ? ` 🪙${u.currency}` : ""} · ${u.pop} pop · atk ${u.attack}`,
    }));

    if (!options.length) {
      await interaction.reply({
        content: "No units available yet — build an Army Camp (or a Dock for ships) first.",
        ephemeral: true,
      });
      return;
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`islander_trainpick_${ownerId}`)
      .setPlaceholder("Choose a unit to train")
      .addOptions(options.slice(0, 25));

    await interaction.reply({
      content: `🪖 **Train units** — free population: ${free} · caps: 🪖${caps.land} land / ⛵${caps.naval} naval`,
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
      ephemeral: true,
    });
  }

  private async doRaid(interaction: ButtonInteraction, defenderId: string) {
    await interaction.deferReply(); // public battle report
    const [attacker, defender] = await Promise.all([
      global.client.users.fetch(interaction.user.id).catch(() => null),
      global.client.users.fetch(defenderId).catch(() => null),
    ]);
    const res = await CombatModule.resolveRaid(
      interaction.user.id,
      defenderId,
      attacker?.username ?? "Raider",
      defender?.username ?? "Island"
    );
    if (!res.ok || !res.report) {
      await interaction.editReply({ content: res.message });
      return;
    }
    await interaction.editReply({ embeds: [IslanderEmbeds.battleReport(res.report)] });
  }

  private async doScout(interaction: ButtonInteraction, defenderId: string) {
    const [attacker, defender] = await Promise.all([
      global.client.users.fetch(interaction.user.id).catch(() => null),
      global.client.users.fetch(defenderId).catch(() => null),
    ]);
    const res = await CombatModule.scout(
      interaction.user.id,
      defenderId,
      attacker?.username ?? "Scout",
      defender?.username ?? "Island"
    );
    if (!res.ok || !res.intel) {
      await interaction.reply({ content: res.message, ephemeral: true });
      return;
    }
    await interaction.reply({ embeds: [IslanderEmbeds.scout(res.intel)], ephemeral: true });
  }
}
