// Discord embed builders for Islander. See docs/ISLANDER_DESIGN.md §7.2.

import { EmbedBuilder } from "discord.js";
import { lineByKey, tierNameFor, UNITS, ResourceKey, PVP } from "./data/balance";
import { IslandWithDetail, IslanderModule } from "./IslanderModule";

/** Discord relative timestamp helper, e.g. "in 3 hours". */
function rel(d: Date): string {
  return `<t:${Math.floor(d.getTime() / 1000)}:R>`;
}

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
      nextUnlock?: { tc: number; names: string[] } | null;
      army?: {
        counts: Record<string, number>;
        caps: { land: number; naval: number };
        freePop: number;
        attack: number;
        smithing: number;
      };
      isOwner?: boolean;
    }
  ): EmbedBuilder {
    const { cap, popCap, production, tcLevel, currentBuild, nextUnlock, army, isOwner } = opts;

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

    // PvP status: defensive shield (shown to anyone, so an attacker knows it's
    // protected) + the owner's own raid cooldown (F10).
    const now = Date.now();
    const statusLines: string[] = [];
    const shield = island.ShieldUntil ? new Date(island.ShieldUntil) : null;
    if (shield && shield.getTime() > now) {
      statusLines.push(`🛡️ Shielded — raidable again ${rel(shield)}`);
    } else if (tcLevel < PVP.NEW_PLAYER_SHIELD_TC) {
      statusLines.push(
        `🛡️ New-player protection (until Town Center ${PVP.NEW_PLAYER_SHIELD_TC})`
      );
    } else {
      statusLines.push("⚔️ Raidable");
    }
    if (isOwner) {
      const cd = island.RaidCooldown ? new Date(island.RaidCooldown) : null;
      statusLines.push(
        cd && cd.getTime() > now
          ? `⏳ Your raiders are resting — ready ${rel(cd)}`
          : "🚣 Raiders ready to sail"
      );
    }
    embed.addFields({ name: "Status", value: statusLines.join("\n"), inline: true });

    if (island.starvedUnits > 0) {
      embed.addFields({
        name: "⚠️ Famine",
        value: `Your island ran out of Food — **${island.starvedUnits}** unit(s) starved. Build more Farms (and Housing) to feed your army.`,
        inline: false,
      });
    }

    if (nextUnlock) {
      embed.addFields({
        name: `🔒 Unlocks at Town Center ${nextUnlock.tc}`,
        value: nextUnlock.names.join(", "),
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

  /** Top-islands leaderboard, with the viewer's own rank if outside the list. */
  static leaderboard(
    entries: { name: string; score: number; tc: number }[],
    viewer?: { name: string; rank: number; score: number; tc: number; total: number }
  ): EmbedBuilder {
    const medals = ["🥇", "🥈", "🥉"];
    let body = entries.length
      ? entries
          .map(
            (e, i) =>
              `${medals[i] ?? `\`#${i + 1}\``} **${e.name}** — ${e.score} pts (TC ${e.tc})`
          )
          .join("\n")
      : "No islands yet — be the first with `/island`!";

    // Append the viewer's standing when they're not already in the shown slice.
    if (viewer && viewer.rank > entries.length) {
      body +=
        `\n…\n\`#${viewer.rank}\` **${viewer.name}** — ${viewer.score} pts (TC ${viewer.tc})` +
        ` · _you, of ${viewer.total}_`;
    }

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
            "You begin with just a **Campfire** (Town Center Lv 1) and some starting resources. Build a **Woodcutter** and **Farm** first — production buildings make resources accrue over time. Each **Town Center** upgrade unlocks the next buildings (Mine & Warehouse at TC2, Tents & Army at TC3, …), so keep upgrading it. The embed shows what unlocks next.",
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
