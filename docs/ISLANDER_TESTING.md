# Islander — Manual Test Plan

> Covers Phases 0–4. None of this could be run in the build environment (no live
> MySQL or Discord token), so everything below is **manual verification** to do
> on a real server. Tick items off as you go.
>
> Companion docs: `ISLANDER_DESIGN.md` (mechanics), `ISLANDER_BALANCE.md` (numbers).

---

## 0. Prerequisites & setup

- [ ] **Migration applied.** `i_*` tables exist (`SHOW TABLES LIKE 'i\_%';` → 7 tables).
      Deploys auto-run it via `npm start` → `prisma/migrate-deploy.js`.
- [ ] **Commands registered.** Run `npm run deploy`. Only **`/island`** should
      register (no `/build`, `/upgrade`, `/rush`, `/train` — those are buttons).
- [ ] **Bot online**, logs show the `island` command + `islander` button/select/modal
      handlers loaded with no errors.
- [ ] For notification tests: at least one tester has opted into the
      `EventNotification` flag in `Members.NotifyLevel` (bit value `2`). Without it,
      DMs are intentionally **not** sent.
- [ ] For PvP tests: **two test accounts** (or willing members) — easier if you can
      grant resources/levels via DB to reach the required states quickly.

> Tip: to fast-forward state for testing, edit rows directly in `i_Island`
> (resources), `i_Building_Island` (levels), `i_Unit_Island` (unit counts).

---

## Phase 0 — Foundations

- [ ] `/island` with no prior island → creates one; image + embed render.
- [ ] Embed shows: Town Center level 1, resources with `/cap`, population `/cap`,
      a starter building list (Campfire, Farm, Woodcutter, Mine, Tents, Warehouse).
- [ ] Image renders (placeholder art: sea, island, labelled building markers, header).
- [ ] **Resource accrual:** note Wood/Stone/Food, wait a few minutes (or set
      `LastTick` back in the DB), `/island` again → resources increased by the
      per-hour rate, **clamped at the storage cap**.
- [ ] **Food upkeep / population:** population grows toward its cap over time; with
      0 Food and population > 0, population slowly starves.
- [ ] `/island @otherMember` → shows their island (or creates an empty one for them);
      your build/upgrade buttons are **disabled** on someone else's island.

---

## Phase 1 — Build loop (buttons on `/island`)

- [ ] **TC gating:** on a fresh island only **Upgrade → Town Centre** is available;
      Build offers nothing until TC rises (walls/army need TC 3, etc.).
- [ ] **Build:** press **Build** → select menu lists buildable, TC-unlocked lines
      with cost previews → pick one → ephemeral "🏗️ Building … ready <relative time>".
- [ ] Build **deducts resources** immediately; insufficient resources → clear
      "need X more" error.
- [ ] **One build at a time:** while a build runs, Build/Upgrade buttons are disabled
      and starting another is refused.
- [ ] **Upgrade:** press **Upgrade** → select shows `Name → Lv N` with cost → starts;
      the building keeps working at its old level until the upgrade completes.
- [ ] **Completion:** after the timer, `/island` (or Refresh) shows the new
      building/level; production/caps update accordingly.
- [ ] **Rush:** with a build in progress, **Rush ⚡** finishes it instantly for 🪙
      and re-renders in place; too little 🪙 → ephemeral error (no charge).
- [ ] **Warehouse** upgrade raises the storage cap (idle window grows).
- [ ] **Knowledge** (Academy line) reduces subsequent build times (compare a build
      time before/after building it).
- [ ] **"Under construction"** field appears on the embed with a relative ready time.

---

## Phase 2 — Army (Train button)

- [ ] **Unlock gates:** Train offers nothing until an Army Camp exists; Raider needs
      Army Lv1, Soldier Lv3, Champion Lv10; Longboat needs a Dock, Galley Naval Lv10.
- [ ] **Train flow:** Train 🪖 → unit select (shows cost/pop/atk) → quantity **modal**
      → "🪖 Trained N× …".
- [ ] **Caps:** can't exceed land cap (30×Army level) or naval cap (5×Naval level) —
      clear error stating how many more fit.
- [ ] **Free population:** training consumes idle population; with none free →
      "need N free population" error (grow Housing).
- [ ] **Resource cost** deducted; insufficient → error.
- [ ] **Embed Army field** shows roster, free pop, attack (with Smithing bonus),
      and land/naval caps.
- [ ] **Smithing** raises the displayed army Attack (build/upgrade Smelter line).
- [ ] **Upkeep tension:** a large army keeps eating Food (population upkeep) — verify
      Food drains faster with more units.

---

## Phase 3 — PvP raiding (Scout/Raid on others, Repair on your own)

Set up: attacker with a **ship** (Longboat) + some Raiders, both islands **TC ≥ 5**
and **within ±5 TC** of each other.

### Validations (each should block with a clear message)
- [ ] Raid **yourself** → refused.
- [ ] Raid with **no ship** (no naval unit) → refused.
- [ ] Raid with **no army** → refused.
- [ ] Raid a **new player** (defender TC < 5) → refused.
- [ ] Raid while **on cooldown** → refused with ready time.
- [ ] Raid a **shielded** defender (just raided) → refused with shield expiry.
- [ ] Raid a target **outside ±5 TC** → refused.
- [ ] Raid the **same target twice within 24h** → refused.

### Combat & outcomes
- [ ] **Scout 🔭** charges 50 🪙 and returns an (estimated) defense report
      (army/attack/walls/towers); too little 🪙 → refused.
- [ ] **Raid ⚔️** posts a public **battle-report embed** (win/loss, both sides'
      losses, loot, wall damage).
- [ ] **Win:** attacker gains loot (≤ 20% of each *unprotected* resource, ≤ surviving
      carry capacity, clamped to attacker storage); defender loses those resources.
- [ ] **Vault:** a defender with a Castle/Keep keeps a protected floor/percentage of
      resources unraidable (loot never empties them).
- [ ] **Towers** reduce attacker numbers (heavier losses vs high towers).
- [ ] **Walls** make a defender much harder to beat; wall HP drops after a raid.
- [ ] **Casualties** apply to both sides; freed population becomes re-trainable.
- [ ] **Cooldown** set on attacker after raiding (shorter with higher Naval).
- [ ] **Post-raid shield** set on a **beaten** defender (not on a repelled attack).
- [ ] **Repair 🧱** on your own island (enabled only when walls are damaged) restores
      wall HP for Stone; full walls → button disabled.
- [ ] A row is written to `i_Raid` for each resolved raid.

---

## Phase 4 — Leaderboard, tutorial, notifications

- [ ] **Leaderboard 🏆** button → ephemeral top-10 by power score, with medals and
      TC levels; ordering looks right (stronger islands higher).
- [ ] **How to play ❓** button → tutorial embed (ephemeral).
- [ ] **Raid notification:** an opted-in defender (NotifyLevel has bit `2`) receives a
      DM when raided (win → looted/repair prompt; loss → "held"). A member **without**
      the flag receives **no** DM.
- [ ] **Build-complete notification:** an opted-in builder receives a DM when a build
      finishes (best-effort). Note: **lost if the bot restarts** mid-build — the build
      still completes on the next `/island` view, just without the DM.

---

## Edge cases & things to watch

- [ ] **Refresh** button always re-renders current state (resources ticked).
- [ ] Clicking action buttons on **someone else's** `/island` message: build/upgrade/
      train/rush/repair are disabled or refuse with "that's not your island";
      Scout/Raid/Leaderboard/Help work.
- [ ] **Concurrency:** two rapid clicks (e.g. double Rush, or two raids) shouldn't
      double-charge or go negative — watch for any negative resources/counts.
- [ ] **Storage clamp:** resources never exceed cap; loot beyond attacker cap is lost
      (expected).
- [ ] **Large quantities** in the train modal (e.g. asking for more than caps/pop
      allow) → refused, not partially applied.
- [ ] No unhandled-promise errors in the bot logs during any of the above.

---

## Known limitations (by design, v1)

- **Training is instant** (capacity/pop/resource-gated, not time-gated) — `trainTime`
  is reserved for a future timed queue.
- **Build-complete DMs are best-effort** (in-memory timer; not restart-durable).
- **Island art is a placeholder** (procedural). Real Kenney.nl art is **Phase 6**.
- **No battle image yet** — raids report via embed; battle image is **Phase 6**.
- **Balance numbers are seeded once** from `ISLANDER_BALANCE.md`; re-tuning means
  editing the data and re-seeding (a `/island-reload` admin command is a follow-up).
