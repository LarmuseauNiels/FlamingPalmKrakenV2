// Islander core logic: island lifecycle + lazy resource accrual.
//
// Resources are accrued lazily — there is no per-tick cron. On every read we
// compute what was produced since `LastTick`, clamp to storage, and persist.
// See docs/ISLANDER_DESIGN.md §3.2 / §9.1.

import {
  CONSTANTS,
  BUILDING_LINES,
  UNITS,
  PVP,
  lineByKey,
  levelStats,
  tcRequirement,
  tierNameFor,
  unitByKey,
  unitByName,
  BuildingLine,
  UnitDef,
  ResourceKey,
} from "./data/balance";
import { IslanderSeed } from "./IslanderSeed";
import { createLogger } from "../utils/logger";

const log = createLogger("IslanderModule");

// Island with the relations the module needs. Loosely typed (strict: false).
export type IslandWithDetail = any;

export abstract class IslanderModule {
  // line key -> i_Building.ID, populated by ensureDefinitions().
  private static buildingIdByKey: Map<string, number> | null = null;

  /** Ensure definition tables are seeded and the id cache is warm. */
  static async ensureDefinitions(): Promise<Map<string, number>> {
    if (this.buildingIdByKey) return this.buildingIdByKey;
    const prisma = global.client.prisma;

    const count = await prisma.i_Building.count();
    if (count === 0) {
      log.info("No Islander definitions found — seeding from balance data");
      await IslanderSeed.upsertAll();
    }

    const buildings = await prisma.i_Building.findMany();
    const map = new Map<string, number>();
    for (const b of buildings) if (b.Name) map.set(b.Name, b.ID);
    this.buildingIdByKey = map;
    return map;
  }

  /** Force a re-seed and cache refresh (admin /island-reload). */
  static async reload(): Promise<void> {
    await IslanderSeed.upsertAll();
    this.buildingIdByKey = null;
    await this.ensureDefinitions();
  }

  /** Fetch the island (with buildings + units), creating it if needed. */
  static async getOrCreateIsland(userId: string): Promise<IslandWithDetail> {
    const prisma = global.client.prisma;
    const ids = await this.ensureDefinitions();

    let island = await this.fetch(userId);
    if (island) return island;

    // Ensure a Members row exists (FK target) without clobbering existing data.
    await prisma.members.upsert({
      where: { ID: userId },
      update: {},
      create: { ID: userId, DisplayName: global.client.idToName(userId) ?? userId },
    });

    await prisma.i_Island.create({
      data: {
        ID: userId,
        Wood: CONSTANTS.START.Wood,
        Stone: CONSTANTS.START.Stone,
        Food: CONSTANTS.START.Food,
        Currency: CONSTANTS.START.Currency,
        Population: CONSTANTS.START.Population,
        LastTick: new Date(),
      },
    });

    // Place the starter buildings at level 1.
    for (const key of CONSTANTS.STARTER_BUILDINGS) {
      const buildingId = ids.get(key);
      if (!buildingId) continue;
      const line = lineByKey(key);
      const wallHP = line?.func === "defend" ? levelStats(line, 1).attr : 0;
      await prisma.i_Building_Island.create({
        data: { BuildingID: buildingId, IslandID: userId, level: 1, wallHP },
      });
    }

    log.info(`Created new island for ${userId}`);
    return this.fetch(userId);
  }

  /** Read an island with its buildings + units, or null if none. */
  static async fetch(userId: string): Promise<IslandWithDetail> {
    return global.client.prisma.i_Island.findUnique({
      where: { ID: userId },
      include: {
        Buildings: { include: { i_Building: true } },
        Units: { include: { i_Unit: true } },
      },
    });
  }

  // ── Build state ───────────────────────────────────────────────────────────

  /**
   * The level a building currently provides effects at. A building under
   * construction of its first level (upgrading === 0) provides nothing until it
   * finishes; an in-progress *upgrade* keeps working at its current level.
   */
  static effectiveLevel(b: any): number {
    if (this.isConstructing(b)) return b.upgrading === 0 ? 0 : b.level;
    return b.level;
  }

  /** Is this building row mid-build (initial or upgrade) and not yet ready? */
  static isConstructing(b: any): boolean {
    return (
      b.upgrading !== null &&
      b.upgrading !== undefined &&
      b.upgradeReady != null &&
      Date.now() < new Date(b.upgradeReady).getTime()
    );
  }

  /** The single building currently under construction, or null. */
  static currentBuild(island: IslandWithDetail): any | null {
    return (island.Buildings ?? []).find((b: any) => this.isConstructing(b)) ?? null;
  }

  /**
   * Persist any builds whose timer has elapsed (initial build → level 1 active,
   * upgrade → target level). Runs before production so finished builds count.
   */
  static async finalizeBuilds(island: IslandWithDetail): Promise<IslandWithDetail> {
    const now = Date.now();
    for (const b of island.Buildings ?? []) {
      const ready = b.upgradeReady ? new Date(b.upgradeReady).getTime() : 0;
      if (b.upgrading == null || !ready || now < ready) continue;

      const newLevel = b.upgrading === 0 ? b.level : b.upgrading;
      const line = lineByKey(b.i_Building?.Name);
      const wallHP =
        line?.func === "defend" ? levelStats(line, newLevel).attr : b.wallHP;

      await global.client.prisma.i_Building_Island.update({
        where: { BuildingID_IslandID: { BuildingID: b.BuildingID, IslandID: island.ID } },
        data: { level: newLevel, upgrading: null, upgradeReady: null, wallHP },
      });
      b.level = newLevel;
      b.upgrading = null;
      b.upgradeReady = null;
      b.wallHP = wallHP;
    }
    return island;
  }

  // ── Derived stats (all use effectiveLevel) ─────────────────────────────────

  /** Town Center level (drives the build-level gate + base storage). */
  static townCenterLevel(island: IslandWithDetail): number {
    const tc = island.Buildings?.find(
      (b: any) => b.i_Building?.Name === "towncenter"
    );
    return tc ? this.effectiveLevel(tc) || 1 : 1;
  }

  /** Per-resource storage cap from TC level + warehouse buildings. */
  static storageCap(island: IslandWithDetail): number {
    let cap =
      CONSTANTS.BASE_STORAGE +
      this.townCenterLevel(island) * CONSTANTS.TC_STORAGE_PER_LEVEL;
    for (const b of island.Buildings ?? []) {
      const line = lineByKey(b.i_Building?.Name);
      const lvl = this.effectiveLevel(b);
      if (lvl > 0 && line?.func === "store" && line.resource === "all") {
        cap += levelStats(line, lvl).attr;
      }
    }
    return cap;
  }

  /** Population capacity from housing buildings. */
  static populationCap(island: IslandWithDetail): number {
    let cap = CONSTANTS.START.Population;
    for (const b of island.Buildings ?? []) {
      const line = lineByKey(b.i_Building?.Name);
      const lvl = this.effectiveLevel(b);
      if (lvl > 0 && line?.func === "store" && line.resource === "Population") {
        cap += levelStats(line, lvl).attr;
      }
    }
    return cap;
  }

  /** Production per hour for each gatherable resource. */
  static productionPerHour(island: IslandWithDetail): Record<ResourceKey, number> {
    const out: Record<ResourceKey, number> = {
      Wood: 0, Stone: 0, Food: 0, Currency: 0, Population: 0,
    };
    for (const b of island.Buildings ?? []) {
      const line = lineByKey(b.i_Building?.Name);
      const lvl = this.effectiveLevel(b);
      if (!line || lvl <= 0) continue;
      if (line.func === "produce" && line.resource && line.resource !== "all") {
        out[line.resource as ResourceKey] += levelStats(line, lvl).attr;
      } else if (line.func === "trade") {
        out.Currency += levelStats(line, lvl).attr;
      }
    }
    return out;
  }

  /** Build-time reduction fraction from the Knowledge line (capped at 50%). */
  static buildTimeReduction(island: IslandWithDetail): number {
    let pct = 0;
    for (const b of island.Buildings ?? []) {
      const line = lineByKey(b.i_Building?.Name);
      const lvl = this.effectiveLevel(b);
      if (lvl > 0 && line?.key === "knowledge") pct += levelStats(line, lvl).attr;
    }
    return Math.min(0.5, pct / 100);
  }

  /**
   * Apply lazy accrual since LastTick: add production (clamped to cap), grow or
   * starve population, persist, and return the refreshed island.
   */
  static async applyTick(island: IslandWithDetail): Promise<IslandWithDetail> {
    const now = Date.now();
    const last = new Date(island.LastTick).getTime();
    const hours = Math.max(0, (now - last) / 3_600_000);
    if (hours <= 0) return island;

    const cap = this.storageCap(island);
    const prod = this.productionPerHour(island);
    const clamp = (v: number) => Math.max(0, Math.min(cap, Math.round(v)));

    const wood = clamp(island.Wood + prod.Wood * hours);
    const stone = clamp(island.Stone + prod.Stone * hours);
    const currency = clamp(island.Currency + prod.Currency * hours);

    // Food: production minus population upkeep.
    const upkeep = island.Population * CONSTANTS.FOOD_UPKEEP_PER_POP * hours;
    let food = clamp(island.Food + prod.Food * hours - upkeep);

    // Population: grow toward capacity if fed, else starve.
    const popCap = this.populationCap(island);
    let population = island.Population;
    if (island.Food + prod.Food * hours - upkeep <= 0 && population > 0) {
      population = Math.max(
        0,
        Math.round(population * (1 - CONSTANTS.STARVATION_RATE * hours))
      );
    } else if (population < popCap) {
      population = Math.min(
        popCap,
        population + Math.ceil(popCap * CONSTANTS.POP_GROWTH_RATE * hours)
      );
    }

    await global.client.prisma.i_Island.update({
      where: { ID: island.ID },
      data: {
        Wood: wood,
        Stone: stone,
        Food: food,
        Currency: currency,
        Population: population,
        LastTick: new Date(now),
      },
    });

    // Reflect changes on the in-memory object so callers needn't re-fetch.
    island.Wood = wood;
    island.Stone = stone;
    island.Food = food;
    island.Currency = currency;
    island.Population = population;
    island.LastTick = new Date(now);
    return island;
  }

  /** Create/fetch + finalize completed builds + accrue resources. */
  static async prepare(userId: string): Promise<IslandWithDetail> {
    let island = await this.getOrCreateIsland(userId);
    island = await this.finalizeBuilds(island);
    island = await this.applyTick(island);
    return island;
  }

  /** One-call entry point for commands: prepared island + derived stats. */
  static async getIslandView(userId: string): Promise<{
    island: IslandWithDetail;
    cap: number;
    popCap: number;
    production: Record<ResourceKey, number>;
    tcLevel: number;
    currentBuild: any | null;
    army: {
      counts: Record<string, number>;
      caps: { land: number; naval: number };
      freePop: number;
      attack: number;
      smithing: number;
    };
  }> {
    const island = await this.prepare(userId);
    return {
      island,
      cap: this.storageCap(island),
      popCap: this.populationCap(island),
      production: this.productionPerHour(island),
      tcLevel: this.townCenterLevel(island),
      currentBuild: this.currentBuild(island),
      army: {
        counts: this.unitCounts(island),
        caps: this.unitCaps(island),
        freePop: this.freePopulation(island),
        attack: this.armyAttack(island),
        smithing: this.smithingBonus(island),
      },
    };
  }

  // ── Build / upgrade / rush ─────────────────────────────────────────────────

  /** Lines the island can start building now (not yet built + TC-unlocked). */
  static buildableLines(island: IslandWithDetail): BuildingLine[] {
    const built = new Set(
      (island.Buildings ?? []).map((b: any) => b.i_Building?.Name)
    );
    const tc = this.townCenterLevel(island);
    return BUILDING_LINES.filter(
      (l) => l.func !== "gate" && !built.has(l.key) && tc >= l.unlockTC
    );
  }

  /** Built lines that can still be upgraded (below max + TC allows next level). */
  static upgradeableLines(
    island: IslandWithDetail
  ): { line: BuildingLine; level: number; next: number }[] {
    const tc = this.townCenterLevel(island);
    const out: { line: BuildingLine; level: number; next: number }[] = [];
    for (const b of island.Buildings ?? []) {
      const line = lineByKey(b.i_Building?.Name);
      if (!line) continue;
      const level = this.effectiveLevel(b);
      const next = level + 1;
      if (next > line.maxLevel) continue;
      const gate = line.func === "gate" ? 0 : next; // TC doesn't gate itself
      if (tc < gate) continue;
      out.push({ line, level, next });
    }
    return out;
  }

  private static canAfford(island: IslandWithDetail, c: { wood: number; stone: number; food: number; currency: number }): string | null {
    const missing: string[] = [];
    if (island.Wood < c.wood) missing.push(`${c.wood - island.Wood} 🪵`);
    if (island.Stone < c.stone) missing.push(`${c.stone - island.Stone} 🪨`);
    if (island.Food < c.food) missing.push(`${c.food - island.Food} 🍖`);
    if (island.Currency < c.currency) missing.push(`${c.currency - island.Currency} 🪙`);
    return missing.length ? `Not enough resources — need ${missing.join(", ")} more.` : null;
  }

  private static buildSeconds(island: IslandWithDetail, baseTime: number): number {
    return Math.max(1, Math.round(baseTime * (1 - this.buildTimeReduction(island))));
  }

  /** Result type for mutating actions. */
  static ok(message: string) {
    return { ok: true as const, message };
  }
  static fail(message: string) {
    return { ok: false as const, message };
  }

  /** Start constructing a brand-new building (level 1). */
  static async startBuild(userId: string, lineKey: string) {
    const ids = await this.ensureDefinitions();
    const island = await this.prepare(userId);
    const line = lineByKey(lineKey);
    if (!line || line.func === "gate") return this.fail("That building can't be built.");

    if ((island.Buildings ?? []).some((b: any) => b.i_Building?.Name === lineKey))
      return this.fail(`You already have a ${line.tierNames[0]}.`);

    const tc = this.townCenterLevel(island);
    if (tc < line.unlockTC)
      return this.fail(`Requires Town Center level ${line.unlockTC} (you're ${tc}).`);

    const inProgress = this.currentBuild(island);
    if (inProgress) return this.fail(this.busyMessage(inProgress));

    const s = levelStats(line, 1);
    const afford = this.canAfford(island, s);
    if (afford) return this.fail(afford);

    const seconds = this.buildSeconds(island, s.time);
    const ready = new Date(Date.now() + seconds * 1000);

    await this.spend(island, s);
    await global.client.prisma.i_Building_Island.create({
      data: {
        BuildingID: ids.get(lineKey)!,
        IslandID: userId,
        level: 1,
        upgrading: 0, // 0 = constructing initial level
        upgradeReady: ready,
        wallHP: 0,
      },
    });
    return this.ok(`🏗️ Building **${line.tierNames[0]}** — ready ${this.discordTime(ready)}.`);
  }

  /** Start upgrading an existing building to its next level. */
  static async startUpgrade(userId: string, lineKey: string) {
    const island = await this.prepare(userId);
    const line = lineByKey(lineKey);
    if (!line) return this.fail("Unknown building.");

    const b = (island.Buildings ?? []).find((x: any) => x.i_Building?.Name === lineKey);
    if (!b) return this.fail(`You haven't built a ${line.tierNames[0]} yet — use /build.`);

    const inProgress = this.currentBuild(island);
    if (inProgress) return this.fail(this.busyMessage(inProgress));

    const level = this.effectiveLevel(b);
    const next = level + 1;
    if (next > line.maxLevel) return this.fail(`${tierNameFor(line, level)} is already max level.`);

    const tc = this.townCenterLevel(island);
    if (line.func !== "gate" && tc < next)
      return this.fail(`Requires Town Center level ${next} (you're ${tc}).`);

    const s = levelStats(line, next);
    const afford = this.canAfford(island, s);
    if (afford) return this.fail(afford);

    const seconds = this.buildSeconds(island, s.time);
    const ready = new Date(Date.now() + seconds * 1000);

    await this.spend(island, s);
    await global.client.prisma.i_Building_Island.update({
      where: { BuildingID_IslandID: { BuildingID: b.BuildingID, IslandID: userId } },
      data: { upgrading: next, upgradeReady: ready },
    });
    return this.ok(
      `⏫ Upgrading **${tierNameFor(line, level)}** → **${tierNameFor(line, next)}** (Lv ${next}) — ready ${this.discordTime(ready)}.`
    );
  }

  /** Instantly finish the in-progress build by paying Currency. */
  static async rush(userId: string) {
    const island = await this.prepare(userId);
    const cb = this.currentBuild(island);
    if (!cb) return this.fail("Nothing is being built right now.");

    const remaining = Math.max(
      0,
      (new Date(cb.upgradeReady).getTime() - Date.now()) / 1000
    );
    const cost = Math.ceil(remaining / CONSTANTS.RUSH_SECONDS_PER_CURRENCY);
    if (island.Currency < cost)
      return this.fail(`Rushing costs ${cost} 🪙 — you have ${island.Currency}.`);

    await global.client.prisma.i_Island.update({
      where: { ID: userId },
      data: { Currency: island.Currency - cost },
    });
    await global.client.prisma.i_Building_Island.update({
      where: { BuildingID_IslandID: { BuildingID: cb.BuildingID, IslandID: userId } },
      data: { upgradeReady: new Date() },
    });
    island.Currency -= cost;
    cb.upgradeReady = new Date();
    await this.finalizeBuilds(island);
    return this.ok(`⚡ Rushed for ${cost} 🪙 — build complete!`);
  }

  // ── Army / training ────────────────────────────────────────────────────────

  /** Effective level of a building line on this island (0 if not built/active). */
  static lineLevel(island: IslandWithDetail, key: string): number {
    const b = (island.Buildings ?? []).find((x: any) => x.i_Building?.Name === key);
    return b ? this.effectiveLevel(b) : 0;
  }

  /** Land-unit cap (Army line) and ship cap (Naval line). */
  static unitCaps(island: IslandWithDetail): { land: number; naval: number } {
    const army = lineByKey("army");
    const naval = lineByKey("naval");
    const armyLvl = this.lineLevel(island, "army");
    const navalLvl = this.lineLevel(island, "naval");
    return {
      land: army && armyLvl > 0 ? levelStats(army, armyLvl).attr : 0,
      naval: naval && navalLvl > 0 ? levelStats(naval, navalLvl).attr : 0,
    };
  }

  /** Current trained counts keyed by unit key. */
  static unitCounts(island: IslandWithDetail): Record<string, number> {
    const out: Record<string, number> = {};
    for (const u of island.Units ?? []) {
      const def = unitByName(u.i_Unit?.Name);
      if (def) out[def.key] = (out[def.key] ?? 0) + u.count;
    }
    return out;
  }

  /** Population already occupied by trained units. */
  static usedPopulation(island: IslandWithDetail): number {
    let used = 0;
    for (const u of island.Units ?? []) {
      const def = unitByName(u.i_Unit?.Name);
      if (def) used += def.pop * u.count;
    }
    return used;
  }

  /** Idle population available to be trained into new units. */
  static freePopulation(island: IslandWithDetail): number {
    return Math.max(0, island.Population - this.usedPopulation(island));
  }

  /** Smithing attack/HP multiplier, e.g. 0.30 = +30% (used in combat + display). */
  static smithingBonus(island: IslandWithDetail): number {
    const line = lineByKey("smithing");
    const lvl = this.lineLevel(island, "smithing");
    return line && lvl > 0 ? levelStats(line, lvl).attr / 100 : 0;
  }

  /** Total army attack with the Smithing bonus applied (display/combat preview). */
  static armyAttack(island: IslandWithDetail): number {
    const counts = this.unitCounts(island);
    let base = 0;
    for (const def of UNITS) base += (counts[def.key] ?? 0) * def.attack;
    return Math.round(base * (1 + this.smithingBonus(island)));
  }

  /** Units the island can train now (their required building level is met). */
  static trainableUnits(island: IslandWithDetail): UnitDef[] {
    return UNITS.filter(
      (u) => this.lineLevel(island, u.reqBuilding) >= u.reqLevel
    );
  }

  /** Train `qty` of a unit. Validates unlock, caps, resources and free pop. */
  static async trainUnit(userId: string, unitKey: string, qty: number) {
    const island = await this.prepare(userId);
    const def = unitByKey(unitKey);
    if (!def) return this.fail("Unknown unit.");
    if (!Number.isFinite(qty) || qty < 1) return this.fail("Enter a quantity of 1 or more.");
    qty = Math.floor(qty);

    if (this.lineLevel(island, def.reqBuilding) < def.reqLevel) {
      const line = lineByKey(def.reqBuilding);
      return this.fail(
        `${def.name} requires ${line ? tierNameFor(line, def.reqLevel) : def.reqBuilding} (Lv ${def.reqLevel}).`
      );
    }

    // Building capacity (land vs naval).
    const caps = this.unitCaps(island);
    const counts = this.unitCounts(island);
    let typeCount = 0;
    for (const u of UNITS) if (u.type === def.type) typeCount += counts[u.key] ?? 0;
    const cap = def.type === 1 ? caps.naval : caps.land;
    if (typeCount + qty > cap) {
      const room = Math.max(0, cap - typeCount);
      return this.fail(
        `${def.type === 1 ? "Ship" : "Army"} capacity is ${cap} — you can train ${room} more (upgrade ${def.type === 1 ? "Naval" : "Army"}).`
      );
    }

    // Free population.
    const needPop = def.pop * qty;
    const free = this.freePopulation(island);
    if (needPop > free)
      return this.fail(`Need ${needPop} free population — you have ${free} (grow it with Housing).`);

    // Resources.
    const cost = { wood: def.wood * qty, stone: 0, food: def.food * qty, currency: def.currency * qty };
    const afford = this.canAfford(island, cost);
    if (afford) return this.fail(afford);

    await this.spend(island, cost);

    // Upsert the unit count.
    const prisma = global.client.prisma;
    const unitRow = await prisma.i_Unit.findFirst({ where: { Name: def.name } });
    if (!unitRow) return this.fail("Unit definition missing — try again shortly.");
    await prisma.i_Unit_Island.upsert({
      where: { IslandID_UnitID: { IslandID: userId, UnitID: unitRow.ID } },
      create: { IslandID: userId, UnitID: unitRow.ID, count: qty },
      update: { count: { increment: qty } },
    });

    return this.ok(`🪖 Trained **${qty}× ${def.name}**.`);
  }

  // ── Walls / defense ─────────────────────────────────────────────────────────

  /** The walls building row (holds current wallHP), or null. */
  static wallsRow(island: IslandWithDetail): any | null {
    return (island.Buildings ?? []).find(
      (b: any) => b.i_Building?.Name === "walls"
    ) ?? null;
  }

  /** Maximum wall HP at the walls building's current level (0 if none). */
  static wallHPMax(island: IslandWithDetail): number {
    const line = lineByKey("walls");
    const lvl = this.lineLevel(island, "walls");
    return line && lvl > 0 ? levelStats(line, lvl).attr : 0;
  }

  /** Current standing wall HP (depleted by raids, restored by /repair). */
  static wallHPCurrent(island: IslandWithDetail): number {
    const row = this.wallsRow(island);
    return row?.wallHP ?? 0;
  }

  /** Restore walls to full HP, paying Stone (1 Stone per 4 HP). */
  static async repairWalls(userId: string) {
    const island = await this.prepare(userId);
    const row = this.wallsRow(island);
    if (!row) return this.fail("You have no walls to repair.");
    const max = this.wallHPMax(island);
    const missing = Math.max(0, max - (row.wallHP ?? 0));
    if (missing <= 0) return this.fail("Your walls are already at full strength.");

    const cost = Math.ceil(missing * PVP.STONE_PER_WALL_HP);
    if (island.Stone < cost)
      return this.fail(`Repairing ${missing} wall HP costs ${cost} 🪨 — you have ${island.Stone}.`);

    await global.client.prisma.i_Island.update({
      where: { ID: userId },
      data: { Stone: island.Stone - cost },
    });
    await global.client.prisma.i_Building_Island.update({
      where: { BuildingID_IslandID: { BuildingID: row.BuildingID, IslandID: userId } },
      data: { wallHP: max },
    });
    return this.ok(`🧱 Repaired walls to full (${max} HP) for ${cost} 🪨.`);
  }

  // ── small helpers ──────────────────────────────────────────────────────────

  private static async spend(
    island: IslandWithDetail,
    c: { wood: number; stone: number; food: number; currency: number }
  ): Promise<void> {
    const data = {
      Wood: island.Wood - c.wood,
      Stone: island.Stone - c.stone,
      Food: island.Food - c.food,
      Currency: island.Currency - c.currency,
    };
    await global.client.prisma.i_Island.update({ where: { ID: island.ID }, data });
    Object.assign(island, data);
  }

  private static busyMessage(b: any): string {
    const line = lineByKey(b.i_Building?.Name);
    const name = line ? tierNameFor(line, b.level) : "a building";
    return `You're already building **${name}** — finishes ${this.discordTime(new Date(b.upgradeReady))}. Only one build at a time (or /rush it).`;
  }

  /** Discord relative timestamp, e.g. "in 3 minutes". */
  static discordTime(d: Date): string {
    return `<t:${Math.floor(d.getTime() / 1000)}:R>`;
  }

  /** Definitions sanity helper (used by tests/diagnostics). */
  static get lines() {
    return BUILDING_LINES;
  }
}
