// Discord embed builders for Islander. See docs/ISLANDER_DESIGN.md §7.2.

import { EmbedBuilder } from "discord.js";
import { lineByKey, tierNameFor, UNITS, ResourceKey } from "./data/balance";
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
      army?: {
        counts: Record<string, number>;
        caps: { land: number; naval: number };
        freePop: number;
        attack: number;
        smithing: number;
      };
    }
  ): EmbedBuilder {
    const { cap, popCap, production, tcLevel, currentBuild, army } = opts;

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

    if (army) {
      const roster = UNITS.filter((u) => (army.counts[u.key] ?? 0) > 0)
        .map((u) => `${u.name} ×${army.counts[u.key]}`)
        .join("\n");
      const bonus = army.smithing ? ` · ⚔️+${Math.round(army.smithing * 100)}%` : "";
      embed.addFields({
        name: "Army",
        value:
          (roster || "No units yet") +
          `\nFree pop: **${army.freePop}** · Atk: **${army.attack}**${bonus}` +
          `\nCaps — 🪖 ${army.caps.land} land · ⛵ ${army.caps.naval} naval`,
        inline: false,
      });
    }

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

  /** Post-battle report shown after a raid resolves. */
  static battleReport(report: {
    attackerName: string;
    defenderName: string;
    win: boolean;
    attackerLosses: Record<string, number>;
    defenderLosses: Record<string, number>;
    loot: Record<string, number>;
    wallDamage: number;
  }): EmbedBuilder {
    const fmtLosses = (l: Record<string, number>) => {
      const e = Object.entries(l).filter(([, n]) => n > 0);
      return e.length ? e.map(([n, c]) => `${n} ×${c}`).join(", ") : "none";
    };
    const lootLine = (["Wood", "Stone", "Food", "Currency"] as const)
      .filter((r) => report.loot[r] > 0)
      .map((r) => `${{ Wood: "🪵", Stone: "🪨", Food: "🍖", Currency: "🪙" }[r]} ${report.loot[r]}`)
      .join("  ");

    return new EmbedBuilder()
      .setColor(report.win ? "#3ba55d" : "#ed4245")
      .setTitle(report.win ? "⚔️ Raid successful!" : "🛡️ Raid repelled!")
      .setDescription(
        `**${report.attackerName}** raided **${report.defenderName}**.`
      )
      .addFields(
        {
          name: report.win ? "💰 Plunder" : "💰 Plunder",
          value: report.win ? lootLine || "Nothing could be carried off." : "The defenders held — no loot.",
          inline: false,
        },
        { name: `${report.attackerName} lost`, value: fmtLosses(report.attackerLosses), inline: true },
        { name: `${report.defenderName} lost`, value: fmtLosses(report.defenderLosses), inline: true },
        { name: "🧱 Wall damage", value: `${report.wallDamage}`, inline: true }
      )
      .setFooter({ text: "Islander · FPG kraken bot" })
      .setTimestamp();
  }

  /** Top-islands leaderboard. */
  static leaderboard(
    entries: { name: string; score: number; tc: number }[]
  ): EmbedBuilder {
    const medals = ["🥇", "🥈", "🥉"];
    const body = entries.length
      ? entries
          .map(
            (e, i) =>
              `${medals[i] ?? `\`#${i + 1}\``} **${e.name}** — ${e.score} pts (TC ${e.tc})`
          )
          .join("\n")
      : "No islands yet — be the first with `/island`!";
    return new EmbedBuilder()
      .setColor("#FD8612")
      .setTitle("🏆 Islander Leaderboard")
      .setDescription(body)
      .setFooter({ text: "Power = 10·TC + 3·Σ building levels + army/10" })
      .setTimestamp();
  }

  /** How-to-play tutorial. */
  static help(): EmbedBuilder {
    return new EmbedBuilder()
      .setColor("#FD8612")
      .setTitle("🏝️ How to play Islander")
      .setDescription(
        "Build an island, gather resources, raise an army, and raid your rivals!"
      )
      .addFields(
        {
          name: "Getting started",
          value:
            "`/island` opens your island. Resources (🪵🪨🍖🪙) accrue over time up to your storage cap — check back regularly. Your **Town Center** level gates everything else, so upgrade it first.",
        },
        {
          name: "Build & upgrade",
          value:
            "Use the **Build** and **Upgrade** buttons. Only one build runs at a time; **Rush ⚡** finishes it instantly for 🪙. Warehouses raise storage, Housing grows population, Farms feed it.",
        },
        {
          name: "Army",
          value:
            "Build an Army Camp (and a Dock for ships), then **Train 🪖**. Units occupy population and eat Food. Smithing boosts attack; you need a ship to raid.",
        },
        {
          name: "Raiding",
          value:
            "Open someone else's island (`/island @member`) and press **Raid ⚔️** (or **Scout 🔭** first). Win to steal resources; the Castle/Keep **vault** and **walls** protect you on defense — **Repair 🧱** them after a hit.",
        },
        {
          name: "Protection",
          value:
            "New islands (TC < 5) are safe, you get an 8h shield after being raided, and you can only be matched against islands within ±5 Town Center levels.",
        }
      )
      .setFooter({ text: "Islander · FPG kraken bot" });
  }

  /** Intel report shown after scouting a target. */
  static scout(intel: {
    name: string;
    tcLevel: number;
    estArmy: number;
    estAttack: number;
    wallHP: number;
    towerLevel: number;
  }): EmbedBuilder {
    return new EmbedBuilder()
      .setColor("#5865f2")
      .setTitle(`🔭 Scouting report — ${intel.name}`)
      .setDescription("Estimates only — actual strength may vary.")
      .addFields(
        { name: "Town Center", value: `Lv ${intel.tcLevel}`, inline: true },
        { name: "Army (est.)", value: `~${intel.estArmy} units · atk ~${intel.estAttack}`, inline: true },
        { name: "Defenses", value: `🧱 ${intel.wallHP} wall HP · 🗼 towers Lv ${intel.towerLevel}`, inline: false }
      )
      .setFooter({ text: "Islander · FPG kraken bot" })
      .setTimestamp();
  }
}
