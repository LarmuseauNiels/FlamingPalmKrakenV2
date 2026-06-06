# Islander — Balance & Tuning

> **Status:** Draft seed values (v1)
> **Companion to:** `ISLANDER_DESIGN.md`
> **Last updated:** 2026-06-04

This document holds the **concrete numbers** for Islander: production rates,
costs, build times, unit stats, and the PvP levers. It is deliberately separate
from the design doc so tuning churn doesn't pollute the spec.

**These map directly onto the `i_BuildingLevel`, `i_Unit`, and `i_Island` schema
in `ISLANDER_DESIGN.md` §9.2.** Everything here lives in **data** (DB rows or a
seed file), never hard-coded — tuning is a row edit + `/island-reload`.

All times are in **seconds** (matching `i_BuildingLevel.Time`). All resource
amounts are integers. "h" = per hour.

---

## 1. Global Constants

| Constant | Value | Notes |
|---|---|---|
| `BASE_STORAGE` | 500 | Per-resource cap from a level-1 Town Center, before Warehouse. |
| `TC_STORAGE_PER_LEVEL` | 500 | Extra per-resource cap per Town Center level. |
| `TICK_GRANULARITY` | 60 s | Resolution of lazy accrual (gains computed per-minute). |
| `STARVATION_RATE` | 5 %/h | Population decay per hour when Food = 0. |
| `RUSH_RATE` | 1 Currency per 6 s | Cost to instant-finish a build (`remainingSeconds / 6`). |
| `OFFLINE_CAP_HOURS` | derived | = `storageCap / ratePerHour`; the idle window. |
| `START_WOOD / STONE / FOOD` | 300 each | Starting resources for a fresh island. |
| `START_CURRENCY` | 50 | |
| `START_POPULATION` | 5 | Idle pop available to assign. |

### Cost/time growth curve
Unless a table says otherwise, per-level scaling uses:

```
cost(level)  = round( base * 1.35^(level-1) )
time(level)  = round( baseTime * 1.50^(level-1) )   # capped at TIME_CAP
rate(level)  = round( baseRate * 1.35^(level-1) )
TIME_CAP     = 86400  # 24h — no single upgrade exceeds a day in v1
```

> **Rebalanced 2026-06-05:** cost growth was lowered from `1.55` to **`1.35`** so
> it matches production/storage growth. With all three on the same exponent, the
> storage cap (driven by the Warehouse) always exceeds the priciest single
> upgrade, so **every tier is reachable**, and the time to bank each upgrade is
> roughly constant per level instead of ballooning. The per-level tables below
> were written against the old `1.55` curve and are now **illustrative only** —
> the authoritative numbers are computed in `islander/data/balance.ts`
> (`levelStats`). Re-seed with `/island-reload` after changing them.

`1.35` cost / `1.50` time / `1.35` production was originally the "production grows
slower than cost" curve that keeps later levels meaningful without infinite idle
times.

---

## 2. Town Center (level gate)

The TC gates every other building: a building's level may not exceed the TC
level. Max level v1 = **30**.

| TC Level | Name | Wood | Stone | Food | Time | Unlocks |
|---|---|---|---|---|---|---|
| 1 | Campfire | — | — | — | — | **Starting building** (the only one). Buildable now: **Farm, Woodcutter** |
| 2 | Campfire | 200 | 150 | 100 | 120 | **Mine, Warehouse** |
| 3 | Campfire | 400 | 300 | 200 | 300 | **Tents**, Army Camp, Palisade Walls |
| 5 | Town Centre | 1.2k | 1k | 600 | 1.8k | Smelter, Dock, Watch Tower |
| 8 | Town Centre | 4k | 3.5k | 2k | 7.2k | Trader, Academy |
| 10 | Town Centre | 9k | 8k | 5k | 21.6k | Tier-2 buildings (Houses, Logging Camp, Quarry…) |
| 15 | Town Centre | 30k | 28k | 18k | 50k | Castle, Barracks, Harbour, Guard Tower |
| 20 | Palace | 90k | 85k | 55k | 86.4k | Tier-3 buildings (Villas, Army Base, Port…) |
| 25 | Palace | 200k | 190k | 120k | 86.4k | Keep, Bombard Tower |
| 30 | Palace | 450k | 430k | 280k | 86.4k | Max island |

> TC also adds a flat **+250 storage per level** to every resource on top of the
> Warehouse.

---

## 3. Production Buildings

Each line below lists Tier-1 base stats; higher tiers use the growth curve and
the named tier swaps in at the level shown. `Function` / `FunctAttribute` columns
show what the building's data row drives.

### 3.1 Food — Farm → Farm Estate → Plantation
| Level | Name | Wood | Stone | Food/h | Time | TC req |
|---|---|---|---|---|---|---|
| 1 | Farm | 50 | 30 | 60 | 30 | 1 |
| 5 | Farm | 470 | 280 | 200 | 760 | 5 |
| 10 | Farm Estate | 4.3k | 2.6k | 900 | 21.6k | 10 |
| 20 | Plantation | 80k | 48k | 12.5k | 86.4k | 20 |

`Function = produce`, `FunctAttribute = Food/h`.

### 3.2 Wood — Woodcutter → Logging Camp → Sawmill
| Level | Name | Wood | Stone | Wood/h | Time | TC req |
|---|---|---|---|---|---|---|
| 1 | Woodcutter | 40 | 20 | 55 | 30 | 1 |
| 5 | Woodcutter | 370 | 185 | 185 | 760 | 5 |
| 10 | Logging Camp | 3.5k | 1.7k | 830 | 21.6k | 10 |
| 20 | Sawmill | 65k | 32k | 11.5k | 86.4k | 20 |

### 3.3 Stone — Mine → Quarry → Stoneworks
Same base as Wood (Mine produces Stone/h). Stone is slightly scarcer in demand
(walls/repairs), so keep rates equal to Wood and let wall costs create the
tension.

### 3.4 Currency — Trader → Marketplace → Grand Bazaar
| Level | Name | Wood | Stone | Currency/h | Time | TC req |
|---|---|---|---|---|---|---|
| 1 | Trader | 120 | 100 | 20 | 600 | 8 |
| 10 | Marketplace | 6k | 5k | 220 | 21.6k | 10 |
| 20 | Grand Bazaar | 95k | 80k | 2.8k | 86.4k | 20 |

Currency is intentionally the **slowest** resource and the main raiding reward —
this is the answer to the brainstorm's "not sure how currency is generated."
Marketplace also enables a **resource exchange** (see §7).

---

## 4. Storage & Housing

### 4.1 Warehouse — Warehouse → Storehouse → Grand Depot (storage cap)
`Function = store`, `FunctAttribute = capacity added per resource`.

| Level | Name | Wood | Stone | +Storage (all resources) | Time | TC req |
|---|---|---|---|---|---|---|
| 1 | Warehouse | 60 | 40 | +1,000 | 60 | 1 |
| 5 | Warehouse | 560 | 370 | +5,500 | 1k | 5 |
| 10 | Storehouse | 5k | 3.4k | +28k | 21.6k | 10 |
| 20 | Grand Depot | 95k | 64k | +400k | 86.4k | 20 |

**Total cap** = `BASE_STORAGE + 500·TClevel + Warehouse capacity` (Warehouse base
`+1500`/level, growing at `1.35` — chosen so the cap stays above any single
upgrade cost at every level; tightest margin ≈ 1.8× at Castle/Keep L15).
**Idle window** = `cap / ratePerHour` — early game ≈ 8–12 h, late game tuned to
≈ 12–18 h so a daily check-in never wastes much.

### 4.2 Housing — Tents → Houses → Villas
`Function = store` (population capacity). Converts Food upkeep into pop ceiling.

| Level | Name | Wood | Stone | Pop Capacity | Time | TC req |
|---|---|---|---|---|---|---|
| 1 | Tents | 40 | 20 | 10 | 45 | 1 |
| 5 | Tents | 370 | 185 | 45 | 1.1k | 5 |
| 10 | Houses | 3.5k | 1.7k | 160 | 21.6k | 10 |
| 20 | Villas | 65k | 32k | 1,400 | 86.4k | 20 |

**Population growth:** while `population < popCapacity` and Food > 0, pop grows at
`max(1, popCapacity * 2%) /h`, consuming **0.5 Food per pop per hour** as upkeep.

---

## 5. Military Buildings

### 5.1 Army — Army Camp → Barracks → Army Base
Caps total land units = `30 · level`. `Function = train`.

| Level | Name | Wood | Stone | Food | Unit Cap | Time | TC req |
|---|---|---|---|---|---|---|---|
| 1 | Army Camp | 200 | 120 | 150 | 30 | 600 | 3 |
| 10 | Barracks | 6k | 4k | 4.5k | 300 | 21.6k | 15 |
| 20 | Army Base | 95k | 64k | 70k | 600 | 86.4k | 20 |

### 5.2 Smithing — Smelter → Blacksmith → Foundry
`Function = defend/attack multiplier`. Each level adds **+3% army attack & HP**
(applies to both raiding and defending).

| Level | Name | Wood | Stone | Atk/HP Bonus | Time | TC req |
|---|---|---|---|---|---|---|
| 1 | Smelter | 150 | 200 | +3% | 600 | 5 |
| 10 | Blacksmith | 5k | 7k | +30% | 21.6k | 15 |
| 20 | Foundry | 80k | 110k | +60% | 86.4k | 20 |

### 5.3 Naval — Dock → Harbour → Port
Builds ships (naval units) and **unlocks/extends raid range**. v1: Dock level ≥ 1
is required to `/raid` at all (you need boats to reach another island).

| Level | Name | Wood | Stone | Ship Cap | Raid Cooldown reduction | Time | TC req |
|---|---|---|---|---|---|---|---|
| 1 | Dock | 250 | 150 | 5 | 0% | 900 | 5 |
| 10 | Harbour | 7k | 4.5k | 40 | -20% | 21.6k | 15 |
| 20 | Port | 110k | 70k | 100 | -40% | 86.4k | 20 |

---

## 6. Defensive Buildings

### 6.1 Walls — Palisade → Stone → Reinforced
`Function = defend`, `FunctAttribute = wallHP`. Wall HP is **damaged in raids**
and repaired with Stone (§7). While `wallHP > 0`, incoming damage is reduced.

| Level | Name | Wood | Stone | Wall HP | Damage Reduction | Time | TC req |
|---|---|---|---|---|---|---|---|
| 1 | Palisade Walls | 100 | 200 | 500 | 5% | 300 | 3 |
| 10 | Stone Walls | 3k | 6k | 6,000 | 25% | 21.6k | 10 |
| 20 | Reinforced Walls | 50k | 95k | 80,000 | 45% | 86.4k | 20 |

Damage reduction is capped at **45%** so walls never make an island unbeatable.

### 6.2 Towers — Watch → Guard → Bombard
`Function = defend`, auto-kills a % of attacking units **before** the clash.

| Level | Name | Wood | Stone | Pre-battle kill % | Time | TC req |
|---|---|---|---|---|---|---|
| 1 | Watch Tower | 120 | 150 | 2% | 300 | 5 |
| 10 | Guard Tower | 4k | 5k | 12% | 21.6k | 15 |
| 20 | Bombard Tower | 70k | 90k | 25% | 86.4k | 20 |

Pre-battle kill is capped at **25%**.

### 6.3 Keep line — Castle → Keep → Citadel (the Vault)
`Function = vault`, `FunctAttribute = % of each resource protected from raids`.
Late-unlock line (Castle requires a high TC).

| Level | Name | Vault % protected | Vault flat floor | TC req |
|---|---|---|---|---|
| 1 | Castle | 15% | 2,000 | 15 |
| 5 | Castle | 26% | 10,000 | 18 |
| 10 | Keep | 41% | 20,000 | 25 |
| 15 | Citadel | 55% | 30,000 | 30 |

**Vault flat floor** = `level · PVP.VAULT_FLOOR_PER_LEVEL` (2,000/level — the
authoritative lever lives in `islander/data/balance.ts`; this table is
illustrative). **Protected amount** per resource =
`max(flatFloor, total · vault%)`, clamped to the current total. Loot can only
ever touch the unprotected remainder. Costs/time follow the standard growth
curve (`levelStats`).

> **Note (tier names):** the Keep line's `maxLevel` is **15**, so in the live
> seed it only ever spans **Castle (1–9) → Keep (10–15)**; the third tier name
> *Citadel* (which `tierNameFor` swaps in at level 20+) is currently
> unreachable. Tracked as **F19** in `ISLANDER_IMPROVEMENTS.md`.

---

## 7. Repairs & Resource Exchange

- **Wall repair (`/repair`):** restores wall HP at **1 Stone per 4 HP**. Repairs
  are instant (no timer) but cost-gated.
- **Currency rush:** `ceil(remainingSeconds / 6)` Currency to finish a build now.
- **Marketplace exchange:** trade resources at a **1.5 : 1** ratio (e.g. 150 Wood
  → 100 Stone), with a per-day volume cap of `Marketplace level · 1,000` per
  resource to prevent laundering raided loot into Currency too freely.

---

## 8. Units

`Attack`, `HP`, `Loot` map to `i_Unit`. Cost is per unit. Training time is per
unit (batched, sequential).

| Unit | Type | Wood | Food | Currency | Pop | Attack | HP | Loot | Train (s) | Req |
|---|---|---|---|---|---|---|---|---|---|---|
| **Raider** | land | 15 | 20 | 0 | 1 | 8 | 20 | 50 | 60 | Army Camp 1 |
| **Soldier** | land | 25 | 25 | 0 | 1 | 12 | 45 | 10 | 90 | Army Camp 3 |
| **Champion** | land | 60 | 50 | 20 | 2 | 35 | 110 | 40 | 240 | Barracks (lvl 10) |
| **Longboat** | naval | 120 | 30 | 10 | 3 | 25 | 150 | 300 | 300 | Dock 1 |
| **War Galley** | naval | 300 | 60 | 40 | 5 | 70 | 400 | 800 | 600 | Harbour (lvl 10) |

Design intent:
- **Raider** = glass-cannon looter (high loot, low HP) → offense.
- **Soldier** = cheap wall of HP → defense.
- **Champion** = elite all-rounder, TC/Barracks gated.
- **Longboats/Galleys** carry the bulk of loot home — without ships, even a won
  raid carries little back.

Killed units free their `Pop` back into the idle pool over **30 min** (re-train
later); the unit instances themselves are lost.

---

## 9. PvP Levers (the important knobs)

| Lever | v1 value | Effect |
|---|---|---|
| `LOOT_PERCENT` | 20% | Max % of a defender's *unprotected* resources a raid can take. |
| `NEW_PLAYER_SHIELD_TC` | TC < 5 | Islands below this TC are unraidable. |
| `POST_RAID_SHIELD` | 8 h | Protection window after being successfully raided. |
| `RAID_COOLDOWN` | 4 h | Base attacker cooldown (reduced by Naval, §5.3). |
| `REPEAT_TARGET_COOLDOWN` | 24 h | Can't re-raid the same victim within this window. |
| `MATCHMAKING_BAND` | ±5 TC | `/raid` target's TC must be within ±5 of attacker's. |
| `SCOUT_COST` | 50 Currency | Cost of `/scout` for an estimated defense readout. |
| `WALL_DR_CAP` | 45% | Max wall damage reduction. |
| `TOWER_KILL_CAP` | 25% | Max pre-battle attacker losses to towers. |

### Combat resolution formula (reference)
```
atkPower = Σ(unit.Attack · count) · (1 + smithingBonus)
defPower = Σ(garrison.HP-weighted defense) · (1 + smithingBonus)
# 1. towers remove min(TOWER_KILL_CAP, towerKill%) of attackers
# 2. walls reduce attacker effective power by min(WALL_DR_CAP, wallDR%)
# 3. ratio = atkPower_eff / (atkPower_eff + defPower)
# 4. jitter ratio by ±10% (seeded RNG, logged)
# 5. attackerWins = ratio > 0.5
# 6. casualties scale with (1 - |ratio - 0.5|·2): closer fights = bloodier
# 7. if win: loot = min(Σ survivingLootCapacity,
#                       LOOT_PERCENT · unprotectedResources)
# 8. wallHP -= damage dealt; defender must /repair
```
The `±10%` jitter and casualty-on-both-sides rule mean a slightly weaker attacker
*can* win but bleeds for it — discouraging risk-free farming.

> **Tower pre-kill (step 1) is implemented as a floor on the attacker's loss
> fraction, not a separate unit-removal pass.** Towers thin `atkPower` in the
> power calc (survivors = `count · (1 − killPct)`), and `attackerLossFrac` is then
> `max(killPct, …)`, so the tower kill % also surfaces as casualties. Net effect
> matches the formula above without double-counting. (See `ISLANDER_IMPROVEMENTS.md`
> F18.)

---

## 10. Power Score (leaderboard & matchmaking)

```
powerScore = 10·TClevel
           + 3·Σ(buildingLevels)
           + 1·Σ(unit.Attack·count + unit.HP·count)/10
```
Used by `/island-leaderboard` and as a secondary matchmaking sanity check
alongside the TC band.

---

## 11. Tuning Methodology

When adjusting these numbers post-launch:
1. **Change one lever at a time**, observe over ≥1 week of play.
2. **Idle window** (`cap / rate`) is the master pacing dial — target 12–18 h
   late game. Adjust Warehouse capacity, not production, to move it.
3. **PvP health check:** if raids empty victims, lower `LOOT_PERCENT` or raise
   vault %; if no one raids, lower cooldowns or raise loot.
4. Keep all changes as **DB row edits** + `/island-reload`. Never inline a
   constant that belongs in a `*_Level` row.
5. Record balance changes in this file's changelog below.

### Changelog
| Date | Change |
|---|---|
| 2026-06-04 | Initial v1 seed values. |
| 2026-06-05 | Reachability rebalance: cost growth `1.55 → 1.35` (matches production/storage); `TC_STORAGE_PER_LEVEL 250 → 500`; Warehouse base storage `1000 → 1500`; Keep base cost `wood 2000→700, stone 3000→900`. Result: every tier affordable (0 unaffordable across all building levels; max single-upgrade cost ≈1.5M vs L30 cap ≈9M). Also widened `i_BuildingLevel` cost columns to `UNSIGNED INT`. Apply with `/island-reload`. |
| 2026-06-06 | Phase A correctness pass (`ISLANDER_IMPROVEMENTS.md`): **Currency is now uncapped** (no longer clamped to storage on accrual/exchange/loot); **vault flat floor** reconciled to the data-driven `PVP.VAULT_FLOOR_PER_LEVEL` (2,000/level — §6.3 table updated to match, the previous doc's 1k/5k/50k figures were never in code). Starvation, casualty-rounding and concurrency changes are logic-only (no balance numbers). |
