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

### 3.1 Deferred resources (later phases)
Two "maybe" resources from the brainstorm are intentionally **out of v1** but the
schema leaves room for them (add columns to `i_Island` + new `produce`/`boost`
building rows — no structural change):
- **Research** — accumulated at the **Knowledge** line; spent to unlock new
  ship/raider unit types and special abilities. Turns Knowledge from a pure
  build-time discount into a tech tree.
- **Faith** — produced by a deferred **Temple** line; candidate uses include a
  defensive blessing (temporary shield) or a production buff. Kept vague until a
  phase actually needs it.

### 3.2 Production model
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

The catalogue is complete below: each line has three named forms (Tier 1 / 2 / 3)
swapping in across the level bands. `Function` is the data hook in
`i_BuildingLevel.Function`; `Effect` is what `FunctAttribute` scales. The
brainstorm only named two forms for several lines (and just one for the
Warehouse) — the **bold-italic** names are this design's additions to give every
line a full three-tier progression. Per-level numbers live in
[`ISLANDER_BALANCE.md`](./ISLANDER_BALANCE.md).

| Category | Function | Effect (what scales) | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|---|---|
| **Town Center** | `gate` | Caps all other buildings' level; +base storage | Campfire | Town Centre | Palace |
| **Housing** | `store` | Population capacity (Food → pop) | Tents | Houses | Villas |
| **Food** | `produce` | Food / hour | Farm | Farm Estate | ***Plantation*** |
| **Wood** | `produce` | Wood / hour | Woodcutter | Logging Camp | ***Sawmill*** |
| **Stone** | `produce` | Stone / hour | Mine | Quarry | ***Stoneworks*** |
| **Trade** | `trade` | Currency / hour + exchange volume | Trader | Marketplace | ***Grand Bazaar*** |
| **Warehouse** | `store` | Storage cap for all resources (idle window) | Warehouse | ***Storehouse*** | ***Grand Depot*** |
| **Smithing** | `boost` | +% army Attack & HP; unlocks units | Smelter | Blacksmith | ***Foundry*** |
| **Army** | `train` | Land-unit cap; training | Army Camp | Barracks | Army Base |
| **Naval** | `train` | Ship cap; enables/extends raids; cooldown cut | Dock | Harbour | Port |
| **Knowledge** | `boost` | −% build time; (Research unlocks later) | Academy | University | ***Grand Library*** |
| **Walls** | `defend` | Wall HP + incoming damage reduction | Palisade Walls | Stone Walls | Reinforced Walls |
| **Towers** | `defend` | Pre-battle % of attackers killed | Watch Tower | Guard Tower | Bombard Tower |
| **Keep** | `vault` | % + flat resources protected from raids | Castle | Keep | ***Citadel*** |

Notes on specific lines:
- **Town Center** is the master gate (full detail in §4.1). No building may exceed
  the TC's level.
- **Trade** answers the brainstorm's open *"how is Currency generated?"* —
  Currency is produced (slowly) here and is the main raiding reward. The
  Marketplace+ tiers also enable a capped **resource exchange** (§4.5).
- **Knowledge** reduces build times globally; it is also the future home of the
  deferred **Research** resource (unlocking ship/raider types) — see §3.1.
- **Keep** line is a **late-unlock** defensive line (Castle first appears at a
  high TC, per balance) and doubles as the **vault** (§6.4). The brainstorm named
  only Castle → Keep; *Citadel* is added as the Tier-3 form.

### 4.3 Upgrade mechanics
- Each `(building, level)` defines: resource costs, build **Time**, the required
  **TC level**, a `Function` hook (`gate`, `produce`, `store`, `trade`, `boost`,
  `train`, `defend`, `vault` — see the §4.2 catalogue) and a `FunctAttribute`
  (the magnitude — rate, cap, HP, %, etc.). This mirrors the
  original `i_BuildingLevel` columns and keeps building behaviour **data-driven**
  rather than hard-coded.
- Only **one upgrade in progress at a time** in v1 (the `upgrading` flag from the
  original `i_Building_Island`). The Knowledge line can reduce build times. A
  second build queue slot is a candidate upgrade later.
- Players may **rush** a build with Currency (instant finish).

### 4.4 Deferred buildings (later phases)
These appear in the brainstorm with a `?` and are **not** part of v1, but the
data-driven schema accommodates them with no structural change:
- **Temple line** → produces the deferred **Faith** resource.
- **Research building** → folded into the **Knowledge** line above (Academy/
  University/Grand Library) when Research is enabled.

### 4.5 Resource exchange (Trade line)
Once a Marketplace (Trade Tier 2) is built, players may convert one resource into
another at an unfavourable ratio, with a per-day volume cap that scales with the
building level. This is a pressure valve for lopsided stockpiles — never a
free-money pump. Exact ratio and cap live in the balance doc (§7 there).

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

> **v1 implementation note:** training is **instant** — gated by resources, free
> population, and the Army/Naval building capacity, but not yet time-gated. The
> per-unit `trainTime` in the balance doc is reserved for a future timed-training
> queue. Trained units occupy population (they keep eating Food via upkeep), so a
> bigger army needs more Housing + Farms — that's the upkeep tension.

### Launch roster
Small and data-driven; new units (and the Research gate) come later. Stats live
in [`ISLANDER_BALANCE.md`](./ISLANDER_BALANCE.md) §8.

| Unit | Type | Role | Trained at | Notes |
|---|---|---|---|---|
| **Raider** | Land | Glass-cannon looter — high loot, low HP | Army Camp | The offensive workhorse; dies fast on defense. |
| **Soldier** | Land | Cheap HP wall — high HP, low loot | Army Camp | The backbone of a garrison. |
| **Champion** | Land | Elite all-rounder | Barracks (Army Tier 2) | TC/Barracks-gated; strong attack *and* HP. |
| **Longboat** | Naval | Loot hauler / raid enabler | Dock | Required to reach a target; carries the bulk of loot home. |
| **War Galley** | Naval | Heavy naval power + huge loot | Harbour (Naval Tier 2) | Late-game loot capacity and ship combat. |

Design intent: without ships even a *won* raid carries little loot back, so the
Naval line gates meaningful raiding; Raiders maximise theft but bleed on defense,
pushing players to keep a separate Soldier garrison. Future unit types
(e.g. Research-gated specialists) slot in as new `i_Unit` rows.

---

## 6. PvP Raiding (core competitive loop)

### 6.1 Initiating a raid
Open the target's island with `/island @member` and press **Raid ⚔️**. The
raider commits their **entire army** (all land + naval units). Validations:
- Attacker has units **and at least one ship** (Naval ≥ 1) to reach the island.
- Target is **not under a protection shield** (§6.3) and not a new player
  (TC ≥ 5).
- Attacker is **not on raid cooldown**, and hasn't raided this target in the
  last 24h (repeat-target guard).
- **Matchmaking guardrail:** target's TC level must be within ±5 of the
  attacker's. **Scout 🔭** reveals an
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
| `/island [@member]` | Render your island (or view another's) — image + status embed + action buttons. **This is the single entry point**: building, upgrading, rushing and training are all done via its buttons/menus, not separate commands. |
| Raid / Scout | **Buttons on another member's `/island`** — Raid ⚔️ launches a raid, Scout 🔭 pays Currency for a defense estimate. |
| Repair | **Button on your own `/island`** (enabled when walls are damaged) — spend Stone to restore wall HP. |
| Leaderboard | **Button on `/island`** — top islands by power score (10·TC + 3·Σ building levels + army/10). |
| How to play | **Button on `/island`** — in-client tutorial embed. |

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

### 7.3 Notifications ✅
- **"You were raided" DM** fires at raid-resolution time (a real push) to the
  defender, with a win/loss + loot summary.
- **Build-complete DM** is best-effort via an in-memory timer scheduled when a
  build starts (lost on bot restart; the build itself still completes lazily on
  the next `/island` view regardless).
- Both respect the member's `NotifyLevel` bitfield (`modules/NotificationLevels.ts`)
  — they only DM members who have opted into the `EventNotification` flag, so
  notifications are **opt-in**.
- An optional dedicated island-updates channel can reuse
  `islander/ChannelUpdates.ts` (currently a generic helper — see §11).

### 7.4 Island rendering & art assets
**Current state (Phase 0–2):** `islander/IslanderImage.ts` renders a fully
**procedural placeholder** — a gradient sea, two ellipses for the landmass, and a
labelled box per building positioned at its catalogue `posX/posY`. No external
image files are loaded; `i_BuildingLevel.imagename` is stored but unused.

**Target (see Phase 6):** replace the placeholder with a proper composited
island built from **[Kenney.nl](https://kenney.nl) assets**, which are **CC0
(public domain)** — free for commercial use, no attribution required (we'll
credit Kenney anyway). The data layer already supports this: each building line
carries an `imagename` and `posX/posY`, so the switch is mostly an asset drop +
`Canvas.loadImage` calls, with a graceful fallback to the current markers when a
sprite is missing.

**Primary kit — Kenney "Hexagon Kit":** pre-rendered isometric hex tiles
(grass, sand, water, stone, dirt, plus building/decoration pieces). The island
becomes a small **hex grid** instead of arbitrary x/y points:
- Lay a base map of water → beach → grass hex tiles for the island shape.
- Each building occupies a hex; its tile/sprite is chosen by `imagename`
  (and ideally by tier, e.g. `farm`, `farm_estate`, `plantation`).
- `posX/posY` (or new axial `q/r` hex coords) place each building on the grid;
  isometric draw order is back-to-front so tiles overlap correctly.

**Supporting kits (also CC0):**
- **Pirate Kit / Pirate Pack** — ships for the Naval line (Dock/Harbour/Port)
  and raid/battle imagery, palm trees, barrels, flags.
- **Nature Kit / Foliage** — trees, rocks for the Wood/Stone lines and ambient
  decoration.
- **Tower Defense (top-down)** or **Medieval RTS** — towers, walls, and military
  buildings if the hex building pieces aren't enough.

**Implementation notes:**
- Vendor the chosen PNGs under `assets/islander/` (kit + version recorded in a
  `CREDITS`/README there), and load them through a small cache (`Canvas.loadImage`
  results memoised once, like the definition cache) so we don't re-read files per
  render.
- Add an `imagename → file` (and tier → file) resolver; unknown names fall back
  to the labelled-box marker so a half-arted catalogue still renders.
- Keep the renderer output at a fixed size and draw a header/resource banner over
  the composed scene (as today). Battle reports (Phase 3) can reuse the same
  compositor for an attacker-vs-defender image.
- Hex math: store a per-building hex coordinate in the catalogue (replacing the
  flat `posX/posY`) and convert to pixel space with the standard isometric hex
  projection; precompute the island's tile layout from a simple shape template.

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
- Concrete seed numbers (production rates, costs, build times, unit stats, PvP
  levers) live in the companion **[`ISLANDER_BALANCE.md`](./ISLANDER_BALANCE.md)**,
  kept out of this design doc so tuning churn doesn't pollute the spec.

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
  Function       String? @default("none") @db.VarChar(25)  // gate|produce|store|trade|boost|train|defend|vault
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

> **Implemented (Phase 0):** the live schema is in `prisma/schema.prisma` with
> migration `prisma/migrations/20260604000000_add_islander_game`. It extends the
> sketch above with a few practical columns: `i_Island.Population` / `CreatedAt`,
> `i_BuildingLevel.Currency` (Currency build costs), `i_Building_Island.wallHP`,
> and per-unit cost/stat columns on `i_Unit` (`Wood`/`Food`/`Currency`/`Pop`/
> `Attack`/`HP`/`Loot`/`TrainTime`).

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
| **0 — Foundations** ✅ | Schema + migration, building/unit seed data (`islander/data/balance.ts` + `IslanderSeed`), `IslanderModule` with lazy resource ticks, `/island` (image + embed + Refresh button). | **Implemented.** Players have an island and watch resources grow. |
| **1 — Build loop** ✅ | Build/Upgrade/Rush driven entirely by `/island` buttons + select menus (no standalone commands), Warehouse caps, TC gating, build timers, one-build-at-a-time, Currency rush, Knowledge build-time reduction. | **Implemented.** Full single-player progression. |
| **2 — Army** ✅ | Train button → unit select → quantity modal; unit unlock gates (Army/Naval level), land/naval caps, free-population cost, Smithing attack/HP bonus, Naval ship cap, Food-upkeep tension; army summary on the island embed. (Instant training; timed queue deferred.) | **Implemented.** Players field an army. |
| **3 — PvP** ✅ | `CombatModule`; Raid/Scout buttons on others' islands + Repair button on your own; tower pre-kill, wall HP + damage, Castle/Keep vault, loot caps, new-player/post-raid shields, attacker cooldown (Naval-reduced), repeat-target + matchmaking-band guards, `i_Raid` log, battle-report embed. (Battle *image* deferred to Phase 6.) | **Implemented.** The competitive core loop is live. |
| **4 — Polish & social** ✅ | Leaderboard button (power-score ranking), How-to-play tutorial button, raid + best-effort build-complete notifications (opt-in via `NotifyLevel`). Balance remains a data-only tuning activity in `ISLANDER_BALANCE.md`. | **Implemented.** Tuned, discoverable, retention features. |
| **5 — Integrations (optional)** | Points/achievement hooks (§10), cosmetics. | Ties Islander into the wider community economy. |
| **6 — Visual art pass** | Replace the procedural placeholder with composited art from **Kenney.nl** CC0 kits — Hexagon Kit for the island/terrain/building tiles, Pirate & Nature kits for ships/decor (§7.4). Vendor assets under `assets/islander/`, add an `imagename`(+tier)→sprite resolver with marker fallback, a hex-grid layout, and an image cache; reuse the compositor for battle reports. | A real, attractive island image (and battle scenes) instead of labelled boxes. |

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
