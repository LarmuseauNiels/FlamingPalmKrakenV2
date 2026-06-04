// Islander core logic: island lifecycle + lazy resource accrual.
//
// Resources are accrued lazily — there is no per-tick cron. On every read we
// compute what was produced since `LastTick`, clamp to storage, and persist.
// See docs/ISLANDER_DESIGN.md §3.2 / §9.1.

import {
  CONSTANTS,
  BUILDING_LINES,
  lineByKey,
  levelStats,
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

  /** Town Center level (drives the build-level gate + base storage). */
  static townCenterLevel(island: IslandWithDetail): number {
    const tc = island.Buildings?.find(
      (b: any) => b.i_Building?.Name === "towncenter"
    );
    return tc?.level ?? 1;
  }

  /** Per-resource storage cap from TC level + warehouse buildings. */
  static storageCap(island: IslandWithDetail): number {
    let cap =
      CONSTANTS.BASE_STORAGE +
      this.townCenterLevel(island) * CONSTANTS.TC_STORAGE_PER_LEVEL;
    for (const b of island.Buildings ?? []) {
      const line = lineByKey(b.i_Building?.Name);
      if (line?.func === "store" && line.resource === "all") {
        cap += levelStats(line, b.level).attr;
      }
    }
    return cap;
  }

  /** Population capacity from housing buildings. */
  static populationCap(island: IslandWithDetail): number {
    let cap = CONSTANTS.START.Population;
    for (const b of island.Buildings ?? []) {
      const line = lineByKey(b.i_Building?.Name);
      if (line?.func === "store" && line.resource === "Population") {
        cap += levelStats(line, b.level).attr;
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
      if (!line) continue;
      if (line.func === "produce" && line.resource && line.resource !== "all") {
        out[line.resource as ResourceKey] += levelStats(line, b.level).attr;
      } else if (line.func === "trade") {
        out.Currency += levelStats(line, b.level).attr;
      }
    }
    return out;
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

  /** One-call entry point for commands: create/fetch + tick + derived stats. */
  static async getIslandView(userId: string): Promise<{
    island: IslandWithDetail;
    cap: number;
    popCap: number;
    production: Record<ResourceKey, number>;
    tcLevel: number;
  }> {
    let island = await this.getOrCreateIsland(userId);
    island = await this.applyTick(island);
    return {
      island,
      cap: this.storageCap(island),
      popCap: this.populationCap(island),
      production: this.productionPerHour(island),
      tcLevel: this.townCenterLevel(island),
    };
  }

  /** Definitions sanity helper (used by tests/diagnostics). */
  static get lines() {
    return BUILDING_LINES;
  }
}
