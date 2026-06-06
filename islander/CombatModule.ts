// PvP raiding resolution for Islander. See docs/ISLANDER_DESIGN.md §6 and
// ISLANDER_BALANCE.md §9. Combat is instant and deterministic-with-jitter; the
// result is persisted (casualties, loot, wall damage, shields, cooldowns) and
// recorded in the i_Raid log.

import {
  UNITS,
  PVP,
  unitByName,
  towerKillPct,
  vaultPct,
  vaultFloor,
  navalCooldownReduction,
  ResourceKey,
} from "./data/balance";
import { IslanderModule, IslandWithDetail } from "./IslanderModule";
import { createLogger } from "../utils/logger";

const log = createLogger("CombatModule");

const RESOURCES: ResourceKey[] = ["Currency", "Wood", "Stone", "Food"];

export interface RaidResult {
  ok: boolean;
  message: string;
  // present on a resolved raid (ok === true)
  report?: {
    attackerName: string;
    defenderName: string;
    win: boolean;
    attackerLosses: Record<string, number>;
    defenderLosses: Record<string, number>;
    loot: Record<string, number>;
    wallDamage: number;
  };
}

export interface ScoutResult {
  ok: boolean;
  message: string;
  intel?: {
    name: string;
    tcLevel: number;
    estArmy: number; // estimated total units
    estAttack: number;
    wallHP: number;
    towerLevel: number;
  };
}

export abstract class CombatModule {
  /** Pay Currency to estimate a target's defenses. */
  static async scout(
    attackerId: string,
    defenderId: string,
    attackerName: string,
    defenderName: string
  ): Promise<ScoutResult> {
    if (attackerId === defenderId)
      return { ok: false, message: "You can't scout your own island." };

    const attacker = await IslanderModule.prepare(attackerId);
    if (attacker.Currency < PVP.SCOUT_COST)
      return { ok: false, message: `Scouting costs ${PVP.SCOUT_COST} 🪙 — you have ${attacker.Currency}.` };

    const defender = await IslanderModule.prepare(defenderId);
    await global.client.prisma.i_Island.update({
      where: { ID: attackerId },
      data: { Currency: attacker.Currency - PVP.SCOUT_COST },
    });

    const counts = IslanderModule.unitCounts(defender);
    const estArmy = Object.values(counts).reduce((a, b) => a + b, 0);
    // Add a little fuzz so intel is an estimate, not exact.
    const fuzz = (n: number) => Math.round(n * (0.85 + Math.random() * 0.3));

    return {
      ok: true,
      message: `Scouted ${defenderName} for ${PVP.SCOUT_COST} 🪙.`,
      intel: {
        name: defenderName,
        tcLevel: IslanderModule.townCenterLevel(defender),
        estArmy: fuzz(estArmy),
        estAttack: fuzz(IslanderModule.armyAttack(defender)),
        wallHP: IslanderModule.wallHPCurrent(defender),
        towerLevel: IslanderModule.lineLevel(defender, "towers"),
      },
    };
  }

  /** Resolve a raid by attacker against defender. */
  static async resolveRaid(
    attackerId: string,
    defenderId: string,
    attackerName: string,
    defenderName: string
  ): Promise<RaidResult> {
    if (attackerId === defenderId)
      return { ok: false, message: "You can't raid your own island." };

    const prisma = global.client.prisma;
    const attacker = await IslanderModule.prepare(attackerId);
    const defender = await IslanderModule.prepare(defenderId);

    // ── Validations (§6.1, ISLANDER_BALANCE.md §9) ──
    const now = Date.now();
    if (attacker.RaidCooldown && new Date(attacker.RaidCooldown).getTime() > now)
      return { ok: false, message: `Your raiders are still resting — ready ${IslanderModule.discordTime(new Date(attacker.RaidCooldown))}.` };

    if (IslanderModule.lineLevel(attacker, "naval") < 1)
      return { ok: false, message: "You need a Dock (Naval) and at least one ship to launch a raid." };

    const attackerCounts = IslanderModule.unitCounts(attacker);
    const attackerArmy = Object.values(attackerCounts).reduce((a, b) => a + b, 0);
    const hasShip = UNITS.some((u) => u.type === 1 && (attackerCounts[u.key] ?? 0) > 0);
    if (attackerArmy === 0) return { ok: false, message: "You have no units to raid with — train an army first." };
    if (!hasShip) return { ok: false, message: "You need at least one ship (Longboat/Galley) to reach another island." };

    const attackerTC = IslanderModule.townCenterLevel(attacker);
    const defenderTC = IslanderModule.townCenterLevel(defender);
    if (defenderTC < PVP.NEW_PLAYER_SHIELD_TC)
      return { ok: false, message: `${defenderName} is under new-player protection (Town Center below ${PVP.NEW_PLAYER_SHIELD_TC}).` };
    if (defender.ShieldUntil && new Date(defender.ShieldUntil).getTime() > now)
      return { ok: false, message: `${defenderName} is shielded — raidable again ${IslanderModule.discordTime(new Date(defender.ShieldUntil))}.` };
    if (Math.abs(attackerTC - defenderTC) > PVP.MATCHMAKING_BAND)
      return { ok: false, message: `Target is out of range — Town Center must be within ±${PVP.MATCHMAKING_BAND} of yours (you ${attackerTC}, them ${defenderTC}).` };

    const recent = await prisma.i_Raid.findFirst({
      where: {
        AttackerID: attackerId,
        DefenderID: defenderId,
        TimeStamp: { gt: new Date(now - PVP.REPEAT_TARGET_HOURS * 3_600_000) },
      },
    });
    if (recent)
      return { ok: false, message: `You've raided ${defenderName} recently — wait ${PVP.REPEAT_TARGET_HOURS}h between raids on the same island.` };

    // ── Combat resolution (ISLANDER_BALANCE.md §9) ──
    const atkSmith = 1 + IslanderModule.smithingBonus(attacker);
    const defSmith = 1 + IslanderModule.smithingBonus(defender);
    const killPct = towerKillPct(IslanderModule.lineLevel(defender, "towers"));
    const wallHP = IslanderModule.wallHPCurrent(defender);

    // Towers thin the attacking force before the clash.
    let atkPower = 0;
    for (const u of UNITS) {
      const survivors = (attackerCounts[u.key] ?? 0) * (1 - killPct);
      atkPower += survivors * u.attack;
    }
    atkPower *= atkSmith;

    const defenderCounts = IslanderModule.unitCounts(defender);
    let defPower = 0;
    for (const u of UNITS) {
      const c = defenderCounts[u.key] ?? 0;
      defPower += c * (u.attack + 0.5 * u.hp);
    }
    defPower = defPower * defSmith + wallHP;

    let ratio = atkPower / (atkPower + defPower || 1);
    ratio *= 1 + (Math.random() * 2 - 1) * PVP.JITTER; // ±10% jitter
    ratio = Math.max(0, Math.min(1, ratio));
    const win = ratio > 0.5;

    // Closer fights are bloodier; the loser takes the heavier toll.
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const attackerLossFrac = Math.max(killPct, clamp(0.15 + (1 - ratio) * 0.7, 0.1, 0.9));
    const defenderLossFrac = clamp(0.1 + ratio * 0.7, 0.05, 0.85);

    const attackerLosses = await this.applyCasualties(attacker, attackerLossFrac);
    const defenderLosses = await this.applyCasualties(defender, defenderLossFrac);

    // Surviving attacker carry capacity.
    let lootCapacity = 0;
    for (const u of UNITS) {
      const survivors = Math.max(0, (attackerCounts[u.key] ?? 0) - (attackerLosses[u.name] ?? 0));
      lootCapacity += survivors * u.loot;
    }

    // Loot (only on a win), bounded by per-resource cap and total carry capacity.
    const loot: Record<string, number> = { Wood: 0, Stone: 0, Food: 0, Currency: 0 };
    const vPct = vaultPct(IslanderModule.lineLevel(defender, "keep"));
    const vFloor = vaultFloor(IslanderModule.lineLevel(defender, "keep"));
    if (win) {
      let capacity = lootCapacity;
      for (const res of RESOURCES) {
        if (capacity <= 0) break;
        const have = defender[res] as number;
        const protectedAmt = Math.min(have, Math.max(vFloor, Math.floor(have * vPct)));
        const unprotected = Math.max(0, have - protectedAmt);
        const take = Math.min(Math.floor(unprotected * PVP.LOOT_PERCENT), capacity);
        if (take > 0) {
          loot[res] = take;
          capacity -= take;
        }
      }
    }

    // Walls take damage from the assault.
    const wallDamage = Math.min(wallHP, Math.round(atkPower * 0.4));

    // ── Persist ──
    const attackerCap = IslanderModule.storageCap(attacker);
    await prisma.i_Island.update({
      where: { ID: attackerId },
      data: {
        Wood: Math.min(attackerCap, attacker.Wood + loot.Wood),
        Stone: Math.min(attackerCap, attacker.Stone + loot.Stone),
        Food: Math.min(attackerCap, attacker.Food + loot.Food),
        // Currency is uncapped (F4) — looted coin always lands in full.
        Currency: attacker.Currency + loot.Currency,
        RaidCooldown: new Date(
          now +
            PVP.RAID_COOLDOWN_HOURS *
              3_600_000 *
              (1 - navalCooldownReduction(IslanderModule.lineLevel(attacker, "naval")))
        ),
      },
    });

    await prisma.i_Island.update({
      where: { ID: defenderId },
      data: {
        Wood: defender.Wood - loot.Wood,
        Stone: defender.Stone - loot.Stone,
        Food: defender.Food - loot.Food,
        Currency: defender.Currency - loot.Currency,
        // Post-raid shield only when the defender was actually beaten.
        ShieldUntil: win
          ? new Date(now + PVP.POST_RAID_SHIELD_HOURS * 3_600_000)
          : defender.ShieldUntil,
      },
    });

    if (wallDamage > 0) {
      const wallsRow = IslanderModule.wallsRow(defender);
      if (wallsRow) {
        await prisma.i_Building_Island.update({
          where: { BuildingID_IslandID: { BuildingID: wallsRow.BuildingID, IslandID: defenderId } },
          data: { wallHP: Math.max(0, wallHP - wallDamage) },
        });
      }
    }

    await prisma.i_Raid.create({
      data: {
        AttackerID: attackerId,
        DefenderID: defenderId,
        AttackerWon: win,
        LootWood: loot.Wood,
        LootStone: loot.Stone,
        LootFood: loot.Food,
        LootCurrency: loot.Currency,
        Report: JSON.stringify({ attackerLosses, defenderLosses, wallDamage, ratio: Number(ratio.toFixed(3)) }),
      },
    });

    log.info(`Raid ${attackerId} -> ${defenderId}: ${win ? "WIN" : "LOSS"}`);

    // Community-economy milestone hook (no-op unless ISLANDER_AWARD_POINTS).
    if (win) IslanderModule.checkRaidMilestones(attackerId).catch(() => {});

    // Notify the defender (respects their NotifyLevel opt-in).
    const lootTotal = loot.Wood + loot.Stone + loot.Food + loot.Currency;
    IslanderModule.notify(defenderId, {
      content: win
        ? `⚔️ Your island was **raided** by **${attackerName}** — they made off with loot (${lootTotal} resources) and damaged your walls. Open \`/island\` and \`Repair\`.`
        : `🛡️ Your island was attacked by **${attackerName}**, but your defenders **held**! Open \`/island\` to check on your forces.`,
    }).catch(() => {});

    return {
      ok: true,
      message: win ? "Raid successful!" : "Raid repelled!",
      report: { attackerName, defenderName, win, attackerLosses, defenderLosses, loot, wallDamage },
    };
  }

  /**
   * Apply a casualty fraction to an island's units, updating/deleting rows.
   * Returns killed counts keyed by unit display name. Population isn't reduced —
   * the survivors' lost comrades free up population for re-training.
   */
  private static async applyCasualties(
    island: IslandWithDetail,
    frac: number
  ): Promise<Record<string, number>> {
    const losses: Record<string, number> = {};
    for (const row of island.Units ?? []) {
      const name = row.i_Unit?.Name;
      // Round (not floor) so small stacks can still take losses — a 1–6 unit
      // garrison was previously unkillable (ISLANDER_IMPROVEMENTS.md F6).
      const killed = Math.min(row.count, Math.round(row.count * frac));
      if (killed <= 0) continue;
      const remaining = row.count - killed;
      losses[name] = killed;
      if (remaining > 0) {
        await global.client.prisma.i_Unit_Island.update({
          where: { IslandID_UnitID: { IslandID: island.ID, UnitID: row.UnitID } },
          data: { count: remaining },
        });
      } else {
        await global.client.prisma.i_Unit_Island.delete({
          where: { IslandID_UnitID: { IslandID: island.ID, UnitID: row.UnitID } },
        });
      }
      row.count = remaining;
    }
    return losses;
  }
}
