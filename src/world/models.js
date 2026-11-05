import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// Polyfork models used in the cave, by short key. `body` decides physics:
// static (trimesh from its own triangles), box (cheap box), dynamic (pushable),
// trunk (an upright capsule), none (visual only).
// Free low-poly assets: https://polyfork.dev/assets
export const MODELS = {
  crystalCluster: { id: 'crystal-cluster-624138', body: 'static' },
  geode: { id: 'mineral-geode-cluster-299927', body: 'static' },
  mossBoulder: { id: 'fern-covered-boulder-2e0375', body: 'static' },
  // W0 world landmarks (docs/polyfork-survey.md §3a): big rock, a far wall,
  // a giant glowing mushroom and an arched stone bridge
  seaStack: { id: 'sea-stack-369791', body: 'none' },
  mesa: { id: 'mesa-backdrop-cbadea', body: 'none' },
  bonnet: { id: 'glowing-bonnet-mushroom-13f518', body: 'none' },
  viaduct: { id: 'stone-viaduct-span-0bd731', body: 'none' },
  // W1 Moss Valley and the camp (docs/polyfork-survey.md §3c, area 1): giants,
  // the old mine, the clutter the scatter strews (world/scatter.js instances
  // them), the camp's furniture
  trestle: { id: 'timber-trestle-bridge-c3cd88', body: 'none' },
  treeFern: { id: 'tree-fern-78320e', body: 'none' },
  mossCushion: { id: 'moss-cushion-2eabef', body: 'none' },
  horsetail: { id: 'giant-horsetail-stand-3a4f94', body: 'none' },
  headframe: { id: 'mine-headframe-735cf4', body: 'none' },
  caveMouth: { id: 'smuggler-cave-mouth-69a07e', body: 'none' },
  burrow: { id: 'ant-nest-entrance-mound-f6136c', body: 'none' },
  ribcage: { id: 'fossil-ribcage-b243c5', body: 'none' },
  outcrop: { id: 'rock-outcrop-158ac3', body: 'none' },
  boulder: { id: 'large-boulder-a29b99', body: 'none' },
  boulders: { id: 'boulder-field-cluster-08e364', body: 'none' },
  scree: { id: 'scree-heap-42cce5', body: 'none' },
  log: { id: 'hollow-log-329fd7', body: 'none' },
  stump: { id: 'moss-covered-stump-7253ab', body: 'none' },
  roots: { id: 'exposed-tree-roots-e1409c', body: 'none' },
  fern: { id: 'fern-plant-1559b8', body: 'none' },
  fernClump: { id: 'fern-clump-90ff4b', body: 'none' },
  clubMoss: { id: 'club-moss-mat-edcb1b', body: 'none' },
  grass: { id: 'grass-tuft-a40a08', body: 'none' },
  flower: { id: 'wildflower-68d3a1', body: 'none' },
  mushrooms: { id: 'mushroom-cluster-18dc1d', body: 'none' },
  toadstool: { id: 'toadstool-257a4a', body: 'none' },
  bones: { id: 'bone-scatter-90313d', body: 'none' },
  reeds: { id: 'river-reed-cluster-cba87e', body: 'none' },
  lilies: { id: 'lily-pad-cluster-457382', body: 'none' },
  pebbles: { id: 'river-stone-cluster-0b55bc', body: 'none' },
  mineCart: { id: 'mine-cart-21d7f0', body: 'none' },
  rail: { id: 'mine-rail-run-d4404c', body: 'none' },
  barrow: { id: 'ore-barrow-3e2464', body: 'none' },
  ropeCoil: { id: 'rope-coil-776dcc', body: 'none' },
  ladder: { id: 'bolted-ladder-da8166', body: 'none' },
  torch: { id: 'torch-stake-d82a2c', body: 'none' },
  stall: { id: 'market-stall-94937d', body: 'none' },
  signboard: { id: 'hanging-signboard-c10e01', body: 'none' },
  altar: { id: 'stone-altar-8f3a0a', body: 'none' },
  glyphStone: { id: 'petroglyph-boulder-7203c3', body: 'none' },
  wayfinder: { id: 'wayfinder-post-961fcd', body: 'none' },
  cairn: { id: 'stone-cairn-a9bf48', body: 'none' },
  // W2 the Mushroom Forest (docs/polyfork-survey.md §3c, area 2: the Insect
  // World kit at bug's-eye scale): the giant puffball, the orb web (the
  // chasm's bridge), the wasps' paper nest, dead snags, the poison pools and
  // vents, and small clutter
  puffball: { id: 'puffball-mushroom-3b1324', body: 'none' },
  orbWeb: { id: 'orb-web-133aba', body: 'none' },
  waspNest: { id: 'wasp-paper-nest-68a6c0', body: 'none' },
  deadSnag: { id: 'dead-snag-0b1891', body: 'none' },
  mudPool: { id: 'bubbling-mud-pool-a1c8ac', body: 'none' },
  tarPit: { id: 'tar-pit-d040f3', body: 'none' },
  fumarole: { id: 'fumarole-vent-8280ba', body: 'none' },
  cobweb: { id: 'cobweb-drape-f65d43', body: 'none' },
  bracketLog: { id: 'bracket-fungus-log-2deef4', body: 'none' },
  shelfShrooms: { id: 'giant-mushroom-cluster-868de6', body: 'none' },
  cocoon: { id: 'ant-pupa-cocoon-3e6ebd', body: 'none' },
  // W3 the Ice Lake (docs/polyfork-survey.md §3c, area 3): the frozen
  // waterfall on the cliffs facing the lens, ice blocks, blue-sheen shards,
  // basalt columns, and a lost explorer's camp (snowy logs, an ice axe, a
  // cold fire pit)
  iceFall: { id: 'frozen-waterfall-5d1fc6', body: 'none' },
  iceChunk: { id: 'ice-chunk-b23ad7', body: 'none' },
  obsidian: { id: 'obsidian-shard-cluster-c8f5d3', body: 'none' },
  basalt: { id: 'basalt-column-outcrop-f1339d', body: 'none' },
  snowLogs: { id: 'snow-capped-log-pile-8719e7', body: 'none' },
  iceAxe: { id: 'ice-axe-and-crampon-e4c7c1', body: 'none' },
  firePit: { id: 'cleared-fire-pit-399cda', body: 'none' },
  // W4 the Crystal Heart (docs/polyfork-survey.md §3c, area 4): floating
  // asteroids (10 / 5 / 2 m), the guardians (moai standing 6 m, kneeling,
  // the unfinished one lying 10.7 m), the Dungeon & Crypt kit's ruins (2 m
  // wall modules, a stair flight, braziers, rubble, a rope bridge span), a
  // carved stele, glowing rune stones, and the Crystal King's crown
  asteroid: { id: 'large-asteroid-391721', body: 'none' },
  asteroidM: { id: 'medium-asteroid-ba674f', body: 'none' },
  asteroidS: { id: 'small-asteroid-7fc86a', body: 'none' },
  moai: { id: 'standing-moai-caa54f', body: 'none' },
  moaiKneel: { id: 'tukuturi-kneeling-moai-fad7ef', body: 'none' },
  moaiLying: { id: 'unfinished-moai-in-the-40da79', body: 'none' },
  dungeonWall: { id: 'dungeon-wall-module-a537b3', body: 'none' },
  ruinWall: { id: 'battle-damaged-wall-module-021883', body: 'none' },
  gable: { id: 'ruined-gable-end-834895', body: 'none' },
  stairs: { id: 'stone-stair-flight-d621e2', body: 'none' },
  brazier: { id: 'standing-brazier-c9e4ee', body: 'none' },
  rubble: { id: 'collapse-rubble-mound-4fbfed', body: 'none' },
  ashlar: { id: 'fallen-ashlar-block-87824e', body: 'none' },
  masonry: { id: 'masonry-rubble-chunk-c4da0b', body: 'none' },
  ropeBridge: { id: 'rope-bridge-span-159f8c', body: 'none' },
  stele: { id: 'carved-grave-stele-a1359c', body: 'none' },
  runeStone: { id: 'glowing-rune-stone-5a5558', body: 'none' },
  flagstone: { id: 'flagstone-floor-tile-2a04ea', body: 'none' },
  portal: { id: 'tunnel-portal-4ac9f3', body: 'none' },
  crown: { id: 'crown-a294ce', body: 'none' },
  // the intro cutscene's sunny forest and the dark below (ui/intro.js):
  // loaded only when the intro plays, and let go after it
  introOak: { id: 'broadleaf-oak-997c22', body: 'none' },
  introOak2: { id: 'oak-tree-50ee7c', body: 'none' },
  introBirch: { id: 'birch-tree-181b33', body: 'none' },
  introMaple: { id: 'maple-tree-65fa12', body: 'none' },
  introPine: { id: 'tall-pine-tree-ab4108', body: 'none' },
  introYoungPine: { id: 'young-pine-0d7695', body: 'none' },
  introBush: { id: 'round-bush-cd2ac0', body: 'none' },
  stalactites: { id: 'stalactite-cluster-6cca9a', body: 'none' },
  // animals: rigged, with Idle/Walk/Run clips (see clipsOf)
  wolf: { id: 'wolf-base', body: 'none' },
  rabbit: { id: 'rabbit-base', body: 'none' }, // the rabbits and, scaled up, their chief
  fox: { id: 'fox-base', body: 'none' }, // M6a: the mushroom cave's ambusher
  deer: { id: 'deer-base', body: 'none' }, // W3: the Ice Lake's charger
  bear: { id: 'bear-base', body: 'none' }, // W3: the brute, and (white) the Ice Bear
  hare: { id: 'mountain-hare-base', body: 'none' }, // W3: the ice cave's rabbits
};

// Where each model is first needed, by region (release: the load order).
// Unlisted: 1, the entrance, Moss Valley and the camp (and everything the
// title screen shows): the game waits for these. The rest streams in after
// the title is up, the region the hero is in (and the next) first; 'intro':
// the new game's cutscene set. test/models.test.js checks the world data
// against this (a landmark or scatter rule in region r uses no model of a
// later region).
export const FIRST_REGION = {
  puffball: 2, orbWeb: 2, waspNest: 2, deadSnag: 2, mudPool: 2, tarPit: 2, fumarole: 2, cobweb: 2, bracketLog: 2, shelfShrooms: 2, cocoon: 2, fox: 2,
  iceFall: 3, iceChunk: 3, obsidian: 3, basalt: 3, snowLogs: 3, iceAxe: 3, firePit: 3, deer: 3, bear: 3, hare: 3,
  asteroid: 4, asteroidM: 4, asteroidS: 4, moai: 4, moaiKneel: 4, moaiLying: 4, dungeonWall: 4, ruinWall: 4, gable: 4, stairs: 4, brazier: 4, rubble: 4,
  ashlar: 3, masonry: 4, ropeBridge: 4, stele: 4, runeStone: 4, flagstone: 4, portal: 4, crown: 4,
  introOak: 'intro', introOak2: 'intro', introBirch: 'intro', introMaple: 'intro', introPine: 'intro', introYoungPine: 'intro', introBush: 'intro', stalactites: 'intro',
};
export const regionOf = (key) => FIRST_REGION[key] ?? 1;
const RIGGED = new Set(['wolf', 'rabbit', 'fox', 'deer', 'bear', 'hare']);

// ---- loading (release). Polyfork's CDN answers every file from its origin
// (no edge cache), and asking for all 87 at once sometimes stalled for
// minutes ("n/87" for good). So: a few at a time (CONCURRENCY), most urgent
// first (`priority`, lower first, then the order asked; the background only
// once the foreground has come); a download that
// stops moving for STALL_MS is dropped and tried again after a pause
// (BACKOFF), RETRIES times; a model that never comes is left out (a prop: an
// empty group; an animal: a plain stand-in, see standIn) and said once in
// the console. Nothing here ever rejects: the game always boots.
export const LOAD = { concurrency: 16, stallMs: 8000, retries: 3, backoff: [800, 2500, 6000] };
const FOREGROUND = 1; // priority: the title's own models (1) and anything more urgent

const loader = new GLTFLoader();
const sources = new Map();
const animations = new Map();
const base = import.meta.env?.BASE_URL ?? '/';
// Dev: the local copies from `npm run fetch-assets`. Production: Polyfork's CDN
// (see vite.config.js for why), unless self-hosting was explicitly enabled.
const fromCdn = !import.meta.env?.DEV && import.meta.env?.VITE_SELF_HOST_MODELS !== '1';
export const modelUrl = (id) => (fromCdn ? `https://polyfork.dev/cdn/${id}.glb` : `${base}assets/polyfork/${id}.glb`);

const idOf = (key) => MODELS[key]?.id ?? key;
const keyOf = new Map(Object.entries(MODELS).map(([k, m]) => [m.id, k]));
// id → { id, priority, order, state: queued|loading|done|failed, keep, waiters[] }
const jobs = new Map();
let order = 0, active = 0, version = 0;
const failedIds = [];
const io = { fetch: (...a) => globalThis.fetch(...a), parse: (buf, url) => loader.parseAsync(buf, url.slice(0, url.lastIndexOf('/') + 1)), wait: (ms) => new Promise((r) => setTimeout(r, ms)) };
/** Tests swap the network and the parser (and the clock). */
export function _setIo(over) { Object.assign(io, over); }
export function _reset() { jobs.clear(); sources.clear(); animations.clear(); failedIds.length = 0; order = 0; active = 0; }

function request(ids, priority, keep) {
  for (const id of ids) {
    let j = jobs.get(id);
    if (!j) { j = { id, priority, order: order++, state: sources.has(id) ? 'done' : 'queued', keep, waiters: [] }; jobs.set(id, j); }
    else if (j.state === 'queued' && priority < j.priority) j.priority = priority;
    if (keep) j.keep = true;
  }
  pump();
}

function pump() {
  while (active < LOAD.concurrency) {
    // the background (priority > FOREGROUND) waits while anything the game
    // is waiting for is still coming: on a slow line it would share the
    // bandwidth the title needs
    let fg = false;
    for (const j of jobs.values()) if ((j.state === 'queued' || j.state === 'loading') && j.priority <= FOREGROUND) { fg = true; break; }
    let next = null;
    for (const j of jobs.values()) if (j.state === 'queued' && (!fg || j.priority <= FOREGROUND) && (!next || j.priority < next.priority || (j.priority === next.priority && j.order < next.order))) next = j;
    if (!next) return;
    next.state = 'loading';
    active++;
    fetchModel(next.id).then((gltf) => {
      sources.set(next.id, gltf.scene);
      animations.set(next.id, gltf.animations ?? []);
      next.state = 'done';
    }, (err) => {
      next.state = 'failed';
      failedIds.push(next.id);
      console.warn(`[models] ${keyOf.get(next.id) ?? next.id} did not load (${err?.message ?? err}): left out`);
    }).finally(() => {
      active--;
      version++;
      const w = next.waiters; next.waiters = [];
      for (const fn of w) fn();
      pump();
    });
  }
}

// One GLB, read as a stream so a stalled download is noticed (no bytes for
// STALL_MS) while a slow one that keeps moving is let finish.
async function fetchModel(id) {
  const url = modelUrl(id);
  let last;
  for (let attempt = 0; attempt <= LOAD.retries; attempt++) {
    if (attempt) await io.wait(LOAD.backoff[Math.min(attempt - 1, LOAD.backoff.length - 1)]);
    const ctl = new AbortController();
    let timer = setTimeout(() => ctl.abort(), LOAD.stallMs);
    const poke = () => { clearTimeout(timer); timer = setTimeout(() => ctl.abort(), LOAD.stallMs); };
    try {
      const res = await io.fetch(url, { signal: ctl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let buf;
      if (res.body?.getReader) {
        const reader = res.body.getReader(), parts = [];
        let n = 0;
        for (;;) {
          poke();
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value); n += value.length;
        }
        const all = new Uint8Array(n);
        let o = 0;
        for (const p of parts) { all.set(p, o); o += p.length; }
        buf = all.buffer;
      } else buf = await res.arrayBuffer();
      clearTimeout(timer);
      return await io.parse(buf, url);
    } catch (err) {
      clearTimeout(timer);
      last = ctl.signal.aborted ? new Error('stalled') : err;
    }
  }
  throw last;
}

const settled = (id) => { const s = jobs.get(id)?.state; return s === 'done' || s === 'failed' || sources.has(id); };
function whenSettled(ids, fn) {
  const left = ids.filter((id) => !settled(id));
  if (!left.length) { fn(); return; }
  let n = left.length;
  for (const id of left) jobs.get(id).waiters.push(() => { if (--n === 0) fn(); });
}

/**
 * Loads `keys` (catalog keys or ids) and resolves when every one has come or
 * been given up on (never rejects). `opts`: a progress callback (done, total),
 * or { onProgress, priority (default 0: now), keep (the game's own: an
 * intro's unloadModels leaves it) }.
 */
export function loadModels(keys, opts = {}) {
  const { onProgress, priority = 0, keep = false } = typeof opts === 'function' ? { onProgress: opts } : opts;
  const ids = [...new Set(keys.map(idOf))];
  request(ids, priority, keep);
  return new Promise((resolve) => {
    let done = ids.filter(settled).length;
    onProgress?.(done, ids.length);
    if (done === ids.length) { resolve(); return; }
    for (const id of ids) if (!settled(id)) jobs.get(id).waiters.push(() => { done++; onProgress?.(done, ids.length); if (done === ids.length) resolve(); });
  });
}
/** Asks for `keys` in the background (priority: lower first); no waiting. */
export function prefetch(keys, priority = 5, { keep = true } = {}) { request([...new Set(keys.map(idOf))], priority, keep); }
/** Moves still-queued `keys` up to `priority`. */
export function prioritize(keys, priority = 0.5) {
  for (const k of keys) { const j = jobs.get(idOf(k)); if (j?.state === 'queued' && priority < j.priority) j.priority = priority; }
}
/** The hero is in region `r`: its models and the next region's come first. */
export function prioritizeRegion(r) {
  if (!(r >= 1)) return;
  prioritize(Object.keys(FIRST_REGION).filter((k) => FIRST_REGION[k] === r), 0.4);
  prioritize(Object.keys(FIRST_REGION).filter((k) => FIRST_REGION[k] === r + 1), 0.6);
}
/** true once every one of `keys` has loaded or been given up on. */
export const allSettled = (keys) => keys.every((k) => settled(idOf(k)));
/** Runs `fn` once all `keys` have loaded or been given up on (now, if they have). */
export function whenLoaded(keys, fn) {
  const ids = [...new Set(keys.map(idOf))];
  request(ids.filter((id) => !jobs.has(id)), 0, true);
  whenSettled(ids, () => {
    try { fn(); } catch (err) { console.error('[models] a late build failed', err); }
  });
}
/** The loader's state, for the loading screen and checks (G.models). */
export function modelStatus() {
  let pending = 0;
  for (const j of jobs.values()) if (j.state === 'queued' || j.state === 'loading') pending++;
  return { pending, failed: failedIds.map((id) => keyOf.get(id) ?? id), version };
}
/** Bumped whenever a model lands (cached scene scans look again). */
export const modelsVersion = () => version;

export const isLoaded = (key) => sources.has(idOf(key));
export const hasFailed = (key) => jobs.get(idOf(key))?.state === 'failed';
// Let go of models no longer needed (ui/intro.js: its forest after the
// intro); the game's own (`keep`) stay.
export function unloadModels(keys) {
  for (const k of keys) {
    const id = idOf(k);
    if (jobs.get(id)?.keep) continue;
    sources.delete(id); animations.delete(id); jobs.delete(id);
  }
}

// A model that never came: a prop is simply left out (an empty group); an
// animal gets a plain body with the bones its animator turns (Neck, Head,
// Jaw, Tail, ears, legs), so the game goes on.
function standIn(key) {
  const g = new THREE.Group();
  g.name = `missing-${key}`;
  g.userData.missingModel = key;
  if (!RIGGED.has(key)) return g;
  const mat = new THREE.MeshStandardMaterial({ color: '#c8b8a0', flatShading: true });
  const hips = new THREE.Object3D(); hips.name = 'Hips'; hips.position.y = 0.55;
  const spine = new THREE.Object3D(); spine.name = 'Spine';
  const chest = new THREE.Object3D(); chest.name = 'Chest'; chest.position.z = 0.3;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.6, 3, 8).rotateX(Math.PI / 2), mat);
  const neck = new THREE.Object3D(); neck.name = 'Neck'; neck.position.set(0, 0.15, 0.45);
  const head = new THREE.Object3D(); head.name = 'Head'; head.position.set(0, 0.1, 0.15);
  head.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0), mat));
  const jaw = new THREE.Object3D(); jaw.name = 'Jaw'; jaw.position.set(0, -0.12, 0.12);
  const tail = new THREE.Object3D(); tail.name = 'Tail'; tail.position.set(0, 0.1, -0.5);
  const bones = ['LeftEar', 'RightEar', 'LeftFrontUpLeg', 'RightFrontUpLeg'].map((n) => { const o = new THREE.Object3D(); o.name = n; return o; });
  head.add(jaw, bones[0], bones[1]);
  neck.add(head);
  chest.add(neck, bones[2], bones[3]);
  spine.add(chest);
  hips.add(body, spine, tail);
  g.add(hips);
  return g;
}

// A model asked for before it has come: an empty group now, the model put
// into it when it lands (models streaming in after the title). Whatever
// needs its meshes (tints, shadows, colliders) goes through whenReady.
function placeholder(key) {
  const g = new THREE.Group();
  g.name = key;
  g.userData.pendingModel = key;
  g.userData.onReady = [];
  whenLoaded([key], () => {
    if (isLoaded(key)) g.add(cloneOf(idOf(key)));
    else g.userData.missingModel = key;
    delete g.userData.pendingModel;
    const fns = g.userData.onReady; delete g.userData.onReady;
    delete g.userData.fadeBox; // (the lens's fade measures it again: isoCamera.js)
    for (const fn of fns) fn(g);
  });
  return g;
}
/** `fn(obj)` once `obj` (from instance/place) has its model: now, or when it lands. */
export function whenReady(obj, fn) {
  if (obj.userData.pendingModel) obj.userData.onReady.push(fn);
  else fn(obj);
}

function cloneOf(id) {
  const src = sources.get(id);
  // rigged models (animals, characters) need their bones cloned too, or the
  // copy keeps drawing with the original's skeleton, somewhere else or nowhere
  let skinned = false;
  src.traverse((o) => { if (o.isSkinnedMesh) skinned = true; });
  const copy = skinned ? cloneSkinned(src) : src.clone(true);
  if (skinned) copy.traverse((o) => { if (o.isSkinnedMesh) o.frustumCulled = false; });
  return copy;
}

// A copy of a model: the real one when it has loaded, a stand-in when it
// never will, else a placeholder it fills when it lands (an animal is only
// made once its model is here: world/expedition.js waits for it).
export function instance(key) {
  const id = idOf(key);
  if (sources.has(id)) return cloneOf(id);
  if (hasFailed(key)) return standIn(key);
  return placeholder(key);
}

// A loaded model's animation clips (rigged animals), by clip name.
export function clipsOf(key) {
  const id = idOf(key);
  return Object.fromEntries((animations.get(id) ?? []).map((c) => [c.name, c]));
}

// Places a catalog model on the ground and gives it its physics.
// opts: { y, ry, s (scale, only for "bigger than life" hero props), body }
export function place(G, key, x, z, opts = {}) {
  const def = MODELS[key] ?? { body: 'static' };
  const obj = instance(key);
  obj.name = key;
  if (opts.s) obj.scale.setScalar(opts.s);
  obj.rotation.y = opts.ry ?? 0;
  const y = opts.y ?? G.groundAt?.(x, z) ?? 0;
  obj.position.set(x, y + (opts.lift ?? 0), z);
  (opts.parent ?? G.scene).add(obj);
  whenReady(obj, () => G.look.shadows(obj));
  const body = opts.body ?? def.body;
  if (body === 'static') whenReady(obj, () => G.physics.addStatic(obj));
  else if (body === 'dynamic') whenReady(obj, () => G.physics.addDynamic(obj, { mass: def.mass ?? 10 }));
  else if (body === 'trunk') {
    const s = opts.s ?? 1;
    G.physics.addCapsule(x, y, z, { radius: 0.3 * s, height: 3 * s });
  } else if (body === 'box') G.physics.addBox(obj);
  return obj;
}
