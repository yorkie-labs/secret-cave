import * as THREE from 'three';
import { createWorld, SLIP_COST } from './world.js';
import { buildNavGrid } from './navGrid.js';
import { buildTerrain } from './terrain.js';
import { place, instance, whenLoaded, whenReady } from './models.js';
import { buildScatter, instanceMany, SCATTER_MODELS } from './scatter.js';
import { spawnEnemy } from './spawn.js';
import { softGlowTexture } from './glow.js';
import { FOREST_MODELS } from './forest.js';

// Builds a height world (world/world.js data) into the game: the terrain
// and its colliders (world/terrain.js), the walkable grid the paths use
// (world/navGrid.js, read by systems/nav.js), bridges, landmarks, falls,
// glows and the animals. W0: the test world; W1: the real world
// (worlds/main.js) with its scatter (world/scatter.js), brooks, rails,
// light shafts and fireflies. Sets G.world, G.navGrid, G.terrain,
// G.groundAt, G.floorY, G.spawn, G.worldStats.
export const WORLD_MODELS = ['seaStack', 'mesa', 'bonnet', 'viaduct'];
const PROC_BRIDGES = new Set(['crystalBridge']); // (W4: built in code: world/heart.js)

// every Polyfork model a world definition needs
export function worldModels(def) {
  const keys = new Set(WORLD_MODELS);
  for (const l of def.landmarks ?? []) keys.add(l.model);
  for (const b of def.bridges ?? []) if (b.model && !PROC_BRIDGES.has(b.model)) keys.add(b.model);
  if (def.lanes) for (const k of SCATTER_MODELS) keys.add(k);
  if (def.rails) keys.add('rail');
  if (def.camp) for (const k of ['altar', 'glyphStone', 'torch', 'stall', 'signboard', 'cairn', 'mineCart', 'ropeCoil']) keys.add(k);
  if (def.hazards) for (const k of FOREST_MODELS) keys.add(k);
  return [...keys];
}

// W2: the world's grid sampled in a Web Worker (world/sampleWorker.js) while
// the models load: a promise of it, or of null (no workers: buildWorld
// samples on the main thread as before).
export function sampleInWorker(id) {
  return new Promise((done) => {
    let w;
    try { w = new Worker(new URL('./sampleWorker.js', import.meta.url), { type: 'module' }); } catch { done(null); return; }
    w.onmessage = (e) => { done(e.data); w.terminate(); };
    w.onerror = () => { done(null); w.terminate(); };
    w.postMessage(id);
  });
}

export function buildWorld(G, def, { sample = null } = {}) {
  const t0 = performance.now();
  const world = createWorld(def);
  const fromWorker = world.useSample(sample);
  G.worldProps = []; // W2: what stands on the ground, hidden while its chunk is not built
  const grid = buildNavGrid(world);
  const tNav = performance.now();
  // a big world's chunk meshes come and go with the hero (terrain.js)
  const big = def.bounds[2] - def.bounds[0] > 300;
  const terrain = buildTerrain(G, world, grid, { lazy: big });
  G.world = world;
  G.navGrid = grid;
  G.terrain = terrain;
  // the ground under a point: the surface nearest `y` (a bridge deck or the
  // ground under it), else the top one
  G.groundAt = (x, z, y) => world.groundAt(x, z, y);
  // the floor a fall is measured from: the walkable ground near the hero;
  // nowhere near any (a chasm floor), and the hero is put back at once
  G.floorY = (x, z, y) => {
    const n = grid.nearest({ x, y, z }, 3);
    return n < 0 ? Infinity : grid.y[n];
  };
  // W3: how slippery the ground is (the hero and the animals slide on ice),
  // and the paths cross ice a little reluctantly (more is added by others:
  // the forest's poison pools, world/forest.js)
  G.slipAt = (x, z) => world.slipAt(x, z);
  G.navCost = (x, z) => world.slipAt(x, z) * SLIP_COST;
  const tTerrain = performance.now();

  for (const b of world.bridges) if (b.model) placeBridge(G, b);
  for (const l of def.landmarks ?? []) G.worldProps.push({ obj: placeLandmark(G, world, l), x: l.x, z: l.z });
  for (const f of def.waterfalls ?? []) addWaterfall(G, world, f);
  for (const b of def.brooks ?? []) addBrook(G, world, b);
  for (const r of def.rails ?? []) addRails(G, world, r);
  for (const g of def.glows ?? []) addGlow(G, g);
  // W2: the forest's glowing pools light their hollows
  for (const w of world.water) if (w.glow) {
    const [x0, z0, x1, z1] = w.box, x = (x0 + x1) / 2, z = (z0 + z1) / 2;
    G.addLight({ pos: new THREE.Vector3(x, w.level + 2.5, z), color: w.glow, intensity: 14, distance: 18 });
    addGlow(G, { x, z, y: w.level + 1.2, color: w.glow, size: (x1 - x0) * 1.6, track: true });
  }
  for (const s of def.shafts ?? []) addShaft(G, world, s);
  const scatter = def.lanes ? buildScatter(G, world, grid, def) : null;
  const flies = def.lanes ? addFireflies(G, world, grid, def) : 0;

  const [sx, sz] = def.spawn;
  G.spawn = new THREE.Vector3(sx, world.groundAt(sx, sz), sz);
  for (const e of def.enemies ?? []) spawnEnemy(G, e);
  if (big) terrain.warm(G.spawn);
  // W2: a prop over a chunk whose ground is not drawn (far off, at the
  // widest zoom) is hidden too: nothing floats in the void
  if (big) {
    let t = 0;
    const cull = () => { for (const p of G.worldProps) p.obj.visible = terrain.builtAt(p.x, p.z) && (p.keep?.() ?? true); };
    cull();
    G.onUpdate((dt) => { t -= dt; if (t <= 0) { t = 0.3; cull(); } });
  }
  G.worldStats = {
    sampleNavMs: Math.round(tNav - t0), sampledInWorker: fromWorker ? sample.ms : false, terrainMs: Math.round(tTerrain - tNav), buildMs: Math.round(performance.now() - t0),
    cells: grid.walkableCount, chunks: terrain.chunks.length, chunksBuilt: terrain.built, tris: terrain.tris, edges: terrain.edgeCount,
    scatter: scatter && { instances: scatter.instances, get meshes() { return scatter.meshes; }, get solid() { return scatter.solid; }, ms: scatter.ms }, fireflies: flies,
  };
  return world;
}

// Polyfork's stone viaduct (24 m as built, deck 0.2 m up, walkway ~4 m
// between its parapets) and the mine's timber trestle (16 m, deck 0.25 m
// up): `spans` copies end to end, each stretched uniformly to its share of
// the bridge and tilted along the deck.
// W4: Polyfork's rope bridge span (4 m along its local x, deck ~0.1 m up)
const BRIDGES = { viaduct: { length: 24, deck: 0.2 }, trestle: { length: 16, deck: 0.25 }, ropeBridge: { length: 4, deck: 0.12, turn: Math.PI / 2, centred: true } };
function placeBridge(G, b) {
  if (b.model === 'orbWeb') { whenLoaded(['orbWeb'], () => placeWeb(G, b)); addDeck(G, b, 0); return; }
  if (PROC_BRIDGES.has(b.model)) { addDeck(G, b, 0); return; }
  const m = BRIDGES[b.model] ?? BRIDGES.viaduct;
  const n = b.spans ?? 1;
  const s = b.length / n / m.length;
  const yaw = Math.atan2(b.b[0] - b.a[0], b.b[1] - b.a[1]), pitch = Math.atan2(b.y0 - b.y1, b.length);
  for (let k = 0; k < n; k++) {
    const t = (k + (m.centred ? 0.5 : 0)) / n;
    const x = b.a[0] + (b.b[0] - b.a[0]) * t, z = b.a[1] + (b.b[1] - b.a[1]) * t, y = b.y0 + (b.y1 - b.y0) * t;
    const obj = place(G, b.model, x, z, { s, y: y - m.deck * s, body: 'none' });
    obj.rotation.set(pitch, yaw + (m.turn ?? 0), 0, 'YXZ');
    G.worldProps?.push({ obj, x: x + (m.centred ? 0 : (b.b[0] - b.a[0]) / n / 2), z: z + (m.centred ? 0 : (b.b[1] - b.a[1]) / n / 2) });
    obj.userData.noFade = true; // walked on: never faded
    whenReady(obj, () => obj.traverse((o) => { o.raycast = () => {}; })); // (a click on a parapet means what lies beyond it)
  }
  addDeck(G, b, pitch);
}
// a click on the bridge means its deck: an unseen strip at the deck's height
function addDeck(G, b, pitch) {
  const yaw = Math.atan2(b.b[0] - b.a[0], b.b[1] - b.a[1]);
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(b.width, b.length).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  deck.position.set((b.a[0] + b.b[0]) / 2, (b.y0 + b.y1) / 2 + 0.02, (b.a[1] + b.b[1]) / 2);
  deck.rotation.set(pitch, yaw, 0, 'YXZ');
  deck.name = 'bridgeDeck';
  deck.userData.noFade = true;
  G.scene.add(deck);
  G.groundMeshes.push(deck);
}

// W2: Polyfork's giant orb web (23 × 25 m, a vertical web as built) laid
// flat across the forest's chasm, its long side along the bridge, a little
// under the walked deck, so the hero runs over its strands. Glowing a
// little (silk catching the mushrooms' light).
function placeWeb(G, b) {
  const web = instance('orbWeb');
  web.rotation.x = -Math.PI / 2; // its height (local y) along −z
  const inner = new THREE.Group();
  inner.add(web);
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  web.position.sub(c); // centred on the group
  const root = new THREE.Group();
  root.name = 'webBridge';
  const s = (b.length * 0.7) / size.z; // the chasm and an anchor either side
  inner.scale.setScalar(s);
  root.add(inner);
  root.position.set((b.a[0] + b.b[0]) / 2, (b.y0 + b.y1) / 2 - 0.12, (b.a[1] + b.b[1]) / 2);
  root.rotation.y = Math.atan2(b.b[0] - b.a[0], b.b[1] - b.a[1]);
  root.userData.noFade = true;
  root.traverse((o) => {
    o.raycast = () => {};
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.emissive = new THREE.Color('#9b8cff');
    o.material.emissiveIntensity = 0.35;
    o.material.side = THREE.DoubleSide;
    o.castShadow = true;
  });
  G.scene.add(root);
  G.worldProps?.push({ obj: root, x: root.position.x, z: root.position.z });
  G.addLight({ pos: new THREE.Vector3(root.position.x, root.position.y + 3, root.position.z), color: '#c8b8ff', intensity: 10, distance: 22 });
  return root;
}

// A big landmark from the survey, standing on the ground (a rock pillar is
// sunk a little so its foot is never in the air), solid as an upright
// cylinder; a glowing mushroom also lights its corner of the cave.
function placeLandmark(G, world, l) {
  const y = l.y ?? world.heightAt(l.x, l.z) - (l.sink ?? (l.model === 'seaStack' ? 1.5 : 0));
  const obj = place(G, l.model, l.x, l.z, { s: l.s, ry: l.ry, y, body: 'none' });
  // a giant mushroom's cap in front of the hero all but goes (W2)
  if (l.model === 'bonnet' || l.model === 'puffball') obj.userData.fadeTo = 0.12;
  // (its meshes, and its collider's height, once the model is here: release)
  whenReady(obj, () => dressLandmark(G, l, obj, y));
  if (l.glow) {
    if (l.light !== false) G.addLight({ pos: new THREE.Vector3(l.x, y + 5 * l.s, l.z), color: l.glow, intensity: 30, distance: 26 });
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: l.glow, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(9 * l.s);
    halo.position.set(l.x, y + 5.2 * l.s, l.z);
    halo.userData.noFade = true;
    halo.raycast = () => {};
    G.scene.add(halo);
  }
  return obj;
}

// a landmark's meshes: shadows, the cave's tint, its collider as tall as drawn
function dressLandmark(G, l, obj, y) {
  if (obj.userData.missingModel) return; // (never came: no collider either)
  if (l.model === 'orbWeb') { obj.userData.noFade = true; obj.traverse((o) => { o.raycast = () => {}; if (o.isMesh) { o.material = o.material.clone(); o.material.side = THREE.DoubleSide; o.material.emissive = new THREE.Color('#8f80e0'); o.material.emissiveIntensity = 0.3; } }); }
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = l.model !== 'mesa';
    // the catalogue's colours (a desert mesa) turned to the cave's stone
    if (l.tint) recolour(o, new THREE.Color(l.tint), !!l.frost);
  });
  // solid as tall as it is drawn (its bounding box), so a click over a low
  // one means the ground behind it and a path on a ledge above is not shut
  // (W2: a mushroom's stem is short to the clicks: a click past it still means the ground)
  if (l.radius) {
    obj.updateMatrixWorld(true);
    const tall = Math.min(30, Math.max(0.6, new THREE.Box3().setFromObject(obj).max.y - y));
    G.physics.addCylinder(l.x, y, l.z, { radius: l.radius, height: l.model === 'bonnet' || l.model === 'puffball' ? Math.min(3, tall) : tall, obj });
  }
}

// A mesh's colours turned to grey, then tinted (a desert rock to cave stone).
// W3 `frost`: lightened toward the tint too (ice blocks, blue-sheen shards)
function recolour(mesh, tint, frost = false) {
  const grey = (r, g, b) => r * 0.3 + g * 0.55 + b * 0.15;
  const col = mesh.geometry.attributes.color;
  if (col) {
    mesh.geometry = mesh.geometry.clone();
    const c = mesh.geometry.attributes.color;
    for (let n = 0; n < c.count; n++) {
      let v = grey(c.getX(n), c.getY(n), c.getZ(n));
      if (frost) v = 0.45 + Math.min(1, v * 1.4) * 0.55;
      c.setXYZ(n, v * tint.r, v * tint.g, v * tint.b);
    }
  }
  mesh.material = mesh.material.clone();
  const m = mesh.material.color, v = grey(m.r, m.g, m.b);
  if (!col) m.setRGB(v * tint.r * 1.6, v * tint.g * 1.6, v * tint.b * 1.6); else m.set('#ffffff');
}

// A waterfall off a cliff: from its lip (`x, z` walking `toward` until the
// ground falls away) down to the water or ground below. W1: two sheets of
// falling streaks (a deep blue one behind, a bright white one in front,
// scrolling at different speeds), white foam churning at its foot, mist
// rising off it and a spray of drops; its sound comes from G.waterfalls
// (audio/sound.js ambience).
function addWaterfall(G, world, f) {
  const [tx, tz] = f.toward, tl = Math.hypot(tx, tz);
  const dx = tx / tl, dz = tz / tl;
  const top = world.heightAt(f.x, f.z);
  let lip = 0;
  while (lip < 30 && world.heightAt(f.x + dx * lip, f.z + dz * lip) > top - 0.5) lip += 0.25;
  let foot = lip;
  while (foot < 60 && world.heightAt(f.x + dx * foot, f.z + dz * foot) > world.heightAt(f.x + dx * (foot + 1), f.z + dz * (foot + 1)) + 0.05) foot += 0.25;
  // W1 `jet`: the water shoots out over the lip (m/s) and falls in an arc,
  // so a fall off a cliff facing away from the lens is still seen from above
  // (the lip hides ~1.2 × the drop under it); it lands that far out
  const lx = f.x + dx * lip, lz = f.z + dz * lip;
  const yAt = (d) => Math.max(world.heightAt(lx + dx * d, lz + dz * d), world.waterAt(lx + dx * d, lz + dz * d)?.level ?? -Infinity);
  let land = foot - lip + 1;
  if (f.jet) { for (let k = 0; k < 3; k++) land = 0.6 + f.jet * Math.sqrt((2 * Math.max(0.5, top - yAt(land))) / 9.8); }
  const bx = lx + dx * land, bz = lz + dz * land;
  const bottom = yAt(land);
  const drop = top - bottom;
  // a curved sheet: out over the lip, then down (an arc when it jets)
  function sheet(out0, widen, speed, color, opacity, density) {
    const rows = Math.max(10, Math.round(drop / 1.5)), cols = 6, pos = [], uv = [], idx = [];
    const px = -dz, pz = dx; // across the fall
    for (let r = 0; r <= rows; r++) {
      const v = r / rows;
      const out = f.jet ? out0 + (land - 0.6) * Math.sqrt(v) : out0 + Math.sqrt(v) * (land + 0.2);
      const y = top + 0.05 + (bottom - top) * v;
      for (let c = 0; c <= cols; c++) {
        const u = c / cols - 0.5;
        const w = f.width * (1 + v * widen);
        pos.push(lx + dx * out + px * u * w, y, lz + dz * out + pz * u * w);
        uv.push(c / cols, (v * drop) / 6);
      }
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c, b = a + cols + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const tex = streakTexture(density).clone();
    tex.needsUpdate = true;
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
    mesh.name = 'waterfall';
    mesh.userData.noFade = true;
    mesh.raycast = () => {};
    G.scene.add(mesh);
    return { mesh, tex, speed };
  }
  const sheets = [sheet(0.45, 0.25, 1.1, '#7fc4ec', 0.75, 0), sheet(0.75, 0.4, 2.3, '#ffffff', 0.9, 1)];
  // foam: churning white discs on the water at its foot
  const foamMat = new THREE.MeshBasicMaterial({ map: softGlowTexture(), color: '#f4fbff', transparent: true, opacity: 0.7, depthWrite: false, fog: false });
  const foams = [0, 1, 2].map((k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), foamMat.clone());
    m.position.set(bx + (k - 1) * dz * f.width * 0.3, bottom + 0.06 + k * 0.01, bz - (k - 1) * dx * f.width * 0.3);
    m.renderOrder = 2; m.userData.noFade = true; m.raycast = () => {};
    G.scene.add(m);
    return m;
  });
  // mist: soft sprites rising off the foot and the falling water
  const mistMat = new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#dff4ff', transparent: true, opacity: 0.4, depthWrite: false });
  const mists = Array.from({ length: 5 }, (_, k) => {
    const s = new THREE.Sprite(mistMat.clone());
    s.userData = { k, noFade: true };
    s.raycast = () => {};
    G.scene.add(s);
    return s;
  });
  // spray: drops flung out of the foam
  const N = 40, spray = new Float32Array(N * 3), seeds = Array.from({ length: N }, (_, i) => [((i * 37) % 100) / 100, ((i * 61) % 100) / 100, ((i * 17) % 100) / 100]);
  const sprayGeo = new THREE.BufferGeometry();
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(spray, 3));
  // (a round soft sprite: a bare point is a hard white square, big near the lens)
  const drops = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ map: softGlowTexture(), color: '#ffffff', size: 0.3, transparent: true, opacity: 0.8, depthWrite: false }));
  drops.frustumCulled = false; drops.userData.noFade = true; drops.raycast = () => {};
  G.scene.add(drops);
  G.addLight({ pos: new THREE.Vector3(bx, bottom + 4, bz), color: '#8fd8ff', intensity: 18 + Math.min(20, drop), distance: 30 });
  G.onUpdate((dt) => {
    for (const s of sheets) s.tex.offset.y -= dt * s.speed;
    const t = G.time;
    foams.forEach((m, k) => {
      const w = f.width * (1.3 + 0.25 * Math.sin(t * 3 + k * 2));
      m.scale.set(w, 1, w * 0.8);
      m.rotation.y = t * (0.4 + k * 0.2);
      m.material.opacity = 0.55 + 0.2 * Math.sin(t * 5 + k);
    });
    mists.forEach((s) => {
      const u = ((t * 0.18 + s.userData.k / mists.length) % 1);
      const size = f.width * (1.4 + u * 1.8) * (1 + Math.min(1, drop / 30));
      s.scale.set(size, size * 0.7, 1);
      s.position.set(bx - dx * u * 2 + Math.sin(s.userData.k * 2.1) * f.width * 0.3, bottom + 0.6 + u * Math.min(10, drop * 0.5), bz - dz * u * 2 + Math.cos(s.userData.k * 1.7) * f.width * 0.3);
      s.material.opacity = 0.42 * Math.sin(u * Math.PI);
    });
    for (let i = 0; i < N; i++) {
      const [a, b, c] = seeds[i];
      const u = (t * (0.9 + c * 0.6) + a) % 1;
      const ang = b * Math.PI * 2, sp = f.width * (0.4 + c * 0.5);
      spray[i * 3] = bx + Math.cos(ang) * sp * u;
      spray[i * 3 + 1] = bottom + 0.2 + (3.5 * u - 4.2 * u * u) * (1 + c);
      spray[i * 3 + 2] = bz + Math.sin(ang) * sp * u;
    }
    sprayGeo.attributes.position.needsUpdate = true;
  });
  for (const o of [...sheets.map((q) => q.mesh), ...foams, ...mists, drops]) G.worldProps?.push({ obj: o, x: bx, z: bz });
  const fall = { sheet: sheets[1].mesh, sheets, top, bottom, width: f.width, lip: new THREE.Vector3(lx, top, lz), foot: new THREE.Vector3(bx, bottom, bz), jet: f.jet ?? 0 };
  (G.waterfalls ??= []).push(fall);
  return fall;
}

const streaks = [];
function streakTexture(kind = 0) {
  if (streaks[kind]) return streaks[kind];
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = kind === 2 ? 'rgba(90,170,215,0.8)' : kind ? 'rgba(220,240,255,0.18)' : 'rgba(170,215,245,0.6)';
  ctx.fillRect(0, 0, 64, 128);
  for (let k = 0; k < (kind ? 34 : 50); k++) {
    const x = (k * 37 + kind * 11) % 64, y = (k * 53) % 128, len = 18 + (k * 13) % 44;
    ctx.fillStyle = `rgba(255,255,255,${(kind ? 0.5 : 0.25) + ((k * 7) % 10) / 22})`;
    const w = kind ? 1 + (k % 3) : 2 + (k % 4);
    ctx.fillRect(x, y, w, len);
    ctx.fillRect(x, y - 128, w, len);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  streaks[kind] = t;
  return t;
}

// A shallow brook between the pools: a ribbon of flowing water a few
// centimetres over the ground (looks only: a paw wades it).
function addBrook(G, world, b) {
  // (over the drawn ground: the highest of the grid vertices round a point)
  const g = world.sample();
  const meshTop = (x, z) => {
    const fi = Math.floor(x - g.x0), fj = Math.floor(z - g.z0);
    let m = -Infinity;
    for (const [i, j] of [[fi, fj], [fi + 1, fj], [fi, fj + 1], [fi + 1, fj + 1]]) m = Math.max(m, g.h[Math.min(g.D - 1, Math.max(0, j)) * g.W + Math.min(g.W - 1, Math.max(0, i))]);
    return m;
  };
  const pts = [];
  for (let i = 0; i < b.pts.length - 1; i++) {
    const [ax, az] = b.pts[i], [bx, bz] = b.pts[i + 1], len = Math.hypot(bx - ax, bz - az);
    for (let s = 0; s < len; s += 1) pts.push([ax + ((bx - ax) * s) / len, az + ((bz - az) * s) / len]);
  }
  pts.push(b.pts.at(-1));
  const pos = [], uv = [], idx = [];
  let run = 0;
  pts.forEach(([x, z], i) => {
    const [nx, nz] = pts[Math.min(pts.length - 1, i + 1)], [px, pz] = pts[Math.max(0, i - 1)];
    let tx = nx - px, tz = nz - pz; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const w = (b.width / 2) * (0.85 + 0.15 * Math.sin(i * 0.7));
    if (i) run += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
    for (const side of [-1, 1]) {
      const vx = x - tz * w * side, vz = z + tx * w * side;
      pos.push(vx, meshTop(vx, vz) + 0.12, vz);
      uv.push(side < 0 ? 0 : 1, run / 3);
    }
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const tex = streakTexture(2).clone();
  tex.needsUpdate = true;
  tex.repeat.set(1, 1);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: '#a8e4ff', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  mesh.name = 'brook';
  mesh.renderOrder = 1;
  mesh.userData.noFade = true;
  mesh.raycast = () => {};
  G.scene.add(mesh);
  G.onUpdate((dt) => { tex.offset.y -= dt * 0.9; });
}

// The old mine's rails: a 2 m piece every 2 m along a run, on whatever
// surface is there (the trestle's deck over the gorge).
function addRails(G, world, pts) {
  const list = [];
  let y = world.groundAt(...pts[0]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
    const ry = Math.atan2(-(bz - az), bx - ax);
    for (let s = 1; s < len; s += 2) {
      const x = ax + ((bx - ax) * s) / len, z = az + ((bz - az) * s) / len;
      y = world.groundAt(x, z, y);
      list.push({ x, y: y + 0.02, z, ry, s: 1 });
    }
  }
  instanceMany(G, 'rail', list);
}

// A deep glow far below (the Crystal Heart from the camp's balcony): soft
// additive sprites that the haze does not swallow, breathing slowly.
function addGlow(G, g) {
  const mat = new THREE.SpriteMaterial({ map: softGlowTexture(), color: g.color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(g.size);
  s.position.set(g.x, g.y, g.z);
  if (g.track) G.worldProps?.push({ obj: s, x: g.x, z: g.z });
  s.userData.noFade = true;
  s.raycast = () => {};
  G.scene.add(s);
  const k = Math.random() * 6;
  G.onUpdate(() => { mat.opacity = 0.45 + 0.15 * Math.sin(G.time * 0.8 + k); });
}

// A shaft of light falling from a crack far above (P-style soft beam): an
// open cone, bright at its foot and fading upward and at its edges, a pool
// of light on the ground and dust motes drifting in it.
let beamTex = null;
function beamTexture() {
  if (beamTex) return beamTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(64, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
    const u = x / 63, v = y / 127; // v: 0 top … 1 bottom
    const edge = Math.sin(u * Math.PI) ** 2;
    // brightest a little over the ground, gone at the top and softly at the foot
    const a = edge * (v ** 1.4) * Math.min(1, (1 - v) * 6 + 0.25) * (0.85 + 0.15 * Math.sin(u * 40 + v * 3));
    const i = (y * 64 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
  beamTex = new THREE.CanvasTexture(c);
  return beamTex;
}
function addShaft(G, world, s) {
  const ground = world.heightAt(s.x, s.z);
  const h = s.top - ground;
  const geo = new THREE.CylinderGeometry(s.r * 0.45, s.r, h, 24, 1, true);
  const mat = new THREE.MeshBasicMaterial({ map: beamTexture(), color: s.color, transparent: true, opacity: s.strength, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Mesh(geo, mat);
  beam.position.set(s.x, ground + h / 2, s.z);
  beam.rotation.z = 0.08;
  beam.name = 'lightShaft';
  beam.userData.noFade = true;
  beam.raycast = () => {};
  G.scene.add(beam);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(s.r * 2.6, s.r * 2.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: softGlowTexture(), color: s.color, transparent: true, opacity: s.strength * 0.6, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  pool.position.set(s.x, ground + 0.08, s.z);
  pool.renderOrder = 3; pool.userData.noFade = true; pool.raycast = () => {};
  G.scene.add(pool);
  const N = Math.round(20 + s.r * 6), motes = new Float32Array(N * 3);
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(motes, 3));
  // (a round soft sprite, as the cave's motes: a bare point is a hard white
  // square, ~12 px at the closest lens)
  const dust = new THREE.Points(mg, new THREE.PointsMaterial({ map: softGlowTexture(), color: '#fff6d8', size: 0.22, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  dust.frustumCulled = false; dust.userData.noFade = true; dust.raycast = () => {};
  G.scene.add(dust);
  G.addLight({ pos: new THREE.Vector3(s.x, ground + 6, s.z), color: s.color, intensity: 10 * s.strength * s.r, distance: s.r * 4 });
  G.onUpdate(() => {
    const t = G.time;
    mat.opacity = s.strength * (0.85 + 0.15 * Math.sin(t * 0.7 + s.x));
    for (let i = 0; i < N; i++) {
      const a = i * 2.39996, rr = s.r * 0.8 * Math.sqrt(((i * 7) % N) / N);
      const yy = ((t * 0.25 + i / N) % 1) * Math.min(h, 14);
      motes[i * 3] = s.x + Math.cos(a + t * 0.1) * rr;
      motes[i * 3 + 1] = ground + 0.5 + yy;
      motes[i * 3 + 2] = s.z + Math.sin(a + t * 0.1) * rr;
    }
    mg.attributes.position.needsUpdate = true;
  });
}

// Fireflies over the moss: points drifting in little loops, blinking, warm
// green-gold; most near the water and the giants. One draw call.
function addFireflies(G, world, grid, def) {
  const pos = [], phase = [];
  const g = world.sample();
  const near = [...(def.waterfalls ?? []), ...(def.landmarks ?? []).filter((l) => ['treeFern', 'mossCushion', 'horsetail'].includes(l.model))];
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const n of near) {
    const count = n.width ? 30 : 12;
    for (let k = 0; k < count; k++) {
      const a = r() * Math.PI * 2, d = 2 + r() * (n.width ? 14 : 8);
      const x = n.x + Math.cos(a) * d, z = n.z + Math.sin(a) * d;
      const node = grid.nearest({ x, z }, 2);
      if (node < 0) continue;
      pos.push(x, grid.y[node] + 0.6 + r() * 2.6, z);
      phase.push(r() * 100);
    }
  }
  // and a thin spread over the whole valley
  for (let k = 0; k < 900; k++) {
    const x = world.bounds[0] + r() * (world.bounds[2] - world.bounds[0]), z = world.bounds[1] + r() * (world.bounds[3] - world.bounds[1]);
    const i = Math.round(x - g.x0), j = Math.round(z - g.z0);
    const n = (j * g.W + i) * 2;
    if (!grid.ok(n)) continue;
    const a = world.areaAt(x, z);
    if (!a || (a.region !== 1 && a.region !== 0)) continue;
    pos.push(x, grid.y[n] + 0.8 + r() * 3, z);
    phase.push(r() * 100);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('phase', new THREE.Float32BufferAttribute(phase, 1));
  const uniforms = { uTime: { value: 0 }, uTex: { value: softGlowTexture() }, uScale: { value: 1 }, uHero: { value: new THREE.Vector3() } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float phase;
      uniform float uTime;
      uniform float uScale;
      uniform vec3 uHero;
      varying float vBlink;
      void main() {
        vec3 p = position;
        // (W2: none past the drawn ground, ~200 m: no sparks in the void)
        if (distance(p.xz, uHero.xz) > 200.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
        float t = uTime * 0.6 + phase;
        p += vec3(sin(t * 1.3) * 0.9, sin(t * 2.1) * 0.35, cos(t * 1.1) * 0.9);
        vBlink = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 2.4 + phase * 3.0), 3.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uScale * 26.0 / -mv.z * (0.6 + vBlink * 0.6);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uTex;
      varying float vBlink;
      void main() {
        vec4 c = texture2D(uTex, gl_PointCoord);
        gl_FragColor = vec4(vec3(0.85, 1.0, 0.45) * c.a * vBlink * 1.6, c.a * vBlink);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'fireflies';
  pts.userData.noFade = true;
  pts.raycast = () => {};
  G.scene.add(pts);
  G.onUpdate(() => { uniforms.uTime.value = G.time; uniforms.uScale.value = G.renderer.getPixelRatio() * (innerHeight / 800) * 30; if (G.player) uniforms.uHero.value.copy(G.player.position); });
  return pos.length / 3;
}
