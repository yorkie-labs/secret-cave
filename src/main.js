import '@fontsource/jua'; // the Jua font, bundled: no third-party font server for a kids' game
import * as THREE from 'three';
import { stage } from './vendor/polyfork/stage.mjs';
import { createPost, chooseQuality, QUALITY_KEY } from './render/post.js';
import { caveLight } from './render/light.js';
import { createPhysics } from './physics/physics.js';
import { loadModels, prefetch, regionOf, modelStatus } from './world/models.js';
import { buildWorld, worldModels, sampleInWorker } from './world/build.js';
import { spawnEnemy } from './world/spawn.js';
import { TEST_WORLD } from './world/worlds/test.js';
import { MAIN_WORLD } from './world/worlds/main.js';
import { createExpedition } from './world/expedition.js';
import { HEART_MODELS } from './world/heart.js';
import { createWorldMap } from './ui/worldMap.js';
import { createCodex } from './ui/codex.js';
import { createAltar } from './ui/altar.js';
import { applyWear } from './entities/cosmetics.js';
import { worn } from './core/growth.js';
import { softGlowTexture } from './world/glow.js';
import { newRun } from './core/run.js';
import { createHammer } from './combat/items/hammer.js';
import { createWaterGun } from './combat/items/waterGun.js';
import { createVine } from './combat/items/vine.js';
import { createShieldItem } from './combat/items/shield.js';
import { createHerbs } from './combat/items/herb.js';
import { createMaskItem } from './combat/items/mask.js';
import { createPoison } from './entities/mushrooms.js';
import { createShop } from './ui/shop.js';
import { dropLoot } from './entities/chest.js';
import { dropShard } from './entities/enemy.js';
import { nextTool } from './combat/loadout.js';
import { ITEMS, START } from './data/items.js';
import { newState, load, save, resetWorld, presetProgress, useSandbox, saveKey, SANDBOX_KEY } from './core/state.js';
import { storage, persistent, session } from './core/storage.js';
import { createGame } from './core/game.js';
import { createHud } from './ui/hud.js';
import { createScreens } from './ui/screens.js';
import { createStory } from './ui/story.js';
import { INTRO_MODELS } from './ui/intro.js';
import { createInput } from './input.js';
import { createPlayer } from './player/player.js';
import { initAudio, resumeAudio, setMusic, setAmbience, sfx, currentMusic } from './audio/sound.js';
import { setupTouch } from './ui/touch.js';
import { createIsoCamera } from './player/isoCamera.js';
import { createPointer } from './systems/pointer.js';
import { createNav } from './systems/nav.js';
import { setupLabels } from './ui/labels.js';
import { addSilhouette } from './entities/silhouette.js';

const $ = (id) => document.getElementById(id);

async function boot() {
  // no 3D in this browser: say so kindly instead of failing with an error
  const probe = document.createElement('canvas');
  if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) {
    $('loading-text').textContent = '이 브라우저나 기기에서는 3D 그림을 그릴 수 없어요. 다른 브라우저(크롬, 사파리, 엣지)로 열어 주세요.';
    return;
  }
  // K1: no MSAA on the canvas: the post chain renders into its own
  // multisampled buffer (render/post.js); ?q=low: no AO, no bloom.
  // Release: phones and small tablets start low; the menu's 화질 toggle
  // (kept in this browser) and ?q= in the address override that
  const quality = chooseQuality({ search: location.search, saved: storage.getItem(QUALITY_KEY), touch: matchMedia('(pointer: coarse)').matches, shortSide: Math.min(screen.width, screen.height) });
  const renderer = new THREE.WebGLRenderer({ antialias: false, stencil: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  $('app').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 300);
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    post.setSize(innerWidth, innerHeight);
  });
  // underground: no sky, a dim cool rig; crystals and the hero's own glow do
  // the rest (GDD §9 "빛")
  const look = stage(renderer, scene, { time: CAVE_TIME, sky: false, shadowSpan: 56, far: 160 });
  // night is too murky for a kids' game: lift the fill and the key so the
  // floor and the white hero read at the default zoom (M2 review); the
  // crystals keep their colour pools, so the cave stays mysterious
  look.hemi.intensity *= CAVE_FILL;
  look.key.intensity *= CAVE_KEY;
  // K1: the key from the lens's front-left, soft blue shadows in a box that
  // follows the hero (stage's own 56 m box and key placement are taken
  // over each frame), a warm-ground / cool-sky fill (render/light.js)
  const light = caveLight(look, { quality });
  const post = createPost(renderer, scene, camera, quality);

  const params = new URLSearchParams(location.search);
  // Release: a debug link (?start=, ?seed=, ?world=) on the published game
  // plays in the sandbox save slot (core/state.js), so a shared test link
  // never touches a child's real save; the dev server keeps one slot
  if (!import.meta.env.DEV && DEBUG_PARAMS.some((k) => params.has(k))) useSandbox(true);
  // W2: the big world's 1 m grid is sampled in a worker meanwhile (world/build.js)
  // (W1: the big world, world/worlds/main.js, is the game; ?world=test is
  // W0's test terrain, for its checks)
  const worldDef = params.get('world') === 'test' ? TEST_WORLD : MAIN_WORLD;
  const sampling = sampleInWorker(worldDef === TEST_WORLD ? 'test' : 'main');
  const physics = await createPhysics();
  const state = load() ?? newState();
  // ?seed=N fixes the dice (chests now, M4's caves later), for checks and
  // for sharing a run; otherwise every run rolls its own
  const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
  const fixedSeed = Number.isFinite(seedParam) ? seedParam >>> 0 : undefined;
  const run = newRun(fixedSeed); // this run only, never saved
  const hud = createHud();
  const input = createInput();
  const G = createGame({ scene, camera, renderer, look, physics, state, run, input, hud });
  G.quality = quality; G.post = post;
  // the menu's 화질 toggle: live, and kept in this browser
  G.setQuality = (q) => { G.quality = q; post.setQuality(q); light.setQuality(q); storage.setItem(QUALITY_KEY, q); };
  Object.defineProperty(G, 'saveKey', { get: saveKey }); // (checks read the save back with it)
  G.groundMeshes = []; // what a click on "the ground" may land on
  G.fixedSeed = fixedSeed;

  // Release: the models the entrance, Moss Valley and the camp need (and
  // the animals there) first; the title comes up when they are here. The
  // rest streams in behind it (world/models.js: a few at a time, retried,
  // the region the hero is in first; a new game's intro set right after)
  const keys = [...new Set(['crystalCluster', 'geode', 'mossBoulder', 'wolf', 'rabbit', 'fox', ...(worldDef === MAIN_WORLD ? ['deer', 'bear', 'hare', 'headframe', ...HEART_MODELS] : []), ...worldModels(worldDef)])];
  const first = worldDef === MAIN_WORLD ? keys.filter((k) => regionOf(k) === 1) : keys;
  const firstReady = loadModels(first, { priority: 1, keep: true, onProgress: (d, n) => loadingProgress(d, n) });
  for (const k of keys) if (!first.includes(k)) prefetch([k], regionOf(k)); // (queued behind the first ones)
  if (worldDef === MAIN_WORLD && !state.world.started) prefetch(INTRO_MODELS, 1.5, { keep: false });
  G.models = { get pending() { return modelStatus().pending; }, get failed() { return modelStatus().failed; } };
  await loadingScreen(firstReady);

  // starting over: a new run on a fresh page, straight into the cave (no
  // second title screen); the save (codex, stars) stays
  const AUTOSTART = 'secret-cave-autostart';
  const startOver = () => {
    // (the big world: 처음부터 means the world over again; the codex stays)
    if (G.expedition) { resetWorld(state); save(state); }
    session.setItem(AUTOSTART, '1'); // (blocked: memory, and the title shows)
    location.reload();
  };
  const screens = createScreens(G, { onRestart: startOver, onTitle: () => location.reload() });
  const story = createStory(G);

  document.body.classList.toggle('no-map', worldDef === TEST_WORLD);
  // a cave of many levels: a deep dark beyond the walls (stage's dusk
  // horizon would show through a cut-away), a thinner haze so the floor
  // 20 m below still reads, a little bluer the deeper it lies
  const lookDef = worldDef.look ?? {};
  scene.background = new THREE.Color(lookDef.background ?? WORLD_DARK);
  if (scene.fog) scene.fog.color.set(lookDef.fog ?? WORLD_FOG);
  look.hemi.intensity *= lookDef.fill ?? 1;
  look.key.intensity *= lookDef.key ?? 1;
  buildWorld(G, worldDef, { sample: await sampling });
  // W2: poison (the Mushroom Forest's pools, vents and the queen's clouds)
  if (worldDef.hazards) createPoison(G);
  // checks: ?start=mushroom (W2) begins at the forest's edge with the chief
  // asleep (release: on the published game only in the sandbox slot, above)
  G.startAt = worldDef === MAIN_WORLD ? params.get('start') : null;
  if (G.startAt && presetProgress(state, { start: G.startAt, seed: fixedSeed ?? null })) save(state);
  camera.far = lookDef.far ?? WORLD_FAR; camera.updateProjectionMatrix(); // past the haze: nothing to draw (and whole chunks culled)
  G.player = createPlayer(G, { x: G.spawn.x, y: G.spawn.y, z: G.spawn.z, heading: Math.PI });
  look.shadows(G.player.model);
  look.follow(G.player.model);
  // a soft glow around the hero, so the room is never pitch dark, and a warm
  // ring at its feet so the little dog reads from the far camera
  const glowAt = new THREE.Vector3();
  G.addLight({ pos: () => glowAt.copy(G.player.position).setY(G.player.position.y + 3), color: '#ffe9c4', intensity: 12, distance: 14 });
  const heroRing = createHeroRing();
  scene.add(heroRing);
  // one control scheme: the Diablo-style top-down view, all by mouse plus the
  // number keys (GDD §4: no WASD, no third-person camera)
  G.cam = createIsoCamera(G);
  G.pointer = createPointer(G);
  G.useTool = () => useTool(G); // the right click
  G.nav = createNav(G); // (a height world's paths come from its walkable grid)
  // M2: the hammer (left click), the water gun (right click) and the wolves
  G.hammer = createHammer(G);
  G.waterGun = createWaterGun(G);
  // M3: the vine (a second right-click tool), the shield (3), herbs (4) and
  // the treasure chests they come out of
  G.vine = createVine(G);
  G.mask = createMaskItem(G); // M6a: the third right-click tool
  G.tools = { waterGun: G.waterGun, vine: G.vine, mask: G.mask };
  createShop(G);
  G.shield = createShieldItem(G);
  G.herbs = createHerbs(G);
  createCodex(G);
  createAltar(G);
  applyWear(G.player.model, worn(state)); // (W5: the star altar's cosmetics)
  if (worldDef.camp) {
    // W1: the expedition loop (camp, gates, spots, the chief, fainting) and its map
    G.expedition = createExpedition(G, worldDef);
    G.map = createWorldMap(G);
    G.player.teleport(G.expedition.home(), Math.PI);
  } else G.map = { open: false, toggle() {}, revealAll() {} }; // (the test world: no map)
  // what a run starts with goes in the codex the first time (GDD §8.4)
  G.startRun = () => { for (const id of START.owned) G.discover(id); };
  G.dropLoot = (item, at) => dropLoot(G, item, at); // an item on the floor (M4 rooms, checks)
  G.dropShard = (at) => dropShard(G, at); // a crystal shard on the floor (checks)
  G.spawnEnemy = (spec) => spawnEnemy(G, spec); // an animal ({ kind, x, z }) right here (checks)
  // the HUD's cooldown sweeps, every frame (cheap: only changed styles are set)
  G.onUpdate(() => hud.cooldowns({
    tool: G.tools[run.tool]?.cooldown ?? 0,
    shield: G.shield.cooldown, shieldUp: G.shield.up, shieldHold: G.shield.holdLeft,
  }));
  // the hero's silhouette through pillars in the top-down view
  const heroGhost = addSilhouette(G.player.model, '#7fe3ff');
  setupLabels(G);
  bindKeys(G, screens);
  hud.onKey = (code) => input.trigger(code);
  hud.onKeyUp = (code) => input.release(code);
  setupTouch(G);
  hud.area(G.expedition ? '동굴 입구' : G.world.def.name);

  // title screen: the room seen from a slow circle above it. W6: every new
  // game (새 게임, 처음부터) plays the intro first; 이어 하기 does not (the
  // user: the title's own 이야기 보기 button felt odd; it is in the menu now)
  $('loading-text').textContent = '';
  $('title').classList.add('live');
  if (G.expedition && state.world.started) $('btn-new').textContent = '이어 하기'; // (처음부터 is in the menu)
  if (state.wins || state.necklace) {
    $('title-save').textContent = [state.necklace && '🏅 황금 목걸이', state.stars && `⭐ ${state.stars}`, state.wins && `🏁 탈출 ${state.wins}번`, state.world?.won && '🌟 탈출 뒤 탐험 중'].filter(Boolean).join(' · ');
    $('title-save').classList.remove('hidden');
  }
  // the sound wakes with the first touch, click or key (browsers keep it
  // asleep until then), whatever screen that is on
  const wakeAudio = () => { initAudio(); resumeAudio(); };
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, wakeAudio, { passive: true });
  // (a new game's intro set was asked for at boot, right after the first models)
  // the browser blocks storage: the game plays, but say that nothing is kept
  if (!persistent) $('title-note').classList.remove('hidden');
  let introShown = false;
  const start = () => {
    initAudio(); resumeAudio();
    if (story.playing) return;
    const newGame = !(G.expedition && state.world.started);
    if (newGame && !introShown) {
      introShown = true;
      $('title').classList.add('hidden');
      story.playIntro(() => { save(state); start(); });
      return;
    }
    $('title').classList.add('hidden');
    hud.show(true);
    state.runs++;
    G.startRun();
    G.expedition?.begin(); // W1: drop in through the sinkhole, or wake at the camp
    G.refresh();
    G.mode = 'play';
    G.settle();
    G.cam.snap(G.player.position);
  };
  $('btn-new').onclick = start;
  // the menu's 이야기 보기: the intro again, then back to the menu
  $('btn-intro').onclick = () => {
    $('menu').classList.add('hidden');
    story.playIntro(() => $('menu').classList.remove('hidden'));
  };
  let autostart = false;
  try { autostart = session.getItem(AUTOSTART) === '1'; session.removeItem(AUTOSTART); } catch { /* ignore */ }
  if (autostart) {
    // no click on this page yet: the sound wakes up with the first one
    const wake = () => { resumeAudio(); removeEventListener('pointerdown', wake); removeEventListener('keydown', wake); };
    addEventListener('pointerdown', wake); addEventListener('keydown', wake);
    start();
  }

  // main loop
  const clock = new THREE.Clock();
  const fogTarget = new THREE.Color();
  let musicTimer = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    // the intro cutscene draws its own set (ui/intro.js); the world waits
    if (story.view) { story.view(dt); return; }
    if (G.running()) {
      physics.step(dt, (step) => { if (G.mode === 'play') G.player.fixedUpdate(G.pointer.moveInput(input.move), G.cam.yaw, step); });
      physics.recoverDynamics(-3);
      G.player.update(dt);
      G.update(dt);
      G.pointer.update(dt);
      state.playTime += dt;
    }
    if (G.mode === 'title') titleOrbit(camera, clock.elapsedTime, G.expedition ? G.player.position : null);
    else G.cam.update(G.player.position, dt);
    // (the ghost's `visible` is a setter only: reading it back gave
    // undefined, so the ring's own flag was never a real boolean)
    const heroShown = G.mode !== 'title' && G.player.model.visible;
    heroGhost.visible = heroShown;
    heroRing.visible = heroShown && G.mode !== 'ending';
    heroRing.position.copy(G.player.position).setY(G.player.position.y + 0.06);
    heroRing.rotation.y += dt * 0.6;
    { const k = (clock.elapsedTime * 0.7) % 1; heroRing.userData.pulse.scale.set(1 + k * 0.5, 1, 1 + k * 0.5); heroRing.userData.pulse.material.opacity = 0.45 * (1 - k); }
    if (heroRing.visible) heroRing.userData.conform(G.world?.heightOnGrid, G.player.position);
    // the haze: the cavern fades into the area's colour beyond the hero, not into black
    if (scene.fog) {
      const d = camera.position.distanceTo(G.player.position);
      scene.fog.near = d + (G.world.def.look?.fogNear ?? 14); scene.fog.far = d + (G.world.def.look?.fogFar ?? 150);
      // W1: each place tints the haze its own way (the camp: the pit's purple)
      if (G.expedition) scene.fog.color.lerp(fogTarget.set(G.expedition.area?.fog ?? G.world.def.look?.fog ?? WORLD_FOG), 1 - Math.exp(-dt * 1.5));
    }
    look.update();
    { const lens = lensView(camera, G); light.update(lens.feet, lens.view, G.world?.heightOnGrid); }
    post.render(dt);

    // music mood, a few times a second
    musicTimer -= dt;
    if (musicTimer <= 0 && G.mode !== 'title') {
      musicTimer = 0.25;
      if (G.waterfalls?.length) {
        // W1: the nearest waterfall's roar (a big one is heard further)
        const pp = G.player.position;
        let lv = 0;
        for (const f of G.waterfalls) lv = Math.max(lv, (1 - Math.hypot(pp.x - f.foot.x, pp.z - f.foot.z) / (30 + f.width * 4)) * Math.min(1, 0.5 + (f.top - f.bottom) / 40));
        setAmbience(G.mode === 'title' ? 0 : lv);
      }
      setMusic(moodOf(G));
    }
  });

  // the save only changes at a few moments (G.refresh); also keep it when the
  // tab is hidden or closed, so play time is never lost
  const saveNow = () => { if (G.mode !== 'title') save(state); };
  addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  G.music = () => ({ playing: currentMusic(), wants: moodOf(G) }); // (checks: what the music plays)
  // for debugging and automated checks. Release: on the published game,
  // anything driving the page from outside (devtools, a headless check)
  // moves saving to the sandbox slot the moment it touches G, so debug
  // helpers (G.expedition.jump, G.spawnEnemy, …) never change a real save
  if (import.meta.env.DEV) window.G = G;
  else {
    Object.defineProperty(window, 'G', {
      configurable: true,
      get() {
        if (saveKey() !== SANDBOX_KEY) { useSandbox(true); console.info('[secret-cave] window.G: this tab now saves to the sandbox slot (the real save is left alone)'); }
        return G;
      },
    });
  }
}

// debug links: on the published game they play in the sandbox save slot
const DEBUG_PARAMS = ['start', 'seed', 'world'];

// The loading line under the title: "n/m" and a bar, and after SLOW_MS
// without the first models a kind word that the internet is slow (it keeps
// going: world/models.js retries what stalls).
const SLOW_MS = 8000;
function loadingProgress(done, total) {
  $('loading-text').textContent = `동굴을 불러오는 중… ${done}/${total}`;
  $('loading-bar').style.setProperty('--p', total ? (done / total).toFixed(3) : '0');
}
async function loadingScreen(ready) {
  $('loading-bar').classList.remove('hidden');
  const slow = setTimeout(() => $('loading-slow').classList.remove('hidden'), SLOW_MS);
  try { await ready; } finally {
    clearTimeout(slow);
    $('loading-bar').classList.add('hidden');
    $('loading-slow').classList.add('hidden');
  }
}

// The hero's ring: a clear gold ring round its feet with a soft warm glow
// inside and a faint ring breathing out from it, so the little dog is found
// at a glance from the far camera (GDD §5.1, P review).
// W6: it lies on the ground, not on a flat plane through the feet: on a
// slope a flat ring sank half under the ground on the uphill side (the
// user: "캐릭터 원이 잘림" on the valley's first ramp). Each vertex is set
// on the ground under it every frame (`conform`, the sampled grid's
// heights), a few centimetres up and drawn a little toward the lens.
function createHeroRing() {
  const g = new THREE.Group();
  g.name = 'heroRing';
  g.userData.noFade = true;
  const mat = (o, color = '#ffcf5a') => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.66, 0.86, 48, 1, 0, Math.PI * 1.72).rotateX(-Math.PI / 2), mat(0.85));
  const glowMat = mat(0.38, '#ffd98a');
  glowMat.map = softGlowTexture();
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6, 8, 8).rotateX(-Math.PI / 2), glowMat);
  const pulse = new THREE.Mesh(new THREE.RingGeometry(0.9, 0.96, 48).rotateX(-Math.PI / 2), mat(0.4, '#ffe9b0'));
  ring.renderOrder = glow.renderOrder = pulse.renderOrder = 3;
  g.add(glow, ring, pulse);
  g.userData.pulse = pulse;
  const flat = [glow, ring, pulse].map((m) => Float32Array.from(m.geometry.attributes.position.array));
  // heightAt(x, z): the ground's height there (or null: no height world);
  // `feet`: the hero's position (a deck or a floating rock under the feet,
  // where the ground far below says nothing: the ring stays flat)
  g.userData.conform = (heightAt, feet) => {
    const onGround = heightAt && Math.abs(heightAt(feet.x, feet.z) - feet.y) < 0.6;
    const c = Math.cos(g.rotation.y), sn = Math.sin(g.rotation.y);
    [glow, ring, pulse].forEach((m, k) => {
      const pos = m.geometry.attributes.position, a = pos.array, f = flat[k], sx = m.scale.x;
      for (let i = 0; i < a.length; i += 3) {
        let y = 0;
        if (onGround) {
          const lx = f[i] * sx, lz = f[i + 2] * sx;
          // (the group turns about y: a local point's place in the world)
          const dy = heightAt(feet.x + lx * c + lz * sn, feet.z - lx * sn + lz * c) - feet.y;
          y = Math.min(1.2, Math.max(-0.4, dy)) / m.scale.y;
        }
        a[i + 1] = y;
      }
      pos.needsUpdate = true;
    });
  };
  return g;
}

// K1: what the lens shows, for the shadow box (render/shadowbox.js): where
// it looks (its forward ray down to the hero's hip level: the hero, or
// whatever a cutscene flies to), its distance there, how steeply it looks
// down (the tilt over rock included), its yaw, field of view and shape
const lensDir = new THREE.Vector3(), lensAt = new THREE.Vector3();
function lensView(camera, G) {
  const c = camera.position, p = G.player.position;
  camera.getWorldDirection(lensDir);
  const t = lensDir.y < -0.05 ? (p.y + 0.6 - c.y) / lensDir.y : -1;
  if (t > 0 && t < 400) lensAt.copy(c).addScaledVector(lensDir, t).setY(p.y);
  else lensAt.copy(p);
  const dx = c.x - lensAt.x, dy = c.y - lensAt.y - 0.6, dz = c.z - lensAt.z, flat = Math.hypot(dx, dz);
  return { feet: lensAt, view: { dist: Math.hypot(flat, dy), pitch: Math.atan2(dy, flat), yaw: Math.atan2(dx, dz), fovDeg: camera.fov, aspect: camera.aspect } };
}

// W0's height world: what lies beyond the walls, and the haze.
const WORLD_DARK = '#0b1013';
const WORLD_FOG = '#1c2b30';
const WORLD_FAR = 200; // m: the lens's far plane (the haze ends at ~180 m)

// How dark the cave is, on stage.mjs's day (0) to night (1) line.
const CAVE_TIME = 0.9;
const CAVE_FILL = 3.2; // × stage's hemisphere light at that time
const CAVE_KEY = 1.4; // × its key light

function bindKeys(G, screens) {
  const { input, hud } = G;
  const playing = () => G.mode === 'play';
  const advance = (e) => { if (hud.inDialog) { hud.advanceDialog(); if (e) e.usedForDialog = true; return true; } return false; };

  // GDD §4.1. The mouse does moving, the hammer and the right-click tool (see
  // systems/pointer.js); the number keys are the hotbar.
  // Space: the next line of a dialogue, else use whatever is close by
  input.on('Space', (e) => { if (!advance(e) && playing()) G.interact(); });
  input.on('Enter', (e) => advance(e));
  input.on('KeyB', () => { if (playing()) G.player.act('bark'); });
  input.on('Escape', () => { if (G.shop?.isOpen) G.shop.close(); else if (G.codex?.isOpen) G.codex.close(); else if (G.altar?.isOpen) G.altar.close(); else if (G.map?.open) G.map.toggle(false); else if (screens.menuOpen) screens.closeMenu(); else screens.openMenu(); });
  // the touch buttons' extras (no right click and no Esc on a phone)
  input.on('Tool', () => { if (playing()) useTool(G); });
  input.on('Hammer', () => { if (playing()) G.pointer.hammer(); });
  // 1 sniff, 2 roll, 3 shield, 4 herb (like a Diablo hotbar); Q switches tools
  input.on('Digit1', () => { if (playing()) G.player.act('sniff'); });
  input.on('Digit2', () => { if (playing()) G.emit('rollTowardCursor'); });
  input.on('Digit3', () => { if (playing()) G.shield.raise(); }); // held: up until let go (or 2 s)
  input.onUp('Digit3', () => G.shield.lower());
  input.on('Digit4', () => { if (playing()) G.herbs.eat(); });
  input.on('KeyQ', () => { if (playing()) switchTool(G); });
  // Tab: the cave map (open while playing; it closes by itself on a result)
  input.on('Tab', () => { if (playing() || G.map.open) G.map.toggle(); });
  // a click anywhere advances dialogue
  addEventListener('mousedown', () => { if (hud.inDialog && !screens.menuOpen) hud.advanceDialog(); });
}

// W5 (GDD §9): what the music plays now: the ending's theme, the result's
// calm, a boss's own theme, the escape, the camp (or a menu), else the
// region the hero is in (the test world: the cave and chase moods).
const REGION_MOOD = ['camp', 'moss', 'mushroom', 'ice', 'heart'];
function moodOf(G) {
  if (G.mode === 'ending') return 'ending';
  if (G.mode === 'result') return G.expedition ? 'ending' : 'calm';
  if (G.expedition?.escaping) return 'escape';
  const boss = G.enemies.find((e) => e.isBoss && (e.active || e.started) && e.state !== 'asleep' && !e.gone && !e.dormant);
  if (boss) return G.expedition ? (boss.def?.kind ?? boss.kind ?? 'boss') : 'boss';
  if (G.shop?.isOpen || G.altar?.isOpen || G.codex?.isOpen) return 'camp';
  const chasing = G.enemies.some((e) => e.active && !e.isBoss && e.pos.distanceTo(G.player.position) < 14);
  if (!G.expedition) return chasing ? 'chase' : 'cave';
  if (G.expedition.atCamp && !chasing) return 'camp';
  if (chasing) return 'chase';
  return REGION_MOOD[G.expedition.area?.region ?? 1] ?? 'moss';
}

// The title backdrop: a slow circle above the room (W1: above the hero).
function titleOrbit(camera, t, at = null) {
  const a = 0.8 + t * 0.05;
  const cx = at?.x ?? 0, cy = at?.y ?? 0, cz = at?.z ?? 0;
  camera.position.set(cx + Math.sin(a) * 22, cy + 17, cz + Math.cos(a) * 22);
  camera.lookAt(cx, cy, cz);
}

// The right-click tool (GDD §6.2: water gun / vine / mask), the one Q last
// picked. On a touch screen it aims at the nearest animal (GDD §4.2).
function useTool(G) {
  const tool = G.tools[G.run.tool];
  if (!tool || G.player.state.shield) return false;
  if (!tool.ready) { if (!tool.auto) G.hud.toolBusy(); return false; } // the sweep says how long
  if (G.touch) {
    const pp = G.player.position;
    const near = G.enemies.filter((e) => !e.gone && e.state !== 'asleep' && e.pos.distanceTo(pp) < 10)
      .sort((a, b) => a.pos.distanceTo(pp) - b.pos.distanceTo(pp))[0];
    if (near) G.player.state.heading = Math.atan2(near.pos.x - pp.x, near.pos.z - pp.z);
  } else G.emit('faceCursor');
  return tool.use();
}

// Q: the next tool the hero owns (water gun → vine → mask).
function switchTool(G) {
  const next = nextTool(G.run.tool, G.run.owned);
  if (!next || next === G.run.tool) { G.toast('바꿀 도구가 아직 없어요'); return; }
  G.run.tool = next;
  sfx.click();
  G.hud.update(G.run);
  G.hud.toolSwitched();
  G.toast(`${ITEMS[next].icon} ${ITEMS[next].name}`, 1200);
  G.emit('toolChanged', next);
}

boot().catch((err) => {
  console.error(err);
  $('loading-text').textContent = `문제가 생겼어요: ${err.message}`;
});
