# SECRET CAVE · 비밀 동굴

> One brave puppy. One mysterious cave. One way out.

A 3D action adventure for kids that runs in the browser: a brave Maltese
falls into a mysterious cave, collects magic items, puts the animals the
purple crystal has turned wild to sleep, beats the Crystal King in the
deepest cave and escapes into the sunlight.

**Play:** https://yorkie-labs.github.io/secret-cave/

Made by a dad and his daughter, who wrote the story and directed the game.
The successor to [Scary Island](https://github.com/yorkie-labs/scary-island),
whose engine, controls and camera it keeps. The game's text is in Korean,
written for young children. three.js + Rapier, low-poly models from
[Polyfork](https://polyfork.dev). Design: [docs/GDD.md](docs/GDD.md) (Korean).

## The game

One big underground world, four regions stacked downward round a **camp**,
each with a boss: the **Moss Valley** (Giant Rabbit Chief), the **Mushroom
Forest** (Poison Mushroom Queen), the frozen **Ice Lake** (Ice Bear) and the
**Crystal Heart** (Crystal King, then the escape). Every attack paints a red
mark on the floor first: step out of it or roll through it. Animals never
die, they fall asleep. Each return to camp starts a new expedition; fainting
just wakes you at the camp. Stars open lasting growth at the star altar
(more hearts, hats and a scarf for the Maltese), the codex book fills with
everything you meet, and every region hides a secret behind a crystal door.
The game saves by itself in the browser (if the browser blocks storage, it
still plays, says so on the title, and keeps nothing after the tab closes).
The first visit downloads ~17 MB of models from the Polyfork CDN: the title
comes up once the entrance's share (~7 MB) is in, the rest streams in while
you play.

## Story

A brave little Maltese follows strange footprints into a cave — and the
floor gives way. Deep underground, every animal the purple crystal touched
attacks: wolves, rabbits, and worse. With an old hammer and a water gun the
Maltese sets out to find the way up. In the first room lies a golden
necklace; the letters on the wall say *"동굴의 가장 깊은 곳에 닿는 자만이
빛을 볼 수 있으리"* (only who reaches the deepest place will see the light).
At the bottom of the Moss Cave waits the Giant Rabbit Chief. Beat it, and
the way opens down into the Mushroom Forest, where the Poison Mushroom Queen
reigns, then the frozen Ice Lake and its Ice Bear. Under the camp lies the
Crystal Heart, where the necklace opens the last doors and the Crystal King
guards the purple crystal. Put him to sleep and its light fades, the cave
shakes, and a hidden way leads up into the sunlight — but deep inside, one
small purple shard still glimmers…

## Controls (Diablo-style)

| Input | Action |
|-------|--------|
| left click | ground: walk there (hold to keep following) · animal: walk up and swing the **hammer** · chest/door/thing: walk up and use |
| right click | the selected **tool** toward the cursor (water gun / vine / mask) |
| Q | switch the right-click tool |
| 1 | sniff: hidden things nearby sparkle |
| 2 | roll toward the cursor |
| 3 | shield (hold) |
| 4 | eat a herb |
| Space | use the nearest thing · next line of a dialogue |
| Tab · Esc | cave map · menu (volume, quality) |

Mouse wheel zooms. **Phones and tablets** get a joystick and buttons with a
word under each icon (망치, 도구, 바꾸기, 구르기, 방패, 약초, 냄새, 사용, 지도,
메뉴); tap the ground to walk there, tap a dialogue to go on.

## Quality

Three levels; the Esc menu cycles them (**화질: 높음 → 중간 → 낮음**) and this
browser remembers the pick.

| Level | Pixels per CSS pixel | Ambient occlusion | Bloom | Shadow map | MSAA |
|---|---|---|---|---|---|
| 높음 high | up to 1.5 | yes | yes | 2048 | 4× on a 1× screen, 2× on a denser one |
| 중간 medium | up to 1.25 | no | yes | 1024 | same |
| 낮음 low | 1 | no | no | 1024 | 2× |

Phones and small tablets start low, computers high. If a computer can't keep
up (the median frame over 20 ms, under ~50 fps, a few seconds into play) the
game steps down one level by itself and says so (부드럽게 하려고 화질을
낮췄어요); it never steps up, and never overrides a level picked in the menu.
The address can force a level: `?q=high`, `?q=medium` or `?q=low`, e.g.
https://yorkie-labs.github.io/secret-cave/?q=low.

**Slow on your machine?** Open the game with `?perf=1`
(https://yorkie-labs.github.io/secret-cave/?perf=1): a panel in the top-left
corner shows fps, frame time, CPU time, draw calls, the pixels drawn and the
level, with switches to turn ambient occlusion, bloom, shadows, MSAA and the
pixel ratio off and on. Tell us which switch helps most.

## Run locally

```bash
npm install
npm run dev            # http://localhost:5191 (predev fetches the Polyfork models, not committed)
npm test               # unit tests (vitest, a few seconds)
npm run build          # → dist/ (static files, relative paths: any sub-folder works)
npm run preview        # serve dist/ locally to check it
```

`dist/` is a plain static site. Every push to `main` runs
`.github/workflows/pages.yml` (tests, build, GitHub Pages). The game needs
WebGL; it tells players kindly if their browser has none. Headless
playtests: `node scripts/e2e.mjs scripts/scenarios/<name>.js` (the dev
server must run; `npm run playtest` plays the whole game with a scripted
player; `GAME_URL=http://localhost:4173/?seed=4` runs one against
`npm run preview`). On the published build, debug links (`?start=`,
`?seed=`, `?world=`) and anything that touches `window.G` play in a
separate sandbox save, so they never change a player's real save.

## Project structure

- `src/main.js` — boot and main loop; `src/core/` — the game context, the run, the save
- `src/world/` — the underground world as data, its terrain, props, regions and expeditions
- `src/entities/` — the Maltese, the animals, the bosses, the bat merchant
- `src/combat/`, `src/data/` — combat maths, items, grades, combos; balance as data
- `src/player/`, `src/systems/` — movement, camera, click-to-move and paths
- `src/render/` — light, shadows, post-processing; `src/ui/` — HUD, menus, intro, ending; `src/audio/` — synthesised music and sound
- `test/` — unit tests; `scripts/` — asset fetch, headless playtests
- `docs/GDD.md` — the design document; `tasks/` — the development log (the earlier, longer README is in [tasks/20261105-readme-status-log.md](tasks/20261105-readme-status-log.md))

## Licences

**The code is not open source.** It is public so you can read it and play
the game, but there is no licence for reuse: all rights reserved.

**The 3D models are not in this repository or in the build.** Polyfork
low-poly models are free for games; shipping them inside the game is fine,
redistributing the raw files as assets is not (see https://polyfork.dev/licensing).
So the game loads them at runtime from the Polyfork CDN
(`https://polyfork.dev/cdn/<id>.glb`), and `vite build` deletes
`dist/assets/polyfork`. The dev server uses local copies from
`npm run fetch-assets` (gitignored). Only if you have permission to
self-host, build with `VITE_SELF_HOST_MODELS=1 npm run build`.

**Third-party notices:** the build ships
[`THIRD_PARTY_LICENSES.txt`](https://yorkie-labs.github.io/secret-cave/THIRD_PARTY_LICENSES.txt)
with the full licence of every bundled library and the font (generated by
`vite.config.js` from `node_modules`).

## Credits

- Story & direction: Jiyu (daughter) · Hackerwins (dad)
- 3D models: [Polyfork](https://polyfork.dev) (loaded from the Polyfork CDN at runtime; the files are not in this repository)
- Engine: [three.js](https://threejs.org), physics: [Rapier](https://rapier.rs), post-processing: [postprocessing](https://github.com/pmndrs/postprocessing) (zlib) and [N8AO](https://github.com/N8python/n8ao) (ISC)
- Font: [Jua](https://fonts.google.com/specimen/Jua) (SIL Open Font License, via `@fontsource/jua`)
- Music and sound: synthesised in the browser with WebAudio (no recordings, nothing to license)
- Full licence texts: [THIRD_PARTY_LICENSES.txt](https://yorkie-labs.github.io/secret-cave/THIRD_PARTY_LICENSES.txt)
