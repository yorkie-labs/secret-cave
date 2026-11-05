import * as THREE from 'three';
import { place, instance, whenReady } from './models.js';
import { M } from './worlds/main.js';
import { CRYSTAL_SPIKE, hopFlight, ESCAPE } from '../data/bosses.js';
import { spikeBurst } from '../entities/bosses/crystalKing.js';
import { createEscape } from './escape.js';
import { softGlowTexture } from './glow.js';
import { textSprite } from '../entities/enemy.js';
import { createGlyphWall } from '../entities/necklace.js';
import { sfx } from '../audio/sound.js';

// W4: the Crystal Heart's fixtures (region 4, worlds/main.js): the floating
// rocks the hero hops between (their decks are the world's `islands`, their
// hops the walking grid's jump links: a hop only when the path means it, or
// when the hero walks onto a pad on purpose), the giant crystal heart over
// the king's platform with its beams of light, rocks drifting in the dark,
// the ruins (Polyfork's Dungeon & Crypt pieces) and their braziers, the
// guardians (moai) with glowing eyes, the old letters, crystal spikes that
// burst out of the floor (a ring first), violet motes round the hero, and
// the way out: the crystal bridge (shown when the king sleeps), the tunnel's
// portal, the sunlight, and the escape run (world/escape.js rocks).
export const HEART_MODELS = ['asteroid', 'asteroidM', 'asteroidS', 'moai', 'moaiKneel', 'moaiLying', 'dungeonWall', 'gable', 'brazier', 'rubble', 'ashlar', 'masonry', 'ropeBridge', 'stele', 'runeStone', 'portal', 'crown'];
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function createHeart(G, def) {
  const world = G.world;
  const h = { islands: [], hops: [], zones: [], drift: [], braziers: [], sealed: false, faded: false, escape: null };
  const inHeart = () => G.expedition?.area?.region === 4;

  // ---- the floating rocks
  for (const s of world.islands) h.islands.push(floatingRock(G, s));

  // ---- the hops: a rune pad near each rock's edge, a dotted arc, a landing
  G.jumpOpen = (id) => !h.sealed || !h.sealedIds?.has(id);
  for (const j of def.hops ?? []) h.hops.push(createHop(G, j));
  G.on('bounced', () => hopLanded()); // (the walk a hop broke goes on)
  h.seal = (ids) => { h.sealed = true; h.sealedIds = new Set(ids); G.emit('navChanged'); };
  h.unseal = () => { h.sealed = false; h.sealedIds = null; G.emit('navChanged'); };

  // ---- the giant crystal heart over the king's platform, and its beams
  const K = def.king;
  const kingY = world.groundAt(...K.at);
  h.crystal = heartCrystal(G, { x: K.at[0], y: K.crystal.y, z: K.at[1], size: K.crystal.size, floor: kingY, def });

  // ---- rocks drifting in the dark (looks: they only bob and turn)
  const KEY = { l: 'asteroid', m: 'asteroidM', s: 'asteroidS' };
  for (const [k, u, v, y, s] of def.drift ?? []) {
    const [x, z] = M(u, v);
    const obj = instance(KEY[k]);
    obj.scale.setScalar(s);
    tint(obj, '#7c6aa8', 0.25, '#4a1aa0');
    obj.position.set(x, y, z);
    obj.userData.noFade = true;
    whenReady(obj, () => obj.traverse((o) => { o.raycast = () => {}; if (o.isMesh) o.castShadow = false; }));
    G.scene.add(obj);
    const seed = u * 0.13 + v * 0.07;
    h.drift.push({ obj, y, seed });
    G.worldProps?.push({ obj, x, z });
  }
  G.onUpdate(() => {
    if (!inHeart() && !G.expedition?.atCamp) return;
    for (const d of h.drift) {
      d.obj.position.y = d.y + Math.sin(G.time * 0.35 + d.seed) * 1.4;
      d.obj.rotation.y = G.time * 0.05 + d.seed;
      d.obj.rotation.x = Math.sin(G.time * 0.2 + d.seed) * 0.12;
    }
  });

  // ---- the ruins
  buildRuins(G, def.ruins ?? {}, h);
  // the guardians: moai standing at the ledges' edges and by the way out, eyes alight
  for (const [model, u, v, s, face] of def.guardians ?? []) {
    const [x, z] = M(u, v), [fx, fz] = M(...face);
    const y = world.groundAt(x, z);
    const ry = Math.atan2(fx - x, fz - z);
    const obj = place(G, model, x, z, { s, ry: model === 'moaiLying' ? ry + Math.PI / 2 : ry, y: y - 0.3, body: 'none' });
    tint(obj, '#a89cc0', 0, null);
    G.worldProps?.push({ obj, x, z });
    if (model !== 'moaiLying') {
      const top = model === 'moai' ? 6.1 * s * 0.8 : 3.7 * s * 0.84;
      for (const side of [-1, 1]) {
        const eye = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#c78cff', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        eye.scale.setScalar(0.55 * s);
        eye.position.set(x + Math.sin(ry) * 0.75 * s + Math.cos(ry) * side * 0.32 * s, y + top, z + Math.cos(ry) * 0.75 * s - Math.sin(ry) * side * 0.32 * s);
        eye.raycast = () => {};
        eye.userData.guardianEye = true;
        G.scene.add(eye);
        G.worldProps?.push({ obj: eye, x, z });
        h.guardianEyes ??= [];
        h.guardianEyes.push(eye);
      }
      G.addLight({ pos: V(x + Math.sin(ry) * 2, y + top, z + Math.cos(ry) * 2), color: '#b07bff', intensity: 6, distance: 10 });
    }
    if (model !== 'moaiLying') G.physics.addCylinder(x, y, z, { radius: model === 'moai' ? 1.0 * s : 0.85 * s, height: 3 });
  }

  // ---- crystal spikes on the ways in (a ring first, then they burst up)
  h.zones = (def.spikes ?? []).map((z) => createSpikeZone(G, { x: z.at[0], z: z.at[1], r: z.r }));
  const before = G.fieldHazards;
  G.fieldHazards = () => [...(before?.() ?? []), ...h.zones.flatMap((z) => z.hazards()), ...(h.escape?.run?.hazards() ?? [])];

  // ---- violet motes rising round the hero, in region 4 only
  const motes = addMotes(G);
  G.onUpdate(() => { motes.visible = inHeart() && G.mode !== 'title'; });

  // ---- the way out: the crystal bridge (hidden until the king sleeps), the
  // tunnel's portal, the sunlight at its end
  const exitB = world.bridges.find((b) => b.id === 'exitBridge');
  h.bridge = exitB ? crystalBridge(G, exitB) : null;
  const E = def.escape;
  if (E) {
    const [tx, tz] = E.tunnel[0];
    const [ux, uz] = E.tunnel[1];
    const ty = world.groundAt(tx, tz);
    const portal = place(G, 'portal', tx, tz, { s: 1.15, ry: Math.atan2(ux - tx, uz - tz), y: ty - 0.3, body: 'none' });
    tint(portal, '#9a8cb4', 0, null);
    portal.userData.noFade = false;
    whenReady(portal, () => portal.traverse((o) => { o.raycast = () => {}; }));
    G.worldProps?.push({ obj: portal, x: tx, z: tz });
    h.sun = sunlight(G, { x: E.sun[0], z: E.sun[1], y: world.groundAt(...E.sun) });
  }
  // the escape run: from the king's platform over the bridge and up the
  // tunnel, rocks falling ahead; a soft clock
  h.startEscape = ({ seed = 1 } = {}) => {
    h.stopEscape();
    const [fx, fz] = E.from, [sx, sz] = E.sun;
    const len = Math.hypot(sx - fx, sz - fz);
    const dir = [(sx - fx) / len, (sz - fz) / len];
    const clock = { left: ESCAPE.time };
    const run = createEscape(G, { x: fx, z: fz, dir, length: len, width: 7, from: ESCAPE.rocksFrom, rocks: ESCAPE.rocks, floor: (x, z) => G.groundAt(x, z, G.player.position.y), hurry: () => clock.left <= 0 }, seed);
    h.escape = { run, clock, startedAt: G.time };
    showClock(true);
    G.emit('escapeStart', { at: G.time, length: len });
  };
  h.stopEscape = () => {
    if (!h.escape) return;
    h.escape.run.stopped = true;
    h.escape.run.clear();
    h.escape = null;
    showClock(false);
  };
  const clockEl = document.createElement('div');
  clockEl.id = 'escape-clock';
  clockEl.className = 'hidden';
  document.getElementById('hud')?.appendChild(clockEl);
  const showClock = (on) => clockEl.classList.toggle('hidden', !on);
  let warned = false;
  G.onUpdate((dt) => {
    const esc = h.escape;
    if (!esc || G.mode !== 'play') return;
    esc.clock.left -= dt;
    const left = Math.max(0, Math.ceil(esc.clock.left));
    clockEl.innerHTML = left > 0 ? `☀️ 햇빛까지 달려요! <b>${left}</b>` : '☀️ 서둘러요! 거의 다 왔어요!';
    clockEl.classList.toggle('hurry', esc.clock.left <= 10);
    if (esc.clock.left <= 0 && !warned) { warned = true; G.toast('⏳ 서둘러요! 바위가 더 자주 떨어져요', 2400); }
  });

  // the ambience: in the heart a deep violet haze; nearer the heart crystal, brighter
  return h;
}

// ---- a floating rock: a flat round top at the deck's height, a jagged
// cone of rock under it with violet crystal veins, a few small asteroids
// hanging from it; an unseen disc on top for the clicks
function floatingRock(G, s) {
  const [x, z] = s.at;
  const g = new THREE.Group();
  g.name = `island-${s.id}`;
  g.position.set(x, s.y, z);
  const rock = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 });
  const top = new THREE.CylinderGeometry(s.r + 0.35, s.r * 0.92, 1.3, 16, 1).translate(0, -0.65, 0).toNonIndexed();
  const under = new THREE.ConeGeometry(s.r * 0.95, s.r * 1.9, 11, 4).rotateX(Math.PI).translate(0, -1.25 - s.r * 0.95, 0).toNonIndexed();
  const col = (geo, a, b, wob) => {
    const p = geo.attributes.position, c = new Float32Array(p.count * 3), ca = new THREE.Color(a), cb = new THREE.Color(b), t = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
      if (wob && py < -0.2) { const k = 1 + (Math.sin(px * 3.1 + pz * 1.7 + s.r) * 0.5 + Math.sin(pz * 4.3 - px) * 0.3) * wob; p.setXYZ(i, px * k, py + Math.sin(px * 2 + pz * 3) * 0.25, pz * k); }
      t.copy(ca).lerp(cb, Math.min(1, Math.max(0, -py / (s.r * 2.2))) + (Math.sin(px * 5 + pz * 3) * 0.08));
      c.set([t.r, t.g, t.b], i * 3);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    geo.computeVertexNormals();
    return geo;
  };
  const topMesh = new THREE.Mesh(col(top, '#7a7290', '#5a4f74', 0.12), rock);
  const underMesh = new THREE.Mesh(col(under, '#4c3f68', '#241a3a', 0.22), rock);
  // the walked face: a lighter worn stone disc with a soft violet moss rim
  const face = new THREE.Mesh(new THREE.CircleGeometry(s.r + 0.2, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#8e86a6', roughness: 0.9, flatShading: true }));
  face.position.y = 0.01;
  const moss = new THREE.Mesh(new THREE.RingGeometry(s.r - 0.6, s.r + 0.35, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#8a5cc8', emissive: '#4a1a90', emissiveIntensity: 0.35, roughness: 0.9 }));
  moss.position.y = 0.02;
  for (const m of [topMesh, underMesh, face, moss]) { m.castShadow = m !== face && m !== moss; m.receiveShadow = true; m.raycast = () => {}; g.add(m); }
  // crystal veins poking out of the rock, and a cluster on the rim
  const cry = new THREE.MeshStandardMaterial({ color: '#d6b8ff', emissive: '#8a3cff', emissiveIntensity: 1.0, flatShading: true, roughness: 0.15 });
  const n = 5 + Math.round(s.r);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + s.r, low = i % 2 === 0;
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.35 + (i % 3) * 0.12, 0), cry);
    const rr = low ? s.r * 0.55 : s.r + 0.1, yy = low ? -1.4 - (i % 3) * s.r * 0.35 : 0.15;
    c.position.set(Math.cos(a) * rr, yy, Math.sin(a) * rr);
    c.scale.set(1, low ? 2.4 : 1.8, 1);
    c.rotation.set(low ? Math.PI + 0.4 * Math.cos(a) : 0.35 * Math.cos(a), a, low ? 0.4 * Math.sin(a) : 0.35 * Math.sin(a));
    c.raycast = () => {};
    g.add(c);
  }
  // a small asteroid or two hanging under it (Polyfork)
  for (let k = 0; k < 2; k++) {
    try {
      const a = instance('asteroidS');
      a.scale.setScalar(0.8 + k * 0.5);
      a.position.set(Math.cos(k * 2.4 + s.r) * s.r * 0.4, -s.r * 1.4 - k * 1.4, Math.sin(k * 2.4 + s.r) * s.r * 0.4);
      a.rotation.set(k, k * 2, 0.4);
      tint(a, '#5e4f86', 0.2, '#3a1480');
      whenReady(a, () => a.traverse((o) => { o.raycast = () => {}; }));
      g.add(a);
    } catch { /* (models not loaded in a check) */ }
  }
  g.userData.noFade = true;
  G.scene.add(g);
  G.worldProps?.push({ obj: g, x, z });
  // a click on the rock means its top
  const disc = new THREE.Mesh(new THREE.CircleGeometry(s.r, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  disc.position.set(x, s.y + 0.02, z);
  disc.name = 'islandDeck';
  disc.userData.noFade = true;
  G.scene.add(disc);
  G.groundMeshes.push(disc);
  G.addLight({ pos: V(x, s.y - 2, z), color: '#a060ff', intensity: 7, distance: 12 });
  return { group: g, s };
}

// ---- a hop pad: a violet rune circle near a rock's edge; standing on it
// while the path goes that way (or after walking onto it on purpose) throws
// the hero along a short arc to its landing. The walk the hero was on goes
// on after the landing (a click across three rocks is three hops).
function createHop(G, j) {
  const nav = G.navGrid;
  const pn = nav.nearest({ x: j.pad[0], z: j.pad[1] }, 2), ln = nav.nearest({ x: j.land[0], z: j.land[1] }, 2);
  const py = pn >= 0 ? nav.y[pn] : G.groundAt(...j.pad), ly = ln >= 0 ? nav.y[ln] : G.groundAt(...j.land);
  const from = V(j.pad[0], py, j.pad[1]), to = V(j.land[0], ly, j.land[1]);
  const flight = hopFlight(from, to);
  const g = new THREE.Group();
  g.name = `hop-${j.id}`;
  g.userData.noFade = true;
  const add = (m) => { m.raycast = () => {}; m.renderOrder = 4; g.add(m); return m; };
  const mat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });
  const ring = add(new THREE.Mesh(new THREE.RingGeometry(0.72, 0.92, 6).rotateX(-Math.PI / 2), mat('#d9a8ff', 0.9)));
  const ring2 = add(new THREE.Mesh(new THREE.RingGeometry(0.45, 0.55, 6).rotateX(-Math.PI / 2), mat('#ffd6ff', 0.8)));
  const glow = add(new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: softGlowTexture(), color: '#b070ff', transparent: true, opacity: 0.6, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })));
  for (const m of [ring, ring2, glow]) m.position.set(from.x, from.y + 0.06, from.z);
  // an arrow of crystal over the pad, pointing the way
  const arrow = add(new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 4).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#efe0ff', emissive: '#a050ff', emissiveIntensity: 1.2, flatShading: true })));
  const yaw = Math.atan2(to.x - from.x, to.z - from.z);
  arrow.rotation.y = yaw;
  // the arc: dots in the air the hero will fly along
  const h = flight.height + Math.abs(to.y - from.y) / 2;
  const len = from.distanceTo(to), n = Math.max(5, Math.round(len / 1.4));
  const dotMat = new THREE.MeshBasicMaterial({ color: '#e2c4ff', transparent: true, opacity: 0.7, depthWrite: false, fog: false });
  const dotGeo = new THREE.SphereGeometry(0.17, 8, 6);
  const dots = [];
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const d = add(new THREE.Mesh(dotGeo, dotMat));
    d.position.set(from.x + (to.x - from.x) * u, from.y + (to.y - from.y) * u + 4 * h * u * (1 - u), from.z + (to.z - from.z) * u);
    dots.push(d);
  }
  const land = add(new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 24).rotateX(-Math.PI / 2), mat('#c9a0ff', 0.55)));
  land.position.set(to.x, to.y + 0.05, to.z);
  G.scene.add(g);
  G.worldProps?.push({ obj: g, x: from.x, z: from.z });
  G.addLight({ pos: V(from.x, from.y + 1, from.z), color: '#b070ff', intensity: 5, distance: 7 });
  const hop = { id: j.id, from, to, ready: 0, group: g, fired: 0 };
  const open = () => G.jumpOpen?.(j.id) ?? true;
  let onPadSince = -1;
  G.onUpdate((dt) => {
    hop.ready = Math.max(0, hop.ready - dt);
    const on = open();
    const k = (G.time * 0.9) % 1;
    dots.forEach((d, i) => { d.visible = on; d.scale.setScalar(1 + 0.5 * Math.max(0, 1 - Math.abs(i / dots.length - k) * 6)); });
    ring.rotation.y = G.time * 0.6; ring2.rotation.y = -G.time * 0.9;
    ring.material.opacity = on ? 0.75 + Math.sin(G.time * 4) * 0.15 : 0.2;
    glow.material.opacity = on ? 0.55 : 0.12;
    land.visible = on;
    arrow.position.set(from.x + Math.sin(yaw) * 0.2, from.y + 1.1 + Math.sin(G.time * 3) * 0.12, from.z + Math.cos(yaw) * 0.2);
    arrow.visible = on;
    if (!G.ticking() || hop.ready > 0 || G.player.state.flight || !on) { onPadSince = -1; return; }
    const pp = G.player.position;
    const near = Math.hypot(pp.x - from.x, pp.z - from.z) < 0.85 && Math.abs(pp.y - from.y) < 0.8;
    if (!near) { onPadSince = -1; return; }
    if (onPadSince < 0) onPadSince = G.time;
    const o = G.pointer?.order;
    const path = o?.path ?? [];
    // the walk goes this way (its next point is this hop's landing), or the
    // hero walked onto the pad itself and stopped there
    const goal = G.pointer?.lastGoal;
    const wants = path.slice(0, 2).some((p) => p.jump === j.id)
      || (!o && goal && Math.hypot(goal.x - from.x, goal.z - from.z) < 1.2 && performance.now() - goal.at < 15000 && G.time - onPadSince > 0.15);
    if (!wants) return;
    // where the walk was going, to go on after the landing
    const after = o && o.type === 'move' && Math.hypot(o.point.x - to.x, o.point.z - to.z) > 1.2 ? { point: o.point.clone(), exact: !!o.exact } : null;
    G.pointer?.clearGoal?.();
    hop.ready = flight.time + 0.6;
    hop.fired++;
    sfx.hop?.();
    G.pointer?.cancel();
    G.player.launch(to.clone(), flight);
    G.emit('hop', { id: j.id, from: from.clone(), to: to.clone(), at: G.time, time: flight.time });
    if (after) pendingResume = () => { G.pointer?.goTo(after.point, after.exact); };
  });
  return hop;
}
// (one landing at a time: the walk resumes after it)
let pendingResume = null;
export function hopLanded() { const r = pendingResume; pendingResume = null; r?.(); }

// ---- the giant crystal heart floating over the king's platform: an outer
// shell of violet crystal, a bright core, shards circling it, a halo, beams
// of light falling from it onto the platform, the stones and the ledges.
// `fade()`: its power goes (the king asleep): the light turns warm and soft,
// the beams draw in, the shards fall.
function heartCrystal(G, { x, y, z, size, floor, def }) {
  const g = new THREE.Group();
  g.name = 'crystalHeart';
  g.position.set(x, y, z);
  const shellMat = new THREE.MeshStandardMaterial({ color: '#b98cff', emissive: '#6a24e0', emissiveIntensity: 0.9, flatShading: true, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.88 });
  const coreMat = new THREE.MeshBasicMaterial({ color: '#ffd8ff', transparent: true, opacity: 0.95, fog: false });
  const shell = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), shellMat);
  shell.scale.set(size * 0.5, size, size * 0.5);
  const shell2 = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), shellMat);
  shell2.scale.set(size * 0.36, size * 0.72, size * 0.36);
  shell2.rotation.y = Math.PI / 4;
  shell2.position.y = 0.4;
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1, 1), coreMat);
  core.scale.set(size * 0.16, size * 0.3, size * 0.16);
  g.add(shell, shell2, core);
  const shardMat = new THREE.MeshStandardMaterial({ color: '#e6d0ff', emissive: '#9a4cff', emissiveIntensity: 1.2, flatShading: true, roughness: 0.1 });
  const shards = Array.from({ length: 10 }, (_, i) => { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.6 + (i % 3) * 0.3, 0), shardMat); m.scale.y = 2; m.userData.k = i / 10; g.add(m); return m; });
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#c88cff', transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  halo.scale.setScalar(size * 4.2);
  g.add(halo);
  g.traverse((o) => { o.raycast = () => {}; });
  g.userData.noFade = true;
  G.scene.add(g);
  // beams: soft additive cones from the heart down to the places it watches
  const targets = [[x, floor, z, 7]];
  for (const s of G.world.islands) targets.push([s.at[0], s.y, s.at[1], s.r * 0.8]);
  for (const [u, v] of [[-100, -205], [104, -205], [0, -310], [-40, -140], [44, -280]]) { const [tx, tz] = M(u, v); targets.push([tx, G.world.groundAt(tx, tz), tz, 5]); }
  const beams = targets.map(([tx, ty, tz, r]) => {
    const from = V(x, y - size * 0.3, z), to = V(tx, ty, tz);
    const len = from.distanceTo(to);
    const geo = new THREE.CylinderGeometry(0.5, r, len, 16, 1, true).translate(0, -len / 2, 0);
    const mat = new THREE.MeshBasicMaterial({ map: beamTex(), color: '#c69aff', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(from);
    m.quaternion.setFromUnitVectors(V(0, -1, 0), to.clone().sub(from).normalize());
    m.raycast = () => {};
    m.userData.noFade = true;
    m.name = 'heartBeam';
    G.scene.add(m);
    // a pool of light where it falls
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.4, r * 2.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: softGlowTexture(), color: '#b07bff', transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    pool.position.set(tx, ty + 0.08, tz);
    pool.renderOrder = 3; pool.raycast = () => {};
    G.scene.add(pool);
    return { m, mat, pool };
  });
  const light = G.addLight({ pos: V(x, y, z), color: '#b46bff', intensity: 60, distance: 70 });
  const under = G.addLight({ pos: V(x, floor + 6, z), color: '#c08aff', intensity: 18, distance: 26 });
  let fade = -1;
  const warm = new THREE.Color('#ffe8c0'), violet = new THREE.Color('#b46bff');
  const crystal = {
    group: g, beams, light,
    get faded() { return fade >= 3; },
    fade(now = false) { if (fade < 0) fade = now ? 3 : 0; },
  };
  G.onUpdate((dt) => {
    const t = G.time;
    if (fade >= 0 && fade < 3) fade += dt;
    const f = fade < 0 ? 0 : Math.min(1, fade / 3);
    g.position.y = y + Math.sin(t * 0.6) * 0.8 - f * 2;
    shell.rotation.y = t * 0.12; shell2.rotation.y = -t * 0.18 + Math.PI / 4;
    core.scale.setScalar(1).multiply(V(size * 0.16, size * 0.3, size * 0.16)).multiplyScalar(1 + Math.sin(t * 2.4) * 0.06 * (1 - f));
    shellMat.emissiveIntensity = 0.9 * (1 - f * 0.75) + Math.sin(t * 1.3) * 0.1;
    shellMat.color.set('#b98cff').lerp(warm, f * 0.7);
    shellMat.emissive.set('#6a24e0').lerp(new THREE.Color('#5a4030'), f);
    coreMat.color.set('#ffd8ff').lerp(warm, f);
    halo.material.color.copy(violet).lerp(warm, f);
    halo.material.opacity = 0.75 * (1 - f * 0.6);
    light.color.copy(violet).lerp(warm, f); light.intensity = 60 * (1 - f * 0.5);
    under.intensity = 18 * (1 - f * 0.4);
    shards.forEach((s, i) => {
      const a = t * 0.4 + s.userData.k * Math.PI * 2;
      const r = size * 0.95 + Math.sin(t + i) * 0.4;
      s.position.set(Math.cos(a) * r, Math.sin(t * 0.8 + i * 1.7) * size * 0.4 - f * f * (20 + i * 3), Math.sin(a) * r);
      s.rotation.y = a * 2;
      s.visible = f < 0.98;
    });
    for (const [i, b] of beams.entries()) {
      b.mat.opacity = (0.2 + Math.sin(t * 0.9 + i * 1.3) * 0.06) * (1 - f);
      b.m.visible = b.mat.opacity > 0.005;
      b.pool.material.opacity = 0.3 * (1 - f);
    }
  });
  void def;
  return crystal;
}
let beamT = null;
function beamTex() {
  if (beamT) return beamT;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(64, 128);
  for (let yy = 0; yy < 128; yy++) for (let xx = 0; xx < 64; xx++) {
    const u = xx / 63, v = yy / 127;
    const a = Math.sin(u * Math.PI) ** 2 * (0.35 + 0.65 * v) * (1 - v * 0.4) * (0.8 + 0.2 * Math.sin(u * 30 + v * 6));
    const i = (yy * 64 + xx) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
  beamT = new THREE.CanvasTexture(c);
  return beamT;
}

// ---- the ruins: wall runs of Dungeon & Crypt modules (2 m each, some left
// out where they fell, the rest a little askew), a gable over a run's middle
// as an arch, braziers with violet flames, rubble, and the old letters on a
// carved stone that tell what happened here
function buildRuins(G, R, h) {
  const world = G.world;
  for (const [u0, v0, u1, v1, gaps = [], arch = false] of R.walls ?? []) {
    const [ax, az] = M(u0, v0), [bx, bz] = M(u1, v1);
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 2));
    const yaw = Math.atan2(bx - ax, bz - az) - Math.PI / 2; // (the module's long side is its local x)
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const a = run[0], b = run.at(-1);
      const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2, half = (run.length * 2) / 2;
      G.physics.addCuboid(cx, Math.min(...run.map((q) => q.y)) + 1.4, cz, half, 1.4, 0.35, yaw);
      run = [];
    };
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (gaps.includes(i)) {
        flush();
        if (i % 2 === 0) { const r = place(G, 'masonry', x + 0.6, z - 0.4, { s: 2.6, ry: i, body: 'none' }); tint(r, '#9a92ac', 0, null); G.worldProps?.push({ obj: r, x, z }); }
        continue;
      }
      const y = world.groundAt(x, z);
      const fallen = (i * 7 + n) % 5 === 0;
      const obj = place(G, 'dungeonWall', x, z, { s: 1, ry: yaw + (fallen ? 0.12 : 0), y: y - (fallen ? 0.9 : 0.1), body: 'none' });
      obj.rotation.z = fallen ? 0.08 : 0;
      tint(obj, '#a29ab8', 0.05, '#3a1a70');
      G.worldProps?.push({ obj, x, z });
      run.push({ x, z, y });
    }
    flush();
    if (arch) {
      const t = 0.5, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const obj = place(G, 'gable', x, z, { s: 0.9, ry: yaw, y: world.groundAt(x, z) - 0.2, body: 'none' });
      tint(obj, '#a29ab8', 0.05, '#3a1a70');
      obj.userData.fadeTo = 0.25;
      G.worldProps?.push({ obj, x, z });
    }
  }
  for (const [u, v] of R.braziers ?? []) {
    const [x, z] = M(u, v), y = world.groundAt(x, z);
    const b = place(G, 'brazier', x, z, { s: 1.6, ry: u, y, body: 'none' });
    G.physics.addCylinder(x, y, z, { radius: 0.55, height: 1.6 });
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#c27aff', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    flame.scale.set(1.3, 1.8, 1);
    flame.position.set(x, y + 2.1, z);
    flame.raycast = () => {};
    G.scene.add(flame);
    G.worldProps?.push({ obj: b, x, z }, { obj: flame, x, z });
    G.addLight({ pos: V(x, y + 2.4, z), color: '#b77bff', intensity: 9, distance: 13, flicker: 0.15 });
    h.braziers.push(flame);
  }
  G.onUpdate(() => { for (const [i, f] of h.braziers.entries()) { const k = 1 + Math.sin(G.time * 9 + i * 2) * 0.12; f.scale.set(1.3 * k, 1.8 / k, 1); } });
  for (const [u, v] of R.rubble ?? []) {
    const [x, z] = M(u, v);
    const r = place(G, 'rubble', x, z, { s: 1.4, ry: u * 0.3, y: world.groundAt(x, z) - 0.1, body: 'none' });
    tint(r, '#8c84a2', 0, null);
    G.physics.addCylinder(x, world.groundAt(x, z), z, { radius: 1.3, height: 1.2 });
    G.worldProps?.push({ obj: r, x, z });
    const a = place(G, 'ashlar', x + 2, z + 1, { s: 3, ry: v, body: 'none' });
    tint(a, '#9a92ac', 0, null);
    G.worldProps?.push({ obj: a, x, z });
  }
  // the old letters (GDD §2.2, §6.4): a carved stone; read, they glow and say what happened here
  if (R.glyph) {
    const [x, z] = R.glyph.at, [fx, fz] = R.glyph.face;
    const y = world.groundAt(x, z), face = Math.atan2(fx - x, fz - z);
    place(G, 'glyphStone', x, z, { s: 2.6, ry: face, y, body: 'none' });
    G.physics.addCylinder(x, y, z, { radius: 1.5, height: 3 });
    const glyphs = createGlyphWall(G, { x: x + Math.sin(face) * 0.95, z: z + Math.cos(face) * 0.95, y: y + 0.9, facing: face, lit: false });
    let read = false;
    G.addInteractable({
      pos: V(x + Math.sin(face) * 2, y, z + Math.cos(face) * 2), radius: 3, name: '옛 글자', kind: 'glyph', label: '📜 옛 글자 읽기',
      action: () => {
        if (!read) { read = true; glyphs.light?.(); sfx.necklace?.(); G.emit('glyphRead'); }
        G.say([
          { name: '옛 글자', text: '“보라빛 수정이 하늘에서 떨어져 동굴의 심장이 되었다. 그 빛이 닿는 곳마다 동물들이 사나워졌다.”' },
          { name: '옛 글자', text: '“왕관을 쓴 수정이 심장을 지킨다. 그는 큰 힘을 쓰고 나면 지쳐 주저앉는다.”' },
          { name: '옛 글자', text: '“심장이 잠들면, 해가 비치는 길이 열리리라.”' },
        ]);
      },
    });
  }
}

// ---- crystal spikes: while the hero is in one of these places, now and
// then a ring shows where the hero stands (a little off), then spikes burst
// up there (half a heart inside it). Walking on is enough to miss them.
function createSpikeZone(G, { x, z, r }) {
  const def = CRYSTAL_SPIKE;
  const y0 = G.groundAt(x, z);
  const marks = [];
  let wait = def.first;
  const zone = { x, z, r, y: y0, marks, fired: 0, hits: 0 };
  const ringMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  function ring(at) {
    const g = new THREE.Group();
    const edge = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 32).rotateX(-Math.PI / 2), ringMat('#ff2a2a', 0.85));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), ringMat('#b04cff', 0.45));
    fill.position.y = 0.005;
    g.add(edge, fill);
    for (const o of [edge, fill]) o.renderOrder = 5;
    g.position.set(at.x, at.y + 0.05, at.z);
    g.scale.setScalar(def.radius);
    G.scene.add(g);
    const burst = spikeBurst();
    burst.scale.setScalar(0.85);
    G.scene.add(burst);
    const m = { x: at.x, z: at.z, y: at.y, t: 0, g, fill, edge, burst, done: false };
    marks.push(m);
    zone.fired++;
    G.emit('spikeWarn', { x: at.x, z: at.z, at: G.time, hitAt: G.time + def.warn });
  }
  zone.hazards = () => marks.filter((m) => m.t < def.warn).map((m) => ({ kind: 'spike', shape: 'circle', x: m.x, z: m.z, r: def.radius, hitAt: G.time + (def.warn - m.t) }));
  G.onUpdate((dt) => {
    const pp = G.player?.position;
    const inside = pp && G.ticking() && Math.hypot(pp.x - x, pp.z - z) < r && Math.abs(pp.y - y0) < 4;
    if (inside) {
      wait -= dt;
      if (wait <= 0) {
        wait = def.every;
        const a = Math.random() * Math.PI * 2, off = Math.random() * 0.9;
        const at = { x: pp.x + Math.cos(a) * off, z: pp.z + Math.sin(a) * off };
        if (!marks.some((m) => !m.done && Math.hypot(m.x - at.x, m.z - at.z) < def.radius * 2)) ring({ ...at, y: G.groundAt(at.x, at.z, pp.y) });
      }
    } else wait = Math.max(wait, def.first);
    for (const m of marks) {
      if (m.done) continue;
      if (G.ticking() || m.t >= def.warn) m.t += dt;
      const k = Math.min(1, m.t / def.warn);
      if (m.t < def.warn) {
        m.fill.scale.setScalar(Math.max(0.1, k));
        m.fill.material.opacity = 0.3 + k * 0.45;
        m.edge.material.opacity = 0.65 + Math.sin(performance.now() / 40) * 0.25;
      } else if (!m.burst.userData.fired) {
        m.burst.userData.fired = true;
        m.g.visible = false;
        m.burst.userData.burst({ x: m.x, z: m.z }, m.y);
        sfx.clang?.();
        const pp2 = G.player.position;
        const hit = Math.hypot(pp2.x - m.x, pp2.z - m.z) < def.radius + 0.3 && Math.abs(pp2.y - m.y) < 2.5;
        const hurt = hit && G.hurtPlayer(new THREE.Vector3(m.x, m.y, m.z), def.damage);
        if (hurt) { zone.hits++; G.toast('💎 아야! 수정 가시예요. 바닥의 원을 보면 피해요!', 2000); }
        G.emit('spikeBurst', { x: m.x, z: m.z, at: G.time, hurt: !!hurt, inside: hit });
      } else {
        m.burst.userData.step();
        if (m.t > def.warn + def.stay + 0.6) { m.done = true; G.scene.remove(m.g, m.burst); }
      }
    }
    for (let i = marks.length - 1; i >= 0; i--) if (marks[i].done) marks.splice(i, 1);
  });
  return zone;
}

// ---- the crystal bridge: hexagonal plates of glowing crystal along the
// deck, posts of crystal either side; hidden until the king sleeps, then it
// forms plate by plate from the platform outward (`grow()`)
function crystalBridge(G, b) {
  const g = new THREE.Group();
  g.name = 'crystalBridge';
  g.userData.noFade = true;
  const plateMat = new THREE.MeshStandardMaterial({ color: '#d8c2ff', emissive: '#7a3cf0', emissiveIntensity: 0.7, flatShading: true, roughness: 0.1, transparent: true, opacity: 0.86 });
  const postMat = new THREE.MeshStandardMaterial({ color: '#e8d8ff', emissive: '#9a5cff', emissiveIntensity: 1.1, flatShading: true, roughness: 0.1 });
  const n = Math.round(b.length / 1.6);
  const yaw = Math.atan2(b.b[0] - b.a[0], b.b[1] - b.a[1]);
  const plates = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(b.width * 0.62, b.width * 0.5, 0.35, 6), plateMat);
    p.position.set(b.a[0] + (b.b[0] - b.a[0]) * t, b.y0 - 0.2, b.a[1] + (b.b[1] - b.a[1]) * t);
    p.rotation.y = yaw + (i % 2) * 0.3;
    p.receiveShadow = true;
    p.raycast = () => {};
    g.add(p);
    const parts = [p];
    if (i % 3 === 0) for (const side of [-1, 1]) {
      const q = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), postMat);
      q.scale.y = 2.6;
      q.position.set(p.position.x + Math.cos(yaw) * side * (b.width / 2 + 0.2), b.y0 + 0.6, p.position.z - Math.sin(yaw) * side * (b.width / 2 + 0.2));
      q.raycast = () => {};
      g.add(q);
      parts.push(q);
    }
    plates.push({ parts, t });
  }
  g.visible = false;
  G.scene.add(g);
  G.worldProps?.push({ obj: g, x: (b.a[0] + b.b[0]) / 2, z: (b.a[1] + b.b[1]) / 2, keep: () => g.visible });
  const light = G.addLight({ pos: V((b.a[0] + b.b[0]) / 2, b.y0 + 2, (b.a[1] + b.b[1]) / 2), color: '#c9a0ff', intensity: 0, distance: 36 });
  let grow = -1;
  const bridge = {
    group: g,
    grow(now = false) { g.visible = true; grow = now ? 9 : 0; light.intensity = 14; sfx.power?.(); },
    get shown() { return g.visible; },
  };
  G.onUpdate((dt) => {
    if (grow < 0) return;
    grow += dt;
    for (const p of plates) {
      const k = Math.min(1, Math.max(0, (grow - p.t * 2.2) / 0.35));
      for (const m of p.parts) { m.visible = k > 0; m.scale.x = m.scale.z = Math.max(0.01, k) * (m.geometry.type === 'OctahedronGeometry' ? 1 : 1); }
    }
    plateMat.emissiveIntensity = 0.7 + Math.sin(G.time * 2) * 0.15;
  });
  return bridge;
}

// ---- the sunlight at the end of the tunnel: a beam of warm daylight from
// far above, a bright pool on the floor, dust in it
function sunlight(G, { x, y, z }) {
  const top = y + 70;
  const h = top - y;
  const mat = new THREE.MeshBasicMaterial({ map: beamTex(), color: '#fff2c8', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 7, h, 24, 1, true), mat);
  beam.position.set(x, y + h / 2, z);
  beam.raycast = () => {};
  beam.userData.noFade = true;
  beam.name = 'sunBeam';
  G.scene.add(beam);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: softGlowTexture(), color: '#fff0c0', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  pool.position.set(x, y + 0.08, z);
  pool.renderOrder = 3; pool.raycast = () => {};
  G.scene.add(pool);
  const sign = textSprite('☀️', 2.2);
  sign.position.set(x, y + 4, z);
  G.scene.add(sign);
  G.addLight({ pos: V(x, y + 6, z), color: '#fff0c8', intensity: 40, distance: 40 });
  G.onUpdate(() => { mat.opacity = 0.5 + Math.sin(G.time * 0.8) * 0.06; sign.position.y = y + 4 + Math.sin(G.time * 2) * 0.15; });
  for (const o of [beam, pool, sign]) G.worldProps?.push({ obj: o, x, z });
  return { x, y, z };
}

// ---- violet motes rising round the hero (one draw call)
function addMotes(G) {
  const N = 260, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 56; pos[i * 3 + 1] = Math.random() * 20; pos[i * 3 + 2] = (Math.random() - 0.5) * 56; seed[i] = Math.random() * 100; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const uniforms = { uTime: { value: 0 }, uHero: { value: new THREE.Vector3() }, uTex: { value: softGlowTexture() }, uScale: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float seed;
      uniform float uTime; uniform vec3 uHero; uniform float uScale;
      varying float vA;
      void main() {
        vec3 p = position;
        float t = uTime + seed;
        p.y = mod(p.y + uTime * (0.5 + fract(seed) * 0.5), 20.0) - 6.0;
        p.x += sin(t * 0.5) * 1.5; p.z += cos(t * 0.4) * 1.5;
        p.x = uHero.x + mod(p.x - uHero.x + 28.0, 56.0) - 28.0;
        p.z = uHero.z + mod(p.z - uHero.z + 28.0, 56.0) - 28.0;
        p.y += uHero.y;
        vA = smoothstep(14.0, 6.0, p.y - uHero.y) * smoothstep(-6.0, -2.0, p.y - uHero.y) * (0.55 + 0.45 * sin(t * 3.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uScale * (0.6 + fract(seed * 3.1) * 0.8) * 10.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uTex;
      varying float vA;
      void main() { vec4 c = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.82, 0.6, 1.0) * c.a * vA * 1.4, c.a * vA); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'motes';
  pts.frustumCulled = false;
  pts.userData.noFade = true;
  pts.raycast = () => {};
  pts.visible = false;
  G.scene.add(pts);
  G.onUpdate(() => { uniforms.uTime.value = G.time; uniforms.uScale.value = G.renderer.getPixelRatio() * (innerHeight / 800) * 30; if (G.player) uniforms.uHero.value.copy(G.player.position); });
  return pts;
}

// A model's colours turned toward a stone tint (vertex colours greyed and
// tinted), with an optional faint violet glow (`glow` intensity, `emissive`).
// (release: a model still streaming in is tinted when it lands)
export function tint(obj, hex, glow = 0, emissive = null) {
  whenReady(obj, () => tintNow(obj, hex, glow, emissive));
}
function tintNow(obj, hex, glow, emissive) {
  const t = new THREE.Color(hex);
  const grey = (r, g, b) => r * 0.3 + g * 0.55 + b * 0.15;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const col = o.geometry.attributes.color;
    if (col) {
      o.geometry = o.geometry.clone();
      const c = o.geometry.attributes.color;
      for (let n = 0; n < c.count; n++) { const v = 0.35 + grey(c.getX(n), c.getY(n), c.getZ(n)) * 0.9; c.setXYZ(n, v * t.r, v * t.g, v * t.b); }
    }
    o.material = o.material.clone();
    if (col) o.material.color?.set('#ffffff'); else o.material.color?.multiply(t);
    if (glow && o.material.emissive) { o.material.emissive.set(emissive ?? hex); o.material.emissiveIntensity = glow; }
  });
}
