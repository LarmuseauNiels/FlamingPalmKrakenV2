# Islander — Game Design Document

> **Status:** Draft / proposed feature
> **Owner:** FlamingPalm community team
> **Last updated:** 2026-06-04

Islander is a **Discord-native island-building game** for the FlamingPalm
community, played through the FlamingPalmKrakenV2 bot. Each member owns a single
persistent island, gathers resources over time, constructs and upgrades
buildings, trains an army, and **raids other members' islands** for loot —
while defending their own with walls, towers and a garrison.

This document is the source of truth for the game's mechanics and its technical
shape inside this codebase. It supersedes the original brainstorm notes
(`FPG_discord_island_builder.docx`) and the abandoned `i_*` Prisma models that
were removed in commit `88417ca`.

---

## 1. Design Goals & Pillars

1. **Idle-friendly.** Resources accumulate over real time so players can "play"
   in short daily bursts. Warehouses cap how long you can idle before
   production stalls — a gentle nudge to log back in.
2. **Build → Power → Raid → Defend loop.** Every system feeds the core loop:
   gather → build/upgrade → train army → raid rivals → defend & repair.
3. **Discord-first UX.** No external client. Everything is a slash command, a
   rendered island image, and a row of buttons.
4. **Community-flavoured PvP.** Raiding is competitive but bounded by
   protection windows, cooldowns and loot caps so it never becomes pure
   bullying or a runaway snowball.
5. **Self-contained economy (for now).** Islander's resources are **separate**
   from the community Points/Rewards system. Integration hooks are designed in
   from day one (see §10) but disabled at launch.

### Non-goals (v1)
- No real-money or Points spending into the game.
- No alliances/clans (candidate for a later phase).
- No live combat animation — combat resolves instantly and is reported as an
  embed + image.

---

## 2. Core Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Economy | **Self-contained**, Points integration deferred | Protect the existing shop economy; revisit once balanced. |
| PvP | **Full player-vs-player raiding** | Gives walls/towers/army purpose; drives engagement. |
| Interface | **Slash commands + generated image + action buttons** | Matches existing bot patterns (profile image tech) and feels modern. |
| Time model | **Tick-based accrual** (lazy evaluation) | Cheap; no per-second cron. Resources computed on read from `lastTick`. |
| One island per member | Yes, keyed by Discord user ID | Mirrors the original `i_Island.ID = Members.ID` design. |

---

## 3. Resources

Five core resources (carried over from the brainstorm). Two "maybe" resources
(Research, Faith) are deferred to a later phase.

| Resource | Symbol | Produced by | Spent on | Raidable? |
|---|---|---|---|---|
| **Wood** | 🪵 | Woodcutter line | Boats, buildings, upgrades | Yes |
| **Stone** | 🪨 | Mine line | Buildings, walls, repairs | Yes |
| **Food** | 🍖 | Farm line | Population growth & upkeep | Yes |
| **Currency** | 🪙 | Trade buildings + raiding | Trading, instant-finish, rush upgrades | Yes |
| **Manpower / Population** | 👥 | Housing (food → pop) | Garrison, raiders, manning buildings | **No** (population isn't stolen; it can be *killed* in combat) |

**Deferred:** `Research` (unlock ships/raider types), `Faith` (temple line). The
schema reserves room for these without requiring them at launch.

### Production model
- Each production building has a `ratePerHour` at its current level.
- Resources are **accrued lazily**: on any read/write we compute
  `gained = ratePerHour * hoursSince(lastTick)`, clamp to storage capacity, then
  update `lastTick`. No background job needed for accrual.
- **Storage cap** comes from the Warehouse (+ a small base cap from the Town
  Center). Production halts when a resource is at cap — this is the idle limit.
- **Food upkeep:** population consumes food per hour. If food hits 0, population
  slowly starves (decays) until balanced. This keeps Housing/Farm in tension.

---

## 4. Buildings

Buildings progress through **3 named tiers** (the doc's "Tier 1–10 / 10–20 /
20–30" columns), each tier internally having multiple upgrade levels. The named
tiers are cosmetic/identity milestones; the numeric `level` drives stats.

### 4.1 Town Center (island level gate)
The Town Center (TC) is the heart of the island. Its level **gates** the maximum
level of every other building (`TClevel` requirement, carried from the original
`i_BuildingLevel.TClevel`). You raise your whole island by upgrading the TC.

| Tier 1–10 | Tier 10–20 | Tier 20–30 |
|---|---|---|
| Campfire | Town Centre | Palace |

### 4.2 Building catalogue

| Category | Function | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|---|
| **Housing** | Converts Food → Population capacity | Tents | Houses | Villas |
| **Food** | Food production | Farm | Farm Estate | *(TBD)* |
| **Wood** | Wood production | Woodcutter | Logging Camp | *(TBD)* |
| **Stone** | Stone production | Mine | Quarry | *(TBD)* |
| **Smithing** | Boosts army attack / unlocks units | Smelter | Blacksmith | *(TBD)* |
| **Army** | Trains & houses land units | Army Camp | Barracks | Army Base |
| **Walls** | Defensive HP / damage reduction | Palisade Walls | Stone Walls | Reinforced Walls |
| **Towers** | Auto-damage to attackers | Watch Tower | Guard Tower | Bombard Tower |
| **Naval** | Builds ships; enables sea raids/range | Dock | Harbour | Port |
| **Knowledge** | Speeds builds / unlocks (Research later) | Academy | University | *(TBD)* |
| **Trade** | Generates Currency; resource exchange | Trader | Marketplace | *(TBD)* |
| **Defense keep** | High-HP last-stand building, loot vault | Castle | Keep | *(TBD)* |
| **Warehouse** | Increases storage capacity (idle window) | Warehouse | *(TBD)* | *(TBD)* |

> **Vault note (from brainstorm):** the Castle/Keep line doubles as a **vault**
> that protects a limited amount of resources from being raided (see §6.4).

### 4.3 Upgrade mechanics
- Each `(building, level)` defines: resource costs, build **Time**, the required
  **TC level**, a `Function` hook (e.g. `produce`, `store`, `defend`, `train`)
  and a `FunctAttribute` (the magnitude — rate, cap, HP, etc.). This mirrors the
  original `i_BuildingLevel` columns and keeps building behaviour **data-driven**
  rather than hard-coded.
- Only **one upgrade in progress at a time** in v1 (the `upgrading` flag from the
  original `i_Building_Island`). The Knowledge line can reduce build times. A
  second build queue slot is a candidate upgrade later.
- Players may **rush** a build with Currency (instant finish).

---

## 5. Units & Army

| Field | Purpose |
|---|---|
| `Type` | Land / Naval / Defensive (carried from original `i_Unit.Type`) |
| Cost | Food + Currency + Population to train |
| Stats | Attack, HP, loot capacity, upkeep |

- Units are trained at the **Army** (land) or **Naval** (ships) buildings, capped
  by building level and available Population.
- **Loot capacity** determines how much a successful raid can carry home.
- Training consumes Population; losing units in combat frees that Population back
  into the pool over time (re-recruitable), but the killed units themselves are
  gone.

Launch unit set (small, expandable via data):
- **Land:** Raider (cheap, low loot), Soldier (defender), Champion (TC-gated elite).
- **Naval:** Longboat (enables raiding members flagged as "across the water" /
  extends range), later tiers via Research.

---

## 6. PvP Raiding (core competitive loop)

### 6.1 Initiating a raid
`/raid @member` (or via the target's island image button). Validations:
- Attacker has idle (not-defending, not-traveling) units.
- Target is **not under a protection shield** (§6.3).
- Attacker is **not on raid cooldown**.
- Optional **matchmaking guardrail:** target's TC level must be within a band of
  the attacker's (e.g. ±N) to prevent stomping newbies. `/scout` reveals an
  estimate of a target's defenses for a small Currency cost.

### 6.2 Combat resolution (instant, server-side)
1. Compute attacker power = Σ(unit attack × count) × smithing multiplier.
2. Compute defender power = Σ(garrison defense) + wall HP mitigation + tower
   auto-damage (towers remove a % of attacking units before the clash).
3. Resolve in a single deterministic-with-jitter pass; produce casualties on
   both sides proportional to the power gap.
4. If attacker wins, loot = min(loot capacity of surviving raiders, raidable
   resources above the vault floor) — capped by a **loot percentage** so a raid
   never fully empties a target.
5. Walls take damage and must be **repaired with Stone** afterward (brainstorm:
   "repairing defences after raid").

All outcomes are written to a **raid log** and reported as an embed + a
post-battle image (attacker/defender losses, loot taken).

### 6.3 Protection & anti-grief
- **New-player shield:** islands below a TC threshold can't be raided.
- **Post-raid shield:** after being successfully raided, a target gets a
  timed protection window so they can recover and log back in.
- **Raid cooldown:** an attacker can't chain raids; cooldown scales down with
  Naval/Army upgrades.
- **Repeat-target limit:** you can't raid the same player again until a cooldown
  passes, preventing farming one victim.

### 6.4 The Vault (Castle/Keep)
A portion of resources (scaling with Castle/Keep level) is **unraidable** — it
sits in the vault. This guarantees that active-but-unlucky players never lose
*everything*, and gives the defense line a clear economic value.

---

## 7. Player Interaction & UX

Per the locked decision, Islander uses **both** slash commands *and* an
interactive image-with-buttons surface.

### 7.1 Slash commands
| Command | Description |
|---|---|
| `/island [@member]` | Render your island (or view another's) — image + status embed + action buttons. |
| `/build <building>` | Start constructing a new building. |
| `/upgrade <building>` | Upgrade an existing building (or via button). |
| `/train <unit> <count>` | Train army/naval units. |
| `/raid @member` | Launch a raid. |
| `/scout @member` | Pay Currency to estimate a target's defenses. |
| `/repair` | Spend Stone to repair walls after a raid. |
| `/collect` | Force a resource tick / claim (mostly cosmetic, since accrual is lazy). |
| `/island-leaderboard` | Top islands by a power score (TC level + buildings + army). |
| `/island-help` | Tutorial / command reference. |

All long operations **`deferReply`** first (Discord's 3s rule, per `CLAUDE.md`).

### 7.2 Interactive surface
`/island` renders:
- A **generated PNG** of the island via `@napi-rs/canvas`, drawing each built
  building at its `imagePosX/Y` using `imagename` sprites (this is exactly what
  the original `i_BuildingLevel.imagename / imagePosX / imagePosY` columns were
  for, and reuses the same canvas tech as `AchievementsModule` profile images).
- A **status embed**: resource bars (current/cap), population, army summary,
  active build timer, shield/cooldown status.
- **Action buttons / select menus**: Build, Upgrade, Train, Raid, Repair,
  Refresh. Button `customId`s are namespaced `islander:<action>:<arg>` and routed
  by the existing button-handler pattern (`name` === customId prefix).

### 7.3 Notifications
- Build-complete and "you were raided" pings respect the member's existing
  `NotifyLevel` preference (`modules/NotificationLevels.ts`).
- An optional dedicated island-updates channel can reuse
  `islander/ChannelUpdates.ts` (currently a generic helper — see §11).

---

## 8. Game Balance & Tuning

All balance lives in **data** (the `*_Level` tables), never in code, so tuning is
a DB edit + cache refresh — no redeploy.

- **Costs/time** grow roughly geometrically per level; the Knowledge line and
  Currency rushing provide pressure valves.
- **Loot %** and **vault floor** are the primary PvP balance levers.
- **Protection windows** and **TC matchmaking band** are the primary anti-grief
  levers.
- A simple **power score** (used for leaderboard + matchmaking) =
  `w1·TClevel + w2·Σ(buildingLevels) + w3·armyValue`.
- Seed numbers belong in a companion `ISLANDER_BALANCE.md` (follow-up), kept out
  of this design doc so tuning churn doesn't pollute the spec.

---

## 9. Technical Design

Islander follows the codebase's established patterns: **static module classes**
for logic, **`IHandler` files** for commands/buttons, the **global Prisma
client**, and the **custom logger**. See `CLAUDE.md` for the conventions.

### 9.1 Module layout
```
islander/
├── ChannelUpdates.ts        # existing helper (see §11)
├── IslanderModule.ts        # core: island CRUD, resource ticks, build/upgrade
├── CombatModule.ts          # raid resolution, loot, casualties, raid log
├── IslanderImage.ts         # @napi-rs/canvas island renderer
├── IslanderEmbeds.ts        # status / battle-report embed builders
└── data/                    # (optional) seed definitions if not DB-seeded
interactionHandlers/commands/
├── island.ts, build.ts, upgrade.ts, train.ts, raid.ts, scout.ts, repair.ts ...
interactionHandlers/buttons/
└── islander.ts              # routes islander:<action> button customIds
```
Resource accrual is **lazy** (computed on access in `IslanderModule`), so no new
cron is required. A light hourly cron may handle starvation/shield expiry sweeps
if lazy evaluation proves insufficient (reuse `modules/statistics.ts` cron
style).

### 9.2 Proposed Prisma schema
This refines the removed `i_*` models and adds PvP support (raid log, shields,
cooldowns, timers). Field names follow the original where sensible for an easy
revival path.

```prisma
model i_Island {
  ID            String   @id @db.VarChar(25)        // = Members.ID
  Wood          Int      @default(0) @db.UnsignedInt
  Stone         Int      @default(0) @db.UnsignedInt
  Currency      Int      @default(0) @db.UnsignedInt
  Food          Int      @default(0) @db.UnsignedInt
  Manpower      Int      @default(0) @db.UnsignedInt
  Population    Int      @default(0) @db.UnsignedInt // trained + idle pop
  LastTick      DateTime @default(now())            // for lazy accrual
  ShieldUntil   DateTime?                            // PvP protection window
  RaidCooldown  DateTime?                            // attacker cooldown
  Members       Members            @relation(fields: [ID], references: [ID], onUpdate: Restrict)
  Buildings     i_Building_Island[]
  Units         i_Unit_Island[]
  RaidsSent     i_Raid[]           @relation("Attacker")
  RaidsRecv     i_Raid[]           @relation("Defender")
}

model i_Building {
  ID     Int               @id @default(autoincrement())
  Name   String?           @db.VarChar(255)
  Levels i_BuildingLevel[]
  Built  i_Building_Island[]
}

model i_BuildingLevel {
  BuildingID     Int
  Level          Int     @db.UnsignedTinyInt
  Name           String  @db.VarChar(255)   // tier name e.g. "Logging Camp"
  Wood           Int     @default(0) @db.UnsignedMediumInt
  Food           Int     @default(0) @db.UnsignedMediumInt
  Stone          Int     @default(0) @db.UnsignedMediumInt
  Time           Int     @default(0) @db.UnsignedMediumInt  // build seconds
  TClevel        Int?    @default(0) @db.UnsignedTinyInt    // TC gate
  imagename      String  @default("") @db.VarChar(255)
  imagePosX      Int     @default(0) @db.MediumInt
  imagePosY      Int     @default(0) @db.MediumInt
  Function       String? @default("none") @db.VarChar(25)  // produce|store|defend|train|trade
  FunctAttribute Int?    @default(0)                        // rate|cap|HP|...
  i_Building     i_Building @relation(fields: [BuildingID], references: [ID], onDelete: Cascade)
  Built          i_Building_Island[]
  @@id([BuildingID, Level])
}

model i_Building_Island {
  BuildingID   Int
  IslandID     String    @db.VarChar(25)
  level        Int       @default(1) @db.UnsignedTinyInt
  upgrading    Int?                          // target level while building
  upgradeReady DateTime?                      // when current build completes
  wallHP       Int?      @default(0)          // for wall/tower lines
  i_BuildingLevel i_BuildingLevel @relation(fields: [level, BuildingID], references: [Level, BuildingID])
  i_Island        i_Island        @relation(fields: [IslandID], references: [ID], onDelete: Cascade)
  i_Building      i_Building      @relation(fields: [BuildingID], references: [ID])
  @@id([BuildingID, IslandID])
}

model i_Unit {
  ID     Int     @id @default(autoincrement()) @db.UnsignedInt
  Name   String  @db.VarChar(255)
  Type   Int     @db.UnsignedTinyInt   // 0=land,1=naval,2=defense
  Attack Int     @default(0)
  HP     Int     @default(0)
  Loot   Int     @default(0)           // carry capacity
  Islands i_Unit_Island[]
}

model i_Unit_Island {
  IslandID String   @db.VarChar(25)
  UnitID   Int      @db.UnsignedInt
  count    Int      @db.UnsignedSmallInt
  i_Unit   i_Unit   @relation(fields: [UnitID], references: [ID], onDelete: Cascade)
  i_Island i_Island @relation(fields: [IslandID], references: [ID], onDelete: Cascade)
  @@id([IslandID, UnitID])
}

model i_Raid {
  ID          Int      @id @default(autoincrement())
  AttackerID  String   @db.VarChar(25)
  DefenderID  String   @db.VarChar(25)
  TimeStamp   DateTime @default(now())
  AttackerWon Boolean
  LootWood    Int      @default(0)
  LootStone   Int      @default(0)
  LootFood    Int      @default(0)
  LootCurrency Int     @default(0)
  Report      String   @db.Text     // serialized casualty/loot detail (JSON)
  Attacker    i_Island @relation("Attacker", fields: [AttackerID], references: [ID])
  Defender    i_Island @relation("Defender", fields: [DefenderID], references: [ID])
  @@index([AttackerID]) @@index([DefenderID]) @@index([TimeStamp])
}
```
Add `i_Island i_Island?` back to the `Members` model (the exact relation removed
in `88417ca`). Run `npx prisma generate` + a migration after applying.

### 9.3 Caching
- Building/Unit/Level definitions are static-ish → load once into an in-memory
  cache on `clientReady`, invalidated by an admin `/island-reload` command.
- Per-island state is read live from Prisma (with lazy tick on read).

---

## 10. Future Points / Economy Integration (designed, off at launch)

Hooks to add later **without schema churn**:
1. **Achievement milestones:** award existing Achievements/Points (one-way) for
   reaching TC tiers, winning N raids, etc. Uses `AchievementsModule`.
2. **Points → Currency exchange:** a rate-limited, capped conversion so the
   community economy can feed the game without unbalancing it. Gated behind a
   config flag.
3. **Shop crossover:** cosmetic island skins purchasable with Points via the
   existing Reward shop.

Each is additive and feature-flagged; none are required for v1.

---

## 11. Cleanup / Tech Debt Notes

- `islander/ChannelUpdates.ts` is **not** island-game code today — it's a generic
  helper that posts profile/raid-event messages to an update channel. It only
  lives under `islander/` historically. Either (a) keep it and let Islander reuse
  it for island update broadcasts, or (b) move it to `modules/` and treat
  `islander/` as purely the new game. **Recommendation:** keep it, extend it.
- `CLAUDE.md` still lists `i_Island / i_Building / i_Unit` and describes
  `islander/` as "Island game mechanics module" — that documentation is stale
  until this feature lands. Update it as part of implementation.

---

## 12. Phased Delivery Plan

| Phase | Scope | Outcome |
|---|---|---|
| **0 — Foundations** | Schema + migration, building/unit seed data, `IslanderModule` with lazy resource ticks, `/island` (image + embed). | Players have an island and watch resources grow. |
| **1 — Build loop** | `/build`, `/upgrade`, Warehouse caps, TC gating, build timers, Currency rush, action buttons. | Full single-player progression. |
| **2 — Army** | `/train`, unit data, Smithing/Naval effects, population/upkeep tension. | Players field an army. |
| **3 — PvP** | `CombatModule`, `/raid`, `/scout`, `/repair`, shields, cooldowns, loot caps, vault, raid log, battle report image. | The competitive core loop is live. |
| **4 — Polish & social** | Leaderboard, notifications, tutorial, balance pass via `ISLANDER_BALANCE.md`. | Tuned, discoverable, retention features. |
| **5 — Integrations (optional)** | Points/achievement hooks (§10), cosmetics. | Ties Islander into the wider community economy. |

---

## Appendix A — Source Material

- **Original brainstorm:** `FPG_discord_island_builder.docx` (resources,
  buildings, 3-tier progression table). Open items in the doc (`?` Research,
  `?` Faith, `?` Temple, vault, "currency generation unclear") are resolved or
  deferred above.
- **Abandoned implementation:** the `i_*` Prisma models removed in `88417ca`
  ("refactor: remove unused models from schema.prisma"). §9.2 revives and extends
  them. There was never any game *logic* committed — only the schema.
- **Reusable tech in-repo:** `@napi-rs/canvas` image generation
  (`AchievementsModule` / `modules/profile.js`), the `IHandler` command/button
  pattern, the global Prisma client, cron style in `modules/statistics.ts`, and
  `modules/NotificationLevels.ts`.
