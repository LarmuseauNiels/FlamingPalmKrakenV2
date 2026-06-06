// Islander balance data — the single source of truth for game numbers.
// Mirrors docs/ISLANDER_BALANCE.md. Used both to SEED the definition tables
// (i_Building / i_BuildingLevel / i_Unit) and at RUNTIME by IslanderModule.
//
// Keeping one TS source avoids drift between the seed and the live maths. The
// DB definition rows exist for Phase 1+ (build/upgrade cost lookups) and the
// website; the runtime computes from these helpers directly.

export type ResourceKey = "Wood" | "Stone" | "Food" | "Currency" | "Population";
export type BuildingFunc =
  | "gate"
  | "produce"
  | "store"
  | "trade"
  | "boost"
  | "train"
  | "defend"
  | "vault";

export const CONSTANTS = {
  BASE_STORAGE: 500, // base per-resource cap from a level-1 Town Center
  TC_STORAGE_PER_LEVEL: 500, // extra cap per TC level
  START: { Wood: 300, Stone: 300, Food: 300, Currency: 50, Population: 5 },
  // COST matches RATE so costs scale with production/storage — every tier stays
  // affordable and build-up time per level is roughly constant (see §8 / the
  // balance changelog). TIME is independent and capped at TIME_CAP.
  GROWTH: { COST: 1.35, TIME: 1.5, RATE: 1.35 },
  TIME_CAP: 86400, // 24h — no single build longer than a day in v1
  RUSH_SECONDS_PER_CURRENCY: 6, // /6s of remaining build = 1 Currency to finish
  POP_GROWTH_RATE: 0.02, // fraction of pop capacity gained per hour
  FOOD_UPKEEP_PER_POP: 0.5, // Food consumed per population per hour
  STARVATION_RATE: 0.05, // fraction of population lost per hour at 0 Food
  // A brand-new island starts with ONLY the Town Center (Campfire) at level 1.
  // Everything else begins unbuilt — players spend their starting resources to
  // construct their first Farm/Woodcutter/Mine/Tents/Warehouse from the Build menu.
  STARTER_BUILDINGS: ["towncenter"],
};

export interface BuildingLine {
  key: string; // stable identity, stored in i_Building.Name
  func: BuildingFunc;
  resource?: ResourceKey | "all"; // target of produce/store
  tierNames: [string, string, string]; // levels 1-9 / 10-19 / 20+
  maxLevel: number;
  unlockTC: number; // min Town Center level to build level 1
  image: string; // sprite name for i_BuildingLevel.imagename
  posX: number; // default canvas placement
  posY: number;
  base: {
    wood?: number;
    stone?: number;
    food?: number;
    currency?: number;
    time: number; // build seconds at level 1
    attr: number; // FunctAttribute at level 1 (rate / cap / hp / % ...)
  };
}

// Catalogue (docs/ISLANDER_DESIGN.md §4.2). base values anchor the growth curve.
export const BUILDING_LINES: BuildingLine[] = [
  {
    key: "towncenter", func: "gate", tierNames: ["Campfire", "Town Centre", "Palace"],
    maxLevel: 30, unlockTC: 0, image: "towncenter", posX: 280, posY: 200,
    base: { wood: 150, stone: 120, food: 80, time: 120, attr: 0 },
  },
  {
    key: "housing", func: "store", resource: "Population",
    tierNames: ["Tents", "Houses", "Villas"], maxLevel: 30, unlockTC: 3,
    image: "housing", posX: 150, posY: 250,
    base: { wood: 40, stone: 20, time: 45, attr: 10 },
  },
  {
    key: "food", func: "produce", resource: "Food",
    tierNames: ["Farm", "Farm Estate", "Plantation"], maxLevel: 30, unlockTC: 1,
    image: "farm", posX: 100, posY: 180,
    base: { wood: 50, stone: 30, time: 30, attr: 60 },
  },
  {
    key: "wood", func: "produce", resource: "Wood",
    tierNames: ["Woodcutter", "Logging Camp", "Sawmill"], maxLevel: 30, unlockTC: 1,
    image: "woodcutter", posX: 420, posY: 170,
    base: { wood: 40, stone: 20, time: 30, attr: 55 },
  },
  {
    key: "stone", func: "produce", resource: "Stone",
    tierNames: ["Mine", "Quarry", "Stoneworks"], maxLevel: 30, unlockTC: 2,
    image: "mine", posX: 470, posY: 240,
    base: { wood: 40, stone: 20, time: 30, attr: 55 },
  },
  {
    key: "trade", func: "trade", resource: "Currency",
    tierNames: ["Trader", "Marketplace", "Grand Bazaar"], maxLevel: 30, unlockTC: 8,
    image: "trader", posX: 350, posY: 260,
    base: { wood: 120, stone: 100, time: 600, attr: 20 },
  },
  {
    key: "warehouse", func: "store", resource: "all",
    tierNames: ["Warehouse", "Storehouse", "Grand Depot"], maxLevel: 30, unlockTC: 2,
    image: "warehouse", posX: 210, posY: 180,
    base: { wood: 60, stone: 40, time: 60, attr: 1500 }, // storage headroom > any single upgrade cost
  },
  {
    key: "smithing", func: "boost",
    tierNames: ["Smelter", "Blacksmith", "Foundry"], maxLevel: 30, unlockTC: 5,
    image: "smelter", posX: 320, posY: 150,
    base: { wood: 150, stone: 200, time: 600, attr: 3 }, // +3% army atk/hp per level
  },
  {
    key: "army", func: "train",
    tierNames: ["Army Camp", "Barracks", "Army Base"], maxLevel: 30, unlockTC: 3,
    image: "army", posX: 180, posY: 300,
    base: { wood: 200, stone: 120, food: 150, time: 600, attr: 30 }, // land-unit cap = 30*level
  },
  {
    key: "naval", func: "train",
    tierNames: ["Dock", "Harbour", "Port"], maxLevel: 30, unlockTC: 5,
    image: "dock", posX: 520, posY: 320,
    base: { wood: 250, stone: 150, time: 900, attr: 5 }, // ship cap = 5*level
  },
  {
    key: "knowledge", func: "boost",
    tierNames: ["Academy", "University", "Grand Library"], maxLevel: 30, unlockTC: 8,
    image: "academy", posX: 250, posY: 130,
    base: { wood: 180, stone: 160, time: 1200, attr: 1 }, // -1% build time per level
  },
  {
    key: "walls", func: "defend",
    tierNames: ["Palisade Walls", "Stone Walls", "Reinforced Walls"], maxLevel: 30, unlockTC: 3,
    image: "walls", posX: 60, posY: 320,
    base: { wood: 100, stone: 200, time: 300, attr: 500 }, // wall HP
  },
  {
    key: "towers", func: "defend",
    tierNames: ["Watch Tower", "Guard Tower", "Bombard Tower"], maxLevel: 30, unlockTC: 5,
    image: "tower", posX: 540, posY: 130,
    base: { wood: 120, stone: 150, time: 300, attr: 2 }, // pre-battle kill % per level
  },
  {
    key: "keep", func: "vault",
    tierNames: ["Castle", "Keep", "Citadel"], maxLevel: 15, unlockTC: 15,
    image: "castle", posX: 300, posY: 230,
    base: { wood: 700, stone: 900, time: 7200, attr: 15 }, // vault % protected; base kept under warehouse headroom
  },
];

export interface UnitDef {
  key: string;
  name: string;
  type: number; // 0 = land, 1 = naval, 2 = defense
  wood: number;
  food: number;
  currency: number;
  pop: number;
  attack: number;
  hp: number;
  loot: number;
  trainTime: number;
  reqBuilding: string; // building line key that must reach reqLevel to unlock
  reqLevel: number;
}

// Roster (docs/ISLANDER_DESIGN.md §5, numbers in ISLANDER_BALANCE.md §8).
export const UNITS: UnitDef[] = [
  { key: "raider",   name: "Raider",    type: 0, wood: 15,  food: 20, currency: 0,  pop: 1, attack: 8,  hp: 20,  loot: 50,  trainTime: 60,  reqBuilding: "army",  reqLevel: 1 },
  { key: "soldier",  name: "Soldier",   type: 0, wood: 25,  food: 25, currency: 0,  pop: 1, attack: 12, hp: 45,  loot: 10,  trainTime: 90,  reqBuilding: "army",  reqLevel: 3 },
  { key: "champion", name: "Champion",  type: 0, wood: 60,  food: 50, currency: 20, pop: 2, attack: 35, hp: 110, loot: 40,  trainTime: 240, reqBuilding: "army",  reqLevel: 10 },
  { key: "longboat", name: "Longboat",  type: 1, wood: 120, food: 30, currency: 10, pop: 3, attack: 25, hp: 150, loot: 300, trainTime: 300, reqBuilding: "naval", reqLevel: 1 },
  { key: "galley",   name: "War Galley",type: 1, wood: 300, food: 60, currency: 40, pop: 5, attack: 70, hp: 400, loot: 800, trainTime: 600, reqBuilding: "naval", reqLevel: 10 },
];

export function unitByKey(key: string): UnitDef | undefined {
  return UNITS.find((u) => u.key === key);
}
export function unitByName(name: string): UnitDef | undefined {
  return UNITS.find((u) => u.name === name);
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** The displayed tier name for a building line at a given level. */
export function tierNameFor(line: BuildingLine, level: number): string {
  if (level >= 20) return line.tierNames[2];
  if (level >= 10) return line.tierNames[1];
  return line.tierNames[0];
}

/** Min Town Center level required to hold this building at `level`. */
export function tcRequirement(line: BuildingLine, level: number): number {
  return Math.max(level, line.unlockTC);
}

export interface LevelStats {
  level: number;
  name: string;
  wood: number;
  stone: number;
  food: number;
  currency: number;
  time: number; // build seconds
  tcReq: number;
  attr: number; // FunctAttribute meaning depends on line.func
}

/** Computed stats for one (line, level) per the documented growth curve. */
export function levelStats(line: BuildingLine, level: number): LevelStats {
  const { GROWTH, TIME_CAP } = CONSTANTS;
  const costMul = Math.pow(GROWTH.COST, level - 1);
  const time = Math.min(
    Math.round((line.base.time || 0) * Math.pow(GROWTH.TIME, level - 1)),
    TIME_CAP
  );
  // boost/defend/vault/train scale linearly; produce/store/trade scale geometrically.
  const linear = ["boost", "defend", "vault", "train"].includes(line.func);
  const attr = linear
    ? Math.round(line.base.attr * level)
    : Math.round(line.base.attr * Math.pow(GROWTH.RATE, level - 1));
  return {
    level,
    name: tierNameFor(line, level),
    wood: Math.round((line.base.wood || 0) * costMul),
    stone: Math.round((line.base.stone || 0) * costMul),
    food: Math.round((line.base.food || 0) * costMul),
    currency: Math.round((line.base.currency || 0) * costMul),
    time,
    tcReq: tcRequirement(line, level),
    attr,
  };
}

export function lineByKey(key: string): BuildingLine | undefined {
  return BUILDING_LINES.find((l) => l.key === key);
}

// ── PvP raiding (docs/ISLANDER_DESIGN.md §6, ISLANDER_BALANCE.md §9) ──────────

export const PVP = {
  LOOT_PERCENT: 0.2, // max % of a resource's *unprotected* amount a raid takes
  NEW_PLAYER_SHIELD_TC: 5, // islands below this Town Center level can't be raided
  POST_RAID_SHIELD_HOURS: 8, // protection after being successfully raided
  RAID_COOLDOWN_HOURS: 4, // base attacker cooldown (reduced by Naval)
  REPEAT_TARGET_HOURS: 24, // can't re-raid the same victim within this window after a WIN
  REPEAT_TARGET_LOSS_HOURS: 6, // shorter re-raid window after a failed raid (F15)
  MATCHMAKING_BAND: 5, // target TC must be within ±this of the attacker's
  SCOUT_COST: 50, // Currency to scout a target's defenses
  TOWER_KILL_CAP: 0.25, // max fraction of attackers towers kill pre-battle
  WALL_DR_CAP: 0.45, // (reference) max wall damage reduction
  JITTER: 0.1, // ±10% randomness on the power ratio
  STONE_PER_WALL_HP: 0.25, // /repair cost: 1 Stone restores 4 HP
  VAULT_FLOOR_PER_LEVEL: 2000, // flat per-resource amount the vault protects per Keep-line level
};

/** Fraction of attacking units killed before the clash by defender towers. */
export function towerKillPct(level: number): number {
  return level > 0 ? Math.min(PVP.TOWER_KILL_CAP, 0.02 * level) : 0;
}

/** Fraction of each resource the Castle/Keep vault protects from raids. */
export function vaultPct(level: number): number {
  return level > 0 ? Math.min(0.55, 0.15 + 0.0285 * (level - 1)) : 0;
}

/** Flat per-resource amount the vault protects regardless of percentage. */
export function vaultFloor(level: number): number {
  return level > 0 ? level * PVP.VAULT_FLOOR_PER_LEVEL : 0;
}

/** Attacker raid-cooldown reduction from the Naval line (max 40%). */
export function navalCooldownReduction(level: number): number {
  return Math.min(0.4, 0.02 * level);
}

// ── Phase 5: community-economy integrations (off by default) ─────────────────
// Enabled per-flag via env vars; see docs/ISLANDER_DESIGN.md §10.

export const INTEGRATIONS = {
  POINTS_PER_CURRENCY: 10, // 1 community Point → this much island Currency
  EXCHANGE_DAILY_POINT_CAP: 100, // max Points a player may convert per day
};

export interface Milestone {
  key: string;
  type: "tc" | "raidwins";
  threshold: number;
  points: number; // one-way community Points award
  label: string;
}

// One-way Point rewards for Islander achievements. Modest by design so they
// don't inflate the community economy.
export const MILESTONES: Milestone[] = [
  { key: "tc5", type: "tc", threshold: 5, points: 25, label: "Reached Town Center level 5" },
  { key: "tc10", type: "tc", threshold: 10, points: 75, label: "Reached Town Center level 10" },
  { key: "tc20", type: "tc", threshold: 20, points: 200, label: "Reached Town Center level 20" },
  { key: "raid1", type: "raidwins", threshold: 1, points: 40, label: "Won your first raid" },
  { key: "raid10", type: "raidwins", threshold: 10, points: 150, label: "Won 10 raids" },
  { key: "raid50", type: "raidwins", threshold: 50, points: 500, label: "Won 50 raids" },
];
