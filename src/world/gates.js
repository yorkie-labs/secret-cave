import * as THREE from 'three';
import { gateBlocks } from './world.js';
import { textSprite } from '../entities/enemy.js';
import { sfx } from '../audio/sound.js';

// W1: the gates of the big world (worlds/main.js `gates`), the height-world
// a barrier of any width across a passage at
// whatever height the ground (or a bridge deck) has there, a sign over it,
// a solid slab while shut, and the same sink-into-the-ground opening.
//   vine     rocks tied up with vines (the entrance, the arena, region 2)
//   crystal  the necklace's purple crystal door (region 3: 곧 열려요)
//   soon     a little wooden fence with a friendly sign (region 2 past its gate)
//   rail     a mine cart parked across the rails with a plank barrier (the
//            shortcut over the trestle)
// W3:
//   ice      a wall of blue ice blocks across a side way (the Ice Lake's
//            grotto and nook): the hammer breaks it (`hits` swings, a crack
//            more each), it shatters and stays broken (saved)
//   frost    a fence of ice spikes (the Ice Bear's rink: up behind the hero)
// While shut, `G.gateShut(x, z)` says the ground is blocked, so paths
// (systems/nav.js) and animals go round, like world.js `gateBlocks` in tests.
const OPEN_TIME = 0.9;
const stone = new THREE.MeshStandardMaterial({ color: '#7a7f74', flatShading: true, roughness: 0.95 });
const stoneDark = new THREE.MeshStandardMaterial({ color: '#5c6158', flatShading: true, roughness: 0.95 });
const vineMat = new THREE.MeshStandardMaterial({ color: '#4fae4a', emissive: '#2d7a30', emissiveIntensity: 0.6, flatShading: true, roughness: 0.8 });
const wood = new THREE.MeshStandardMaterial({ color: '#9a6a3a', emissive: '#2a1408', emissiveIntensity: 0.5, flatShading: true, roughness: 0.85 });
const crystalMat = () => new THREE.MeshStandardMaterial({ color: '#b48cff', emissive: '#6a2fd0', emissiveIntensity: 0.8, flatShading: true, roughness: 0.25, transparent: true, opacity: 0.92 });
const iceMat = () => new THREE.MeshStandardMaterial({ color: '#bfe8ff', emissive: '#3f9ad8', emissiveIntensity: 0.45, flatShading: true, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.88 });
const frostMat = new THREE.MeshStandardMaterial({ color: '#d8f2ff', emissive: '#5ab4ff', emissiveIntensity: 0.6, flatShading: true, roughness: 0.15, transparent: true, opacity: 0.92 });

export function createGates(G, world, nav, { isOpen, locked }) {
  const gates = world.gates.map((def) => createGate(G, world, nav, def, { open: isOpen(def), locked: locked(def) }));
  G.gateShut = (x, z) => gates.some((g) => !g.open && gateBlocks(g.def, x, z));
  G.emit('navChanged');
  return Object.fromEntries(gates.map((g) => [g.id, g]));
}

function createGate(G, world, nav, def, { open, locked }) {
  const [dx, dz] = def.dir;
  const yaw = Math.atan2(dx, dz); // local +z: the way through
  // the walkable stretch across the passage (the barrier covers that, a little more)
  let lo = Infinity, hi = -Infinity, y = -Infinity;
  for (let a = -def.width / 2; a <= def.width / 2; a += 0.5) {
    const x = def.at[0] - dz * a, z = def.at[1] + dx * a;
    const n = nav.nearest({ x, z }, 0);
    if (n < 0) continue;
    lo = Math.min(lo, a); hi = Math.max(hi, a); y = Math.max(y, nav.y[n]);
  }
  if (!Number.isFinite(lo)) { lo = -2; hi = 2; y = world.groundAt(...def.at); }
  const span = hi - lo + 2.2, mid = (lo + hi) / 2;
  const at = new THREE.Vector3(def.at[0] - dz * mid, y, def.at[1] + dx * mid);
  const root = new THREE.Group();
  root.name = `gate-${def.id}`;
  root.position.copy(at);
  root.rotation.y = yaw;
  const parts = [];
  const add = (m, x, py, z = 0) => { m.position.set(x, py, z); m.castShadow = true; m.receiveShadow = true; root.add(m); parts.push(m); return m; };
  const n = Math.max(2, Math.round(span / 1.6));
  let shine = null, ice = null;
  if (def.kind === 'ice') {
    // big blocks of blue ice, a few smaller ones stacked on them, chips at the foot
    ice = iceMat();
    const m = Math.max(3, Math.round(span / 1.9));
    for (let k = 0; k < m; k++) {
      const w = span / m, h = 2.6 + ((k * 5) % 3) * 0.5;
      const b = add(new THREE.Mesh(new THREE.BoxGeometry(w * 1.05, h, 1.3), ice), -span / 2 + (k + 0.5) * w, h / 2 - 0.1, ((k * 3) % 2) * 0.25 - 0.12);
      b.rotation.set(((k * 7) % 3 - 1) * 0.05, ((k * 5) % 3 - 1) * 0.12, ((k * 11) % 3 - 1) * 0.05);
      if (k < m - 1) { const t = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), ice), -span / 2 + (k + 1) * w, h + 0.3, 0.1); t.rotation.set(k, k * 0.4, 0); t.scale.set(1, 1.4, 0.8); }
    }
    for (let k = 0; k < m * 2; k++) { const c = add(new THREE.Mesh(new THREE.TetrahedronGeometry(0.35, 0), ice), -span / 2 + (k + 0.5) * (span / (m * 2)), 0.15, ((k % 2) ? 1 : -1) * 0.95); c.rotation.set(k, k * 2, 0); }
  } else if (def.kind === 'frost') {
    // a fence of ice spikes, tallest in the middle
    for (let k = 0; k < n + 2; k++) {
      const u = k / (n + 1), h = 1.8 + Math.sin(u * Math.PI) * 1.6 + ((k * 7) % 3) * 0.3;
      const m = add(new THREE.Mesh(new THREE.ConeGeometry(0.42, h, 5), frostMat), -span / 2 + u * span, h / 2, ((k % 2) - 0.5) * 0.4);
      m.rotation.set(((k % 3) - 1) * 0.12, k, ((k % 2) ? 1 : -1) * 0.1);
    }
  } else if (def.kind === 'crystal' && def.secret) {
    // W5: a secret door: a wall of mossy rock with dim crystals in it, only
    // noticed by the nose (world/secrets.js reveals it, then it glows)
    shine = crystalMat();
    shine.emissiveIntensity = 0.12;
    for (let k = 0; k < n; k++) {
      const r = 0.95 - (k % 2) * 0.12;
      const m = add(new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), k % 2 ? stoneDark : stone), -span / 2 + (k + 0.5) * (span / n), 0.8, (k % 2) * 0.14 - 0.07);
      m.rotation.set(k * 1.3, k * 0.7, k * 0.4); m.scale.set(1, 1.05, 0.8);
    }
    for (let k = 0; k < n - 1; k++) {
      const m = add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.65, 0), k % 2 ? stone : stoneDark), -span / 2 + (k + 1) * (span / n), 2.0);
      m.rotation.set(k, k * 0.5, 0);
    }
    for (let k = 0; k < Math.max(2, Math.round(n / 2)); k++) {
      const c = add(new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.1, 5), shine), -span / 2 + ((k * 2 + 1) / (n)) * span * 0.5 + span * 0.1, 1.3 + (k % 2) * 0.7, 0.62);
      c.rotation.set(0.5, k, (k % 2 ? 1 : -1) * 0.4);
    }
  } else if (def.kind === 'crystal') {
    shine = crystalMat();
    for (let k = 0; k < n; k++) {
      const h = 2.4 + ((k * 7) % 5) * 0.45;
      const m = add(new THREE.Mesh(new THREE.ConeGeometry(0.55, h, 5), shine), -span / 2 + (k + 0.5) * (span / n), h / 2, (k % 2) * 0.3 - 0.15);
      m.rotation.set((k % 3 - 1) * 0.08, k, (k % 2 ? 1 : -1) * 0.07);
    }
  } else if (def.kind === 'soon' || def.kind === 'rail') {
    // posts and planks across (and for the rail, a cart parked on the rails)
    for (let k = 0; k <= n; k++) add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.6, 0.22), wood), -span / 2 + k * (span / n), 0.8);
    for (const py of [0.55, 1.15]) add(new THREE.Mesh(new THREE.BoxGeometry(span, 0.2, 0.08), wood), 0, py, 0.12).rotation.z = (py > 1 ? 0.03 : -0.02);
    if (def.kind === 'rail') {
      const cart = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.8, 1.9), new THREE.MeshStandardMaterial({ color: '#6e5a48', flatShading: true, roughness: 0.7, metalness: 0.3 }));
      body.position.y = 0.7;
      cart.add(body);
      for (const [wx, wz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.12, 10).rotateZ(Math.PI / 2), stoneDark);
        w.position.set(wx, 0.25, wz); cart.add(w);
      }
      const ore = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: '#b48cff', emissive: '#6a2fd0', emissiveIntensity: 0.6, flatShading: true }));
      ore.position.y = 1.2; ore.scale.set(1, 0.6, 1.4); cart.add(ore);
      cart.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      root.add(cart); parts.push(cart);
      cart.position.set(0, 0, -1.4);
    }
  } else {
    // vine: big rocks across the passage, smaller ones on top, two vines
    for (let k = 0; k < n; k++) {
      const r = 0.95 - (k % 2) * 0.12;
      const m = add(new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), k % 2 ? stoneDark : stone), -span / 2 + (k + 0.5) * (span / n), 0.75, (k % 2) * 0.14 - 0.07);
      m.rotation.set(k * 1.3, k * 0.7, k * 0.4); m.scale.set(1, 0.9, 0.75);
    }
    for (let k = 0; k < n - 1; k++) {
      const m = add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 0), k % 2 ? stone : stoneDark), -span / 2 + (k + 1) * (span / n), 1.85);
      m.rotation.set(k, k * 0.5, 0);
    }
    for (const [py, tilt] of [[1.1, 0.06], [1.9, -0.05]]) {
      const v = add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, span + 0.3, 6), vineMat), 0, py, -0.6);
      v.rotation.z = Math.PI / 2 + tilt;
    }
  }
  G.scene.add(root);
  G.look.shadows(root);
  // (W4 `hidden`: no barrier to see, the way itself is not there yet: the
  // crystal bridge past the king's platform)
  if (def.hidden) root.traverse((o) => { if (o.isMesh) o.visible = false; });
  G.worldProps?.push({ obj: root, x: at.x, z: at.z, keep: () => !g.open });

  // the slab: as wide as the gate's data says (into the cliffs either side)
  const solid = () => G.physics.addCuboid(def.at[0], y + 1.5, def.at[1], def.width / 2 + 0.2, 1.6, 0.6, yaw);
  let body = open ? null : solid();

  // (no name sign over it any more: a place's name comes up as a card on
  // entering it and fades, expedition.js; `def.sign` names the gate on the
  // map and its interactable, user feedback 2026-11-06)
  const soon = (def.kind === 'soon' || def.kind === 'crystal') && !def.hidden && !def.secret ? textSprite('🚧', 1.0) : null;
  if (soon && def.kind === 'soon') { soon.position.copy(at).setY(y + 1.9); G.scene.add(soon); }
  const cold = def.kind === 'ice' || def.kind === 'frost';
  const light = G.addLight({ pos: at.clone().setY(y + 2.4), color: def.kind === 'crystal' ? '#c9a8ff' : cold ? '#9fdcff' : '#ffe3a0', intensity: def.hidden ? 0 : def.secret ? 0.6 : def.kind === 'crystal' ? 5 : cold ? 4 : 3, distance: 8 });

  const g = {
    id: def.id, def, kind: def.kind, open, opening: -1, closing: -1, glowing: -1, root, at, y,
    get pos() { return at.clone(); },
  };
  g.glow = () => { if (shine && g.glowing < 0) { g.glowing = 0; sfx.necklace?.(); } };
  // W5: a secret door found by the nose: its crystals light up, a ✨ over it
  g.revealed = !def.secret;
  let spark = null;
  g.reveal = () => {
    if (g.revealed) return false;
    g.revealed = true;
    shine.emissiveIntensity = 0.9;
    light.intensity = 5;
    spark = textSprite('✨', 1.4);
    spark.visible = true;
    spark.position.copy(at).setY(y + 3.2);
    G.scene.add(spark);
    sfx.ting?.();
    G.emit('secretRevealed', g);
    return true;
  };
  g.unseal = () => {
    if (g.open || g.opening >= 0) return false;
    g.opening = 0;
    sfx.grind();
    G.cam?.shake(0.3);
    return true;
  };
  g.seal = () => {
    if (!g.open) return false;
    g.open = false; g.opening = -1; g.closing = 0;
    root.visible = true;
    for (const p of parts) { p.userData.y0 ??= p.position.y; p.position.y = p.userData.y0 - 3.4; }
    body = solid();
    sfx.grind();
    G.cam?.shake(0.35);
    G.emit('navChanged');
    G.emit('gateSealed', g);
    return true;
  };
  const finish = () => {
    g.open = true; g.opening = -1;
    root.visible = false;
    if (soon) soon.visible = false;
    if (body) { for (const h of G.physics.remove(body)) G.invisibleColliders?.delete(h); body = null; }
    light.intensity = def.hidden ? 0 : 4;
    sfx.ting();
    G.emit('navChanged');
    G.emit('gateOpened', g);
  };
  if (open) { root.visible = false; if (soon) soon.visible = false; }
  g.dispose = () => { if (body) G.physics.remove(body); body = null; };

  // W3: an ice wall: the hammer's to break, swing by swing (a hittable
  // every 2 m along it, so a swing anywhere at it lands; one crack a swing)
  g.hits = 0;
  if (def.kind === 'ice') {
    const need = def.hits ?? 3;
    let lastHit = -1;
    const crack = () => {
      if (g.open || g.opening >= 0 || G.time === lastHit) return;
      lastHit = G.time;
      g.hits++;
      sfx.clang?.();
      G.cam?.shake(0.15 + g.hits * 0.08);
      chips(g.hits >= need ? 26 : 8);
      ice.emissiveIntensity = 0.45 + g.hits * 0.35;
      ice.opacity = Math.max(0.55, 0.88 - g.hits * 0.1);
      parts.forEach((p, i) => { p.userData.shake = 0.25; p.userData.i = i; });
      G.emit('iceWallHit', { gate: g, hits: g.hits, need });
      if (g.hits >= need) { g.opening = 0; sfx.grind(); G.emit('iceWallBroken', g); }
      else G.toast(g.hits === 1 ? '🧊 쩍! 얼음에 금이 갔어요' : '🧊 쩌적! 한 번 더!', 1600);
    };
    const across = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    for (let a = -span / 2 + 1; a <= span / 2 - 0.9; a += 2) {
      const hp = at.clone().addScaledVector(across, a).setY(y + 1);
      G.addHittable({ radius: 1.2, enabled: () => !g.open && g.opening < 0, pos: hp, onHit: (o) => { if (o.kind === 'hammer' || o.kind === 'wave') crack(); return true; } });
    }
  }
  // flying chips of ice (a crack, the shatter)
  const flying = [];
  const chipGeo = new THREE.TetrahedronGeometry(1, 0);
  function chips(n) {
    for (let k = 0; k < n; k++) {
      const c = new THREE.Mesh(chipGeo, ice);
      c.scale.setScalar(0.12 + Math.random() * 0.22);
      c.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * span * 0.8, y - at.y + 0.6 + Math.random() * 2, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
      c.userData.v = new THREE.Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 5);
      G.scene.add(c);
      flying.push({ c, t: 0 });
    }
  }

  // shut: clicking it (or Space) says why
  if (def.kind !== 'ice' && !def.hidden) G.addInteractable({
    enabled: () => !g.open,
    pos: at.clone(), radius: 3.2, name: def.secret ? '✨ 비밀 문' : def.sign?.name ?? '문', kind: 'gate', gate: g,
    label: () => locked.label,
    action: () => G.toast(locked.toast, 2800),
  });

  G.onUpdate((dt) => {
    for (const f of flying) {
      f.t += dt; f.c.userData.v.y -= 12 * dt;
      f.c.position.addScaledVector(f.c.userData.v, dt); f.c.rotation.x += dt * 9;
      if (f.t > 1.2 || f.c.position.y < y - 0.5) { G.scene.remove(f.c); f.done = true; }
    }
    for (let i = flying.length - 1; i >= 0; i--) if (flying[i].done) flying.splice(i, 1);
    if (ice && !g.open && g.opening < 0) for (const p of parts) if (p.userData.shake !== undefined) { p.userData.bx ??= p.position.x; p.userData.shake = Math.max(0, p.userData.shake - dt); p.position.x = p.userData.bx + Math.sin(G.time * 70 + p.userData.i) * 0.05 * Math.min(1, p.userData.shake * 6); }
    if (soon?.visible) soon.position.y = y + 1.9 + Math.sin(G.time * 3) * 0.05;
    if (spark) { spark.visible = !g.open; spark.position.y = y + 3.2 + Math.sin(G.time * 2.5) * 0.15; }
    if (g.glowing >= 0 && shine) {
      g.glowing += dt;
      shine.emissiveIntensity = 0.8 + Math.min(1, g.glowing / 0.8) * 2.2 + Math.sin(G.time * 12) * 0.3;
      shine.emissive.set(g.glowing > 0.4 ? '#ffd66a' : '#9b5cff');
    }
    if (g.closing >= 0) {
      g.closing += dt;
      const k = Math.min(1, g.closing / 0.6);
      for (const p of parts) p.position.y = p.userData.y0 - (1 - k) * (1 - k) * 3.4;
      if (k >= 1) g.closing = -1;
    }
    if (g.opening < 0) return;
    g.opening += dt;
    const k = Math.min(1, g.opening / OPEN_TIME);
    parts.forEach((p, i) => {
      p.userData.y0 ??= p.position.y;
      if (ice) {
        // shattering: the blocks burst apart, tumble and fade
        p.userData.x0 ??= p.position.x;
        p.position.x = p.userData.x0 * (1 + k * 0.6);
        p.position.z = ((i % 2) ? 1 : -1) * k * 2.2;
        p.position.y = p.userData.y0 + Math.sin(k * Math.PI) * 1.2 - k * k * 2.5;
        p.rotation.x += 0.05 * (i % 3 + 1); p.scale.multiplyScalar(0.985);
        ice.opacity = 0.88 * (1 - k);
      } else p.position.y = p.userData.y0 - k * k * 3.4 + (k < 0.25 ? Math.sin(g.opening * 60 + i) * 0.04 : 0);
    });
    if (k >= 1) finish();
  });
  return g;
}
