import * as THREE from 'three';
import { ITEMS, GRADE_UP } from '../data/items.js';
import { gradeUp, upgradeTarget, gradeName } from '../combat/grades.js';
import { ga } from '../core/josa.js';
import { rollLoot } from '../core/loot.js';
import { rng, subSeed } from '../core/rng.js';
import { grant } from '../combat/loadout.js';
import { betterArmor } from '../combat/hits.js';
import { createShield, createHerb, createVineCoil } from './maltese.js';
import { createMaskModel } from '../combat/items/mask.js';
import { dropShard } from './enemy.js';
import { addOutline } from './outline.js';
import { sfx } from '../audio/sound.js';

// A treasure chest (GDD §4.1, §6.5, §11.1): left click walks up and opens
// it, so does Space nearby. The lid shakes, flies open with a burst of gold,
// and the loot pops out in an arc beside it: an item to walk over (or click),
// or a handful of crystal shards. What it holds is rolled when it opens, from
// the run's seed and the chest's own number (core/loot.js), so the same
// seed always gives the same chests.
const OPEN = 0.75; // s: shake, then the lid swings up
const POP_AT = 0.45; // s into the opening: the loot jumps out
const FLIGHT = 0.6; // s the loot is in the air
const C = {
  wood: '#a8682e', woodDark: '#6e4120', band: '#4a3424', gold: '#ffcf4a', inside: '#2a1408',
};

const mats = new Map();
const mat = (hex, extra = {}) => {
  const key = hex + JSON.stringify(extra);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color: hex, flatShading: true, roughness: 0.8, ...extra }));
  return mats.get(key);
};
const box = (w, h, d, color, x, y, z, extra) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, extra));
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
};

export function createChestModel() {
  const g = new THREE.Group();
  g.name = 'chest';
  const W = 0.95, H = 0.5, D = 0.62;
  const warm = { emissive: '#3a1c08', emissiveIntensity: 0.55 }; // reads in the dark
  const shine = { emissive: '#b07a10', emissiveIntensity: 0.8, roughness: 0.35, metalness: 0.3 };
  g.add(box(W, H, D, C.wood, 0, H / 2, 0, warm));
  g.add(box(W - 0.08, 0.04, D - 0.08, C.inside, 0, H - 0.01, 0));
  for (const x of [-0.3, 0.3]) g.add(box(0.08, H + 0.01, D + 0.02, C.band, x, H / 2, 0));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.1, 0.1, 0.1, C.gold, x * (W / 2 - 0.03), 0.06, z * (D / 2 - 0.03), shine));
  // the lid hinges on its back edge
  const lid = new THREE.Group();
  lid.name = 'lid';
  lid.position.set(0, H, -D / 2);
  // a half-cylinder dome across the chest: flat side down, from the hinge forward
  const dome = (r, w) => new THREE.CylinderGeometry(r, r, w, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
  const top = new THREE.Mesh(dome(D / 2, W), mat(C.wood, warm));
  top.position.z = D / 2;
  top.castShadow = true;
  lid.add(top);
  for (const x of [-0.3, 0.3]) {
    const b = new THREE.Mesh(dome(D / 2 + 0.014, 0.08), mat(C.band));
    b.position.set(x, 0, D / 2);
    lid.add(b);
  }
  lid.add(box(0.14, 0.16, 0.05, C.gold, 0, -0.02, D + 0.015, shine)); // the lock
  g.add(lid);
  g.userData = { lid, W, H, D };
  addOutline(g, { thickness: 0.02, minSize: 0.1 });
  return g;
}

// What a loot item looks like lying on the floor: the item itself, big
// enough to read from the default camera, standing up and turning.
export function lootModel(item) {
  const g = new THREE.Group();
  g.name = `loot-${item}`;
  let m;
  if (item === 'shield') { m = createShield(); m.rotation.x = Math.PI; m.scale.setScalar(2.0); } // lying face up: never edge-on to the camera as it turns
  else if (item === 'herb') { m = createHerb(); m.scale.setScalar(3.4); m.position.y = -0.2; }
  else if (item === 'vine') { m = createVineCoil(); m.scale.setScalar(3.4); }
  else if (item === 'mask') { m = createMaskModel(); m.position.set(0, 0.35, 0); m.scale.setScalar(3.2); } // (W2: the forest's chest)
  else if (item === 'armor') { m = armorModel(); m.scale.setScalar(1.25); } // (W3: the Ice Lake's grotto)
  else if (item === 'gradeUp') { m = gemModel(); } // (W5: a grade-up gem)
  else return null;
  g.add(m);
  // a soft gold ring on the floor under it: "something to take"
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffe17a', transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
  ring.name = 'lootRing';
  ring.renderOrder = 4;
  g.add(ring);
  g.userData.ring = ring;
  return g;
}

const ITEM_GLOW = { shield: '#ffe9a0', herb: '#8dff8a', vine: '#8dff8a', mask: '#ffb46b', armor: '#7cc8ff', gradeUp: '#ffe07a' };

// W5: a grade-up gem: a gold star-cut crystal with a blue heart of light
function gemModel() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: '#ffe07a', emissive: '#c88a14', emissiveIntensity: 1.0, flatShading: true, roughness: 0.2, metalness: 0.3 });
  const blue = new THREE.MeshStandardMaterial({ color: '#9fd8ff', emissive: '#3f9aff', emissiveIntensity: 1.4, flatShading: true, roughness: 0.1 });
  const top = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), gold);
  top.scale.set(1, 1.35, 1);
  top.position.y = 0.35;
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), blue);
  core.position.set(0, 0.35, 0.22);
  g.add(top, core);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const p = new THREE.Mesh(new THREE.TetrahedronGeometry(0.09, 0), gold);
    p.position.set(Math.cos(a) * 0.5, 0.35 + Math.sin(a * 2) * 0.1, Math.sin(a) * 0.5);
    g.add(p);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
const UP_WORDS = { hammer: { rare: '범위 +50 %', legend: '휘두를 때마다 작은 충격파' }, waterGun: { rare: '두 줄기 발사', legend: '물폭탄' } };

// W3: armour lying on the floor: a little blue padded vest with gold trim
// and a blue heart on its chest (procedural: no Polyfork dog armour)
function armorModel() {
  const g = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: '#4f9ae8', emissive: '#1f5aa8', emissiveIntensity: 0.6, flatShading: true, roughness: 0.5 });
  const trim = new THREE.MeshStandardMaterial({ color: '#ffcf4a', emissive: '#a8740c', emissiveIntensity: 0.7, flatShading: true, metalness: 0.4, roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.5, 10, 1, true, -2.2, 4.4), blue);
  body.material.side = THREE.DoubleSide;
  body.position.y = 0.3;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 16, Math.PI * 1.4), trim);
  collar.rotation.set(Math.PI / 2, 0, -Math.PI * 0.2 + Math.PI);
  collar.position.y = 0.55;
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 6, 18, Math.PI * 1.4), trim);
  hem.rotation.set(Math.PI / 2, 0, -Math.PI * 0.2 + Math.PI);
  hem.position.y = 0.06;
  const heart = new THREE.Shape();
  heart.moveTo(0, -0.1); heart.bezierCurveTo(-0.16, 0.0, -0.1, 0.13, 0, 0.06); heart.bezierCurveTo(0.1, 0.13, 0.16, 0.0, 0, -0.1);
  const gem = new THREE.Mesh(new THREE.ExtrudeGeometry(heart, { depth: 0.05, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: '#8fd8ff', emissive: '#3aa0ff', emissiveIntensity: 1.2, flatShading: true }));
  gem.position.set(0, 0.32, 0.38);
  g.add(body, collar, hem, gem);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// An item lying in the cave (from a chest; M4's rooms may place them too).
// Walking over it, or clicking it, takes it.
export function dropLoot(G, item, at, { from = null, grade = 'common', target = null } = {}) {
  const model = lootModel(item);
  const pos = new THREE.Vector3(at.x, G.groundAt?.(at.x, at.z) ?? 0, at.z);
  const glow = G.addLight({ pos: () => model.position, color: ITEM_GLOW[item] ?? '#ffe9a0', intensity: 5, distance: 5 });
  let warned = 0;
  const def = item === 'gradeUp' ? GRADE_UP : ITEMS[item];
  const p = G.addPickup({
    model, pos, float: 0.55, radius: 0.85, name: def.name, kind: 'loot',
    canCollect: () => p.t > FLIGHT && (item !== 'herb' || G.run.herbs < ITEMS.herb.max),
    onBlocked: () => {
      if (p.t <= FLIGHT || G.time - warned < 3) return;
      warned = G.time;
      G.toast('약초 주머니가 가득 찼어요 (3개)');
    },
    onCollect: () => {
      glow.on = false;
      if (item === 'gradeUp') {
        // W5: the next grade of the hammer or the water gun (both legend: shards)
        const up = gradeUp(G.run, target);
        sfx.item();
        if (up) G.toast(`✨ ${ITEMS[up.item].icon} ${ga(ITEMS[up.item].name)} ${gradeName(up.grade)} 등급이 되었어요! (${UP_WORDS[up.item][up.grade]})`, 3600);
        else { G.run.shards += 5; G.toast('✨ 모두 전설이라 수정 조각 5개로 바뀌었어요!', 3000); }
        G.emit('gradeUp', up);
        G.emit('itemGot', { item });
        return;
      }
      grant(G.run, item, 1, { grade });
      sfx.item();
      G.toast((item === 'armor' ? `🦺 ${ITEMS.armor.grades[grade] ?? ''} ` : '') + def.got + (item === 'herb' ? ` (${G.run.herbs}/${ITEMS.herb.max})` : ''), 3200);
      G.discover?.(item);
      G.emit('itemGot', { item });
    },
    onRemove: () => { glow.on = false; },
  });
  p.item = item;
  p.grade = grade;
  p.t = 0;
  // pop out of the chest in an arc
  if (from) {
    const start = from.clone(), end = pos.clone();
    p.flight = { start, end, t: 0 };
    p.pos.copy(start);
    p.step = (dt) => flyLoot(p, dt);
  }
  return p;
}

// One chest in the world. `index`: its number in the cave (its dice).
// W2 `loot`: what it surely holds while the hero has none (the forest's mask
// chest), else its dice as usual.
export function createChest(G, { x, z, heading = 0, index = 0, loot: sure = null, grade = 'common', target = null, secret = false }) {
  const model = createChestModel();
  model.position.set(x, G.groundAt?.(x, z) ?? 0, z);
  model.rotation.y = heading;
  G.scene.add(model);
  G.look.shadows(model);
  const { lid, W, H, D } = model.userData;
  const front = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
  const y0 = model.position.y; // (W1: the ground there, not 0)
  G.physics.addCuboid(x, y0 + H / 2 + 0.05, z, W / 2, H / 2 + 0.05, D / 2, heading);
  const glow = G.addLight({ pos: model.position.clone().setY(y0 + 1.2).addScaledVector(front, 0.6), color: secret ? '#d4a8ff' : '#ffcf6a', intensity: 3, distance: 5 });
  // W5: a secret pocket's chest: purple crystals on its lid
  if (secret) {
    const cm = new THREE.MeshStandardMaterial({ color: '#c99bff', emissive: '#8a3cff', emissiveIntensity: 1.1, flatShading: true, roughness: 0.2 });
    for (const [cx, cs] of [[-0.25, 0.14], [0.05, 0.2], [0.3, 0.12]]) {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(cs, 0), cm);
      c.scale.y = 1.6; c.position.set(cx, H + 0.35, -D / 2 - 0.05);
      model.add(c);
    }
  }
  const sparkles = [];
  const sparkGeo = new THREE.OctahedronGeometry(1, 0);

  const c = {
    model, index, opened: false, t: -1, loot: null,
    get pos() { return model.position; },
  };

  c.open = () => {
    if (c.opened) return false;
    c.opened = true;
    c.t = 0;
    sfx.creak();
    G.emit('chestOpening', { chest: c });
    return true;
  };

  // the loot jumps out to one side of the chest, away from the hero
  function pop() {
    // (W3: an armour chest holds its armour while that is better than what is worn)
    // (W5: a secret chest's grade-up gem while there is something to raise)
    const wanted = sure && (sure === 'armor' ? betterArmor(grade, G.run.armorGrade) : sure === 'gradeUp' ? !!upgradeTarget(G.run, target) : !G.run.owned.includes(sure));
    const loot = wanted ? { item: sure, count: 1, grade, target } : rollLoot(G.run, rng(subSeed(G.run.seed, index)));
    c.loot = loot;
    sfx.item();
    const pp = G.player.position;
    const side = new THREE.Vector3(front.z, 0, -front.x);
    if (side.dot(new THREE.Vector3(pp.x - x, 0, pp.z - z)) > 0) side.negate();
    const land = model.position.clone().addScaledVector(side, 1.7).addScaledVector(front, 0.4);
    // (W6: and if the chest's front is no floor — a small pocket, a chest by
    // its wall — the nearest free walkable cell, never off the floor)
    const spot = G.nav?.lineReach(model.position.clone().addScaledVector(front, 0.9), land) ?? (G.nav?.nearestWalkable && ((c) => c && G.nav.at(c))(G.nav.nearestWalkable(land, 4))) ?? land;
    const from = model.position.clone().setY(y0 + H + 0.2);
    if (loot.item === 'shards') {
      for (let i = 0; i < loot.count; i++) {
        const a = (i / loot.count) * Math.PI * 2;
        dropShard(G, spot.clone().add(new THREE.Vector3(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45)));
      }
      G.toast(`수정 조각 ${loot.count}개가 들어 있었어요!`);
    } else dropLoot(G, loot.item, spot, { from, grade: loot.grade ?? 'common', target: loot.target ?? null });
    // a burst of gold
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: i % 2 ? '#fff3a0' : '#ffcf4a', transparent: true, depthWrite: false, fog: false }));
      s.scale.setScalar(0.05 + Math.random() * 0.05);
      s.position.copy(from);
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2;
      s.userData.v = new THREE.Vector3(Math.cos(a) * sp, 3 + Math.random() * 2.5, Math.sin(a) * sp);
      s.renderOrder = 7;
      G.scene.add(s);
      sparkles.push({ s, t: 0 });
    }
    G.emit('chestOpened', { chest: c, loot });
  }

  G.addInteractable({
    pos: model.position.clone(), radius: 1.9, label: '보물 상자 열기', name: '보물 상자', kind: 'chest', chest: c, obj: model,
    enabled: () => !c.opened,
    action: () => c.open(),
  });

  G.onUpdate((dt) => {
    if (c.t >= 0 && c.t < OPEN + 1) {
      const before = c.t;
      c.t += dt;
      const k = c.t;
      // a little shake, then the lid swings up past upright and settles
      model.position.x = x + (k < 0.2 ? Math.sin(k * 90) * 0.025 : 0);
      const u = Math.min(1, Math.max(0, (k - 0.2) / (OPEN - 0.2)));
      const open = u < 1 ? -2.1 * (1 - (1 - u) ** 3) : -1.95;
      lid.rotation.x = open + (u >= 1 ? 0 : Math.sin(u * Math.PI) * -0.1);
      glow.intensity = k < POP_AT ? 3 + k * 20 : Math.max(1.2, 12 - (k - POP_AT) * 14);
      if (before < POP_AT && c.t >= POP_AT) pop();
    }
    for (const sp of sparkles) {
      sp.t += dt;
      sp.s.userData.v.y -= 9 * dt;
      sp.s.position.addScaledVector(sp.s.userData.v, dt);
      sp.s.rotation.y += dt * 8;
      sp.s.material.opacity = Math.max(0, 1 - sp.t / 1.0);
      if (sp.t > 1) { G.scene.remove(sp.s); sp.s.material.dispose(); sp.done = true; }
    }
    for (let i = sparkles.length - 1; i >= 0; i--) if (sparkles[i].done) sparkles.splice(i, 1);
  });

  c.reset = () => {
    c.opened = false; c.t = -1; c.loot = null;
    lid.rotation.x = 0;
    model.position.x = x;
    glow.intensity = 3;
  };
  return c;
}

// Loot in flight: the arc from the chest to where it lands (game.js runs the
// pickups; this moves the ones still in the air).
export function flyLoot(p, dt) {
  const f = p.flight;
  if (!f) return;
  f.t = Math.min(1, f.t + dt / FLIGHT);
  p.pos.lerpVectors(f.start, f.end, f.t);
  p.pos.y = THREE.MathUtils.lerp(f.start.y, f.end.y, f.t) + Math.sin(f.t * Math.PI) * 1.1 - p.float * (1 - f.t);
  if (f.t >= 1) { p.pos.copy(f.end); p.flight = null; sfx.land(); }
}
