# Polyfork 에셋 조사 — 큰 동굴 맵용 (Polyfork survey for the big cave map)

Surveyed 2026-11-02 for the big-world redesign (W0–W4); trimmed 2026-11-05 for the public repo. This file is our own analysis: which [Polyfork](https://polyfork.dev) models Secret Cave uses, where and why, and what we had to build ourselves. The survey read Polyfork's public catalogue (2,768 published assets at the time; 279 looked relevant to a cave game). That catalogue listing is Polyfork's data, so it is not kept here; browse https://polyfork.dev for it.

The live list of what the game loads is `MODELS` in `src/world/models.js` (and `INTRO_MODELS` in `src/ui/intro.js` for the intro cutscene). Code comments cite the sections below (§3a, §3c areas 1–4).

## 0. 요약 (TL;DR)

- **What makes the cave feel big.** Polyfork has no cave kit, so size comes from three sources:
  1. Rock landmarks that scale up cleanly (their `scale` knob is plain uniform scale, so our `place(..., { s })` does the same): `sea-stack`, `rock-outcrop`, `mesa-backdrop`, `smuggler-cave-mouth`, and the asteroids (2/5/10 m) for floating rock.
  2. The **Insect World** kit, built at bug's-eye scale: a 7 m glowing mushroom, a 5 m puffball, a 5 m moss cushion, a 23 m orb web, a 22 m paper nest. Next to them the puppy is tiny, which is exactly the feeling we want.
  3. Long structures that span chasms: `stone-viaduct-span` (24 m), `timber-trestle-bridge` (16 m), `tunnel-portal` (12 m), `mine-headframe` (9 m).
- **Walls and floors stay procedural.** The procedural terrain already handles openings, fading and the camera-side cut-away; no Polyfork piece does. The Dungeon & Crypt kit (2 m grid, the same as our cell) dresses only the built ruins of the Crystal Heart.
- **Gaps we build ourselves:** waterfalls, light shafts and particles, the bat merchant, the mole, the Mushroom Queen, the Crystal King, the mask, the water gun, the necklace, large crystal spires (see §3e).
- **Colour:** a `/cdn/<id>.glb` is always the default colourway. Recolours (the white Ice Bear, crystal tints) are done on the loaded meshes in our code.

## 1. 라이선스 메모 (Licence)

- Polyfork's free low-poly models allow use in commercial projects with no attribution, but **not redistribution of the files themselves** (https://polyfork.dev/licensing).
- So the game links the models at runtime from `https://polyfork.dev/cdn/<id>.glb`; the production build deletes its local copies (`vite.config.js`), and the local copies used by the dev server (`npm run fetch-assets`) stay gitignored, as does `src/vendor/polyfork/stage.mjs`.
- HD editions are Pro-only; we don't need them. Kit zips must not be committed either.

## 2. 방법 / 스케일 메모 (Method & scale notes)

- **Scale.** Polyfork models are real-world scale in metres. The camera sits about 30 m away at a 40° pitch, so anything under about 0.5 m reads as a speck: small things are floor clutter, and pickups are scaled up 2–3×.
- **Physics.** Giant landmarks get simple colliders (boxes or the world's own height function), not trimeshes, to keep Rapier cheap; most models are `body: 'none'` because the ground and walls come from the world data.
- **Glow.** The glowing mushrooms, gems and rune stones get their glow from emissive zones plus our bloom.

## 3. 추천 (Recommendations)

### (a) 거대함을 만드는 랜드마크 (Landmarks that make the cave feel huge)

The W0 landmarks, all in use:

| id | default size (m) | how we use it | areas |
|---|---|---|---|
| `sea-stack-369791` | 1.8×4.5×1.8, scaled 3–10× | floor-to-darkness rock pillars that read as "the ceiling is far away" | all |
| `mesa-backdrop-cbadea` | 32×24×24 | distant layered cave wall at the edge of big halls | all |
| `glowing-bonnet-mushroom-13f518` | 2.7×7×2.7 | the forest of giant glowing mushrooms | 2 |
| `stone-viaduct-span-0bd731` | 5.9×10×24 | the ancient arched bridge over the valley gorge | 1 |
| `smuggler-cave-mouth-69a07e` | 5×4×1.9, scaled | gate arches, and the cave mouth in the intro | all |
| `timber-trestle-bridge-c3cd88` | 16 m | the old mine's bridge | 1 |
| `large/medium/small-asteroid` | 10 / 5 / 2 m | floating rocks round the Crystal Heart | 4 |
| `orb-web-133aba` | 23×25 | the web bridge over the forest chasm | 2 |
| `frozen-waterfall-5d1fc6` | 4.4×4×1.8, scaled 2–3× | frozen cascades on the ice cliffs | 3 |
| `standing-moai` / `unfinished-moai` / `tukuturi-kneeling-moai` | 6 / 10.7 m | ancient guardians in the ruins | 4 |
| `tunnel-portal-4ac9f3` | 12×8×8.4 | massive masonry passage mouth | 4 |
| `mine-headframe-735cf4` + `mine-rail-run` + `mine-cart` | 9 m tower | the abandoned mine and the mine-cart shortcut | 1 |
| `moss-cushion-2eabef` / `tree-fern-78320e` | 5 m / 8 m | giant moss mounds and ferns that dwarf the puppy | 1 |

### (b) 모듈 키트 (Modular kits)

Verdict: keep the procedural cave shell for natural walls, rims and ceilings; use the **Dungeon & Crypt** pieces (`dungeon-wall-module`, `flagstone-floor-tile`, `stone-stair-flight`, `rope-bridge-span`, all on a 2 m grid) only where the space should look built (the Crystal Heart ruins); dress natural walls with big rocks placed along the wall line, not on it. The Insect World tunnel kit needs baked shape variants per piece and was not needed.

### (c) 지역별 팔레트 (Per-area palettes)

What each region uses (all in `MODELS`), and why.

**Area 1 — 이끼 계곡 Moss Valley and the camp (green moss, waterfalls, fireflies)**
- Giants: `tree-fern`, `moss-cushion`, `giant-horsetail-stand`, `sea-stack`, `mine-headframe`, `timber-trestle-bridge`, `ant-nest-entrance-mound` (the rabbit burrows), `fossil-ribcage`.
- Mid: `fern-covered-boulder`, `large-boulder`, `boulder-field-cluster`, `rock-outcrop`, `scree-heap`, `hollow-log`, `moss-covered-stump`, `exposed-tree-roots`.
- Water's edge: `river-reed-cluster`, `lily-pad-cluster`, `river-stone-cluster`. There is no flowing-waterfall model, so waterfalls and brooks are procedural.
- Clutter (instanced by `world/scatter.js`): `club-moss-mat`, `fern-plant`, `fern-clump`, `grass-tuft`, `wildflower`, `mushroom-cluster`, `toadstool`, `bone-scatter`.
- The mine: `mine-cart`, `mine-rail-run`, `ore-barrow`, `rope-coil`, `bolted-ladder`, `torch-stake`.
- The camp: `market-stall` and `hanging-signboard` (the bat merchant's shop), `stone-altar` (the star altar), `petroglyph-boulder` (the codex stone), `wayfinder-post`, `stone-cairn`.

**Area 2 — 버섯 숲 Mushroom Forest (giant glowing mushrooms, poison)**
- The Insect World kit at bug's-eye scale: `glowing-bonnet-mushroom`, `puffball-mushroom`, `orb-web` (the chasm's bridge), `wasp-paper-nest`.
- Mid: `dead-snag`, `bracket-fungus-log`, `giant-mushroom-cluster`, `cobweb-drape`, `ant-pupa-cocoon`.
- Poison hazards: `bubbling-mud-pool`, `tar-pit`, `fumarole-vent` (the poison pools and vents).

**Area 3 — 얼음 호수 Ice Lake (blue ice, slippery, icicles)**
- `frozen-waterfall`, `ice-chunk` (ice blocks), `obsidian-shard-cluster` (blue ice shards), `basalt-column-outcrop`.
- A lost explorer's camp for a little story: `snow-capped-log-pile`, `ice-axe-and-crampon`, `cleared-fire-pit`.
- Icicles and the slippery ice are procedural (no icicle-ceiling model).

**Area 4 — 수정의 심장 Crystal Heart (dark purple floating crystals, final arena)**
- Floating rock: `large-asteroid`, `medium-asteroid`, `small-asteroid`.
- Guardians: `standing-moai`, `tukuturi-kneeling-moai`, `unfinished-moai`.
- Built ruins (Dungeon & Crypt): `dungeon-wall-module`, `battle-damaged-wall-module`, `ruined-gable-end`, `stone-stair-flight`, `flagstone-floor-tile`, `standing-brazier`, `collapse-rubble-mound`, `fallen-ashlar-block`, `masonry-rubble-chunk`, `rope-bridge-span`, `tunnel-portal`.
- Lore and glow: `carved-grave-stele`, `glowing-rune-stone`.
- Crystals: `crystal-cluster` and `mineral-geode-cluster`, scaled up (also used in other regions), and `crown` for the Crystal King.

### (d) 적·NPC·아이템 (Enemies, NPCs, items)

| game role | model | note |
|---|---|---|
| wolf, rabbit, fox | `wolf-base`, `rabbit-base`, `fox-base` | rigged (Idle/Walk/Run) |
| deer, bear | `deer-base`, `bear-base` | rigged; the Ice Bear is `bear-base` recoloured white and scaled up |
| snow hare | `mountain-hare-base` | the Ice Lake's rabbits |
| Giant Rabbit Chief | `rabbit-base`, scaled up | |
| mole, bat merchant, Mushroom Queen, Crystal King | none | built procedurally (the King wears Polyfork's `crown`) |
| hammer, water gun, vine, mask, necklace | none fitting | built procedurally |

### (e) 공백 — 직접 만들어야 하는 것 (Gaps to build procedurally)

1. Icicle ceilings and drip stalactites (the intro's dark chamber uses `stalactite-cluster`).
2. Flowing waterfalls, streams and splashes: procedural meshes and shaders.
3. Light shafts, fireflies, mist, glow sprites: shaders and points.
4. Large crystal spires: `crystal-cluster` and the geode are about 1 m, so they are scaled 3–6×.
5. The cave shell: procedural terrain.
6. Creatures: the bat merchant, the mole, the Mushroom Queen, the Crystal King.
7. Items: mask, water gun, necklace.

## 4. 인트로 컷신 (The intro cutscene's set)

The intro (`src/ui/intro.js`, `INTRO_MODELS`) borrows a sunny forest that the cave never shows: `broadleaf-oak`, `oak-tree`, `birch-tree`, `maple-tree`, `tall-pine-tree`, `young-pine`, `round-bush`, plus `stalactite-cluster` for the dark chamber below; and it reuses the valley's grass, flowers, ferns, toadstools, boulders, stump, log, cave mouth, crystals, mushrooms and four animals. These load only when the intro plays and are let go after it.
