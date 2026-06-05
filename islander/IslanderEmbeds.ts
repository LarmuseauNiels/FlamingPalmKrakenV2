// Discord embed builders for Islander. See docs/ISLANDER_DESIGN.md §7.2.

import { EmbedBuilder } from "discord.js";
import { lineByKey, tierNameFor, ResourceKey } from "./data/balance";
import { IslandWithDetail, IslanderModule } from "./IslanderModule";

export abstract class IslanderEmbeds {
  static status(
    island: IslandWithDetail,
    ownerName: string,
    opts: {
      cap: number;
      popCap: number;
      production: Record<ResourceKey, number>;
      tcLevel: number;
      currentBuild?: any | null;
    }
  ): EmbedBuilder {
    const { cap, popCap, production, tcLevel, currentBuild } = opts;

    const resLine = (
      label: string,
      value: number,
      perHour: number,
      capped = true
    ) =>
      `${label}: **${value}**${capped ? `/${cap}` : ""}` +
      (perHour ? ` (+${perHour}/h)` : "");

    const buildings = (island.Buildings ?? [])
      .map((b: any) => {
        const line = lineByKey(b.i_Building?.Name);
        return line ? `${tierNameFor(line, b.level)} (Lv ${b.level})` : null;
      })
      .filter(Boolean)
      .sort();

    const embed = new EmbedBuilder()
      .setColor("#FD8612")
      .setTitle(`🏝️ ${ownerName}'s Island`)
      .setDescription(`Town Center level **${tcLevel}**`)
      .addFields(
        {
          name: "Resources",
          value: [
            resLine("🪵 Wood", island.Wood, production.Wood),
            resLine("🪨 Stone", island.Stone, production.Stone),
            resLine("🍖 Food", island.Food, production.Food),
            resLine("🪙 Currency", island.Currency, production.Currency, false),
          ].join("\n"),
          inline: true,
        },
        {
          name: "Population",
          value: `👥 **${island.Population}**/${popCap}`,
          inline: true,
        },
        {
          name: `Buildings (${buildings.length})`,
          value: buildings.length ? buildings.join("\n") : "None yet",
          inline: false,
        }
      );

    if (currentBuild) {
      const line = lineByKey(currentBuild.i_Building?.Name);
      const targetLevel =
        currentBuild.upgrading === 0 ? 1 : currentBuild.upgrading;
      const label = line ? tierNameFor(line, targetLevel) : "Building";
      const ready = Math.floor(
        new Date(currentBuild.upgradeReady).getTime() / 1000
      );
      embed.addFields({
        name: "🏗️ Under construction",
        value: `**${label}** (Lv ${targetLevel}) — ready <t:${ready}:R>`,
        inline: false,
      });
    }

    embed
      .setImage("attachment://island.png")
      .setFooter({
        text: "Islander · FPG kraken bot",
        iconURL: "https://flamingpalm.com/images/FlamingPalmLogoSmall.png",
      })
      .setTimestamp();

    return embed;
  }
}
