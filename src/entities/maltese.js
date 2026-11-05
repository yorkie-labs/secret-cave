import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addOutline } from './outline.js';

// The Maltese, our hero (GDD §3.1): a chibi white puppy, big round head on a
// small body, fluffy white fur, long floppy ears, black button eyes and nose,
// a pink bow on the top-knot, a little khaki adventurer vest with a side bag,
// and a wooden hammer. Built from low-poly primitives in the flat-shaded
// Polyfork style, with pivots placed so it animates by hand (no skeleton).
//
// The fur is "puffs": a core ball with small balls merged over its surface,
// one mesh per part, so the outline traces the fluffy edge and not every tuft.

export const MALTESE_COLORS = {
  fur: '#fbf8f1', furShade: '#ece4d6', ear: '#f1e6d2',
  eye: '#17110d', nose: '#141010', tongue: '#f08a9a', bow: '#ff7eb3', bowDark: '#e0558f',
  vest: '#c9a96b', vestDark: '#9a7a45', pocket: '#b08f55',
  bag: '#8a5a32', bagFlap: '#6e4526', strap: '#6b4423', buckle: '#e9c45c',
  wood: '#b07a46', woodDark: '#7a5230', band: '#8c8f96',
  gun: '#4fb6ff', gunDark: '#2d7fc4', tank: '#ffd34d',
  shieldWood: '#c4874a', shieldRim: '#dfe3ea', shieldBoss: '#ffd34d', shieldLeaf: '#5fd068',
  leaf: '#5fd068', leafDark: '#3a9a48', stem: '#4c8a3a', vine: '#4fae4a', vineDark: '#2f7a35',
};

// white fur glows a touch, so the hero reads white even in a dark cave; and
// a warm rim of light round its edge (fresnel), so the little dog stands out
// against the floor from the far camera (P review: small at 30 m)
const FUR = new Set([MALTESE_COLORS.fur, MALTESE_COLORS.furShade, MALTESE_COLORS.ear]);
export const FUR_GLOW = 0.42;
const RIM = { color: new THREE.Color('#fff2cf'), strength: 0.85, power: 2.4 };
const mats = new Map();
function mat(hex, extra = {}) {
  const fur = FUR.has(hex) && !extra.emissive;
  if (fur) extra = { emissive: hex, emissiveIntensity: FUR_GLOW, ...extra };
  const key = hex + JSON.stringify(extra);
  if (!mats.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color: hex, flatShading: true, roughness: 0.85, ...extra });
    if (fur) addRim(m);
    mats.set(key, m);
  }
  return mats.get(key);
}
function addRim(m) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: RIM.color.clone().multiplyScalar(RIM.strength) };
    shader.fragmentShader = `uniform vec3 uRim;\n${shader.fragmentShader}`.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += uRim * pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), ${RIM.power.toFixed(2)});`);
  };
  m.customProgramCacheKey = () => 'malteseRim';
}

function mesh(geo, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, extra } = {}) {
  const m = new THREE.Mesh(geo, mat(color, extra));
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const pivot = (name, x = 0, y = 0, z = 0) => {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  return g;
};

// A fluffy ball: a core with `tufts` small balls spread evenly over it
// (a Fibonacci sphere, jittered by a fixed seed so every Maltese is the same).
// `skip(dir)` leaves a patch bare (the face). Scaled after merging, so an ear
// stays fluffy all along its length.
function puff(r, { tufts = 12, tuft = 0.42, out = 0.86, detail = 1, tuftDetail = 1, seed = 1, skip = null, sx = 1, sy = 1, sz = 1 } = {}) {
  const parts = [new THREE.IcosahedronGeometry(r, detail)];
  const golden = Math.PI * (3 - Math.sqrt(5));
  let s = seed * 9301 + 49297;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < tufts; i++) {
    const y = 1 - ((i + 0.5) / tufts) * 2, rad = Math.sqrt(1 - y * y), th = golden * i + seed;
    const dir = new THREE.Vector3(Math.cos(th) * rad, y, Math.sin(th) * rad);
    if (skip?.(dir)) continue;
    const tr = r * tuft * (0.8 + rand() * 0.4);
    const g = new THREE.IcosahedronGeometry(tr, tuftDetail);
    g.rotateX(rand() * 3).rotateY(rand() * 3);
    g.translate(dir.x * r * out, dir.y * r * out, dir.z * r * out);
    parts.push(g);
  }
  const geo = mergeGeometries(parts.map((g) => { g.deleteAttribute('uv'); return g; }));
  geo.scale(sx, sy, sz);
  geo.computeBoundingSphere();
  return geo;
}

export function createHammer() {
  const C = MALTESE_COLORS;
  const g = pivot('hammer');
  g.add(mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.5, 6), C.wood, { y: 0.19 }));
  const head = pivot('hammerHead', 0, 0.46, 0);
  head.add(mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.28, 8), C.wood, { rz: Math.PI / 2 }));
  head.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.035, 8), C.band, { rz: Math.PI / 2, x: 0.095 }));
  head.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.035, 8), C.band, { rz: Math.PI / 2, x: -0.095 }));
  g.add(head);
  return g;
}

// A toy water gun (GDD §6.2): only out while shooting.
export function createWaterGun() {
  const C = MALTESE_COLORS;
  const g = pivot('waterGun');
  g.add(mesh(new THREE.BoxGeometry(0.07, 0.08, 0.2), C.gun, { z: 0.06 }));
  g.add(mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.12, 6), C.gunDark, { rx: Math.PI / 2, z: 0.2 }));
  g.add(mesh(new THREE.BoxGeometry(0.045, 0.1, 0.05), C.gunDark, { y: -0.07, z: 0 }));
  g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), C.tank, { y: 0.07, z: 0.04 }));
  return g;
}

// The shield (GDD §6.3): a round wooden buckler with a bright metal rim and a
// leaf on its gold boss, out only while 3 is held. Its face looks along the
// hand's -Y: straight ahead when the arm is raised forward.
export function createShield() {
  const C = MALTESE_COLORS;
  const g = pivot('shield');
  const glow = { emissive: '#3a2410', emissiveIntensity: 0.6 };
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 14), C.shieldWood, { extra: glow }));
  g.add(mesh(new THREE.TorusGeometry(0.2, 0.026, 5, 18), C.shieldRim, { rx: Math.PI / 2, extra: { emissive: '#8a96aa', emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.4 } }));
  g.add(mesh(new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), C.shieldBoss, { y: -0.02, rx: Math.PI, extra: { emissive: '#a07a10', emissiveIntensity: 0.6, roughness: 0.3 } }));
  for (const a of [0, Math.PI / 2]) g.add(mesh(new THREE.BoxGeometry(0.36, 0.045, 0.02), C.shieldRim, { y: -0.012, ry: a, extra: { emissive: '#8a96aa', emissiveIntensity: 0.35 } }));
  return g;
}

const SHIELD_HELD = 1.5; // × createShield's size while held up
const HERB_HELD = 2.2; // × createHerb's size in the paw

// A herb (GDD §6.3): a little sprig of three leaves, out while eating.
export function createHerb() {
  const C = MALTESE_COLORS;
  const g = pivot('herb');
  g.add(mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.14, 4), C.stem, { y: 0.05 }));
  for (const [a, y, s] of [[-0.8, 0.07, 1], [0.8, 0.09, 1], [0, 0.13, 1.15]]) {
    g.add(mesh(new THREE.IcosahedronGeometry(0.045, 0), a ? C.leaf : C.leafDark, { x: Math.sin(a) * 0.04, y, rz: -a, sx: 0.55 * s, sy: 1.2 * s, sz: 0.25, extra: { emissive: '#1f6a24', emissiveIntensity: 0.5 } }));
  }
  return g;
}

// A coil of vine with a few leaves, in the paw before it is thrown.
export function createVineCoil() {
  const C = MALTESE_COLORS;
  const g = pivot('vineCoil');
  g.add(mesh(new THREE.TorusGeometry(0.07, 0.018, 5, 12), C.vine, { extra: { emissive: '#1f5a22', emissiveIntensity: 0.5 } }));
  g.add(mesh(new THREE.TorusGeometry(0.055, 0.016, 5, 12), C.vineDark, { z: 0.02, rz: 0.6 }));
  for (const a of [0.4, 2.4, 4.4]) g.add(mesh(new THREE.IcosahedronGeometry(0.03, 0), C.leaf, { x: Math.cos(a) * 0.08, y: Math.sin(a) * 0.08, sx: 0.6, sz: 0.3 }));
  return g;
}

export function createMaltese() {
  const C = MALTESE_COLORS;
  const root = pivot('maltese');
  const body = pivot('body'); // everything; rolls and bobs as one
  root.add(body);

  const hips = pivot('hips', 0, 0.27, 0);
  body.add(hips);

  // Legs: short fluffy stumps with round paws.
  const legs = {};
  for (const side of [-1, 1]) {
    const leg = pivot(side < 0 ? 'legL' : 'legR', side * 0.085, 0, 0);
    leg.add(mesh(puff(0.07, { tufts: 8, seed: 3 + side, sy: 1.25 }), C.fur, { y: -0.1 }));
    const foot = pivot('foot', 0, -0.2, 0.025);
    foot.add(mesh(puff(0.062, { tufts: 6, seed: 5 + side, sz: 1.3, sy: 0.8 }), C.furShade, { y: 0.0 }));
    leg.add(foot);
    hips.add(leg);
    legs[side < 0 ? 'L' : 'R'] = leg;
  }

  // Torso: a small fluffy body, a fur skirt under the vest and a fur collar.
  const torso = pivot('torso', 0, 0.02, 0);
  hips.add(torso);
  torso.add(mesh(new THREE.IcosahedronGeometry(0.155, 1), C.fur, { y: 0.15, sy: 1.15 }));
  torso.add(mesh(puff(0.15, { tufts: 14, seed: 7, out: 0.9, sy: 0.45, skip: (d) => d.y > 0.2 }), C.fur, { y: 0.02 }));
  // Vest: an open khaki shell, the white chest showing in front.
  const vestGeo = new THREE.CylinderGeometry(0.158, 0.182, 0.22, 12, 1, true, 0.5, Math.PI * 2 - 1.0);
  torso.add(mesh(vestGeo, C.vest, { y: 0.15, extra: { side: THREE.DoubleSide } }));
  torso.add(mesh(new THREE.TorusGeometry(0.17, 0.014, 4, 14), C.vestDark, { y: 0.045, rx: Math.PI / 2, sx: 1.05 }));
  for (const side of [-1, 1]) {
    torso.add(mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), C.pocket, { x: side * 0.1, y: 0.11, z: 0.135, ry: side * 0.55 }));
    torso.add(mesh(new THREE.BoxGeometry(0.064, 0.018, 0.024), C.vestDark, { x: side * 0.1, y: 0.14, z: 0.137, ry: side * 0.55 }));
  }
  // Side bag (the item pouch) on a strap from the right shoulder to the left hip.
  torso.add(mesh(new THREE.TorusGeometry(0.19, 0.012, 4, 18), C.strap, { y: 0.16, rz: 0.75, sx: 1, sz: 0.95, rx: 0 }));
  const bag = pivot('bag', -0.19, 0.04, 0.03);
  bag.add(mesh(new THREE.BoxGeometry(0.07, 0.1, 0.12), C.bag, {}));
  bag.add(mesh(new THREE.BoxGeometry(0.076, 0.045, 0.126), C.bagFlap, { y: 0.035 }));
  bag.add(mesh(new THREE.BoxGeometry(0.02, 0.025, 0.03), C.buckle, { x: -0.04, y: 0.02 }));
  torso.add(bag);
  // Tail: a white plume curled up over the back.
  const tail = pivot('tail', 0, 0.06, -0.15);
  tail.add(mesh(puff(0.065, { tufts: 9, seed: 11, sy: 1.7 }), C.fur, { y: 0.09, z: -0.04, rx: -0.75 }));
  torso.add(tail);

  // Arms: fluffy white, paws at the end. The right paw holds the hammer, the
  // left one the water gun when it is out.
  const arms = {};
  for (const side of [-1, 1]) {
    const arm = pivot(side < 0 ? 'armL' : 'armR', side * 0.165, 0.24, 0);
    arm.add(mesh(puff(0.055, { tufts: 7, seed: 13 + side, sy: 1.55 }), C.fur, { y: -0.08 }));
    arm.add(mesh(puff(0.05, { tufts: 5, seed: 17 + side }), C.furShade, { y: -0.17 }));
    torso.add(arm);
    arms[side < 0 ? 'L' : 'R'] = arm;
  }
  const hand = pivot('hand', 0, -0.17, 0.02);
  arms.R.add(hand);
  const hammer = createHammer();
  hammer.rotation.set(-0.7, 0, 0.25); // carried on the shoulder
  hand.add(hammer);
  const handL = pivot('handL', 0, -0.17, 0.03);
  arms.L.add(handL);
  const gun = createWaterGun();
  gun.visible = false;
  handL.add(gun);
  // the left paw also holds the shield (raised forward), a herb, a vine coil
  const shield = createShield();
  shield.position.set(0.12, -0.14, 0.02); // in front of the paw, toward the middle
  shield.visible = false;
  handL.add(shield);
  const herb = createHerb();
  herb.rotation.x = Math.PI / 2; // stands up in the paw when the arm points forward
  herb.position.set(0.03, -0.12, 0.02);
  herb.visible = false;
  handL.add(herb);
  const vine = createVineCoil();
  vine.position.set(0, -0.05, 0.02);
  vine.scale.setScalar(1.5);
  vine.visible = false;
  handL.add(vine);

  // Head: big and round, fluffy all over except the face.
  const neck = pivot('neck', 0, 0.3, 0);
  torso.add(neck);
  neck.add(mesh(puff(0.13, { tufts: 12, seed: 19, sy: 0.5 }), C.fur, { y: 0.0 })); // fur collar
  const head = pivot('head', 0, 0.22, 0);
  neck.add(head);
  const face = (d) => d.z > 0.45 && d.y > -0.55 && d.y < 0.6;
  head.add(mesh(puff(0.25, { tufts: 46, tuft: 0.3, out: 0.92, detail: 2, seed: 23, skip: face }), C.fur, { sx: 1.06, sy: 0.95 }));
  // muzzle with a little beard, button nose, a pink tongue
  head.add(mesh(puff(0.095, { tufts: 9, seed: 29, skip: (d) => d.y > 0.2 }), C.fur, { y: -0.085, z: 0.2, sx: 1.3, sy: 0.8 }));
  head.add(mesh(new THREE.IcosahedronGeometry(0.042, 1), C.nose, { y: -0.045, z: 0.3, sx: 1.2, sy: 0.85, extra: { roughness: 0.35 } }));
  head.add(mesh(new THREE.SphereGeometry(0.026, 8, 6), C.tongue, { y: -0.135, z: 0.27, sz: 0.6 }));
  // big round black eyes with a highlight
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = pivot('eye', side * 0.1, 0.035, 0.212);
    eye.add(mesh(new THREE.SphereGeometry(0.056, 12, 10), C.eye, { sz: 0.7, extra: { roughness: 0.25 } }));
    eye.add(mesh(new THREE.SphereGeometry(0.017, 6, 4), '#ffffff', { x: side * -0.014, y: 0.022, z: 0.036, extra: { emissive: '#ffffff', emissiveIntensity: 0.6 } }));
    head.add(eye);
    eyes.push(eye);
  }
  // top-knot with a pink bow, the Maltese trademark
  head.add(mesh(puff(0.075, { tufts: 7, seed: 31, sy: 1.2 }), C.fur, { y: 0.27, z: -0.01 }));
  const bow = pivot('bow', 0, 0.33, 0.0);
  for (const side of [-1, 1]) bow.add(mesh(new THREE.ConeGeometry(0.045, 0.09, 4), C.bow, { x: side * 0.045, rz: side * Math.PI / 2, sx: 1, sz: 0.5 }));
  bow.add(mesh(new THREE.IcosahedronGeometry(0.022, 0), C.bowDark, {}));
  head.add(bow);
  // long, floppy, fluffy ears hanging past the cheeks
  const ears = [];
  for (const side of [-1, 1]) {
    const ear = pivot('ear', side * 0.22, 0.1, 0.0);
    ear.rotation.z = side * 0.12;
    // a drape of three fluffy locks, flattened against the cheek
    const locks = [[0.075, -0.06, 0.02], [0.082, -0.18, 0.04], [0.072, -0.31, 0.055]]
      .map(([lr, ly, lx], i) => puff(lr, { tufts: 10, seed: 37 + side * 5 + i, sy: 1.15 }).translate(side * lx, ly, 0));
    const earGeo = mergeGeometries(locks).scale(1, 1, 0.7);
    earGeo.computeBoundingSphere();
    ear.add(mesh(earGeo, C.ear));
    head.add(ear);
    ears.push(ear);
  }

  root.userData.rig = { body, hips, torso, neck, head, legs, arms, hand, hammer, gun, shield, herb, vine, tail, ears, eyes, bow };
  addOutline(root, { thickness: 0.016, minSize: 0.05 });
  return root;
}

// Procedural animation. `state` carries what the controller knows; `action`
// is a one-shot ({ name, t, duration }) the player triggers. Actions: swing,
// shoot, throw, eat, roll, hurt, faint, pickup, interact, sniff, bark,
// victory. `shield`: the shield is held up (a pose, not an action).
export function createMalteseAnimator(root) {
  const r = root.userData.rig;
  let phase = 0, time = 0, blink = 2, guard = 0;
  const lerp = THREE.MathUtils.lerp;
  const ease = (k) => k * k * (3 - 2 * k);

  return function animate(dt, { speed = 0, grounded = true, vy = 0, action = null, shield = false }) {
    time += dt;
    guard = THREE.MathUtils.clamp(guard + (shield ? dt : -dt) * 10, 0, 1); // the shield comes up in 0.1 s
    const moving = speed > 0.1;
    phase += dt * (moving ? speed * 4.4 : 0);
    const run = Math.min(1, speed / 4.6);
    const swing = moving ? Math.sin(phase) * (0.55 + run * 0.35) : 0;
    const bob = moving ? Math.abs(Math.sin(phase)) : 0;

    // base pose: idle breathing, or a bouncy trot
    r.body.scale.setScalar(1);
    r.body.position.set(0, moving ? bob * 0.045 * (1 + run) : Math.sin(time * 2.2) * 0.006, 0);
    r.body.rotation.set(0, 0, moving ? 0 : Math.sin(time * 0.9) * 0.015);
    r.legs.L.rotation.set(swing, 0, 0);
    r.legs.R.rotation.set(-swing, 0, 0);
    r.arms.L.rotation.set(-swing * 0.8, 0, 0.2);
    r.arms.R.rotation.set(swing * 0.5 - 0.25, 0, -0.2);
    r.torso.rotation.set(run * 0.2, 0, 0);
    r.torso.scale.set(1, 1 + (moving ? 0 : Math.sin(time * 2.2) * 0.012), 1);
    r.neck.rotation.set(-run * 0.14 + Math.sin(time * 1.7) * 0.03, 0, moving ? 0 : Math.sin(time * 0.6) * 0.08);
    r.head.rotation.set(0, 0, 0);
    r.tail.rotation.set(0, 0, Math.sin(time * (moving ? 18 : 8)) * 0.45);
    // ears flop with every step and stream back when running
    for (const [i, ear] of r.ears.entries()) {
      const side = i ? 1 : -1;
      ear.rotation.set(Math.sin(time * 2.4 + i) * 0.05 - run * 0.55 + (moving ? (bob - 0.5) * 0.25 : 0), 0, side * (0.12 + (moving ? bob * 0.12 : 0)));
    }
    r.gun.visible = false;
    r.herb.visible = false;
    r.vine.visible = false;
    r.hammer.visible = true;
    r.hammer.rotation.set(-0.7, 0, 0.25); // resting on the shoulder
    r.herb.scale.setScalar(1);

    // shield up: the left paw holds it out in front of the chest, a low brace
    r.shield.visible = guard > 0.05;
    if (guard > 0) {
      const g = ease(guard);
      // (armL sits at -x: a positive roll brings the paw in toward the chest)
      r.arms.L.rotation.set(lerp(r.arms.L.rotation.x, -1.45, g), 0, lerp(0.2, 0.3, g));
      r.shield.rotation.set(0, 0, -0.3 * g); // square to the front again
      r.arms.R.rotation.set(lerp(r.arms.R.rotation.x, -0.5, g), 0, -0.3);
      r.torso.rotation.x += 0.12 * g;
      r.body.position.y -= 0.03 * g;
      r.neck.rotation.x -= 0.1 * g;
      r.shield.scale.setScalar(SHIELD_HELD * (0.4 + 0.6 * g)); // a big toy shield: it must read from the camera
      for (const ear of r.ears) ear.rotation.x -= 0.25 * g;
    }

    if (!grounded) {
      const up = vy > 0;
      r.legs.L.rotation.x = up ? -0.7 : 0.4;
      r.legs.R.rotation.x = up ? 0.3 : -0.2;
      r.arms.L.rotation.set(-2.4, 0, 0.3);
      r.arms.R.rotation.set(-2.0, 0, -0.3);
    }

    // blink
    blink -= dt;
    let closed = blink < 0.12;
    if (blink < 0) blink = 2 + Math.random() * 3;

    if (action) {
      const k = Math.min(1, action.t / action.duration);
      const arc = Math.sin(k * Math.PI);
      switch (action.name) {
        case 'swing': { // wind up over the head, then bonk forward
          const a = k < 0.35 ? lerp(0, -2.9, k / 0.35) : lerp(-2.9, -0.2, Math.min(1, (k - 0.35) / 0.25));
          r.arms.R.rotation.set(a, 0, -0.1);
          r.arms.L.rotation.set(a * 0.9, 0, 0.1);
          r.hammer.rotation.set(Math.PI, 0, 0);
          r.torso.rotation.x = k < 0.35 ? -0.25 : 0.35;
          for (const ear of r.ears) ear.rotation.x = k < 0.35 ? 0.3 : -0.5;
          break;
        }
        case 'shoot': { // the water gun out in the left paw, a little kick back
          r.gun.visible = true;
          const kick = k < 0.25 ? 0 : Math.max(0, 1 - (k - 0.25) / 0.3);
          r.arms.L.rotation.set(-1.5 + kick * 0.25, 0, -0.05);
          r.arms.R.rotation.set(-0.2, 0, -0.25);
          r.gun.rotation.set(1.5 - kick * 0.25, 0, 0);
          r.torso.rotation.set(-0.06 * kick, 0.25, 0);
          r.neck.rotation.set(0.05, -0.2, 0);
          break;
        }
        case 'throw': { // the vine coil swung back and out to the side, then flung forward
          // (the chibi head hides anything raised over it, so the wind-up is sideways)
          const rel = 0.33; // the coil leaves the paw here (movement.js THROW_RELEASE / duration)
          r.vine.visible = k < rel;
          const back = ease(Math.min(1, k / rel)), fling = ease(Math.min(1, Math.max(0, k - rel) / 0.3));
          r.arms.L.rotation.set(k < rel ? 0.7 * back : lerp(0.7, -1.6, fling), 0, k < rel ? -1.25 * back : lerp(-1.25, 0.2, fling));
          r.arms.R.rotation.set(-0.3, 0, -0.3);
          r.torso.rotation.set(k < rel ? -0.1 * back : 0.2 * arc + 0.05, k < rel ? 0.45 * back : lerp(0.45, -0.3, fling), 0);
          r.neck.rotation.set(0, k < rel ? -0.35 * back : 0.15, 0);
          for (const ear of r.ears) ear.rotation.x = k < rel ? 0.25 : -0.45;
          break;
        }
        case 'eat': { // the herb held up before the chest, head bowed to it, munch munch, gone
          r.herb.visible = k < 0.92;
          r.herb.scale.setScalar(HERB_HELD * Math.max(0.2, 1 - Math.max(0, k - 0.2) * 1.0));
          const up = ease(Math.min(1, k / 0.18));
          r.arms.L.rotation.set(-1.5 * up, 0, 0.45 * up); // the paw out in front, the herb standing up in it
          r.arms.R.rotation.set(-0.5 * up, 0, -0.3);
          const chew = k > 0.18 ? Math.abs(Math.sin(k * Math.PI * 9)) : 0;
          r.torso.rotation.x = 0.12 * up;
          r.neck.rotation.set(0.12 * up + chew * 0.1, 0, 0); // a small nod: a deep bow hides the herb
          r.head.rotation.z = Math.sin(k * Math.PI * 4.5) * 0.06;
          r.tail.rotation.z = Math.sin(time * 22) * 0.6;
          for (const ear of r.ears) ear.rotation.x = 0.1 + chew * 0.15;
          closed = k > 0.25 && k < 0.85 && chew > 0.6; // happy blinks while chewing
          break;
        }
        case 'roll': {
          // tumble around the middle of the curled-up body (not the feet), so
          // the head never dips under the ground mid-roll
          const th = ease(k) * Math.PI * 2, curl = 0.78, c = 0.6 * curl;
          r.body.scale.setScalar(curl);
          r.body.rotation.x = th;
          r.body.position.y = c - c * Math.cos(th) + arc * 0.06;
          r.body.position.z = -c * Math.sin(th);
          r.legs.L.rotation.x = r.legs.R.rotation.x = -1.6;
          r.arms.L.rotation.x = r.arms.R.rotation.x = -1.5;
          r.neck.rotation.x = 0.5;
          for (const ear of r.ears) ear.rotation.x = -0.9;
          closed = true;
          break;
        }
        case 'bark': {
          const s = Math.sin(k * Math.PI * 4);
          r.neck.rotation.x = -0.4 + s * 0.2;
          r.body.position.y += Math.max(0, s) * 0.05;
          for (const ear of r.ears) ear.rotation.x = -0.5;
          break;
        }
        case 'sniff': { // nose to the ground, sweeping side to side
          r.torso.rotation.x = 0.6;
          r.neck.rotation.set(0.55 + Math.sin(time * 22) * 0.04, Math.sin(time * 4) * 0.45, 0);
          r.tail.rotation.z = Math.sin(time * 25) * 0.6;
          for (const ear of r.ears) ear.rotation.x = 0.35;
          break;
        }
        case 'hurt': {
          r.torso.rotation.x = -0.45 * arc;
          r.body.position.z = -0.1 * arc;
          r.arms.L.rotation.set(-1.0 * arc, 0, 0.6);
          r.arms.R.rotation.set(-1.0 * arc, 0, -0.6);
          for (const ear of r.ears) ear.rotation.x = 0.7 * arc;
          closed = k < 0.7;
          break;
        }
        case 'faint': { // topple onto the side and lie there, eyes shut
          const f = ease(Math.min(1, k / 0.4));
          r.body.rotation.z = f * Math.PI / 2;
          r.body.position.set(f * 0.42, f * 0.43 + Math.sin(Math.min(1, k / 0.4) * Math.PI) * 0.08, 0);
          r.legs.L.rotation.x = r.legs.R.rotation.x = -0.4 * f;
          r.arms.L.rotation.set(-0.6 * f, 0, 0.6 * f);
          r.arms.R.rotation.set(-0.6 * f, 0, -0.2);
          r.tail.rotation.z = 0;
          for (const ear of r.ears) ear.rotation.x = 0.4 * f;
          closed = f > 0.5;
          break;
        }
        case 'pickup': { // bend down, scoop with both paws, back up
          r.torso.rotation.x = 0.75 * arc;
          r.neck.rotation.x = 0.3 * arc;
          r.body.position.y -= 0.06 * arc;
          r.legs.L.rotation.x = r.legs.R.rotation.x = -0.35 * arc;
          r.arms.L.rotation.set(-1.1 * arc, 0, 0.05);
          r.arms.R.rotation.set(-1.1 * arc, 0, -0.05);
          break;
        }
        case 'interact': {
          r.arms.R.rotation.x = -1.2 * arc;
          r.arms.L.rotation.x = -1.2 * arc;
          r.torso.rotation.x = 0.3 * arc;
          break;
        }
        case 'victory': { // paws and hammer up, hopping, tail going wild
          r.arms.L.rotation.set(-2.8, 0, 0.4);
          r.arms.R.rotation.set(-2.9, 0, -0.35);
          r.hammer.rotation.set(0.2, 0, 0);
          r.body.position.y += Math.abs(Math.sin(k * Math.PI * 3)) * 0.16;
          r.neck.rotation.x = -0.25;
          r.tail.rotation.z = Math.sin(time * 30) * 0.7;
          for (const ear of r.ears) ear.rotation.x = -0.3 + Math.abs(Math.sin(k * Math.PI * 3)) * 0.5;
          break;
        }
        default: break;
      }
    }
    for (const e of r.eyes) e.scale.y = closed ? 0.15 : 1;
  };
}
