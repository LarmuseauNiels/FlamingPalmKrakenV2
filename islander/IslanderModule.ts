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
  INTEGRATIONS,
  MILESTONES,
  Milestone,
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
import { EventNotification } from "../modules/NotificationLevels";
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

    // Seed if definitions are missing OR incomplete (e.g. a previous seed was
    // interrupted), since the seed is idempotent (upsert) and cheap to re-run.
    const expectedBuildings = BUILDING_LINES.length;
    const expectedLevels = BUILDING_LINES.reduce((s, l) => s + l.maxLevel, 0);
    const [buildingCount, levelCount] = await Promise.all([
      prisma.i_Building.count(),
      prisma.i_BuildingLevel.count(),
    ]);
    if (buildingCount < expectedBuildings || levelCount < expectedLevels) {
      log.info(
        `Seeding Islander definitions (have ${buildingCount}/${expectedBuildings} buildings, ${levelCount}/${expectedLevels} levels)`
      );
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

    try {
      // Ensure a Members row exists (FK target) without clobbering existing data.
      await prisma.members.upsert({
        where: { ID: userId },
        update: {},
        create: { ID: userId, DisplayName: global.client.idToName(userId) ?? userId },
      });

      // Idempotent: a concurrent /island invocation may have created this island
      // between our fetch above and now, so don't blow up on a duplicate.
      await prisma.i_Island.upsert({
        where: { ID: userId },
        update: {},
        create: {
          ID: userId,
          Wood: CONSTANTS.START.Wood,
          Stone: CONSTANTS.START.Stone,
          Food: CONSTANTS.START.Food,
          Currency: CONSTANTS.START.Currency,
          Population: CONSTANTS.START.Population,
          LastTick: new Date(),
        },
      });

      // Place the starter buildings at level 1 (idempotent — skip if already there).
      for (const key of CONSTANTS.STARTER_BUILDINGS) {
        const buildingId = ids.get(key);
        if (!buildingId) continue;
        const line = lineByKey(key);
        const wallHP = line?.func === "defend" ? levelStats(line, 1).attr : 0;
        await prisma.i_Building_Island.upsert({
          where: { BuildingID_IslandID: { BuildingID: buildingId, IslandID: userId } },
          update: {},
          create: { BuildingID: buildingId, IslandID: userId, level: 1, wallHP },
        });
      }

      log.info(`Created new island for ${userId}`);
    } catch (error: any) {
      // A racing invocation may have created the island first; re-fetch and use
      // it rather than failing the render. Re-throw anything we can't recover.
      if (error?.code !== "P2002") throw error;
      log.warn(`Concurrent island creation for ${userId}; using existing row`);
    }

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
    // Currency is intentionally uncapped — it's the scarce, bankable raiding
    // reward, so storage never silently eats it (see ISLANDER_IMPROVEMENTS.md F4).
    const currency = Math.max(0, Math.round(island.Currency + prod.Currency * hours));

    // Food: production minus population upkeep.
    const upkeep = island.Population * CONSTANTS.FOOD_UPKEEP_PER_POP * hours;
    const netFood = island.Food + prod.Food * hours - upkeep;
    let food = clamp(netFood);

    // Population: grow toward capacity if fed, else starve. Starvation decays
    // *compounding* (per-hour) rather than linearly, so a long offline gap can't
    // wipe the whole population in a single tick (ISLANDER_IMPROVEMENTS.md F1).
    const popCap = this.populationCap(island);
    let population = island.Population;
    if (netFood <= 0 && population > 0) {
      population = Math.max(
        0,
        Math.floor(population * Math.pow(1 - CONSTANTS.STARVATION_RATE, hours))
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

    // Famine: trained units occupy population, so if starvation dropped the
    // population below what the army needs, the weakest units starve too —
    // otherwise armies would be immune to famine (ISLANDER_IMPROVEMENTS.md F2).
    island.starvedUnits = await this.cullUnitsToPopulation(island, population);
    return island;
  }

  /**
   * Remove units (weakest first) until the population they occupy fits within
   * `population`, freeing pop for the survivors. Persists row updates/deletes and
   * mirrors the change on the in-memory island. Returns the count culled.
   */
  private static async cullUnitsToPopulation(
    island: IslandWithDetail,
    population: number
  ): Promise<number> {
    let used = this.usedPopulation(island);
    if (used <= population) return 0;

    // Weakest (lowest attack+HP) units starve first.
    const rows = [...(island.Units ?? [])].sort((a: any, b: any) => {
      const da = unitByName(a.i_Unit?.Name);
      const db = unitByName(b.i_Unit?.Name);
      return ((da?.attack ?? 0) + (da?.hp ?? 0)) - ((db?.attack ?? 0) + (db?.hp ?? 0));
    });

    let culled = 0;
    for (const row of rows) {
      if (used <= population) break;
      const def = unitByName(row.i_Unit?.Name);
      if (!def || def.pop <= 0) continue;
      const overBy = used - population;
      const removeCount = Math.min(row.count, Math.ceil(overBy / def.pop));
      if (removeCount <= 0) continue;

      const remaining = row.count - removeCount;
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
      used -= def.pop * removeCount;
      culled += removeCount;
    }
    return culled;
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
    nextUnlock: { tc: number; names: string[] } | null;
    army: {
      counts: Record<string, number>;
      caps: { land: number; naval: number };
      freePop: number;
      attack: number;
      smithing: number;
    };
  }> {
    const island = await this.prepare(userId);
    await this.checkTcMilestones(userId, island); // no-op unless integrations enabled
    return {
      island,
      cap: this.storageCap(island),
      popCap: this.populationCap(island),
      production: this.productionPerHour(island),
      tcLevel: this.townCenterLevel(island),
      currentBuild: this.currentBuild(island),
      nextUnlock: this.nextUnlock(island),
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

  /** The next batch of buildings that unlock, and at which TC level (or null). */
  static nextUnlock(
    island: IslandWithDetail
  ): { tc: number; names: string[] } | null {
    const tc = this.townCenterLevel(island);
    const built = new Set(
      (island.Buildings ?? []).map((b: any) => b.i_Building?.Name)
    );
    const locked = BUILDING_LINES.filter(
      (l) => l.func !== "gate" && !built.has(l.key) && l.unlockTC > tc
    );
    if (!locked.length) return null;
    const nextTc = Math.min(...locked.map((l) => l.unlockTC));
    const names = locked
      .filter((l) => l.unlockTC === nextTc)
      .map((l) => l.tierNames[0]);
    return { tc: nextTc, names };
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

    if (!(await this.trySpend(island, s)))
      return this.fail("Your resources changed — try again.");
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
    this.scheduleBuildComplete(userId, seconds * 1000, line.tierNames[0]);
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

    if (!(await this.trySpend(island, s)))
      return this.fail("Your resources changed — try again.");
    await global.client.prisma.i_Building_Island.update({
      where: { BuildingID_IslandID: { BuildingID: b.BuildingID, IslandID: userId } },
      data: { upgrading: next, upgradeReady: ready },
    });
    this.scheduleBuildComplete(userId, seconds * 1000, tierNameFor(line, next));
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
    // Always at least 1 Currency, so a near-finished build can't be rushed free.
    const cost = Math.max(1, Math.ceil(remaining / CONSTANTS.RUSH_SECONDS_PER_CURRENCY));
    if (island.Currency < cost)
      return this.fail(`Rushing costs ${cost} 🪙 — you have ${island.Currency}.`);

    // Guarded decrement so a double-click can't charge twice (F3).
    const spent = await global.client.prisma.i_Island.updateMany({
      where: { ID: userId, Currency: { gte: cost } },
      data: { Currency: { decrement: cost } },
    });
    if (spent.count === 0)
      return this.fail("Your Currency changed — try again.");
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

    if (!(await this.trySpend(island, cost)))
      return this.fail("Your resources changed — try again.");

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

    // Guarded decrement so a double-click can't charge twice (F3).
    const spent = await global.client.prisma.i_Island.updateMany({
      where: { ID: userId, Stone: { gte: cost } },
      data: { Stone: { decrement: cost } },
    });
    if (spent.count === 0)
      return this.fail("Your Stone changed — try again.");
    await global.client.prisma.i_Building_Island.update({
      where: { BuildingID_IslandID: { BuildingID: row.BuildingID, IslandID: userId } },
      data: { wallHP: max },
    });
    return this.ok(`🧱 Repaired walls to full (${max} HP) for ${cost} 🪨.`);
  }

  // ── Notifications ───────────────────────────────────────────────────────────

  /** DM a member an Islander event, if they've opted into notifications. */
  static async notify(userId: string, payload: any): Promise<void> {
    try {
      const m = await global.client.prisma.members.findUnique({
        where: { ID: userId },
        select: { NotifyLevel: true },
      });
      if (!m || ((m.NotifyLevel ?? 0) & EventNotification) === 0) return;
      const user = await global.client.users.fetch(userId).catch(() => null);
      await user?.send(payload).catch(() => {});
    } catch (error) {
      log.error("Failed to send islander notification:", error);
    }
  }

  /** Best-effort DM when a build finishes (in-memory timer; lost on restart). */
  static scheduleBuildComplete(userId: string, ms: number, label: string): void {
    if (ms <= 0 || ms >= 2_147_483_647) return; // setTimeout 32-bit limit (~24.8d)
    setTimeout(() => {
      this.notify(userId, {
        content: `🏝️ Your **${label}** has finished building! Open \`/island\` to see it.`,
      }).catch(() => {});
    }, ms);
  }

  // ── Leaderboard ─────────────────────────────────────────────────────────────

  /** Power score for ranking (docs/ISLANDER_DESIGN.md §8 / §10). */
  static powerScore(island: IslandWithDetail): number {
    const tc = this.townCenterLevel(island);
    let buildingSum = 0;
    for (const b of island.Buildings ?? []) buildingSum += this.effectiveLevel(b);
    const counts = this.unitCounts(island);
    let armyVal = 0;
    for (const u of UNITS) armyVal += (counts[u.key] ?? 0) * (u.attack + u.hp);
    return Math.round(10 * tc + 3 * buildingSum + armyVal / 10);
  }

  /**
   * Top islands by power score, plus the viewer's own rank when supplied (so the
   * leaderboard can show "you're #N" even when outside the top slice — F12).
   */
  static async leaderboard(
    limit = 10,
    viewerId?: string
  ): Promise<{
    top: { id: string; score: number; tc: number }[];
    viewer?: { rank: number; score: number; tc: number; total: number };
  }> {
    const islands = await global.client.prisma.i_Island.findMany({
      include: {
        Buildings: { include: { i_Building: true } },
        Units: { include: { i_Unit: true } },
      },
    });
    const scored = islands
      .map((i: any) => ({
        id: i.ID,
        score: this.powerScore(i),
        tc: this.townCenterLevel(i),
      }))
      .sort((a, b) => b.score - a.score);

    const top = scored.slice(0, limit);
    let viewer;
    if (viewerId) {
      const idx = scored.findIndex((s) => s.id === viewerId);
      if (idx >= 0) {
        viewer = {
          rank: idx + 1,
          score: scored[idx].score,
          tc: scored[idx].tc,
          total: scored.length,
        };
      }
    }
    return { top, viewer };
  }

  /** The attacker raid-cooldown timestamp if still active, else null. */
  static async activeRaidCooldown(userId: string): Promise<Date | null> {
    const row = await global.client.prisma.i_Island.findUnique({
      where: { ID: userId },
      select: { RaidCooldown: true },
    });
    const cd = row?.RaidCooldown ? new Date(row.RaidCooldown) : null;
    return cd && cd.getTime() > Date.now() ? cd : null;
  }

  /**
   * Pick a random eligible raid target for `attackerId` (F9). Applies the same
   * gates the raid itself enforces — within the matchmaking TC band, not under
   * new-player protection, not currently shielded, and not on the attacker's
   * repeat-target cooldown — so a found target is actually raidable. Returns the
   * target's island ID, or null when nobody is in range.
   */
  static async findRaidTarget(attackerId: string): Promise<{ id: string } | null> {
    const prisma = global.client.prisma;
    const attacker = await this.prepare(attackerId);
    const attackerTC = this.townCenterLevel(attacker);
    const now = Date.now();

    // Candidate islands: not me, and not currently shielded.
    const islands = await prisma.i_Island.findMany({
      where: {
        ID: { not: attackerId },
        OR: [{ ShieldUntil: null }, { ShieldUntil: { lte: new Date(now) } }],
      },
      include: { Buildings: { include: { i_Building: true } } },
    });

    // Build a per-defender "raidable again" map from this attacker's recent raids,
    // honouring the win/loss repeat windows (mirrors CombatModule's guard).
    const recentRaids = await prisma.i_Raid.findMany({
      where: {
        AttackerID: attackerId,
        TimeStamp: { gt: new Date(now - PVP.REPEAT_TARGET_HOURS * 3_600_000) },
      },
      orderBy: { TimeStamp: "desc" },
    });
    const blockedUntil = new Map<string, number>();
    for (const r of recentRaids) {
      if (blockedUntil.has(r.DefenderID)) continue; // latest raid per target wins
      const windowH = r.AttackerWon
        ? PVP.REPEAT_TARGET_HOURS
        : PVP.REPEAT_TARGET_LOSS_HOURS;
      blockedUntil.set(r.DefenderID, new Date(r.TimeStamp).getTime() + windowH * 3_600_000);
    }

    const eligible = islands.filter((i: any) => {
      const tc = this.townCenterLevel(i);
      if (tc < PVP.NEW_PLAYER_SHIELD_TC) return false;
      if (Math.abs(tc - attackerTC) > PVP.MATCHMAKING_BAND) return false;
      const until = blockedUntil.get(i.ID);
      if (until && until > now) return false;
      return true;
    });
    if (!eligible.length) return null;

    const pick = eligible[Math.floor(Math.random() * eligible.length)];
    return { id: pick.ID };
  }

  // ── Phase 5: community-economy integrations (feature-flagged, off by default) ─

  /** Award community Points for Islander milestones? (env ISLANDER_AWARD_POINTS) */
  static get pointsAwardEnabled(): boolean {
    return process.env.ISLANDER_AWARD_POINTS === "true";
  }

  /** Allow converting community Points → island Currency? (env ISLANDER_POINTS_EXCHANGE) */
  static get pointsExchangeEnabled(): boolean {
    return process.env.ISLANDER_POINTS_EXCHANGE === "true";
  }

  /** Award a milestone's Points once (idempotent via a PointHistory marker). */
  static async awardMilestone(userId: string, m: Milestone): Promise<boolean> {
    const prisma = global.client.prisma;
    const marker = `ISL:milestone:${m.key}`;
    const already = await prisma.pointHistory.findFirst({
      where: { userid: userId, comment: { startsWith: marker } },
    });
    if (already) return false;

    await prisma.points.upsert({
      where: { userid: userId },
      update: { TotalPoints: { increment: m.points }, lastComment: m.label },
      create: { userid: userId, TotalPoints: m.points, lastComment: m.label },
    });
    await prisma.pointHistory.create({
      data: { userid: userId, points: m.points, comment: `${marker} ${m.label}` },
    });
    this.notify(userId, {
      content: `🏝️ **Islander milestone:** ${m.label} — +${m.points} :palm_tree: points!`,
    }).catch(() => {});
    return true;
  }

  /** Check Town-Center milestones for an island (no-op unless enabled). */
  static async checkTcMilestones(userId: string, island: IslandWithDetail): Promise<void> {
    if (!this.pointsAwardEnabled) return;
    const tc = this.townCenterLevel(island);
    for (const m of MILESTONES) {
      if (m.type === "tc" && tc >= m.threshold) {
        await this.awardMilestone(userId, m).catch((e) =>
          log.error("milestone award failed:", e)
        );
      }
    }
  }

  /** Check raid-win milestones (called after a winning raid; no-op unless enabled). */
  static async checkRaidMilestones(userId: string): Promise<void> {
    if (!this.pointsAwardEnabled) return;
    const wins = await global.client.prisma.i_Raid.count({
      where: { AttackerID: userId, AttackerWon: true },
    });
    for (const m of MILESTONES) {
      if (m.type === "raidwins" && wins >= m.threshold) {
        await this.awardMilestone(userId, m).catch((e) =>
          log.error("milestone award failed:", e)
        );
      }
    }
  }

  /** Convert community Points into island Currency (rate-limited). */
  static async exchangePoints(userId: string, points: number) {
    if (!this.pointsExchangeEnabled)
      return this.fail("Points exchange is currently disabled.");
    if (!Number.isFinite(points) || points < 1)
      return this.fail("Enter a whole number of points (1 or more).");
    points = Math.floor(points);

    const prisma = global.client.prisma;
    const pts = await prisma.points.findUnique({ where: { userid: userId } });
    const balance = pts?.TotalPoints ?? 0;
    if (balance < points)
      return this.fail(`You only have ${balance} :palm_tree: points.`);

    // Daily cap across all conversions today.
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const agg = await prisma.pointHistory.aggregate({
      _sum: { points: true },
      where: { userid: userId, TimeStamp: { gte: since }, comment: { startsWith: "ISL:exchange" } },
    });
    const spentToday = -(agg._sum.points ?? 0);
    const remaining = INTEGRATIONS.EXCHANGE_DAILY_POINT_CAP - spentToday;
    if (points > remaining)
      return this.fail(`Daily exchange cap is ${INTEGRATIONS.EXCHANGE_DAILY_POINT_CAP} points — you can convert ${Math.max(0, remaining)} more today.`);

    const island = await this.prepare(userId);
    const gain = points * INTEGRATIONS.POINTS_PER_CURRENCY;

    // Guarded decrement so concurrent exchanges can't double-spend Points (F3).
    const spent = await prisma.points.updateMany({
      where: { userid: userId, TotalPoints: { gte: points } },
      data: { TotalPoints: { decrement: points } },
    });
    if (spent.count === 0)
      return this.fail(`You only have ${balance} :palm_tree: points.`);
    await prisma.points.update({
      where: { userid: userId },
      data: { lastComment: "Islander currency exchange" },
    });
    await prisma.pointHistory.create({
      data: { userid: userId, points: -points, comment: `ISL:exchange ${points} pts → ${gain} 🪙` },
    });
    // Currency is uncapped (F4), so the full conversion always lands.
    await prisma.i_Island.update({ where: { ID: userId }, data: { Currency: { increment: gain } } });

    return this.ok(`🔁 Converted **${points}** :palm_tree: → **${gain}** 🪙.`);
  }

  // ── small helpers ──────────────────────────────────────────────────────────

  /**
   * Atomically spend resources with a DB-level guard so concurrent clicks can't
   * double-charge or drive a balance negative (ISLANDER_IMPROVEMENTS.md F3). The
   * conditional `updateMany` only decrements when every balance still covers the
   * cost; a 0 affected-row count means we lost a race. Callers should still
   * `canAfford` first for a friendly "need X more" message — this is the
   * authoritative gate. Returns true if the spend was applied.
   */
  private static async trySpend(
    island: IslandWithDetail,
    c: { wood: number; stone: number; food: number; currency: number }
  ): Promise<boolean> {
    const res = await global.client.prisma.i_Island.updateMany({
      where: {
        ID: island.ID,
        Wood: { gte: c.wood },
        Stone: { gte: c.stone },
        Food: { gte: c.food },
        Currency: { gte: c.currency },
      },
      data: {
        Wood: { decrement: c.wood },
        Stone: { decrement: c.stone },
        Food: { decrement: c.food },
        Currency: { decrement: c.currency },
      },
    });
    if (res.count === 0) return false;
    island.Wood -= c.wood;
    island.Stone -= c.stone;
    island.Food -= c.food;
    island.Currency -= c.currency;
    return true;
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
