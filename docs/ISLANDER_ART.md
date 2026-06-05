# Islander — Art Asset Manifest (Phase 6)

> Checklist of every image the Islander renderer needs, with suggested
> **Kenney.nl** sources. All Kenney assets are **CC0** (public domain — free for
> commercial use, no attribution required; crediting Kenney is appreciated).
>
> Drop finished PNGs in `assets/islander/`. The Phase-6 loader resolves
> `imagename`(+tier) → file and **falls back to the current labelled-box marker**
> when a file is missing, so art can be added incrementally without breaking the
> game. See `ISLANDER_DESIGN.md` §7.4.

---

## Art direction (pick ONE coherent style)

The renderer composites pre-rendered PNGs on a 2D canvas — use **pre-rendered
isometric sprites**, not 3D models. Keep all building sprites on one footprint
(e.g. 128×128 isometric) so they sit correctly on the hex tiles.

- **Route A (recommended):** Hexagon Kit terrain + **Medieval RTS** buildings.
- **Route B (tropical/pirate):** Hexagon Kit terrain + **Pirate Kit** buildings/
  ships, gaps filled from Nature/Castle kits.

Packs to grab (all CC0, at `kenney.nl/assets`): Hexagon Kit, Medieval RTS,
Castle Kit, Pirate Kit/Pack, Nature Kit, Fantasy Town Kit, Game Icons, UI Pack.

---

## 1. Terrain / island base — Hexagon Kit
- [ ] Deep water hex
- [ ] Shallow water / coast hex
- [ ] Beach / sand hex
- [ ] Grass hex (build surface)
- [ ] Dirt / stone-ground hex
- [ ] Forest / hill / rock accent hexes

## 2. Buildings — 14 lines × 3 tiers (`imagename` = per-line key in `balance.ts`)

| Line (`imagename`) | Tier 1 → 2 → 3 | Suggested Kenney source |
|---|---|---|
| Town Center (`towncenter`) | Campfire → Town Centre → Palace | Medieval RTS townhall/keep (small→large); campfire from Nature Kit |
| Housing (`housing`) | Tents → Houses → Villas | Medieval RTS tents → houses → large houses |
| Food (`farm`) | Farm → Farm Estate → Plantation | Medieval RTS farm/field + windmill |
| Wood (`woodcutter`) | Woodcutter → Logging Camp → Sawmill | Medieval RTS lumber mill; logs from Nature Kit |
| Stone (`mine`) | Mine → Quarry → Stoneworks | Medieval RTS mine entrance; rocks from Nature Kit |
| Trade (`trader`) | Trader → Marketplace → Grand Bazaar | Fantasy Town Kit / Medieval RTS market stalls |
| Warehouse (`warehouse`) | Warehouse → Storehouse → Grand Depot | Medieval RTS storehouse/barn |
| Smithing (`smelter`) | Smelter → Blacksmith → Foundry | Medieval RTS blacksmith/forge |
| Army (`army`) | Army Camp → Barracks → Army Base | Medieval RTS barracks / banner tents |
| Naval (`dock`) | Dock → Harbour → Port | Pirate Kit docks/pier + moored ship |
| Knowledge (`academy`) | Academy → University → Grand Library | Fantasy Town Kit large building / Medieval RTS church |
| Walls (`walls`) | Palisade → Stone → Reinforced | Castle Kit wall segments (wood→stone→reinforced) |
| Towers (`tower`) | Watch → Guard → Bombard | Castle Kit / Tower Defense towers (small→cannon) |
| Keep (`castle`) | Castle → Keep → Citadel | Castle Kit keep + Medieval RTS castle |

Checklist (one box per line to start; add `_t2`/`_t3` variants later):
- [ ] `towncenter` [ ] `housing` [ ] `farm` [ ] `woodcutter` [ ] `mine`
- [ ] `trader` [ ] `warehouse` [ ] `smelter` [ ] `army` [ ] `dock`
- [ ] `academy` [ ] `walls` [ ] `tower` [ ] `castle`

## 3. Land units — Tiny Battle or Medieval RTS characters
- [ ] Raider (light infantry)
- [ ] Soldier (spear/shield)
- [ ] Champion (knight, armored/mounted)

## 4. Ships — Pirate Kit / Pirate Pack
- [ ] Longboat (small boat / raft)
- [ ] War Galley (large ship / galleon)

## 5. Resource & UI icons — Game Icons + UI Pack
- [ ] Wood (log/plank)  [ ] Stone (rock/ore)  [ ] Food (meat/wheat)
- [ ] Currency (coin)   [ ] Population (person)
- [ ] Optional: panel/banner frame for the resource header (UI Pack)

## 6. Decoration (ambience) — Nature Kit + Pirate Kit
- [ ] Palm trees / trees  [ ] Rocks / bushes  [ ] Barrels / crates / flags
- [ ] Water foam / shoreline edge

## 7. Battle report scene (optional)
- [ ] Crossed-swords / explosion icons (Game Icons) — composited over the
      attacker-ships-vs-defender-walls scene; no new pack needed.

---

## Logistics
- **Minimum viable set (~25 assets):** 6 terrain hexes, 14 building sprites
  (one per line), 3 land units, 2 ships, 5 resource icons. Tier variants and
  decoration can follow.
- **File naming:** `assets/islander/<imagename>.png` (e.g. `farm.png`) or
  per-tier `assets/islander/<imagename>_t{1,2,3}.png`.
- **Footprint:** keep all building sprites to one isometric tile size so they
  align on the hex grid.
- **Credit (optional):** add an `assets/islander/CREDITS.md` listing the Kenney
  packs + versions used.
