# Islander — Planned Improvements & Implementation Plan

> **Status:** Proposed / planning
> **Owner:** FlamingPalm community team
> **Last updated:** 2026-06-06
> **Companion docs:** [`ISLANDER_DESIGN.md`](./ISLANDER_DESIGN.md) (mechanics),
> [`ISLANDER_BALANCE.md`](./ISLANDER_BALANCE.md) (numbers),
> [`ISLANDER_TESTING.md`](./ISLANDER_TESTING.md) (manual test plan).

This document captures a review of the live Islander game (Phases 0–5 as built)
and lays out a **phased plan** to fix correctness issues, finish documented-but-
missing features, and add the highest-leverage engagement features.

It is the source of truth for *what we plan to change and why*. As items land,
update the status column and fold the mechanics into `ISLANDER_DESIGN.md` /
`ISLANDER_BALANCE.md` so those stay authoritative for *current* behaviour.

Guiding constraints (unchanged from the original design):
- Balance stays in **data** (`islander/data/balance.ts`) — tuning is a row edit +
  `/island-reload`, never an inlined constant.
- Idle-friendly, Discord-first, single entry point (`/island` + buttons).
- PvP stays bounded by shields, cooldowns, loot caps and the matchmaking band.

---

## 1. Findings Summary

Each finding has an ID (`F#`) referenced by the phase plan in §3.

### 1.1 Correctness issues (gameplay-affecting)

| ID | Issue | Where | Impact |
|---|---|---|---|
| **F1** | **Starvation is a cliff, not a slow decay.** Population decay is linear (`population * (1 - STARVATION_RATE * hours)`); at ~20h offline with no food the factor hits 0 and the *entire* population is wiped in one tick — the opposite of the design's "slowly starves." | `IslanderModule.applyTick` (~L285-289) | High — punishes the daily-check-in loop the game is built around. |
| **F2** | **Trained units are immune to starvation.** `Population` (idle + trained) decays, but unit rows are never touched, so `Population` can fall below `usedPopulation()`. `freePopulation()` clamps to 0 while the army stays fully combat-ready. The Farm/Housing ↔ army upkeep tension (Design §5) never actually bites. | `IslanderModule.applyTick`, `usedPopulation` | High — undermines a core balance pillar. |
| **F3** | **Concurrency double-spend.** `startBuild`, `startUpgrade`, `rush`, `trainUnit`, `exchangePoints`, `repairWalls` do read → validate → `spend()` as separate queries with no transaction/lock. Two fast clicks can both pass the affordability check and both decrement → negative resources. | `IslanderModule.spend` & all callers | High — Discord users double-click; exploitable. |
| **F4** | **Currency capped in logic but shown as uncapped.** `applyTick` and `exchangePoints` clamp Currency to `storageCap`, but the embed renders Currency with no `/cap` and the image header omits its cap. Players lose accrued/exchanged Currency silently. | `applyTick` (~L276), `IslanderEmbeds.status` (~L57), `IslanderImage` header | Medium — silent loss + inconsistent UX. |
| **F5** | **`vaultFloor` code ≠ balance doc.** Code: `level * 2000`. Balance §6.3: 1,000 / 5,000 / 20,000 / 50,000. The vault floor is a PvP lever, not a cost-curve value, so this is real drift. | `balance.ts` `vaultFloor` (~L262) vs Balance §6.3 | Medium — tuning doesn't match reality. |
| **F6** | **Small armies are unkillable.** `applyCasualties` uses `Math.floor(count * frac)`; stacks of 1–6 units with `frac < 0.5` take **zero** losses. Early raids are bloodless. | `CombatModule.applyCasualties` | Low/Medium — weakens early PvP stakes. |

### 1.2 Documented but not implemented

| ID | Issue | Where | Impact |
|---|---|---|---|
| **F7** | **Marketplace resource exchange is missing.** Design §4.5 / Balance §7 specify a Wood↔Stone-style exchange at 1.5:1 with a Marketplace-scaled daily cap. Only **Points→Currency** exists in code. | `IslanderModule` (no resource-exchange method) | Medium — referenced feature absent; either build or strike from docs. |
| **F8** | **Build-complete DMs lost on restart.** `scheduleBuildComplete` is an in-memory `setTimeout`. Builds already persist `upgradeReady`, so a small sweep could DM durably. | `IslanderModule.scheduleBuildComplete` | Low — best-effort by design, but cheap to harden. |

### 1.3 Net-new improvements (engagement)

| ID | Improvement | Rationale |
|---|---|---|
| **F9** | **"Find Target 🎯" matchmaking.** Raiding requires `/island @member`; there is no discovery, so most members never raid anyone. A button that picks a random eligible opponent (within band, not shielded, not on repeat-cooldown) opens the whole PvP pillar. | The single biggest unlock for the competitive loop. |
| **F10** | **Surface shield & raid-cooldown status.** `ShieldUntil`/`RaidCooldown` are only read inside `CombatModule`; the status embed never shows them. Defenders can't tell they're protected; attackers learn cooldown only by failing. | Removes confusing dead-ends; cheap. |
| **F11** | **War Log 📜 button.** Every raid is written to `i_Raid` but nothing surfaces it. Show raids sent/received with win/loss + loot; lets defenders see who keeps hitting them. | High retention value, data already exists. |
| **F12** | **Leaderboard: own rank + categories.** Outside top-10 you get no feedback. Append the viewer's rank; consider category boards (most raids won, richest, biggest army). | Cheap, improves stickiness. |
| **F13** | **Daily objective / login-streak reward.** Idle game with no reason to log in beyond accrual. A small idempotent daily Currency reward (PointHistory-style marker) drives the daily burst. | Retention. |
| **F14** | **Defensive unit type (`Type === 2`) is defined but unused.** Either add a defense-only unit reinforcing the Soldier-garrison vs Raider-offense split, or drop the type. | Removes dead surface area / adds tactical depth. |

### 1.4 Minor / polish (batch where convenient)

| ID | Item | Where |
|---|---|---|
| **F15** | Failed raids trigger the full 24h repeat-target lock — consider a shorter retry window on a *loss*. | `CombatModule.resolveRaid` repeat-target guard |
| **F16** | Rush cost can round to **0 Currency** on nearly-finished builds (free rush). Enforce a minimum (e.g. `Math.max(1, …)`). | `IslanderModule.rush` |
| **F17** | `leaderboard()` loads every island with full includes on each click. Fine at community scale; cache `powerScore` if it grows. | `IslanderModule.leaderboard` |
| **F18** | Tower pre-kill is folded into the attacker loss-fraction floor rather than independently removing units; acceptable approximation, document it. | `CombatModule.resolveRaid` |

---

## 2. Design Decisions to Lock Before Building

These need a quick call so the phases below are unambiguous:

1. **Currency cap (F4):** uncap Currency (treat it as the slow, bankable raiding
   reward) **or** display its cap everywhere. *Recommendation: uncap Currency* —
   it's the scarcest resource and capping it punishes the exact players the loot
   economy depends on. (If uncapped, `applyTick`/`exchangePoints`/loot-credit stop
   clamping Currency.)
2. **Starvation model (F1/F2):** confirm compounding decay
   `pop * (1 - rate)^hours`, and that starvation **kills trained units** when
   `usedPopulation > Population` (kill lowest-value units first, free their pop).
3. **Marketplace exchange (F7):** build it (Wood/Stone/Food ↔ each other at the
   documented 1.5:1, Currency **not** purchasable to avoid laundering loot) or
   formally defer and strike from `ISLANDER_DESIGN.md` §4.5.
4. **Defensive unit (F14):** add one ("Militia" — cheap, high HP, zero loot,
   land-cap-exempt or its own small cap) or remove `Type === 2`.

See §5 for the open-questions checklist to resolve these.

---

## 3. Phased Implementation Plan

Phases are ordered by **risk-adjusted value**: correctness first (small, clearly
right, high impact), then cheap visibility wins, then the PvP-unlocking features,
then economy completion and retention. Each phase is independently shippable and
testable, and ends with a `/island-reload` + the relevant `ISLANDER_TESTING.md`
checklist.

### Phase A — Correctness & safety (F1, F2, F3, F4, F5, F6, F16)
**Goal:** the simulation is fair and unexploitable. No new surfaces.

- **A1 (F1):** compounding starvation — `pop * Math.pow(1 - STARVATION_RATE, hours)`.
- **A2 (F2):** when `usedPopulation > Population` after a tick, cull units
  (cheapest/lowest-value first) until they fit, freeing pop; reflect on the
  in-memory island. Add a "your garrison starved" note to the next view.
- **A3 (F3):** wrap each spend+mutate in `prisma.$transaction`, using conditional
  `updateMany` guards (`where: { Wood: { gte: cost }, … }`) and checking the
  affected-row count so concurrent clicks can't double-spend or go negative.
- **A4 (F4):** apply the locked Currency decision (recommended: stop clamping
  Currency; keep showing it without `/cap`, which already matches the embed).
- **A5 (F5):** reconcile `vaultFloor` with Balance §6.3 (move the floor schedule
  into `balance.ts` as data; update the doc table to match the chosen numbers).
- **A6 (F6):** casualty rounding — `Math.round`, or floor + probabilistic
  remainder, so small stacks can take losses.
- **A7 (F16):** `rush` cost `Math.max(1, Math.ceil(remaining / RUSH_SECONDS_PER_CURRENCY))`.

**Risk:** low. **Schema:** none (pure logic + data constants).
**Test:** `ISLANDER_TESTING.md` Phase 0 (accrual/starvation), Phase 3 (casualties),
plus a new concurrency check (double-click Rush/Train → no negative balances).

### Phase B — Visibility & UX (F10, F12, F18)
**Goal:** players can see their PvP state; no dead-end errors.

- **B1 (F10):** add a "Status" block to `IslanderEmbeds.status` — 🛡️ "Shielded
  until `<t:…:R>`" / "✅ Raidable", and on your own island ⚔️ "Raiders ready
  `<t:…:R>`" / "Ready to raid". Pass `ShieldUntil`/`RaidCooldown` through
  `getIslandView`.
- **B2 (F10):** in `IslanderView`, when viewing another's island, disable or
  annotate the Raid button if the *target* is shielded or the *viewer* is on
  cooldown (compute viewer state in the view builder).
- **B3 (F12):** `leaderboard()` returns the viewer's rank; embed appends
  "Your rank: #N (score)" when outside the top 10.
- **B4 (F18):** add a one-line code comment + Balance note documenting how tower
  pre-kill folds into the loss fraction (no behaviour change).

**Risk:** low. **Schema:** none. **Test:** new mini-checklist (shield/cooldown
display; raid button state on shielded/cooldown; own-rank line).

### Phase C — PvP discovery: Find Target (F9, F15)
**Goal:** open the competitive loop to everyone, not just people who name a rival.

- **C1 (F9):** `IslanderModule.findRaidTarget(attackerId)` — query islands within
  `MATCHMAKING_BAND` TC of the attacker, excluding: self, `TC < NEW_PLAYER_SHIELD_TC`,
  currently shielded, and those raided by this attacker inside `REPEAT_TARGET_HOURS`.
  Pick randomly (optionally weight toward similar power score).
- **C2 (F9):** "Find Target 🎯" button on your **own** island → renders the chosen
  target's `/island` (reusing `IslanderView.build(..., isOwner=false)`), so the
  existing Scout/Raid buttons apply. If none eligible, a friendly ephemeral
  "no targets in range right now."
- **C3 (F15):** shorten the repeat-target lock on a **loss** (e.g. new
  `REPEAT_TARGET_LOSS_HOURS`), so a failed raid isn't punished like a successful
  farm. Data constant in `balance.ts`.

**Risk:** medium (matchmaking query correctness). **Schema:** none.
**Test:** Find Target respects every exclusion; "no targets" path; loss vs win
repeat-cooldown.

### Phase D — Economy completion (F7, F8)
**Goal:** finish the documented economy; harden notifications.

- **D1 (F7):** Marketplace resource exchange — `exchangeResources(userId, from, to, amount)`
  gated on Trade line ≥ Tier 2 (level 10), at the documented **1.5:1** ratio, with
  a per-day cap = `Marketplace level · EXCHANGE_BASE_CAP` tracked in a small log
  (reuse a `PointHistory`-style marker or a new lightweight table — decide in §5).
  Currency is **not** a purchasable target. New "Trade 🔁" button (own island,
  shown when Marketplace built) → from/to/amount select+modal.
- **D2 (F7):** add `RESOURCE_EXCHANGE` constants to `balance.ts`; update
  `ISLANDER_DESIGN.md` §4.5 / `ISLANDER_BALANCE.md` §7 to mark it implemented.
- **D3 (F8):** durable build-complete notifications — a light hourly sweep (cron
  style from `modules/statistics.ts`) that finds builds whose `upgradeReady` just
  elapsed and DMs opted-in owners; keep the in-memory timer as the fast path.
  Needs a "notified" marker to avoid duplicates (column or in-memory set keyed by
  building+ready time).

**Risk:** medium. **Schema:** possibly one nullable column (`notifiedAt` on
`i_Building_Island`) for D3, or a daily-exchange tally — confirm in §5.
**Test:** exchange ratio/cap/gating; Currency not buyable; build DM fires once
across a simulated restart.

### Phase E — Retention & social (F11, F13, F12 categories)
**Goal:** reasons to come back daily; richer social surface.

- **E1 (F11):** War Log 📜 button → paginated recent `i_Raid` rows for the viewer
  (sent & received), win/loss + loot, opponent name. Read-only over existing data.
- **E2 (F13):** daily reward / login streak — first `/island` view each UTC day
  grants a small Currency bonus (and/or a daily objective like "win 1 raid"),
  idempotent via a dated marker. Tunable in `balance.ts`; respects the
  "Currency is the scarce reward" principle (keep amounts modest).
- **E3 (F12):** category leaderboards (most raids won, richest, biggest army) —
  optional select on the leaderboard embed.

**Risk:** low/medium. **Schema:** none (markers reuse `PointHistory`/`i_Raid`).
**Test:** war-log paging & correctness; daily reward grants once/day; categories
rank correctly.

### Phase F — Tactical depth & polish (F14, F17)
**Goal:** optional depth once the core is solid.

- **F1-impl (F14):** add a defense unit (`type 2`, e.g. "Militia": cheap, high HP,
  ~0 loot) or remove the unused type — per the §2 decision. If added, give it its
  own cap source (e.g. Walls level) or fold into land cap.
- **F2-impl (F17):** `powerScore` cache for the leaderboard if the island count
  grows enough to matter (memoise per island, invalidate on mutation).

**Risk:** low. **Schema:** none (unit is a data row). **Test:** new unit
trains/defends; leaderboard still correct with cache.

---

## 4. Cross-Cutting Notes

- **No schema churn for A–C and E.** Only Phase D *may* add one nullable column
  (durable-notify marker / exchange tally) — decide in §5 before writing a
  migration. If added, follow the `LEGACY_MIGRATIONS`/`migrate-deploy` flow in
  `CLAUDE.md`.
- **Keep balance in data.** Every new lever (loss-cooldown, exchange ratio/cap,
  daily reward, vault-floor schedule, militia stats) goes in `balance.ts` and is
  re-seeded with `/island-reload`.
- **Update the canonical docs as features land** — fold mechanics into
  `ISLANDER_DESIGN.md` / `ISLANDER_BALANCE.md`, extend `ISLANDER_TESTING.md`, and
  flip the status of each `F#` here.
- **Concurrency (A3) is a prerequisite** for any new spend surface (D1 exchange,
  E2 reward) — land Phase A first.

---

## 5. Open Questions (resolve before coding the affected phase)

- [x] **F4 Currency cap:** **uncapped** (resolved, Phase A).
- [x] **F1/F2 starvation:** **compounding decay**, cull **weakest units first**,
      warn via a "⚠️ Famine" embed field (resolved, Phase A).
- [ ] **F7 exchange:** build now (Phase D) or defer & strike from design docs?
      If build: confirm ratio (1.5:1), daily-cap base, and that Currency is
      non-purchasable. Tally storage: `PointHistory`-style marker vs new column.
- [ ] **F8 durable DMs:** add `i_Building_Island.notifiedAt` column, or track in
      memory only and accept dup-DM risk on overlapping sweeps?
- [ ] **F14 defensive unit:** add "Militia" or remove `Type === 2`? If added,
      which cap source?
- [ ] **E2 daily reward:** Currency-only, or also a daily objective? Amount?

---

## 6. Status Tracker

| ID | Title | Phase | Status |
|---|---|---|---|
| F1 | Compounding starvation | A | ✅ Done (2026-06-06) |
| F2 | Units obey starvation | A | ✅ Done (2026-06-06) |
| F3 | Transactional spend | A | ✅ Done (2026-06-06) |
| F4 | Currency cap consistency (uncapped) | A | ✅ Done (2026-06-06) |
| F5 | Vault floor data/doc reconcile | A | ✅ Done (2026-06-06) |
| F6 | Casualty rounding | A | ✅ Done (2026-06-06) |
| F16 | Min rush cost | A | ✅ Done (2026-06-06) |
| F10 | Shield/cooldown in embed | B | Planned |
| F12 | Own rank (+ categories in E) | B / E | Planned |
| F18 | Document tower pre-kill | B | Planned |
| F9 | Find Target matchmaking | C | Planned |
| F15 | Shorter loss repeat-cooldown | C | Planned |
| F7 | Marketplace resource exchange | D | Planned |
| F8 | Durable build-complete DMs | D | Planned |
| F11 | War Log button | E | Planned |
| F13 | Daily reward / streak | E | Planned |
| F14 | Defensive unit / remove type | F | Planned |
| F17 | Leaderboard powerScore cache | F | Planned |
| F19 | Keep-line `Citadel` tier name unreachable (`maxLevel 15` < tier-3 threshold 20) | F | Planned (found during Phase A) |

### Phase A — implementation notes (2026-06-06)
Decisions taken from §2 (all per the recommendation):
- **F4:** Currency is **uncapped** — accrual, Points exchange and raid loot no
  longer clamp it to storage. Embed/image already showed it without a cap.
- **F1:** starvation now compounds — `pop · (1 − STARVATION_RATE)^hours`.
- **F2:** when starvation drops population below the army's needs, the **weakest
  units (lowest attack+HP) are culled** to fit; a "⚠️ Famine" note shows on the
  next `/island`. (`island.starvedUnits` carries the count to the embed.)
- **F3:** all spends (`startBuild`, `startUpgrade`, `trainUnit`, `rush`,
  `repairWalls`, `exchangePoints`) now use **conditional `updateMany`** guards
  (`where: { <res>: { gte: cost } }, data: { decrement }`) and fail closed if the
  affected-row count is 0 — no double-charge / negative balances under concurrent
  clicks.
- **F5:** vault flat floor extracted to `PVP.VAULT_FLOOR_PER_LEVEL` (2,000/level,
  preserving live behaviour); Balance §6.3 table + changelog updated to match.
- **F6:** casualties use `Math.round` (capped at the stack size) so 1–6-unit
  garrisons can take losses.
- **F16:** rush cost floored at `Math.max(1, …)`.

Residual (deferred, not in F-scope): the *build-slot* race (two different builds
started concurrently can both pass the one-at-a-time check) is unaffected by the
resource guard; the UI disables Build/Upgrade while building, so it needs a
deliberate click-storm to hit. Tighten with an interactive transaction if it ever
shows up in practice.
</content>
</invoke>
