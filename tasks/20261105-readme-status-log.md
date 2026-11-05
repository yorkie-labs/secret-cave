# 2026-11-05 · README 작업 기록 (옮김)

출시 준비(`20261105-release-prep-todo.md`)에서 README를 플레이어용으로 줄이면서, 그때까지 README에 있던
W5–W7 상태 기록, 큰 세계 설명, 자세한 플레이 방법, 옛 실행 명령, 자세한 조작표, 코드 지도를 여기로 옮겼다.
아래는 2026-11-05 README의 해당 부분 원문 그대로다(고치지 않음).

---

**Status:** complete (W5 of the world redesign, 2026-11-02) — the whole game
plays from the prologue to the ending and on into the post-game, every
feature of the design is in, and a scripted player finishes it headless.
W6 (2026-11-04): the world squeezed twice so it is quick to walk (about a
third of the walking: entrance → camp 473 → 156 m), the valley-descent
graphics glitch fixed, and every new game opens with the story.
W7 (2026-11-05): a click on the ground goes where the cursor is (it was
taken over by invisible 30 m prop columns, a rock top in front of the lens
or the level behind a back wall), an unreachable click says so (a red ×,
"저기는 못 가요"), rock in front of the lens is cut away across the whole
screen and the lens tilts up rather than rising into the rock, the touch
buttons have words, and the old seeded-cave modes are gone.
Next: the director's playtest.

One **big underground world** (hand-designed; W6 squeezed it twice so it is
quick to walk: about 280 m of walkable ground across, from 0 m down to
−63 m), four regions stacked downward round a **camp**:

| Region | Levels | What is there | Boss |
|---|---|---|---|
| 1 Moss Valley | 0 → −11 m, meadow −13.5 | a sinkhole, stepped waterfalls, a stone viaduct over a gorge, an old mine; wolves, rabbits | Giant Rabbit Chief (its sleep opens a mine-cart shortcut and the forest gate) |
| camp | −13.5 m | the glowing spring, the bat merchant, the codex stone, the star altar, a balcony over the Crystal Heart | — |
| 2 Mushroom Forest | −18 / −25 / −32 m | glowing giant mushrooms, an orb web over a chasm, bounce mushrooms, poison pools and vents; foxes, moles | Poison Mushroom Queen (a mushroom lift home) |
| 3 Ice Lake | −13.5 → −29 m | an icy pass with falling icicles, a snow shelf, a slippery frozen lake, frozen falls, ice walls the hammer breaks; deer, bears, snow hares | Ice Bear (a rope lift home) |
| 4 Crystal Heart | −29 → −63 m | crystal canyons, ruins over a glowing abyss, floating rocks crossed by hops, crystal spikes; every animal, crystal-tinted | Crystal King → the escape → the ending |

Each return to camp is a new expedition (packs, chests and herbs re-rolled);
fainting wakes you at the camp. Stars from first deeds open lasting growth
at the **star altar** (more hearts, a herb pouch, a bigger tank, a rabbit
mask, hats and a scarf and wellies for the Maltese); the **codex book**
fills with pictures of everything met; the hammer and the water gun come in
**common / rare / legend** grades; five **item combos**; a **secret pocket**
in every region behind a crystal door only a sniff finds and the golden
necklace opens; and after the ending a **purple shard** hints at the next
adventure. Synthesised music for every region and boss. Roadmap: GDD §11,
progress: [tasks/](tasks/README.md). Checks: W0's test terrain at
`?world=test` (also where the fighting and item checks run);
`?start=mushroom` / `?start=ice` / `?start=heart` begin a region in with
the bosses before it asleep.

## How to play

**The start.** A new game (새 게임, or 처음부터 in the Esc menu) opens with a
~40-second **3D intro** in the game's own engine: the Maltese strolls
through a sunny forest, sniffs out glowing footprints, finds a huge cave
mouth ("멍? 여기는 어디지?"), the ground gives way (쿠구구궁!), eyes shine in
the dark below, and it picks up the hammer and the water gun ("좋아! 반드시
여기서 나갈 거야!") — then the game starts at the sinkhole's foot. Subtitles
type out under the picture; click / tap / Space shows the next line, Esc or
**건너뛰기 ▶▶** skips it. 이어 하기 goes straight back in; the menu's
이야기 보기 plays it again.

**The loop.** Explore on foot: the cave goes down in steps (ramps join the
levels, bridges cross gorges, bounce mushrooms and floating-rock hops jump
between levels — a click past them routes through). The top left names
where you are; the round minimap and the Tab map show what you have seen.
The **camp** is home: the spring fills every heart, the bat merchant trades
crystal shards for things, the codex stone opens the codex book, the star
altar spends stars. Every time you come back to camp from outside, a new
expedition begins: the animals, chests and herbs are new. Out of hearts?
You wake at the camp; you lose half the shards found on this expedition and
the hammer's and water gun's grades; opened gates, beaten bosses, the map,
your items, the codex, stars and unlocks stay. Lose to the same boss twice
in a row and the merchant tucks an extra herb in your bag.

**Fighting.** Every attack **paints a red mark on the floor first**: step
out of it, or roll (2) through it. Animals don't die, they fall asleep;
put a whole pack to sleep and its shards fly to you. Each animal fears one
item (the codex says which): the vine ties a **wolf**; the hammer catches a
**rabbit** (or snow hare) right as it lands; water shows up a hiding **fox**
and floods out a **mole** from its mound; a raised shield sticks a
**deer**'s antlers fast; water in a **bear**'s face makes it reel. The
hammer's third hit in a row shakes the ground.

**Bosses** rest after every pattern and are dizzy (the hammer hits twice as
hard) after their big moves: the **Giant Rabbit Chief** slams, flaps its
ears and dashes three times; the **Poison Mushroom Queen** blows spores,
calls poison mushrooms and seeps clouds (wash them with water), her cap
drooping after; the **Ice Bear** punches (its fist sticks in the ice),
drops ice and blows a blizzard on a slippery rink; the **Crystal King**
sweeps a laser across a red wedge (a yellow arrow shows which way it
sweeps: get out sideways or behind him), bursts crystal spikes and calls
animals — after a laser or the spikes he slumps, tired: hammer his chest
crystal. Beat him, then run up the collapsing tunnel into the sunlight.

**Items.** Hammer (left click), the right-click tool (water gun / vine /
mask, Q switches), shield (hold 3), herbs (4, two hearts; press 4 again
while eating to eat two at once for five hearts), armour (blue hearts taken
before the red, refilled at springs). **Grades**: grade-up gems in chests
(more often deeper), the merchant's upgrades and the secret chests raise the
hammer (rare: reaches further; legend: a small shockwave every hit) and the
water gun (rare: two streams; legend: water bombs); the slot's border shows
it (white, blue, gold). **Combos** pop up with "콤보!": water + vine (wet
animals stay tied 5 s), hammer + armour (a hit mends half a blue heart once
a fight), mask + vine (the vine keeps the mask on), shield + hammer (a swing
right after a block hits twice as hard), herb + herb.

**Secrets.** Each region hides a crystal door that looks like a mossy rock
wall. When the nose says so, sniff (1): the door shows itself; walk up with
the golden necklace and it opens. The first time gives a star and a codex
page; the chest inside holds a rare reward every expedition.

**Stars and the altar.** Stars come from each boss the first time, each
secret the first time, half and all of the codex, and the purple shard
after the ending (11 in all). The **star altar** opens, for good: hearts
+1 (twice), the herb pouch, the big tank (+50 % water), the rabbit mask
(two seconds longer), and the Maltese's explorer hat, flower crown, red
scarf and yellow wellies (put them on and off at the altar).

**Sound.** Gentle synthesised music for the camp and every region, a theme
for each boss, the escape and the ending. The menu (Esc) has music and
sound-effect volume sliders.

## Run

```bash
npm install
npm run fetch-assets   # Polyfork GLBs + stage.mjs (not committed)
npm run dev            # http://localhost:5191 (game), /gallery.html (characters, dev only)
npm test               # unit tests (~2 s: the world's data and encounters, clicks, growth, codex, grades, combos, secrets, movement, nav, save, combat, enemy and boss AI)
npm run playtest       # headless whole-game run by a scripted player (dev server must run): intro (skipped) → four bosses → escape → ending → the purple shard
npm run world-preview  # the world drawn top-down to /tmp/secret-cave-world.png
```

Add `?q=low` to the address on a slow machine: no ambient occlusion and no
bloom (the colour grade and vignette stay), a smaller shadow map.

## Controls (Diablo-style, GDD §4.1)

| Input | Action |
|-------|--------|
| left click | ground: walk there (hold to keep following; the ground you see under the cursor, a wall past the hero means its foot; somewhere unreachable: a red × and "저기는 못 가요", and the hero goes as near as it can) · enemy: walk up and swing the **hammer** · item/door/chest: walk up and use |
| Shift + left click | hammer in place toward the cursor |
| right click | the selected **tool** toward the cursor (water gun / vine / mask) |
| Q | switch the right-click tool |
| 1 | sniff: a scent ring rolls out; hidden things it reaches sparkle and get name tags |
| 2 | roll toward the cursor |
| 3 | shield (hold) |
| 4 | eat a herb |
| Space | use the nearest thing · next line of a dialogue |
| Alt (hold) · Tab | name tags · cave map |
| wheel · Esc | zoom · menu (volume) |

No WASD and no jump: high places are reached by ramps, bridges, bounce
mushrooms and hops. **Phones and tablets** get a joystick and ten buttons
(GDD §4.2), each with a word under its icon: 🔨 망치 hammer (at the
nearest animal), 💧 도구 tool, 🔄 바꾸기 switch tool, 🌀 구르기 roll, 🛡️ 방패
shield (hold), 🌱 약초 herb, 👃 냄새 sniff, ✋ 사용 use, 🗺️ 지도 map, ☰ 메뉴
menu; tap the ground to walk there, tap the dialogue to go on.

## Code map

- `src/main.js` — boot, main loop, key bindings
- `src/core/game.js` — the game context `G`: interactables, pickups, hits, lights, dialogue, fainting and starting over; `run.js` — this run (hearts, water, shards); `state.js` — the save (codex, stars, unlocks, necklace, and the big world's progress: camp, gates, bosses, fog, the bag)
- `src/world/` (W0–W1, the big world) — `world.js` (pure: the world as data + one height function: hollows carved in rock, cliffs, ramps, bridges, water, gates, named places), `worlds/main.js` (the real world's data: regions, levels, gates, the camp, encounter spots, landmarks, falls), `navGrid.js` (pure: the walkable grid and A*), `terrain.js` (chunked ground meshes built near the hero, heightfield colliders, the cut-away shader), `build.js` (bridges, landmarks, waterfalls, brooks, rails, light shafts, fireflies), `scatter.js` (thousands of instanced Polyfork props, placed deterministically off the lanes), `gates.js`, `encounters.js` (pure: an expedition's spots from its seed, the faint penalty), `expedition.js` (the camp loop: gates, camp, necklace, chief arena, waking animals, fainting; W2: the queen's ring, the mushroom lift, tougher animals per region), `forest.js` (W2: the Mushroom Forest's pools, vents, poison and bounce mushrooms, spores, spring), `lake.js` (W3: the Ice Lake's falling icicles, resting spring, snow and breath; slippery ice is `world.js` `SLIP`), `heart.js` (W4: the Crystal Heart's floating rocks and hop pads, the giant crystal heart and its beams, drifting asteroids, ruins and guardians, crystal spikes, the crystal bridge, the sunlight and the escape run; the rocks are `world.js` `islands`, the hops `navGrid.js` jump links), `src/entities/bosses/crystalKing.js` + `crystalKingAI.js` (W4: the last boss), `src/entities/crystalTint.js` (W4: region 4's animals), `sampleWorker.js` (W2: the world's 1 m grid sampled in a Web Worker while the models load); `src/ui/worldMap.js` (minimap and Tab map with saved fog of war), `secrets.js` (W5: the secret pockets' doors, sniff reveal, chests, the purple shard)
- W5 growth: `src/data/unlocks.js` + `src/core/growth.js` (pure: the star altar, the stars for first deeds, the codex milestones, the boss-loss herb) + `src/ui/altar.js` + `src/entities/cosmetics.js` (the Maltese's hats, scarf, wellies); `src/data/codex.js` + `src/ui/codex.js` (the codex book) + `src/ui/thumbs.js` (its pictures, drawn from the models); `src/combat/grades.js` (pure: item grades) and `src/combat/combos.js` (pure: the five combos)
- `src/world/models.js` — Polyfork models; `glow.js` (the soft glow texture), `spawn.js` (who builds each animal), `escape.js` (the escape run's falling rocks)
- `src/render/` (K1, the soft look) — `light.js` (the cave's light on top of Polyfork's stage rig: the key from the lens's front-left, soft blue shadows, cool sky / warm ground fill), `shadowbox.js` (pure: the key's direction and the shadow box that follows the hero, fitted to the view and snapped to the shadow map's texels), `post.js` (postprocessing + N8AO: ambient occlusion, bloom, colour grade, vignette; `?q=low`)
- `src/player/` — controller, movement maths, Diablo-style camera
- `src/systems/` — click to move (`pointer.js`; W7: what a click means is `resolveClick.js`, pure: the ray marched over the height world, unit-tested), A* paths (`nav.js`, on the world's walkable grid)
- `src/data/` — balance as data (GDD §10.4): `items.js` (incl. the shop), `enemies.js`, `bosses.js` (incl. poison and bounce)
- `src/combat/` — pure combat maths (`hits.js`: hearts, damage carry; `loadout.js`: tools, shield, herbs, the mask) and the items (`items/`: hammer, water gun, vine, shield, herb, mask)
- `src/core/shop.js` — the shop's rules (pure); `loot.js` — what comes out of a chest (pure)
- `src/entities/` — the Maltese (`maltese.js`: procedural model and animations; `/gallery.html` shows it up close), the animals' shared AI (`enemyAI.js`, pure) and body (`enemy.js`: chase, red marks, sleep, shard), the wolf, the rabbit, the fox, the deer, the bear and the snow hare (Polyfork's rigged models; the fox's hiding: `foxAI.js`, pure), the mole (`moleAI.js` pure, `mole.js` body), the bosses (`bosses/chiefAI.js` pure scheduler, `bosses/rabbitChief.js`, `bosses/queenAI.js` + `bosses/mushroomQueen.js`, `bosses/iceBearAI.js` + `bosses/iceBear.js`), the Mushroom Cave's mushrooms, poison and bounce mushrooms (`mushrooms.js`), the bat merchant (`bat.js`), the golden necklace (`necklace.js`), chests, the spring
- `src/ui/` — HUD (with the boss plate), menu, result, the intro and the ending (`story.js`; the intro cutscene is `intro.js`, a small forest-and-cave set of its own in the game's renderer, disposed after, its schedule pure in `introTimeline.js`), the shop panel (`shop.js`), name tags, touch; `src/audio/sound.js` — synthesised sound and music
- `scripts/e2e.mjs` + `scripts/scenarios/` — headless playtests; `full.js` plays the whole game in the big world with a scripted player (`_bot.js`: entrance → camp → valley → chief → Mushroom Forest → queen → lift home → Ice Lake → Ice Bear → rope lift home and back → Crystal Heart → Crystal King → escape → ending → result), `w2-forest.js`/`w2-queen.js`/`w2-shots.js` the forest, `w3-lake.js`/`w3-icebear.js`/`w3-shots.js` the lake, `w4-heart.js`/`w4-king.js`/`w4-shots.js` the Crystal Heart, the king and the ending, `w5-altar.js`/`w5-codex.js`/`w5-secrets.js`/`w5-mobile.js` (W5: the altar and cosmetics, the codex book and combos, all four secrets, phones upright and lying down), `w6-descent.js` (the valley's first ramps: no black holes), `w6-pick.js` (W7: clicks land on the ground under the cursor at fixed spots and two zooms, the red ×, the mine cart, the boss plate, rock in front of the lens), `w7-combat.js`/`w7-items.js`/`w7-rabbit.js` (W7, `?world=test`: the wolf's marks and bites, water and the tank, the shield, the vine, herbs, the rabbit's lane and dodge — the old M2/M3/M5 checks); `k1-look.js` (K1: same-spot look screenshots and perf, high vs `?q=low`; `SIZE=1600x900` on `e2e.mjs` for 16:9); `scripts/world-preview.mjs` draws a world top-down (a map-frame grid, bounce links, poison; an optional crop window)
