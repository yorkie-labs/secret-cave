import * as THREE from 'three';
import { POISON, BOUNCE } from '../data/bosses.js';
import { sfx } from '../audio/sound.js';

// M6a, the mushroom cave (GDD §7.1 row 2): its scenery and its hazards.
//   - giant glowing mushrooms (landmarks; the foxes hide in their shade),
//     small glowing clusters along the walls, drifting spores,
//   - poison: puddles on the floor and the clouds that poison mushrooms puff
//     (and the queen seeps): inside, half a heart every `tick` s and a green
//     tint; water washes a cloud away (a puddle stays: walk round it). Every
//     cloud is shown first (a green-red ring while the mushroom swells),
//   - bounce mushrooms: step on one and it throws the hero along a fixed arc
//     (dotted on the floor) to a marked landing.
// The poison system (createPoison) lives for the whole game; the zones and
// washables a cave adds go with its scope (core/game.js SCOPED).
// W2: in the big world everything stands on the ground where it is (`y`, or
// G.groundAt); a zone hurts only the hero on its level; fumarole vents puff
// on a beat (createVent); a bounce pad throws the hero up or down a level.
const floorAt = (G, x, z, y) => y ?? G.groundAt?.(x, z) ?? 0;

const mats = new Map();
const mat = (hex, extra = {}) => {
  const k = hex + JSON.stringify(extra);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: hex, flatShading: true, roughness: 0.75, ...extra }));
  return mats.get(k);
};
const glowMat = (hex, k = 0.55) => mat(hex, { emissive: hex, emissiveIntensity: k });

// A mushroom: a slightly bent stem and a domed cap with glowing gills and
// pale spots. `h` its height, `r` the cap's radius (metres), `cap` its colour.
export function mushroomModel({ h = 1, r = 0.5, cap = '#b05cff', stem = '#efe2d0', spots = '#ffeeb8', seed = 0, glow = 0.45 } = {}) {
  const g = new THREE.Group();
  g.name = 'mushroom';
  const sr = Math.max(0.05, r * 0.24);
  const stemGeo = new THREE.CylinderGeometry(sr * 0.85, sr * 1.25, h, 7, 4);
  const pos = stemGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / h + 0.5; // 0 at the foot
    pos.setX(i, pos.getX(i) + Math.sin(y * 2.2 + seed) * r * 0.12 * y);
  }
  stemGeo.computeVertexNormals();
  const st = new THREE.Mesh(stemGeo, mat(stem, { emissive: stem, emissiveIntensity: 0.18 }));
  st.position.y = h / 2;
  g.add(st);
  const capMesh = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), glowMat(cap, glow));
  capMesh.scale.y = 0.55;
  capMesh.position.set(Math.sin(2.2 + seed) * r * 0.12, h * 0.97, 0);
  g.add(capMesh);
  const gills = new THREE.Mesh(new THREE.CircleGeometry(r * 0.96, 12).rotateX(Math.PI / 2), glowMat(cap, glow * 2.2));
  gills.position.copy(capMesh.position).setY(h * 0.97 - 0.01);
  g.add(gills);
  const n = Math.max(3, Math.round(r * 5));
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + seed, rho = r * (0.25 + ((i * 7) % 5) / 8);
    const sp = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.1, 0), glowMat(spots, 0.8));
    const y = Math.sqrt(Math.max(0, 1 - (rho / r) ** 2)) * r * 0.55;
    sp.position.set(capMesh.position.x + Math.cos(a) * rho, h * 0.97 + y, Math.sin(a) * rho);
    sp.scale.y = 0.5;
    g.add(sp);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.cap = capMesh;
  return g;
}

// Spores drifting up through the cave round the hero (one cloud of points
// that follows the hero and wraps round, so it is cheap anywhere).
export function addSpores(G, theme) {
  const N = 180, BOX = 44, H = 9;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), seed = [];
  const tint = theme.mushrooms.caps.map((c) => new THREE.Color(c));
  for (let i = 0; i < N; i++) {
    seed.push({ x: Math.random() * BOX, y: Math.random() * H, z: Math.random() * BOX, v: 0.12 + Math.random() * 0.25, w: Math.random() * 6 });
    const c = tint[i % tint.length].clone().lerp(new THREE.Color('#fff2c8'), 0.35);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const tex = sporeTexture();
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: tex, size: 0.2, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  pts.name = 'spores';
  pts.frustumCulled = false;
  pts.userData.noFade = true;
  pts.raycast = () => {};
  G.scene.add(pts);
  G.onUpdate((dt) => {
    const p = G.player.position;
    for (let i = 0; i < N; i++) {
      const s = seed[i];
      s.y += s.v * dt;
      if (s.y > H) s.y -= H;
      const wx = ((s.x - p.x) % BOX + BOX * 1.5) % BOX - BOX / 2, wz = ((s.z - p.z) % BOX + BOX * 1.5) % BOX - BOX / 2;
      pos[i * 3] = p.x + wx + Math.sin(G.time * 0.5 + s.w) * 0.4;
      pos[i * 3 + 1] = (G.world ? p.y - 0.5 : 0.3) + s.y;
      pos[i * 3 + 2] = p.z + wz + Math.cos(G.time * 0.4 + s.w) * 0.4;
    }
    geo.attributes.position.needsUpdate = true;
  });
  return pts;
}
let sporeTex = null;
function sporeTexture() {
  if (sporeTex) return sporeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  sporeTex = new THREE.CanvasTexture(c);
  return sporeTex;
}

// ---------------------------------------------------------------- poison

// The poison system: is the hero standing in a live cloud or a puddle? The
// first `grace` s inside are free, then half a heart every `tick` s (the
// hero's blink after a hit is shorter, so it never chains), the screen
// tints green while inside. Zones: G.poisonZones ({ x, z, r, live(), kind }).
export function createPoison(G) {
  const tint = document.getElementById('poison-tint');
  let timer = POISON.grace, inside = null, glow = 0;
  G.poisonZones ??= [];
  G.washables ??= [];
  // (W2: `y`: only a zone on that level, not one on a shelf above or below)
  G.poisonAt = (x, z, pad = 0, y) => G.poisonZones.find((p) => p.live() && Math.hypot(x - p.x, z - p.z) < p.r + pad && (y === undefined || p.y === undefined || Math.abs(y - p.y) < 2.5)) ?? null;
  // what the bot reads: every live zone as a red mark (hitAt: the next tick)
  G.fieldHazards = () => {
    const out = [];
    for (const p of G.poisonZones) {
      // (one the hero is not in only hurts once stepped into: no hurry)
      if (p.live() && (p.y === undefined || !G.player || Math.abs(G.player.position.y - p.y) < 2.5)) out.push({ kind: 'poison', shape: 'circle', x: p.x, z: p.z, r: p.r, hitAt: G.time + (inside === p ? timer : 3), poison: true });
      const w = p.warning?.();
      if (w) out.push(w);
    }
    return out;
  };
  // drop what is over (a washed cloud, a summoned mushroom gone), in place
  const prune = (list) => { const keep = list.filter((z) => !z.dead); list.length = 0; list.push(...keep); };
  G.onUpdate((dt) => {
    for (const z of G.poisonZones) z.step?.(dt);
    if (G.poisonZones.some((z) => z.dead)) { prune(G.poisonZones); prune(G.washables); }
    if (!G.ticking() || !G.player) { if (tint) tint.style.opacity = '0'; return; }
    const pp = G.player.position;
    const now = G.poisonAt(pp.x, pp.z, 0, G.world ? pp.y : undefined);
    if (now !== inside) { inside = now; timer = POISON.grace; if (now) G.emit('poisonIn', { kind: now.kind }); }
    if (inside) {
      timer -= dt;
      if (timer <= 0) {
        timer = POISON.tick;
        const hurt = G.hurtPlayer(new THREE.Vector3(inside.x, 0, inside.z), POISON.damage);
        G.emit('poisonTick', { kind: inside.kind, hurt: !!hurt, at: G.time });
        if (hurt) G.toast('🤢 독이에요! 초록 구름 밖으로! (물총으로 씻을 수 있어요)', 2000);
      }
    }
    glow += ((inside ? 1 : 0) - glow) * Math.min(1, dt * 5);
    if (tint) tint.style.opacity = glow.toFixed(3);
  });
  return { get inside() { return inside; } };
}

// a soft green poison cloud: a few puffy translucent balls swirling low
function cloudMesh(r) {
  const g = new THREE.Group();
  g.name = 'poisonCloud';
  g.userData.noFade = true;
  const m = new THREE.MeshBasicMaterial({ color: '#7dff6a', transparent: true, opacity: 0.22, depthWrite: false, fog: false });
  const dark = new THREE.MeshBasicMaterial({ color: '#3fae3a', transparent: true, opacity: 0.28, depthWrite: false, fog: false });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, d = i === 0 ? 0 : r * 0.55;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r * (i === 0 ? 0.55 : 0.42), 1), i % 2 ? dark : m);
    b.position.set(Math.cos(a) * d, r * 0.25, Math.sin(a) * d);
    b.scale.y = 0.45;
    b.userData.a = a; b.userData.d = d;
    g.add(b);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.94, r, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#9dff5a', transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
  ring.position.y = 0.05;
  ring.renderOrder = 5;
  g.add(ring);
  g.userData.mats = [m, dark, ring.material];
  return g;
}

// A poison cloud ({ x, z, r, life }): live as soon as it is made (it comes
// after its telegraph), it thins out over its last second, water washes it.
export function createPoisonCloud(G, { x, z, r, life, kind = 'cloud', y }) {
  const g = cloudMesh(r);
  const fy = floorAt(G, x, z, y);
  g.position.set(x, fy, z);
  G.scene.add(g);
  const c = { x, z, r, kind, t: 0, life, gone: false, mesh: g, y: G.world ? fy : undefined };
  c.live = () => !c.gone && c.t < c.life;
  const w = { x, z, r, active: () => c.live(), kind: 'cloud' };
  c.wash = w.wash = () => {
    if (c.gone) return false;
    c.gone = true; c.washed = true; c.fade = 0;
    sfx.splash?.();
    G.emit('poisonWashed', { kind, x, z });
    return true;
  };
  c.dispose = () => { G.scene.remove(g); g.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); w.dead = true; }; // (its own balls and colours: let them go)
  G.poisonZones.push(c);
  G.washables.push(w);
  const base = g.userData.mats.map((m) => m.opacity);
  c.step = (dt) => {
    c.t += dt;
    const k = c.gone ? Math.max(0, 1 - (c.fade = (c.fade ?? 0) + dt * 3)) : Math.min(1, c.t * 3) * Math.min(1, (c.life - c.t) + 0.2);
    g.userData.mats.forEach((m, i) => { m.opacity = base[i] * Math.max(0, k); });
    g.children.forEach((b, i) => { if (b.userData.a !== undefined) { const a = b.userData.a + G.time * 0.6; b.position.x = Math.cos(a) * b.userData.d; b.position.z = Math.sin(a) * b.userData.d; b.rotation.y = G.time * 0.3 + i; } });
    if ((c.gone && k <= 0) || c.t > c.life + 1) { c.gone = true; c.dead = true; c.dispose(); }
  };
  return c;
}

// A poison puddle on the floor: always there (no telegraph needed: it does
// not move, it is plainly green and bubbling, and click-to-move walks round
// it: G.navCost). Water flies over it (only a cloud in the air is washed).
// W2 `look`: a Polyfork pool under the goo ('mud': the bubbling mud pool,
// 'tar': the tar pit), sized to the puddle, a green sheen on it.
export function createPuddle(G, { x, z, r, y, look = null, model = null }) {
  const g = new THREE.Group();
  g.name = 'poisonPuddle';
  g.userData.noFade = true;
  const goo = new THREE.Mesh(new THREE.CircleGeometry(r, 28).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#5bd04a', emissive: '#3aa82e', emissiveIntensity: 0.7, roughness: 0.2, transparent: true, opacity: 0.85, depthWrite: false }));
  goo.position.y = 0.035;
  goo.renderOrder = 2;
  const rim = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.18, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#2e7a28', transparent: true, opacity: 0.8, depthWrite: false }));
  rim.position.y = 0.03;
  g.add(goo, rim);
  const bubbles = [];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), glowMat('#b6ff8a', 0.8));
    b.userData.a = i * 1.3; b.userData.d = r * (0.2 + (i % 3) * 0.25);
    g.add(b);
    bubbles.push(b);
  }
  const fy = floorAt(G, x, z, y);
  g.position.set(x, fy, z);
  if (look && model) {
    // the pool itself, a little bigger than the goo, the goo a sheen over it
    model.scale.multiplyScalar(r * (look === 'tar' ? 0.62 : 0.95));
    model.position.y = -0.04;
    model.rotation.y = x * 1.7;
    g.add(model);
    goo.material = goo.material.clone();
    goo.material.opacity = look === 'tar' ? 0.42 : 0.5;
    goo.position.y = look === 'tar' ? 0.3 : 0.12;
    goo.scale.setScalar(0.82);
    for (const b of g.children) if (b !== model && b !== goo && b !== rim) b.position.y += goo.position.y;
    rim.position.y = goo.position.y - 0.01;
  }
  G.scene.add(g);
  const p = { x, z, r, kind: 'puddle', live: () => true, y: G.world ? fy : undefined, look, parts: [g] };
  G.poisonZones.push(p);
  G.addLight({ pos: new THREE.Vector3(x, fy + 0.8, z), color: '#7dff5a', intensity: 2.5, distance: 5 });
  const by = goo.position.y;
  p.step = () => {
    for (const b of bubbles) {
      const u = (G.time * 0.6 + b.userData.a) % 1;
      b.position.set(Math.cos(b.userData.a) * b.userData.d, by + 0.02 + u * 0.25, Math.sin(b.userData.a) * b.userData.d);
      b.scale.setScalar(0.6 + u);
    }
  };
  return p;
}

// A poison mushroom: when the hero comes within `near` m it swells (a
// green-red ring on the floor: where the cloud will be) for `warn` s, then
// puffs a cloud that lasts `life` s, then rests. Water on it while it
// swells stops the puff (it gets wet and sulks).
export function createPoisonMushroom(G, { x, z, y, life = Infinity, theme = null, summoned = false, big = 1 }) {
  const def = POISON.mushroom;
  const fy = floorAt(G, x, z, y);
  const m = mushroomModel({ h: 0.85 * big, r: 0.55 * big, cap: '#9b3fd8', stem: '#e8d8ff', spots: '#b6ff6a', seed: x, glow: 0.65 });
  m.name = 'poisonMushroom';
  m.position.set(x, fy, z);
  G.scene.add(m);
  G.look.shadows(m);
  const ring = new THREE.Group();
  const edge = new THREE.Mesh(new THREE.RingGeometry(def.radius * 0.9, def.radius, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3a2a', transparent: true, opacity: 0.85, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(def.radius * 0.9, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7dff4a', transparent: true, opacity: 0.35, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  fill.position.y = 0.005;
  ring.add(edge, fill);
  for (const o of [edge, fill]) o.renderOrder = 5;
  ring.position.set(x, fy + 0.05, z);
  ring.visible = false;
  G.scene.add(ring);
  const p = { x, z, y: fy, state: 'idle', t: 0, cloud: null, gone: false, model: m, summoned, parts: [m] };
  // the swelling, for the bot and the checks
  p.warning = () => (p.state === 'swell' ? { kind: 'poisonPuff', shape: 'circle', x, z, r: def.radius, hitAt: G.time + (def.warn - p.t) + POISON.grace, poison: true } : null);
  const zone = { x, z, r: 0, kind: 'mushroom', live: () => false, warning: p.warning, mushroom: p };
  const w = { x, z, r: 0.9, active: () => p.state === 'swell', wash: () => { p.state = 'rest'; p.t = 0; ring.visible = false; G.emit('poisonWashed', { kind: 'mushroom', x, z }); return true; }, kind: 'mushroom' };
  zone.dispose = () => { G.scene.remove(m); G.scene.remove(ring); p.gone = true; w.dead = true; };
  p.remove = () => { zone.dispose(); zone.dead = true; };
  G.poisonZones.push(zone);
  G.washables.push(w);
  let age = 0;
  zone.step = (dt) => {
    if (p.gone) return;
    age += dt;
    if (age > life) { zone.dispose(); zone.dead = true; return; }
    if (!G.ticking()) return;
    p.t += dt;
    const pp = G.player.position;
    const d = Math.hypot(pp.x - x, pp.z - z) + (G.world ? Math.max(0, Math.abs(pp.y - fy) - 1.5) * 10 : 0);
    if (p.state === 'idle' && d < def.near && p.t > 0.3) { p.state = 'swell'; p.t = 0; sfx.growl?.(); G.emit('poisonSwell', { x, z, at: G.time }); }
    else if (p.state === 'swell' && p.t >= def.warn) {
      p.state = 'puff'; p.t = 0;
      p.cloud = createPoisonCloud(G, { x, z, y: fy, r: def.radius, life: def.life, kind: 'puff' });
      sfx.gust?.();
      G.emit('poisonPuff', { x, z, at: G.time });
    } else if (p.state === 'puff' && (p.t >= def.life || p.cloud?.gone)) { p.state = 'rest'; p.t = 0; }
    else if (p.state === 'rest' && p.t >= def.rest) { p.state = 'idle'; p.t = 0; }
    ring.visible = !G.fainted && p.state === 'swell';
    if (ring.visible) { fill.scale.setScalar(Math.max(0.05, p.t / def.warn)); edge.material.opacity = 0.7 + Math.sin(G.time * 30) * 0.2; }
    const swell = p.state === 'swell' ? 1 + (p.t / def.warn) * 0.35 + Math.sin(G.time * 30) * 0.04 : p.state === 'puff' && p.t < 0.3 ? 1.35 - p.t : 1;
    m.scale.set(swell * big, (2 - swell) * big, swell * big);
  };
  void theme;
  return p;
}

// W2: a fumarole vent in the forest floor (Polyfork's `fumarole-vent`): it
// puffs poison on a beat while the hero is about. Every puff is shown first:
// steam rises and the green-red ring fills for `warn` s, then the cloud
// stands `life` s, then it rests `rest` s. Water on it while it rumbles
// stops that puff (like a poison mushroom).
export const VENT = { warn: 1.3, life: 3.2, rest: 4.5, radius: 2.3, wake: 22 };
export function createVent(G, { x, z, y, model = null, phase = 0 }) {
  const def = VENT;
  const fy = floorAt(G, x, z, y);
  const g = new THREE.Group();
  g.name = 'fumarole';
  g.position.set(x, fy, z);
  if (model) { model.scale.multiplyScalar(1.5); model.rotation.y = x; g.add(model); }
  G.scene.add(g);
  G.look.shadows(g);
  G.physics.addCylinder(x, fy, z, { radius: 0.7, height: 1.6 });
  // the warning ring, like the poison mushroom's
  const edge = new THREE.Mesh(new THREE.RingGeometry(def.radius * 0.9, def.radius, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3a2a', transparent: true, opacity: 0.85, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(def.radius * 0.9, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7dff4a', transparent: true, opacity: 0.35, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  const ring = new THREE.Group();
  ring.add(edge, fill);
  for (const o of [edge, fill]) o.renderOrder = 5;
  ring.position.set(x, fy + 0.06, z);
  ring.visible = false;
  G.scene.add(ring);
  // steam: soft puffs rising out of it, thicker and greener while it rumbles
  const steamMat = new THREE.SpriteMaterial({ map: sporeTexture(), color: '#d8ffc0', transparent: true, opacity: 0.35, depthWrite: false });
  const steam = Array.from({ length: 6 }, (_, k) => { const s = new THREE.Sprite(steamMat.clone()); s.userData.k = k; s.raycast = () => {}; G.scene.add(s); return s; });
  const v = { x, z, y: fy, state: 'rest', t: def.rest * (0.3 + (phase % 1) * 0.7), cloud: null, gone: false, parts: [g] };
  v.warning = () => (v.state === 'swell' ? { kind: 'ventPuff', shape: 'circle', x, z, r: def.radius, hitAt: G.time + (def.warn - v.t) + POISON.grace, poison: true } : null);
  const zone = { x, z, y: fy, r: 0, kind: 'vent', live: () => false, warning: v.warning, vent: v };
  const w = { x, z, r: 1, active: () => v.state === 'swell', wash: () => { v.state = 'rest'; v.t = 0; ring.visible = false; G.emit('poisonWashed', { kind: 'vent', x, z }); return true; }, kind: 'vent' };
  G.poisonZones.push(zone);
  G.washables.push(w);
  zone.step = (dt) => {
    const pp = G.player?.position;
    const near = pp && Math.hypot(pp.x - x, pp.z - z) < def.wake && Math.abs(pp.y - fy) < 8;
    if (G.ticking() && (near || v.state !== 'rest')) {
      v.t += dt;
      if (v.state === 'rest' && v.t >= def.rest && near) { v.state = 'swell'; v.t = 0; sfx.rumble?.(); G.emit('ventSwell', { x, z, at: G.time }); }
      else if (v.state === 'swell' && v.t >= def.warn) {
        v.state = 'puff'; v.t = 0;
        v.cloud = createPoisonCloud(G, { x, z, y: fy, r: def.radius, life: def.life, kind: 'vent' });
        sfx.gust?.();
        G.emit('ventPuff', { x, z, at: G.time });
      } else if (v.state === 'puff' && (v.t >= def.life || v.cloud?.gone)) { v.state = 'rest'; v.t = 0; }
    }
    ring.visible = !G.fainted && v.state === 'swell';
    if (ring.visible) { fill.scale.setScalar(Math.max(0.05, v.t / def.warn)); edge.material.opacity = 0.7 + Math.sin(G.time * 30) * 0.2; }
    const hot = v.state === 'swell' ? 1 : v.state === 'puff' ? 0.6 : 0.15;
    for (const s of steam) {
      const u = ((G.time * (0.5 + hot * 0.6) + s.userData.k / steam.length) % 1);
      const size = (0.8 + u * 2.2) * (0.6 + hot);
      s.scale.set(size, size, 1);
      s.position.set(x + Math.sin(s.userData.k * 2.1 + G.time * 0.7) * 0.3 * u, fy + 1.4 + u * (2 + hot * 2.5), z + Math.cos(s.userData.k * 1.3) * 0.3 * u);
      s.material.opacity = (0.15 + hot * 0.35) * Math.sin(u * Math.PI);
      s.material.color.set(v.state === 'swell' ? '#a8ff7a' : '#e8ffd8');
    }
  };
  return v;
}

// ---------------------------------------------------------------- bounce

// A bounce mushroom ({ x, z, to }): a springy orange cap; step on it and it
// throws the hero along its arc (dotted on the floor) to the glowing mark.
// W2: `y` and `to.y` (the big world: up or down a level), the arc dotted in
// the air; `id` (its jump link in the walking grid, world/navGrid.js).
export function bounceFlight(from, to) {
  const d = Math.hypot(to.x - from.x, to.z - from.z), rise = (to.y ?? 0) - (from.y ?? 0);
  return { time: Math.max(BOUNCE.time, 0.55 + d / 20 + Math.abs(rise) / 40), height: BOUNCE.height + Math.max(0, rise) * 0.15 };
}
export function createBounce(G, { x, z, to, y, id = null }) {
  const fy = floorAt(G, x, z, y);
  const ty = floorAt(G, to.x, to.z, to.y);
  const land3 = new THREE.Vector3(to.x, ty, to.z);
  const big = G.world ? 1.35 : 1;
  const pad = mushroomModel({ h: 0.45 * big, r: 0.95 * big, cap: '#ff8a2a', stem: '#ffe2b8', spots: '#fff6c8', seed: x, glow: 0.7 });
  pad.name = 'bounceMushroom';
  pad.position.set(x, fy, z);
  G.scene.add(pad);
  G.look.shadows(pad);
  const g = new THREE.Group();
  g.name = 'bounceArc';
  g.userData.noFade = true;
  // the arc: dots from the pad to the landing (on the floor; W2: in the air,
  // the path the hero will fly)
  const flight = G.world ? bounceFlight({ x, z, y: fy }, { x: to.x, z: to.z, y: ty }) : BOUNCE;
  const h = flight.height + Math.abs(ty - fy) / 2;
  const arcY = (u) => (G.world ? fy + (ty - fy) * u + 4 * h * u * (1 - u) : 0.05);
  const dotMat = new THREE.MeshBasicMaterial({ color: G.world ? '#ffd27a' : '#ffc46a', transparent: true, opacity: 0.55, depthWrite: false, fog: false });
  const len = Math.hypot(to.x - x, to.z - z), n = Math.max(6, Math.round(len / (G.world ? 1.6 : 0.9)));
  const dots = [];
  const dotGeo = G.world ? new THREE.SphereGeometry(0.24, 8, 6) : new THREE.CircleGeometry(0.11, 10).rotateX(-Math.PI / 2);
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const d = new THREE.Mesh(dotGeo, dotMat);
    d.position.set(x + (to.x - x) * u, arcY(u), z + (to.z - z) * u);
    d.renderOrder = 3;
    d.raycast = () => {};
    g.add(d);
    dots.push(d);
  }
  // the landing: a soft orange ring with an arrow over it
  const land = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffb04a', transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
  land.position.set(to.x, (G.world ? ty : 0) + 0.05, to.z);
  land.renderOrder = 3;
  land.raycast = () => {};
  g.add(land);
  G.scene.add(g);
  G.addLight({ pos: new THREE.Vector3(x, fy + 1, z), color: '#ffb04a', intensity: G.world ? 8 : 4, distance: G.world ? 9 : 6 });
  const b = { x, z, y: fy, to: land3, id, ready: 0, pad, arc: g };
  G.onUpdate((dt) => {
    b.ready = Math.max(0, b.ready - dt);
    const k = (G.time * 0.8) % 1;
    dots.forEach((d, i) => { d.material.opacity = G.world ? 0.75 : 0.35; d.scale.setScalar(1 + 0.4 * Math.max(0, 1 - Math.abs(i / dots.length - k) * 6)); });
    land.scale.setScalar(1 + Math.sin(G.time * 4) * 0.08);
    const squash = b.ready > BOUNCE.cooldown - 0.3 ? 0.6 : 1;
    pad.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    if (!G.ticking() || b.ready > 0 || G.player.state.flight) return;
    const pp = G.player.position;
    if (Math.hypot(pp.x - x, pp.z - z) < 0.8 * big && pp.y < fy + 0.6 && pp.y > fy - 1) {
      b.ready = flight.time + BOUNCE.cooldown;
      sfx.jump?.();
      G.pointer?.cancel();
      G.player.launch(G.world ? land3.clone() : new THREE.Vector3(to.x, 0, to.z), flight);
      G.emit('bounce', { from: { x, z, y: fy }, to: land3, id, at: G.time });
    }
  });
  return b;
}
