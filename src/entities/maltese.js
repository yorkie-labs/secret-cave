import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { addOutline } from './outline.js';

// The Maltese, our hero (GDD §3.1): a chibi white puppy in a soft puppy
// cut (the user's reference photos, 2026-11-06): a big round fluffy head,
// rounded fluffy ears hanging at the sides, big round glossy black eyes in
// dark rims, a black button nose, a happy open mouth; a compact short-coated
// body, short sturdy legs with fluffy socks, a short plume of a tail. A
// little khaki adventurer vest with a side bag, and a wooden hammer. No bow,
// no lashes: neither boy nor girl. Built from primitives (the props
// flat-shaded in the Polyfork style, the fur smooth and softly noisy, see
// `fluffy`), with pivots so it animates by hand (no skeleton). The ears and
// the tail sway on springs in the animator (secondary motion).

export const MALTESE_COLORS = {
  fur: '#fbf8f1', furShade: '#ece4d6', ear: '#f1e6d2',
  eye: '#0d0908', eyeRim: '#1a1212', nose: '#141010', mouth: '#4a2228', tongue: '#ec8086', nail: '#2a2220',
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
      #ifdef USE_COLOR
      totalEmissiveRadiance *= vColor.rgb;
      #endif
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

// A lock of long hair (the tail's plume): a closed lathe hanging from its
// pivot down to -len, its radius `profile(t)` (t: 0 top, 1 tip), soft
// strand grooves round it (a touch darker), uneven strand tips at the end.
// `shape(v, t)` bends it afterwards. Smooth normals: silky, not clumpy.
function lock(len, profile, { seg = 22, rows = 12, grooves = 9, groove = 0.07, tips = 0.06, shade = 0.32, sx = 1, sz = 1, shape = null } = {}) {
  const pts = [new THREE.Vector2(0, -len * 0.985)];
  for (let i = rows; i >= 0; i--) {
    const t = i / rows;
    pts.push(new THREE.Vector2(Math.max(0.002, profile(t)), -t * len));
  }
  pts.push(new THREE.Vector2(0, 0.0));
  let geo = new THREE.LatheGeometry(pts, seg);
  geo.deleteAttribute('uv'); geo.deleteAttribute('normal');
  geo = mergeVertices(geo);
  const p = geo.attributes.position, v = new THREE.Vector3();
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = THREE.MathUtils.clamp(-v.y / len, 0, 1);
    const th = Math.atan2(v.x, v.z);
    const strand = 0.5 + 0.5 * Math.cos(th * grooves); // 1 mid-strand, 0 in a groove
    const k = 1 - groove * (0.35 + 0.65 * t) * Math.pow(1 - strand, 3);
    // a groove is a little darker (strands, even under the glow)
    const c = 1 - shade * (0.45 + 0.55 * t) * Math.pow(1 - strand, 1.6) - 0.06 * THREE.MathUtils.smoothstep(t, 0.9, 1);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c;
    v.x *= k * sx; v.z *= k * sz;
    v.y -= THREE.MathUtils.smoothstep(t, 0.82, 1) * tips * len * strand; // strand tips

    shape?.(v, t);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}
// Soft fur (the puppy cut, GDD §3.1): a smooth ball nudged in and out by
// a fine fixed noise, so its outline is a little wispy and the light rolls
// softly over it: not separate tufts (that read as a poodle) and not long
// strands. The low spots are a touch darker (vertex colours). `shape(v, n)`
// moves a vertex (n: its direction from the centre); `calm(n)` 0…1 smooths the noise there.
function fluffy(r, { w = 24, h = 16, amp = 0.05, freq = 9, seed = 1, shade = 0.14, shape = null, calm = null } = {}) {
  let geo = new THREE.SphereGeometry(r, w, h);
  geo.deleteAttribute('uv'); geo.deleteAttribute('normal');
  geo = mergeVertices(geo);
  let s = seed * 9301 + 49297;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const waves = Array.from({ length: 7 }, (_, i) => {
    const k = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
    return { k, f: freq * (i < 4 ? 1 : 2.3), a: i < 4 ? 1 : 0.45, ph: rand() * 6.28 };
  });
  const p = geo.attributes.position, v = new THREE.Vector3(), n = new THREE.Vector3(), col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    n.fromBufferAttribute(p, i).normalize();
    let q = 0;
    for (const wv of waves) q += wv.a * Math.sin(n.dot(wv.k) * wv.f + wv.ph);
    q /= 3.4; // (about -1…1)
    if (calm) q *= 1 - calm(n); // (smoother where `calm` says: the face)
    v.copy(n).multiplyScalar(r * (1 + amp * q));
    shape?.(v, n);
    p.setXYZ(i, v.x, v.y, v.z);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 1 - shade * (0.5 - 0.5 * q);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}
const HAIR = { flatShading: false, roughness: 0.6 };
const FUR_SOFT = { ...HAIR, vertexColors: true }; // (fluffy and lock geometry: their low spots shaded)

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

  // Legs: short and sturdy, soft white, fluffy "socks" round the paws with
  // a hint of dark toenails (the paws wear the wellies, cosmetics.js).
  const legs = {};
  for (const side of [-1, 1]) {
    const leg = pivot(side < 0 ? 'legL' : 'legR', side * 0.1, 0, 0);
    leg.add(mesh(fluffy(0.062, { amp: 0.06, seed: 3 + side }), C.fur, { y: -0.09, sy: 1.45, extra: FUR_SOFT }));
    const foot = pivot('foot', 0, -0.2, 0.04);
    foot.add(mesh(fluffy(0.07, { amp: 0.11, freq: 12, seed: 5 + side }), C.fur, { sz: 1.25, sy: 0.78, extra: FUR_SOFT }));
    for (const tx of [-0.025, 0, 0.025]) foot.add(mesh(new THREE.SphereGeometry(0.009, 5, 3), C.nail, { x: tx, y: -0.035, z: 0.083 }));
    leg.add(foot);
    hips.add(leg);
    legs[side < 0 ? 'L' : 'R'] = leg;
  }

  // Torso: compact, short soft fur (the puppy cut), the vest over it.
  const torso = pivot('torso', 0, 0.02, 0);
  hips.add(torso);
  torso.add(mesh(fluffy(0.155, { amp: 0.05, seed: 7 }), C.fur, { y: 0.15, sy: 1.15, extra: FUR_SOFT }));
  torso.add(mesh(fluffy(0.15, { amp: 0.06, seed: 8 }), C.fur, { y: 0.03, sy: 0.75, sx: 1.05, extra: FUR_SOFT })); // the hips
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
  const bag = pivot('bag', -0.2, 0.04, 0.03);
  bag.add(mesh(new THREE.BoxGeometry(0.07, 0.1, 0.12), C.bag, {}));
  bag.add(mesh(new THREE.BoxGeometry(0.076, 0.045, 0.126), C.bagFlap, { y: 0.035 }));
  bag.add(mesh(new THREE.BoxGeometry(0.02, 0.025, 0.03), C.buckle, { x: -0.04, y: 0.02 }));
  torso.add(bag);
  // Tail: a short plume, up and curled over the back.
  const tail = pivot('tail', 0, 0.08, -0.17);
  const plume = lock(0.2, (t) => 0.025 + 0.045 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.62), {
    grooves: 7, groove: 0.1, tips: 0.14, shade: 0.2, sz: 0.8,
    // bend the lock (hanging down -y) round toward -z: after the half turn
    // below it rises from the back and curls forward over it
    shape: (v, t) => { const a = -2.4 * t, R = 0.2 / 2.4, d = R + v.z; v.z = -(R - d * Math.cos(a)); v.y = -d * Math.sin(-a); },
  });
  tail.add(mesh(plume, C.fur, { rx: Math.PI - 0.9, extra: FUR_SOFT }));
  torso.add(tail);

  // Arms: short, soft, fluffy socks round the paws. The right paw holds the
  // hammer, the left one the water gun when it is out.
  const arms = {};
  for (const side of [-1, 1]) {
    const arm = pivot(side < 0 ? 'armL' : 'armR', side * 0.165, 0.24, 0);
    arm.add(mesh(fluffy(0.052, { amp: 0.06, seed: 13 + side }), C.fur, { y: -0.08, sy: 1.55, extra: FUR_SOFT }));
    arm.add(mesh(fluffy(0.054, { amp: 0.11, freq: 12, seed: 17 + side }), C.fur, { y: -0.17, extra: FUR_SOFT }));
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

  // Head: big and round, a soft teddy/puppy cut: the fur a little wispy at
  // the edge, full round cheeks, the face a little recessed so the fur
  // frames it (user's reference photos, 2026-11-06).
  const neck = pivot('neck', 0, 0.3, 0);
  torso.add(neck);
  neck.add(mesh(fluffy(0.14, { amp: 0.07, seed: 19 }), C.fur, { sy: 0.6, extra: FUR_SOFT })); // the ruff under the chin (the scarf's place)
  const head = pivot('head', 0, 0.22, 0);
  neck.add(head);
  const F = new THREE.Vector3(0, -0.1, 1).normalize(), smooth = THREE.MathUtils.smoothstep;
  head.add(mesh(fluffy(0.26, {
    w: 40, h: 28, amp: 0.05, freq: 12, seed: 23,
    calm: (n) => 0.8 * smooth(n.dot(F), 0.6, 0.85), // (short fur on the face: the eyes sit clean in it)
    shape: (v, n) => {
      const face = smooth(n.dot(F), 0.6, 0.88);
      const cheek = smooth(Math.abs(n.x), 0.3, 0.75) * smooth(-n.y, -0.25, 0.35) * smooth(n.z, -0.6, 0.2);
      v.multiplyScalar(1 - 0.07 * face + 0.08 * cheek);
    },
  }), C.fur, { sx: 1.06, sy: 0.95, extra: FUR_SOFT }));
  // a short-furred muzzle, a black button nose, a happy open mouth with its
  // pink tongue, a few whisker wisps
  head.add(mesh(fluffy(0.1, { w: 20, h: 14, amp: 0.05, freq: 14, seed: 29 }), C.fur, { y: -0.085, z: 0.18, sx: 1.22, sy: 0.8, extra: FUR_SOFT }));
  head.add(mesh(new THREE.IcosahedronGeometry(0.044, 1), C.nose, { y: -0.048, z: 0.283, sx: 1.25, sy: 0.85, extra: { roughness: 0.3 } }));
  head.add(mesh(new THREE.SphereGeometry(0.04, 12, 8), C.mouth, { y: -0.128, z: 0.24, sx: 1.7, sy: 0.85, sz: 0.7 }));
  head.add(mesh(new THREE.SphereGeometry(0.028, 10, 8), C.tongue, { y: -0.15, z: 0.25, sx: 1.05, sy: 1.25, sz: 0.55 }));
  for (const side of [-1, 1]) {
    for (const [a, y] of [[0.35, -0.07], [0.7, -0.1]]) {
      head.add(mesh(new THREE.ConeGeometry(0.009, 0.075, 4), C.fur, { x: side * 0.105, y, z: 0.22, rz: side * (-Math.PI / 2 + a), extra: FUR_SOFT }));
    }
  }
  // big round glossy black eyes on the front of the face, a little above
  // its middle (the 40° game camera looks down on them, wild-island
  // lessons), about an eye apart. Each is a decal: thin caps of spheres
  // round the head's middle, so it follows the curve of the face just over
  // the fur, never bulges past the head's outline nor gets cut by it (user
  // feedback 2026-11-06): a thin near-black rim of skin, the glossy eye,
  // a big and a small highlight. No outline (it would read as lashes).
  const eyes = [];
  const EYE = { yaw: 0.395, pitch: 0.2, r: 0.051 }; // (where on the head, and how big)
  const decal = (R, r, color, extra = {}) => {
    const a = Math.asin(r / R);
    const g = new THREE.SphereGeometry(R, 20, 3, 0, Math.PI * 2, 0, a).rotateX(Math.PI / 2).translate(0, 0, -R);
    g.deleteAttribute('uv');
    const m = mesh(g, color, { extra: { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...extra } });
    m.userData.noOutline = true;
    m.castShadow = false;
    return m;
  };
  for (const side of [-1, 1]) {
    const seat = pivot('eyeSeat'); // (at the head's middle, its z turned out through the eye)
    seat.rotation.set(-EYE.pitch, side * EYE.yaw, 0, 'YXZ');
    head.add(seat);
    // the fur's face is ~0.245-0.25 out along it (scaled, recessed a little, calm there)
    const R = 0.256;
    const rim = decal(R, EYE.r + 0.009, C.eyeRim);
    rim.position.z = R;
    seat.add(rim);
    const eye = pivot('eye', 0, 0, R + 0.002); // (the blink squashes it here)
    eye.add(decal(R + 0.002, EYE.r, C.eye, { roughness: 0.15 }));
    const hi = (x, y, r) => { const h = decal(R + 0.004, r, '#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.7 }); h.position.set(x, y, 0.002); return h; };
    eye.add(hi(side * -0.016, 0.017, 0.016), hi(side * 0.017, -0.019, 0.007));
    seat.add(eye);
    eyes.push(eye);
  }
  // Ears: rounded, fluffy, hanging down the sides and melting into the
  // round head (they frame the face). On pivots: they swing.
  const ears = [];
  for (const side of [-1, 1]) {
    const ear = pivot('ear', side * 0.22, 0.11, -0.02);
    ear.add(mesh(fluffy(0.115, { w: 22, h: 16, amp: 0.1, freq: 10, seed: 37 + side,
      shape: (v, n) => v.multiplyScalar(1 + 0.12 * smooth(-n.y, 0.3, 1)) }), // (wispier, fuller at the tips)
    C.ear, { x: side * 0.055, y: -0.12, rz: side * 0.28, sx: 0.66, sy: 1.45, sz: 0.95, extra: FUR_SOFT }));
    head.add(ear);
    ears.push(ear);
  }

  root.userData.rig = { body, hips, torso, neck, head, legs, arms, hand, hammer, gun, shield, herb, vine, tail, ears, eyes };
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
  const lerp = THREE.MathUtils.lerp, clamp = THREE.MathUtils.clamp;
  const ease = (k) => k * k * (3 - 2 * k);
  // hair springs (secondary motion): each follows a signal of the pose late
  // and overshoots a little; the hair bends by how far it lags behind
  const springs = { lean: { x: 0, v: 0 }, head: { x: 0, v: 0 }, bob: { x: 0, v: 0 } };
  const follow = (s, target, dt, k = 70, c = 7) => {
    if (!(dt > 0)) { s.x = target; s.v = 0; return 0; } // (a pose held still: the hair at rest)
    const n = Math.ceil(dt / 0.02), h = dt / n;
    for (let i = 0; i < n; i++) { s.v += (k * (target - s.x) - c * s.v) * h; s.x += s.v * h; }
    return clamp(s.x - target, -0.6, 0.6);
  };

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
    // the long ears hang, sway a little, stream back when running
    for (const [i, ear] of r.ears.entries()) {
      const side = i ? 1 : -1;
      ear.rotation.set(Math.sin(time * 1.6 + i) * 0.03 + run * 0.3, 0, side * (moving ? 0.03 + bob * 0.06 : 0));
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
      for (const ear of r.ears) ear.rotation.x -= 0.1 * g;
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
          for (const ear of r.ears) ear.rotation.x = k < 0.35 ? 0.2 : -0.25;
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
          for (const ear of r.ears) ear.rotation.x = k < rel ? 0.15 : -0.2;
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
          for (const ear of r.ears) ear.rotation.x = 0.05 + chew * 0.08;
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
          for (const ear of r.ears) ear.rotation.x = 0.5; // (tucked back)
          closed = true;
          break;
        }
        case 'bark': {
          const s = Math.sin(k * Math.PI * 4);
          r.neck.rotation.x = -0.4 + s * 0.2;
          r.body.position.y += Math.max(0, s) * 0.05;
          for (const ear of r.ears) ear.rotation.x = -0.15;
          break;
        }
        case 'sniff': { // nose to the ground, sweeping side to side
          r.torso.rotation.x = 0.6;
          r.neck.rotation.set(0.55 + Math.sin(time * 22) * 0.04, Math.sin(time * 4) * 0.45, 0);
          r.tail.rotation.z = Math.sin(time * 25) * 0.6;
          for (const ear of r.ears) ear.rotation.x = 0;
          break;
        }
        case 'hurt': {
          r.torso.rotation.x = -0.45 * arc;
          r.body.position.z = -0.1 * arc;
          r.arms.L.rotation.set(-1.0 * arc, 0, 0.6);
          r.arms.R.rotation.set(-1.0 * arc, 0, -0.6);
          for (const ear of r.ears) ear.rotation.x = 0.35 * arc;
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
          for (const ear of r.ears) ear.rotation.x = 0.2 * f;
          r.ears[0].rotation.z = 0.5 * f; // (the ear underneath lies along the cheek, not through the floor)
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
          for (const ear of r.ears) ear.rotation.x = -0.1 + Math.abs(Math.sin(k * Math.PI * 3)) * 0.3;
          break;
        }
        default: break;
      }
    }
    for (const e of r.eyes) e.scale.y = closed ? 0.15 : 1;

    // the ears and tail after the pose: the ears hang (half undoing the
    // trunk's and the head's tilt), both lag behind every move on springs
    const rolling = action?.name === 'roll';
    const trunk = r.torso.rotation.x, headTilt = r.neck.rotation.x + r.head.rotation.x;
    const lagH = follow(springs.head, trunk + headTilt, dt, 55, 5);
    const lagZ = follow(springs.lean, r.body.rotation.z + r.torso.rotation.y * 0.5 + r.neck.rotation.z, dt, 50, 5);
    const lagY = follow(springs.bob, r.body.position.y, dt, 120, 9);
    const hang = rolling ? 0.3 : 1;
    for (const [i, ear] of r.ears.entries()) {
      const side = i ? 1 : -1;
      ear.rotation.x = clamp(ear.rotation.x - 0.5 * (trunk + headTilt) * hang + lagH * 0.8, -0.5, 0.5);
      ear.rotation.z = clamp(ear.rotation.z + lagZ * 0.5 + side * Math.min(0.12, Math.abs(lagY) * 0.8), -0.6, 0.6);
    }
    r.tail.rotation.x = clamp(-lagY * 2, -0.3, 0.3);
  };
}
