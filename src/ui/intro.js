import * as THREE from 'three';
import { stage } from '../vendor/polyfork/stage.mjs';
import { loadModels, instance, clipsOf, isLoaded, unloadModels } from '../world/models.js';
import { createMaltese, createMalteseAnimator, createHammer, createWaterGun } from '../entities/maltese.js';
import { softGlowTexture } from '../world/glow.js';
import { sfx, setMusic } from '../audio/sound.js';
import { INTRO_LINES, INTRO_SCENES, INTRO_LENGTH, FADE_OUT, sceneAt, lineAt, typedCount, advance, cuesBetween, ramp } from './introTimeline.js';

// The intro cutscene (GDD §2.1; tasks/20261105-intro-cutscene-todo.md): the
// prologue told in the game's own renderer with the procedural Maltese, on a
// small set built only for it: a sunny forest, glowing footprints, a cave
// mouth whose threshold gives way, a shaft, and a dark chamber below where
// eyes shine and the hammer and the water gun wait in a pool of light.
// Letterbox bars, subtitles in Jua with a soft typewriter, 건너뛰기 ▶▶.
//
// Everything on screen is a function of one clock `t` (ui/introTimeline.js
// has the schedule), so a click or Space moves on a line and skipping is
// just the end. The set is its own THREE.Scene: the cave world is not
// touched, and all of it (geometry, textures, lights' shadow maps, the
// intro-only models) is let go when it ends.

const $ = (id) => document.getElementById(id);

// the models the set uses (the animals and some clutter are the game's own)
export const INTRO_MODELS = [
  'introOak', 'introOak2', 'introBirch', 'introMaple', 'introPine', 'introYoungPine', 'introBush', 'stalactites',
  'grass', 'flower', 'fern', 'fernClump', 'toadstool', 'mossBoulder', 'boulder', 'stump', 'log', 'caveMouth',
  'crystalCluster', 'mushrooms', 'wolf', 'rabbit', 'fox', 'deer',
];

const HERO = 1.12; // (player.js HERO_SCALE)
const FLOOR = -30; // the chamber's floor, straight under the hole
const HOLE = 2.25; // m: the hole's radius (the cave mouth's threshold)
const CEIL = -24; // the shaft's foot, the chamber's ceiling
const ROOM = 14; // the chamber's radius
const G_FALL = 5; // a slow cartoon fall (m/s²)
const FALL_AT = 22.5;
const HILL_X = 21; // the hill the cave mouth is dug into (its middle, +x)

// The walk: a gentle curve through the forest to the cave mouth's threshold
// (the hole is at the origin, the cave mouth just beyond it, +x).
const PATH = new THREE.CatmullRomCurve3([[-34, 0, 3], [-25, 0, 1.4], [-17, 0, -0.9], [-9, 0, 0.7], [-3, 0, 0.1], [0, 0, 0]].map((p) => new THREE.Vector3(...p)));
const PATH_LEN = PATH.getLength();

// how far along the path the dog is (m), by time: a speed profile summed up,
// with the scene-3 cut starting it again near the cave
function speedAt(t) {
  if (t < 7) return 1.5;
  if (t < 8) return 1.5 * (1 - ramp(t, 7, 8));
  if (t < 10.4) return 0; // sniffing the first footprint
  if (t < 13.5) return 1.7 * ramp(t, 10.4, 10.9);
  if (t < 16.6) return 2.0 * (1 - ramp(t, 16.1, 16.6));
  if (t < 19.5) return 0; // "멍? 여기는 어디지?"
  if (t < 20.7) return 1.6 * Math.sin(Math.PI * (t - 19.5) / 1.2); // two steps more, onto the threshold
  return 0;
}
const S_TABLE = (() => {
  const dt = 1 / 120, n = Math.ceil(INTRO_LENGTH / dt) + 2, s = new Float32Array(n);
  let acc = 0;
  for (let i = 1; i < n; i++) {
    const t = i * dt;
    if (Math.abs(t - 13.5) < dt / 2) acc = PATH_LEN - 7.9; // (the cut: a few steps before the cave)
    acc += speedAt(t) * dt;
    s[i] = acc;
  }
  return { s, dt };
})();
const along = (t) => {
  const { s, dt } = S_TABLE, i = Math.min(s.length - 2, Math.max(0, Math.floor(t / dt))), k = t / dt - i;
  return Math.min(PATH_LEN - 0.4, s[i] + (s[i + 1] - s[i]) * Math.max(0, Math.min(1, k)));
};
const pathAt = (s, out = new THREE.Vector3()) => PATH.getPointAt(Math.min(1, Math.max(0, s / PATH_LEN)), out);
const tangentAt = (s, out = new THREE.Vector3()) => PATH.getTangentAt(Math.min(1, Math.max(0, s / PATH_LEN)), out);

// the chamber: where the dog lands, where the tools lie
const LAND = new THREE.Vector3(0, FLOOR, 0);
const TOOLS = new THREE.Vector3(1.15, FLOOR, 0.95);
const TOOL_DIR = TOOLS.clone().sub(LAND).normalize();
const PICK_AT = TOOLS.clone().addScaledVector(TOOL_DIR, -0.6);
const FACE_CAM = Math.atan2(-3.6, 2.4); // facing the first chamber shot

const smooth = (a, b, k) => a + (b - a) * k;
function lerpAngle(a, b, k) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; }

// a tiny seeded generator, so the set is the same every time
function seeded(seed) { let a = seed >>> 0; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }
const noise2 = (x, z) => Math.sin(x * 0.071 + 1.3) * Math.cos(z * 0.053 - 0.7) + 0.5 * Math.sin(x * 0.19 - z * 0.23);
// distance from a point to the walk (sampled)
const PATH_PTS = PATH.getSpacedPoints(80);
const pathDist = (x, z) => { let d = 1e9; for (const p of PATH_PTS) d = Math.min(d, Math.hypot(p.x - x, p.z - z)); return d; };

// ------------------------------------------------------------------ the set
function buildSet(renderer, keep) {
  const scene = new THREE.Scene();
  const own = { geometries: new Set(), materials: new Set(), textures: new Set() };
  const track = (o) => { o.traverse((m) => { if (m.geometry) own.geometries.add(m.geometry); for (const mt of [m.material].flat()) if (mt) own.materials.add(mt); }); return o; };
  const tex = (t) => { own.textures.add(t); return t; };
  const look = stage(renderer, scene, { time: 'day', shadowSpan: 48, far: 150 });
  look.hemi.intensity *= 1.05;
  const rnd = seeded(7);

  // -- the ground: a meadow round the hole, finer near it, rising into far
  // hills, with a worn path along the walk (a ring: the hole is its middle)
  const ring = new THREE.RingGeometry(HOLE, 170, 120, 70).rotateX(-Math.PI / 2);
  {
    const pos = ring.attributes.position, col = new Float32Array(pos.count * 3), uv = ring.attributes.uv;
    const grass = new THREE.Color('#79b84e'), grassDark = new THREE.Color('#5e9a3e'), dirt = new THREE.Color('#b99a68'), rock = new THREE.Color('#9b8f7e'), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), z = pos.getZ(i);
      const r0 = Math.hypot(x, z), k = Math.max(0, (r0 - HOLE) / (170 - HOLE)), r = HOLE + (170 - HOLE) * k ** 2.1; // (fine near the hole)
      x *= r / r0; z *= r / r0;
      const far = ramp(r, 55, 120);
      pos.setXYZ(i, x, groundHeight(x, z), z);
      uv.setXY(i, x / 7, z / 7);
      const m = 0.6 * noise2(x, z) + 0.4 * noise2(x * 2.7 + 13, z * 2.3 - 7);
      c.copy(grass).lerp(grassDark, 0.5 + 0.5 * m);
      const pd = pathDist(x, z);
      if (x < 1 && x > -36) c.lerp(dirt, (1 - ramp(pd, 0.5, 1.6)) * 0.75);
      if (r < 6) c.lerp(dirt, (1 - ramp(r, 2.2, 6)) * 0.8); // the bare threshold
      if (x > 2.5 && Math.abs(z) < 9) c.lerp(rock, (1 - ramp(Math.abs(z), 5, 9)) * ramp(x, 2.5, 4.5) * 0.6);
      c.multiplyScalar(1 - 0.12 * far);
      col.set([c.r, c.g, c.b], i * 3);
    }
    ring.setAttribute('color', new THREE.BufferAttribute(col, 3));
    ring.computeVertexNormals();
  }
  const blotch = tex(meadowTexture());
  const ground = new THREE.Mesh(ring, new THREE.MeshStandardMaterial({ vertexColors: true, map: blotch, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(track(ground));

  // -- the hole's lid: wedges of the same ground that drop when it gives way
  const lid = new THREE.Group();
  const lidMat = new THREE.MeshStandardMaterial({ color: lidColor(), map: blotch, roughness: 1 });
  const lidSide = new THREE.MeshStandardMaterial({ color: '#6b5236', roughness: 1, flatShading: true });
  const wedges = [];
  for (let i = 0; i < 7; i++) {
    const a0 = (i / 7) * Math.PI * 2, a1 = ((i + 1) / 7) * Math.PI * 2, sh = new THREE.Shape();
    sh.moveTo(0, 0);
    for (let k = 0; k <= 6; k++) { const a = a0 + (a1 - a0) * (k / 6); sh.lineTo(Math.cos(a) * HOLE, Math.sin(a) * HOLE); }
    sh.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.45, bevelEnabled: false }).rotateX(Math.PI / 2);
    { const uv = g.attributes.uv; for (let n = 0; n < uv.count; n++) uv.setXY(n, uv.getX(n) / 7, uv.getY(n) / 7); } // (the ground's scale)
    const mid = (a0 + a1) / 2, w = new THREE.Mesh(g, [lidMat, lidSide]);
    w.castShadow = w.receiveShadow = true;
    w.userData = { dir: new THREE.Vector3(Math.cos(mid), 0, Math.sin(mid)), spin: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(4), delay: rnd() * 0.25 };
    lid.add(w);
    wedges.push(w);
  }
  scene.add(track(lid));
  // cracks spreading over it (drawn once, revealed from the middle out)
  const crackTex = tex(crackTexture());
  const cracks = new THREE.Mesh(new THREE.PlaneGeometry(HOLE * 3.2, HOLE * 3.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4 }));
  cracks.position.y = 0.03;
  cracks.renderOrder = 2;
  scene.add(track(cracks));

  // -- the shaft and the chamber below (rock seen from inside)
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: THREE.BackSide });
  const shaft = new THREE.Mesh(rockTube(HOLE, 3.2, 0, CEIL, 28, 10, ['#6f5b45', '#2a2420'], 0.25, 3), rockMat);
  const walls = new THREE.Mesh(rockTube(ROOM, ROOM - 0.5, CEIL + 0.5, FLOOR - 0.2, 48, 6, ['#3b3346', '#2a2632'], 1.1, 5), rockMat);
  const ceilG = new THREE.RingGeometry(3.15, ROOM + 0.6, 40, 4).rotateX(Math.PI / 2);
  paint(ceilG, ['#2e2834', '#221e28'], 9, 0.4);
  const ceiling = new THREE.Mesh(ceilG, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide }));
  ceiling.position.y = CEIL;
  const floorG = new THREE.RingGeometry(0.01, ROOM + 0.4, 48, 14).rotateX(-Math.PI / 2);
  { // (a little relief, mossy near the light, dark stone at the rim)
    const p = floorG.attributes.position, c = new Float32Array(p.count * 3), moss = new THREE.Color('#6d6a52'), stone = new THREE.Color('#4a4650'), dark = new THREE.Color('#25222b'), k = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
      p.setY(i, ramp(r, 4.5, 7) * noise2(x * 3, z * 3) * 0.12 + ramp(r, 10, ROOM) * 0.9);
      k.copy(moss).lerp(stone, ramp(r, 2, 5)).lerp(dark, ramp(r, 6, ROOM)).multiplyScalar(1 + 0.08 * noise2(x * 5, z * 5));
      c.set([k.r, k.g, k.b], i * 3);
    }
    floorG.setAttribute('color', new THREE.BufferAttribute(c, 3));
    floorG.computeVertexNormals();
  }
  const floor = new THREE.Mesh(floorG, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  floor.position.y = FLOOR;
  floor.receiveShadow = true;
  const below = new THREE.Group();
  below.add(shaft, walls, ceiling, floor);
  scene.add(track(below));

  // the light from the hole: a soft beam, a warm pool, motes drifting in it
  const beamTex = tex(beamTexture());
  // (from the shaft's foot down to the floor)
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, color: '#ffe9b8', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Group();
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.PlaneGeometry(5.6, CEIL - FLOOR + 1), beamMat); b.rotation.y = (i / 4) * Math.PI; beam.add(b); }
  beam.position.set(0.3, (CEIL + FLOOR) / 2 + 0.5, 0.25);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: softGlowTexture(), color: '#ffdf9a', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  pool.position.set(0.4, FLOOR + 0.03, 0.3);
  const spot = new THREE.SpotLight('#ffe7bd', 0, 22, 0.42, 0.75, 0.6);
  spot.position.set(0, CEIL - 0.3, 0);
  spot.target.position.set(0.4, FLOOR, 0.4);
  const fill = new THREE.PointLight('#8f7dff', 0, 16, 1.2); // the crystals' faint purple
  fill.position.set(5, FLOOR + 2.5, -5);
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(HOLE * 3.4, HOLE * 3.4).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: softGlowTexture(), color: '#fff6d8', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sun.position.y = 0.6;
  const carry = new THREE.PointLight('#ffe4b0', 0, 6, 1.5); // (lights the falling dog from the hole's side)
  scene.add(track(beam), track(pool), track(sun), spot, spot.target, fill, carry);

  // -- the Maltese (the hammer and the water gun stay on the floor until found)
  const dog = createMaltese();
  dog.scale.setScalar(HERO);
  look.shadows(dog);
  scene.add(dog);
  dog.traverse((m) => { if (m.geometry) own.geometries.add(m.geometry); }); // (its materials are the hero's: kept)
  const animate = createMalteseAnimator(dog);
  look.follow(dog);
  const rig = dog.userData.rig;

  const floorTools = new THREE.Group();
  const hammer = createHammer(), gun = createWaterGun();
  hammer.scale.setScalar(1.25); gun.scale.setScalar(1.25);
  hammer.rotation.set(Math.PI / 2, 0, 0.9); hammer.position.set(-0.12, 0.06, 0.05);
  gun.rotation.set(0, 0.6, Math.PI / 2); gun.position.set(0.22, 0.08, -0.12);
  floorTools.add(hammer, gun);
  floorTools.position.copy(TOOLS);
  look.shadows(floorTools);
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#fff3c0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glint.scale.setScalar(1.1);
  glint.position.set(0, 0.25, 0);
  floorTools.add(glint);
  scene.add(track(floorTools));

  // -- clutter helpers: a Polyfork model placed, or many as instances
  const placed = [];
  function put(key, x, z, { s = 1, ry = rnd() * Math.PI * 2, y = 0, parent = scene } = {}) {
    const o = instance(key);
    o.scale.setScalar(s);
    o.rotation.y = ry;
    o.position.set(x, y, z);
    look.shadows(o);
    parent.add(o);
    placed.push({ key, o });
    return o;
  }
  function many(key, spots) { // spots: [x, y, z, s, ry]
    const src = instance(key);
    src.updateMatrixWorld(true);
    const group = new THREE.Group();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    src.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      const im = new THREE.InstancedMesh(g, mesh.material, spots.length);
      spots.forEach(([x, y, z, s, ry], i) => im.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(0, ry, 0)), new THREE.Vector3(s, s, s))));
      im.castShadow = false; im.receiveShadow = true;
      own.geometries.add(g);
      group.add(im);
    });
    scene.add(group);
    placed.push({ key, o: group, inst: true });
    return group;
  }

  // -- the forest: big trees off the path, bushes, ferns, flowers, grass
  const TREES = ['introOak', 'introOak', 'introOak2', 'introBirch', 'introBirch', 'introPine', 'introYoungPine', 'introMaple'];
  const onHill = (x, z) => ((x - HILL_X) / 16) ** 2 + (z / 20) ** 2 < 1;
  const free = (x, z, d) => pathDist(x, z) > d && !(x > -4 && Math.abs(z) < 10 && x < 26) && !onHill(x, z) && Math.hypot(x, z) > 5;
  for (let i = 0, n = 0; i < 900 && n < 74; i++) {
    const x = -62 + rnd() * 70, z = -40 + rnd() * 80;
    if (!free(x, z, 3.6 + rnd() * 2)) continue;
    if (placed.some((p) => p.tree && Math.hypot(p.o.position.x - x, p.o.position.z - z) < 3.4)) continue;
    const key = TREES[Math.floor(rnd() * TREES.length)];
    put(key, x, z, { s: 0.85 + rnd() * 0.45 });
    placed.at(-1).tree = true;
    n++;
  }
  // a ring of tall pines far out, so the forest never ends at the fog
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + rnd() * 0.1, r = 58 + rnd() * 18;
    const x = Math.cos(a) * r - 14, z = Math.sin(a) * r;
    put(rnd() < 0.6 ? 'introPine' : 'introOak', x, z, { s: 1.2 + rnd() * 0.5, y: groundHeight(x, z) - 0.2 });
  }
  const scatter = (key, count, { near = 1.4, s = [0.8, 1.3], area = [-48, 6, -26, 26], test = null } = {}) => {
    const spots = [];
    for (let i = 0; i < count * 6 && spots.length < count; i++) {
      const x = area[0] + rnd() * (area[1] - area[0]), z = area[2] + rnd() * (area[3] - area[2]);
      if (pathDist(x, z) < near || Math.hypot(x, z) < 4 || onHill(x, z) || (test && !test(x, z))) continue;
      spots.push([x, 0, z, s[0] + rnd() * (s[1] - s[0]), rnd() * Math.PI * 2]);
    }
    return many(key, spots);
  };
  scatter('introBush', 46, { near: 2.2, s: [1.1, 1.9] });
  scatter('grass', 420, { near: 0.9, s: [1.6, 2.6] });
  scatter('flower', 160, { near: 1.0, s: [1.6, 2.4] });
  scatter('fern', 50, { near: 2, s: [1.2, 1.8] });
  scatter('toadstool', 14, { near: 1.6, s: [1.4, 2.2] });
  // a few things to look at along the way
  put('stump', -21, 3.2, { s: 1.3 });
  put('log', -12.5, -3.4, { s: 1.4, ry: 0.4 });
  put('mossBoulder', -6, 3.6, { s: 1.2 });
  put('fernClump', -15, 2.6, { s: 1.4 });

  // -- the cave mouth in a rocky hill, its dark arch right behind the hole
  const hill = new THREE.Mesh(hillGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  hill.position.set(HILL_X, -0.6, 0);
  hill.castShadow = hill.receiveShadow = true;
  scene.add(track(hill));
  const mouth = put('caveMouth', 5.6, 0.35, { s: 3, ry: -Math.PI / 2 });
  for (const [x, z, s, k] of [[5.5, -8.6, 1.9, 'boulder'], [6.2, 8.4, 1.7, 'boulder'], [3.8, -6.6, 1.3, 'mossBoulder'], [4.2, 6.4, 1.2, 'mossBoulder'], [9, -12, 2.4, 'boulder'], [9, 12.5, 2.2, 'boulder']]) put(k, x, z, { s });
  for (const [x, z, s, k] of [[16, -6, 1.1, 'introPine'], [18, 6, 1.2, 'introOak'], [22, -1, 1.25, 'introPine'], [15, 11, 1, 'introBirch'], [24, 8, 1.2, 'introOak2'], [21, -10, 1.1, 'introOak'], [13.5, -12, 1, 'introYoungPine']]) put(k, x, z, { s, y: hillHeight(x - HILL_X, z) - 1 });

  // -- the glowing footprints: big round paws leading to the cave
  const printTex = tex(pawTexture());
  const printGeo = new THREE.PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2);
  const haloGeo = new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2);
  const haloMat = new THREE.MeshBasicMaterial({ map: softGlowTexture(), color: '#7f9cff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  own.materials.add(haloMat); own.geometries.add(haloGeo);
  const prints = [];
  const P = new THREE.Vector3(), T = new THREE.Vector3();
  for (let s = 11.6, i = 0; s < PATH_LEN - 1.6; s += 0.78, i++) {
    pathAt(s, P); tangentAt(s, T);
    const side = i % 2 ? 1 : -1;
    const mat = new THREE.MeshBasicMaterial({ map: printTex, color: '#b4c6ff', transparent: true, opacity: 0, depthWrite: false, fog: false });
    const m = new THREE.Mesh(printGeo, mat);
    m.position.set(P.x - T.z * side * 0.2, 0.025, P.z + T.x * side * 0.2);
    m.rotation.y = Math.atan2(T.x, T.z);
    m.renderOrder = 3;
    m.userData.s = s;
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.copy(m.position).setY(0.02);
    halo.renderOrder = 2;
    scene.add(m, halo);
    own.materials.add(mat);
    prints.push(m);
  }
  own.geometries.add(printGeo);

  // -- sunny details: shafts of light through the trees, pollen, butterflies
  const rayTex = tex(rayTexture());
  const rays = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const ray = new THREE.Mesh(new THREE.PlaneGeometry(2.6 + rnd() * 2, 16), new THREE.MeshBasicMaterial({ map: rayTex, color: '#fff2c4', transparent: true, opacity: 0.16 + rnd() * 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    const s = 3 + i * 4.5 + rnd() * 2;
    pathAt(s, P);
    ray.position.set(P.x + (rnd() - 0.5) * 8, 6.5, P.z + (rnd() < 0.5 ? -1 : 1) * (3 + rnd() * 4));
    ray.rotation.set(0, Math.PI / 2 + (rnd() - 0.5) * 0.6, 0.38);
    rays.add(ray);
  }
  scene.add(track(rays));
  const pollen = motes(140, (r) => new THREE.Vector3(-36 + r() * 40, 0.3 + r() * 4, -6 + r() * 12), '#fff0a8', 0.09);
  const dust = motes(160, (r) => { const a = r() * Math.PI * 2, d = r() * 4.2; return new THREE.Vector3(Math.cos(a) * d, r() * 2.2, Math.sin(a) * d); }, '#a88a64', 0.55, false);
  const beamMotes = motes(90, (r) => { const a = r() * Math.PI * 2, d = r() * 2.6; return new THREE.Vector3(Math.cos(a) * d, FLOOR + r() * 6, Math.sin(a) * d); }, '#fff2c6', 0.07);
  const sparks = motes(80, (r) => { const p = pathAt(11.6 + r() * (PATH_LEN - 13.4)); return new THREE.Vector3(p.x + (r() - 0.5) * 0.8, 0.1 + r() * 0.5, p.z + (r() - 0.5) * 0.8); }, '#d7e3ff', 0.07);
  scene.add(track(pollen), track(dust), track(beamMotes), track(sparks));
  const flies = [];
  const wingTex = tex(wingTexture());
  for (const [i, color] of ['#ffd34d', '#ff9fd2', '#9fd8ff', '#ffffff'].entries()) {
    const b = new THREE.Group();
    const wm = new THREE.MeshBasicMaterial({ map: wingTex, color, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.13).translate(side * 0.08, 0, 0), wm);
      w.userData.side = side;
      b.add(w);
    }
    b.userData = { i, at: -30 + i * 7, z: (i % 2 ? 1.6 : -1.8) };
    flies.push(b);
    scene.add(track(b));
  }

  // -- the dark below: rocks, stalactites, faint crystals, and the watchers
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rnd() * 0.3, r = 9 + rnd() * 3.5;
    put(i % 3 ? 'boulder' : 'mossBoulder', Math.cos(a) * r, Math.sin(a) * r, { s: 0.9 + rnd() * 0.9, y: FLOOR + ramp(r, 10, ROOM) * 0.9 - 0.15 });
  }
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2, r = 4 + rnd() * 9;
    const o = put('stalactites', Math.cos(a) * r, Math.sin(a) * r, { s: 1.1 + rnd() * 1.0 });
    const box = new THREE.Box3().setFromObject(o);
    o.position.y += CEIL + 0.15 - box.max.y; // (hanging from the ceiling by its top)
  }
  const crystals = [];
  for (const [a, r, s] of [[0.4, 11.5, 1.6], [2.4, 12, 1.3], [3.9, 11, 1.8], [5.3, 12.2, 1.4], [1.3, 12.6, 1.1]]) crystals.push(put('crystalCluster', Math.cos(a) * r, Math.sin(a) * r, { s, y: FLOOR + 0.3 }));
  put('mushrooms', -3.4, -2.8, { s: 1.6, y: FLOOR });
  put('fern', 4.8, -4.6, { s: 1.4, y: FLOOR });

  const watchers = [];
  const shadowMat = new THREE.MeshStandardMaterial({ color: '#1b2036', roughness: 1, emissive: '#06070d' });
  own.materials.add(shadowMat);
  const eyeTex = softGlowTexture();
  // [kind, angle (rad, about the landing spot), radius, when the eyes open]
  const WATCH = [
    ['wolf', 2.35, 8.4, 30.5], ['rabbit', 1.75, 7.6, 31.0], ['fox', 2.85, 8.0, 31.5], ['deer', 1.3, 9.8, 32.0],
    ['rabbit', 3.25, 8.8, 32.4], ['eyes', 2.05, 10.6, 31.2], ['eyes', 2.6, 11.0, 32.7], ['eyes', 1.55, 10.4, 33.0],
    ['eyes', 3.0, 10.8, 31.8], ['eyes', 2.2, 12.2, 32.3],
  ];
  const SCALE = { wolf: 1.25, rabbit: 2.4, fox: 1.7, deer: 1.05 };
  // where the eyes sit from the head bone: forward, up, apart (per kind, by look)
  const EYE = { wolf: [0.2, 0.06, 0.08, 0.4], rabbit: [0.13, 0.04, 0.065, 0.34], fox: [0.17, 0.05, 0.065, 0.36], deer: [0.17, 0.05, 0.085, 0.4], eyes: [0, 0, 0.11, 0.42] };
  WATCH.forEach(([kind, a, r, at], i) => {
    const pos = new THREE.Vector3(Math.sin(a) * r, FLOOR, Math.cos(a) * r);
    const w = { kind, at, pos, head: null, mixer: null, blink: 1.3 + i * 0.7 };
    if (kind !== 'eyes') {
      const body = instance(kind);
      body.scale.setScalar(SCALE[kind]);
      body.position.copy(pos);
      body.rotation.y = Math.atan2(LAND.x - pos.x, LAND.z - pos.z);
      body.traverse((o) => { if (o.isMesh) { o.material = shadowMat; o.castShadow = false; } });
      scene.add(body);
      placed.push({ key: kind, o: body });
      w.body = body;
      w.head = body.getObjectByName('Head');
      const clip = clipsOf(kind).Idle;
      if (clip) { w.mixer = new THREE.AnimationMixer(body); const act = w.mixer.clipAction(clip); act.time = i * 0.37; act.play(); }
    } else pos.y = FLOOR + 0.6 + (i % 3) * 0.25;
    w.eyes = [-1, 1].map((side) => {
      const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: eyeTex, color: '#ffe066', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      const size = EYE[kind][3];
      e.scale.set(size, size, 1);
      e.userData.side = side;
      own.materials.add(e.material);
      scene.add(e);
      return e;
    });
    watchers.push(w);
  });

  return {
    scene, look, own, keep, placed, sun, carry, dog, animate, rig, lid, wedges, cracks, beam, pool, spot, fill, floorTools, glint,
    prints, haloMat, sparks, rays, pollen, dust, beamMotes, flies, watchers, EYE, crystals, mouth,
  };
}

// a rock tube seen from inside (the shaft, the chamber's wall): rough, flat-shaded
function rockTube(r0, r1, y0, y1, seg, rows, colors, rough, seed) {
  const g = new THREE.CylinderGeometry(r0, r1, y0 - y1, seg, rows, true);
  g.translate(0, (y0 + y1) / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z);
    const top = Math.abs(y - y0) < 0.01; // (the rim at the hole stays round: it meets the ground)
    const k = top ? 1 : 1 + (noise2(a * 9 + seed, y * 0.9) * 0.08 + Math.sin(a * 23 + y * 1.7 + seed) * 0.03) * rough * 2;
    p.setXYZ(i, Math.cos(a) * r * k, y, Math.sin(a) * r * k);
  }
  paint(g, colors, seed, 0.5);
  g.computeVertexNormals();
  return g;
}
function paint(g, [a, b], seed, mix) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3), A = new THREE.Color(a), B = new THREE.Color(b), k = new THREE.Color();
  const ys = Array.from({ length: p.count }, (_, i) => p.getY(i)), top = Math.max(...ys), bot = Math.min(...ys);
  for (let i = 0; i < p.count; i++) {
    const h = top === bot ? 0.5 : (p.getY(i) - bot) / (top - bot);
    k.copy(B).lerp(A, h).multiplyScalar(1 + mix * 0.3 * noise2(p.getX(i) * 2 + seed, p.getZ(i) * 2 + p.getY(i)));
    c.set([k.r, k.g, k.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
}
// the ground's own colour at the threshold (ring colouring, r ≈ 1 m on the path)
function lidColor() {
  const c = new THREE.Color('#79b84e').lerp(new THREE.Color('#5e9a3e'), 0.5);
  c.lerp(new THREE.Color('#b99a68'), 0.75).lerp(new THREE.Color('#b99a68'), 0.8);
  return c;
}
// the hill the cave is dug into: a lumpy dome, grass on top, rock on the steep sides
function hillHeight(x, z) { const d = Math.hypot(x / 15, z / 19); return 10.5 * Math.sqrt(Math.max(0, 1 - d * d)) - 0.4; }
// the meadow's height: flat near the walk, rising into hills far out
function groundHeight(x, z) { const far = ramp(Math.hypot(x, z), 55, 120); return far * (7 + 6 * noise2(x * 0.6 + 40, z * 0.6 - 25)); }
function hillGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 4);
  const p = g.attributes.position, c = new Float32Array(p.count * 3), grass = new THREE.Color('#6fae48'), rock = new THREE.Color('#8f8676'), k = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    y = Math.max(-0.1, y);
    const n = 1 + noise2(x * 5, z * 5 + y * 3) * 0.06;
    p.setXYZ(i, x * 15 * n, y * 10.5 * n, z * 19 * n);
  }
  g.computeVertexNormals();
  const nrm = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    k.copy(rock).lerp(grass, ramp(nrm.getY(i), 0.55, 0.8)).multiplyScalar(0.92 + 0.1 * noise2(p.getX(i), p.getZ(i)));
    c.set([k.r, k.g, k.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

// soft round points that drift (pollen, dust, motes in the beam); their
// motion is a function of time, set in update
function motes(n, at, color, size, glow = true) {
  const r = seeded(n * 31 + size * 1000), base = [], pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = at(r); base.push(v, r() * 100); pos.set([v.x, v.y, v.z], i * 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: softGlowTexture(), color, size, transparent: true, opacity: 0, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, fog: false }));
  pts.userData.base = base;
  pts.frustumCulled = false;
  return pts;
}

// ---- canvas textures (drawn once; disposed with the set)
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function meadowTexture() {
  const t = canvasTex(256, 256, (c) => {
    c.fillStyle = '#ececec'; c.fillRect(0, 0, 256, 256);
    const r = seeded(11);
    for (let n = 0; n < 900; n++) { // little blades and speckles
      const x = r() * 256, y = r() * 256, light = r() < 0.5;
      c.strokeStyle = light ? `rgba(255,255,230,${0.12 + r() * 0.12})` : `rgba(60,90,40,${0.1 + r() * 0.12})`;
      c.lineWidth = 1 + r();
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 5); c.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function crackTexture() {
  return canvasTex(512, 512, (c, w) => {
    const r = seeded(5);
    c.lineCap = 'round'; c.lineJoin = 'round';
    const branch = (x, y, a, len, width) => {
      if (len < 8 || width < 0.8) return;
      c.strokeStyle = 'rgba(46,30,18,0.95)'; c.lineWidth = width;
      c.beginPath(); c.moveTo(x, y);
      let px = x, py = y;
      for (let s = 0; s < len; s += 10) { a += (r() - 0.5) * 0.6; px += Math.cos(a) * 10; py += Math.sin(a) * 10; c.lineTo(px, py); }
      c.stroke();
      if (r() < 0.8) branch(px, py, a + (r() - 0.5) * 1.6, len * 0.6, width * 0.65);
      if (r() < 0.5) branch(x + (px - x) * 0.5, y + (py - y) * 0.5, a + (r() < 0.5 ? 1 : -1) * (0.7 + r()), len * 0.45, width * 0.55);
    };
    for (let i = 0; i < 9; i++) branch(w / 2, w / 2, (i / 9) * Math.PI * 2 + r() * 0.4, 150 + r() * 70, 7);
    c.fillStyle = 'rgba(46,30,18,0.9)'; c.beginPath(); c.arc(w / 2, w / 2, 9, 0, Math.PI * 2); c.fill();
  });
}
function pawTexture() {
  return canvasTex(128, 128, (c) => {
    c.fillStyle = '#fff';
    c.shadowColor = '#fff'; c.shadowBlur = 10;
    c.beginPath(); c.ellipse(64, 78, 25, 21, 0, 0, Math.PI * 2); c.fill();
    for (const [x, y, rx, ry] of [[33, 46, 10, 13], [52, 32, 10, 13], [76, 32, 10, 13], [95, 46, 10, 13]]) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); }
  });
}
function beamTexture() {
  return canvasTex(64, 128, (c) => {
    for (let x = 0; x < 64; x++) {
      const e = Math.exp(-(((x - 31.5) / 15) ** 2)); // soft at the sides
      const g = c.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, `rgba(255,255,255,${0.95 * e})`); g.addColorStop(0.65, `rgba(255,255,255,${0.4 * e})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(x, 0, 1, 128);
    }
  });
}
function rayTexture() {
  return canvasTex(64, 256, (c) => {
    const g = c.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 256);
    const v = c.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.15, 'rgba(0,0,0,0)'); v.addColorStop(0.75, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)');
    c.globalCompositeOperation = 'destination-out'; c.fillStyle = v; c.fillRect(0, 0, 64, 256);
  });
}
function wingTexture() {
  return canvasTex(64, 64, (c) => {
    c.fillStyle = '#fff';
    c.beginPath(); c.ellipse(32, 24, 26, 20, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(30, 48, 16, 13, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.arc(32, 24, 7, 0, Math.PI * 2); c.fill();
  });
}

// --------------------------------------------------------------- the player
// Plays the cutscene; resolves when it is over (the end or 건너뛰기). The
// main loop hands its frames to `view` while it plays (main.js).
export function playIntroCutscene(G, story) {
  const el = $('intro'), line = $('intro-line'), black = $('intro-black'), skipBtn = $('intro-skip');
  const renderer = G.renderer;
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 400);
  let set = null, t = -1e-3, prevT = -1e-3, ended = false, finishing = 0, lastLine = -2, stepTimer = 0;
  const seen = { scenes: [], lines: [] };
  let resolve;
  const done = new Promise((r) => { resolve = r; });

  // the letterbox: a wide picture in landscape, a tall one on an upright phone
  let barPx = -1;
  const layout = () => {
    const W = innerWidth, H = innerHeight;
    const aspect = W > H ? 2.1 : 0.82;
    const bar = Math.round(Math.max(H * 0.085, 42, (H - W / aspect) / 2)); // (≥ 42 px: room for 건너뛰기 on a phone lying down)
    if (bar !== barPx) { barPx = bar; el.style.setProperty('--bar', `${bar}px`); }
    return { W, H, bar };
  };
  const frameCamera = () => {
    const { W, H, bar } = layout();
    const picH = H - bar * 2, a = W / picH;
    // keep about 64° across in landscape; upright, at least 50° across (more of the sky and the floor)
    const hf = THREE.MathUtils.degToRad(a >= 1 ? 64 : 52);
    let vf = 2 * Math.atan(Math.tan(hf / 2) / a);
    vf = Math.min(vf, THREE.MathUtils.degToRad(78));
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(vf / 2) * H / picH));
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  };

  const controller = {
    get t() { return t; },
    get scene() { return INTRO_SCENES[sceneAt(Math.max(0, t))].id; },
    get sceneIndex() { return sceneAt(Math.max(0, t)); },
    get line() { return lineAt(t); },
    get text() { return line.textContent; },
    get ready() { return !!set; },
    get playing() { return !ended; },
    seen,
    hold: false, // (checks: freeze the clock for a screenshot)
    next() { if (set && !finishing) { t = Math.min(INTRO_LENGTH, advance(t)); sfx.click(); } },
    skip() { if (!finishing) finish(0.35); },
    seek(to) { if (set && !finishing) t = Math.max(0, Math.min(INTRO_LENGTH - 0.01, to)); }, // (checks, screenshots)
    info() { return G.renderer.info.memory; },
    where() { return set && { cam: camera.position.toArray().map((v) => +v.toFixed(2)), dog: set.dog.position.toArray().map((v) => +v.toFixed(2)), heading: +set.dog.rotation.y.toFixed(2), action: set.action, hand: set.rig.hand.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)), handL: set.rig.gun.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)), hammer: set.rig.hammer.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)), head: set.rig.head.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)) }; },
    done,
  };

  function finish(fade) {
    if (finishing) return;
    finishing = performance.now() + fade * 1000;
    black.style.transition = `opacity ${fade}s`;
    black.style.opacity = '1';
  }

  // input: Esc skips; Space, Enter, → or a click/tap moves on a line
  const onKey = (e) => {
    if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); controller.skip(); }
    else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) controller.next(); }
    else e.stopImmediatePropagation(); // (no game keys underneath: 1–4, Tab, Q…)
  };
  const onClick = (e) => { if (e.target === skipBtn) return; controller.next(); };
  skipBtn.onclick = (e) => { e.stopPropagation(); sfx.click(); controller.skip(); };
  addEventListener('keydown', onKey, true);
  el.addEventListener('click', onClick);
  G.input.muffled = true; // (Esc must not also open or close the menu underneath)
  document.body.classList.add('intro-on');
  el.classList.remove('hidden');
  el.classList.add('loading');
  black.style.transition = 'none';
  black.style.opacity = '1';
  line.textContent = '';
  layout();
  story.playing = true;
  G.intro = controller;

  // the set needs a handful of Polyfork models: fetched now (they were
  // asked for at boot, so usually already here)
  const fresh = INTRO_MODELS.filter((k) => !isLoaded(k));
  loadModels(INTRO_MODELS).then(() => {
    if (ended) return;
    set = buildSet(renderer, fresh);
    el.classList.remove('loading');
    renderer.compile(set.scene, camera);
  }).catch((err) => { console.warn('intro: models did not load, straight to the game', err); finish(0.2); });

  // one frame of the cutscene (called by the main loop instead of the game's)
  story.view = (dt) => {
    if (finishing && performance.now() >= finishing) { end(); return; }
    frameCamera();
    if (!set) { renderer.setClearColor('#000'); renderer.clear(); return; }
    if (!finishing && !controller.hold) t = Math.min(INTRO_LENGTH, t + dt);
    if (t >= INTRO_LENGTH && !finishing) finish(0.05);
    // sounds and music
    for (const c of cuesBetween(prevT, t)) {
      if (c.cue.startsWith('music:')) setMusic(c.cue.slice(6) || null);
      else sfx[c.cue]?.();
    }
    const dtScene = Math.max(0, Math.min(0.1, t - prevT)) || dt;
    prevT = t;
    const sc = sceneAt(t);
    if (seen.scenes.at(-1) !== INTRO_SCENES[sc].id) { seen.scenes.push(INTRO_SCENES[sc].id); G.emit?.('introScene', INTRO_SCENES[sc].id); }
    subtitles();
    if (!finishing) black.style.opacity = String(fadeAt(t));
    pose(set, t, dtScene, camera);
    // footsteps while walking on the surface
    stepTimer -= dtScene;
    if (speedAt(t) > 0.6 && t < FALL_AT && stepTimer <= 0) { stepTimer = 0.32; sfx.step(); }
    set.look.update();
    // (K1: the game's post chain in its `plain` mode, render/post.js: the
    // same multisampled render, no AO, bloom, grade or vignette. With them
    // the sunny forest was a touch richer, but the dark room's spotlight
    // bloomed into a wide haze and the lifted blacks hid the watching
    // animals' silhouettes)
    if (G.post) G.post.render(dtScene, set.scene, camera, true);
    else renderer.render(set.scene, camera);
  };

  function subtitles() {
    const i = lineAt(t);
    if (i !== lastLine) {
      lastLine = i;
      line.className = i < 0 ? 'gone' : `${INTRO_LINES[i].say ? 'say' : 'tell'}${INTRO_LINES[i].big ? ' big' : ''}`;
      if (i >= 0 && !seen.lines.includes(i)) seen.lines.push(i);
      line.dataset.line = String(i);
    }
    if (i < 0) return;
    const l = INTRO_LINES[i], chars = [...l.text], n = typedCount(l, t);
    // typed part, then the rest kept invisible (the line never jumps about)
    if (line.dataset.n !== String(n) || line.dataset.at !== String(i)) {
      line.dataset.n = String(n); line.dataset.at = String(i);
      line.innerHTML = `<span>${esc(chars.slice(0, n).join(''))}</span><i>${esc(chars.slice(n).join(''))}</i>`;
    }
  }

  function end() {
    if (ended) return;
    ended = true;
    removeEventListener('keydown', onKey, true);
    el.removeEventListener('click', onClick);
    skipBtn.onclick = null;
    G.input.muffled = false;
    story.view = null;
    setMusic(null);
    if (set) dispose(set, renderer);
    set = null;
    G.intro = { ...controller, playing: false, seen, t, done };
    document.body.classList.remove('intro-on');
    story.playing = false;
    resolve();
    // the black lifts over whatever comes next (the cave, the menu)
    line.className = 'gone';
    el.classList.add('leaving');
    black.style.transition = 'opacity 0.7s';
    requestAnimationFrame(() => requestAnimationFrame(() => { black.style.opacity = '0'; }));
    setTimeout(() => { el.classList.add('hidden'); el.classList.remove('leaving'); }, 750);
  }
  return done;
}

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// black over the picture: in from black, the fall's blackout, out at the end
function fadeAt(t) {
  const start = 1 - ramp(t, 0, 0.9);
  const fall = ramp(t, 25.4, 26.0) * (1 - ramp(t, 26.6, 27.6));
  const last = ramp(t, INTRO_LENGTH - FADE_OUT, INTRO_LENGTH - 0.1);
  return Math.max(start, fall, last);
}

// --------------------------------------------------------------- the poses
const Q = new THREE.Quaternion(), HIGH = new THREE.Vector3(), LOOK = new THREE.Vector3();
const D = new THREE.Vector3(), F = new THREE.Vector3(), cam = new THREE.Vector3(), tgt = new THREE.Vector3(), q = new THREE.Vector3();
function pose(S, t, dt, camera) {
  const { dog, rig } = S;
  // ---- where the dog is, which way it faces, what it does
  let heading, action = null, speed = 0, grounded = true, vy = 0, tools = false, extra = null;
  if (t < FALL_AT) {
    const s = along(t);
    pathAt(s, D); tangentAt(s, F);
    heading = Math.atan2(F.x, F.z);
    speed = speedAt(t);
    if (t >= 8.05 && t < 10.35) action = { name: 'sniff', t: t - 8.05, duration: 2.3 };
    if (t >= 16.75 && t < 19.4) extra = 'wonder';
    if (t >= 17.0 && t < 17.6) action = { name: 'bark', t: t - 17.0, duration: 0.6 };
    if (t >= 20.6) { extra = 'quake'; heading += Math.sin((t - 20.6) * 5) * 0.5 * ramp(t, 20.6, 21); }
    if (t >= 21.7 && t < 22.2) action = { name: 'hurt', t: t - 21.7, duration: 0.5 };
    // the lid drops: the dog with it
    const ft = t - (FALL_AT - 0.05);
    if (ft > 0) { D.y -= 0.5 * G_FALL * ft * ft; grounded = false; vy = -1; }
  } else {
    const ft = t - (FALL_AT - 0.05);
    pathAt(along(FALL_AT - 0.1), D);
    D.multiplyScalar(1 - ramp(t, FALL_AT, FALL_AT + 1.2)).setY(Math.max(FLOOR, -0.5 * G_FALL * ft * ft));
    heading = FACE_CAM;
    grounded = D.y <= FLOOR + 0.01;
    vy = grounded ? 0 : -1;
    if (t >= 26.5 && t < 27.5) action = { name: 'faint', t: 1.2 * (1 - ramp(t, 26.9, 27.5)), duration: 1.2 }; // up again
    if (t >= 27.6 && t < 28.2) action = { name: 'bark', t: t - 27.6, duration: 0.6 };
    if (t >= 28.6 && t < 29.2) action = { name: 'bark', t: t - 28.6, duration: 0.6 };
    if (t >= 29.3 && t < 34.3) { heading = FACE_CAM + Math.sin((t - 29.3) * 1.25) * 0.9 * ramp(t, 29.3, 30) * (1 - ramp(t, 33.6, 34.3)); extra = 'worry'; }
    // the tools: walk to them, pick them up, turn, cheer
    if (t >= 34.3) {
      const k = ramp(t, 34.6, 35.6);
      D.lerpVectors(LAND, PICK_AT, k).setY(FLOOR);
      const toTools = Math.atan2(TOOL_DIR.x, TOOL_DIR.z);
      heading = lerpAngle(FACE_CAM, toTools, ramp(t, 34.3, 34.7));
      speed = k > 0 && k < 1 ? 1.8 : 0;
      if (t >= 35.65 && t < 36.55) action = { name: 'pickup', t: t - 35.65, duration: 0.9 };
      tools = t >= 36.1;
      if (t >= 36.9) heading = lerpAngle(toTools, HERO_FACE, ramp(t, 36.9, 37.5));
      if (t >= 37.7 && t < 40.7) { action = { name: 'victory', t: t - 37.7, duration: 3 }; extra = 'cheer'; }
      if (t >= 40.8 && t < 41.4) action = { name: 'bark', t: t - 40.8, duration: 0.6 };
    }
  }
  dog.position.copy(D);
  dog.rotation.set(0, heading, 0);
  if (!grounded && t > FALL_AT) dog.rotation.x = Math.sin((t - FALL_AT) * 2.2) * 0.5; // tumbling a little
  S.animate(dt, { speed, grounded, vy, action });
  S.action = action?.name ?? null;
  // after the animator: what it does not know (no hammer yet, a puzzled tilt)
  rig.hammer.visible = tools;
  if (tools) { rig.gun.visible = true; rig.gun.rotation.set(0.6, 0, 0); }
  if (extra === 'wonder') { const k = ramp(t, 16.75, 17.2) * (1 - ramp(t, 19.0, 19.4)); rig.neck.rotation.x -= 0.45 * k; rig.neck.rotation.z += 0.32 * k; rig.head.rotation.z += 0.12 * Math.sin(t * 3) * k; }
  if (extra === 'quake') { for (const ear of rig.ears) ear.rotation.x = 0.5; rig.body.position.y += Math.abs(Math.sin(t * 31)) * 0.02; }
  if (extra === 'cheer') {
    // (the game's victory raises the paws behind the big head: from the
    // front they vanish. Here the hammer comes up in front, standing tall,
    // the water gun pointing ahead)
    const k = ramp(t, 37.7, 38.05) * (1 - ramp(t, 40.4, 40.7));
    rig.arms.R.rotation.set(smooth(rig.arms.R.rotation.x, -1.1, k), 0, smooth(rig.arms.R.rotation.z, 1.0, k));
    rig.arms.L.rotation.set(smooth(rig.arms.L.rotation.x, -1.3, k), 0, smooth(rig.arms.L.rotation.z, -0.55, k));
    rig.hammer.quaternion.slerp(Q.copy(rig.arms.R.quaternion).invert(), k); // (standing straight up from the paw)
    rig.gun.rotation.set(smooth(0.6, 0.8, k), 0, 0);
  }
  if (extra === 'worry') { for (const ear of rig.ears) ear.rotation.x += 0.35; rig.tail.rotation.z *= 0.3; }

  // ---- the set over time
  const quake = ramp(t, 20.0, 20.4) * (1 - ramp(t, 22.6, 23.4));
  const surfaceLight = 1 - ramp(t, 25.2, 25.9);
  S.look.key.intensity = 2.85 * surfaceLight;
  S.look.rim.intensity = 0.85 * surfaceLight;
  S.look.hemi.intensity = 0.92 * 1.05 * surfaceLight + 0.28 * (1 - surfaceLight);
  if (surfaceLight < 1) { S.look.hemi.color.set('#6e7cb8'); S.look.hemi.groundColor.set('#120f1a'); } else { S.look.hemi.color.set('#ffffff'); S.look.hemi.groundColor.set('#a89f92'); }
  const under = t >= 26.5;
  S.spot.intensity = under ? 26 * ramp(t, 26.6, 28) : 0;
  S.fill.intensity = under ? 6 * ramp(t, 28, 31) : 0;
  S.beam.visible = S.pool.visible = under;
  const falling = t > FALL_AT && t < 26.2;
  S.sun.material.opacity = falling ? 0.9 : 0;
  S.carry.intensity = falling ? 5 : 0;
  if (falling) S.carry.position.set(D.x + 0.6, D.y + 1.6, D.z + 0.4);
  S.beam.children[0].material.opacity = 0.2 * ramp(t, 26.8, 28.4);
  S.pool.material.opacity = 0.5 * ramp(t, 26.8, 28);
  S.floorTools.visible = !(t >= 36.1);
  S.glint.material.opacity = (0.35 + 0.35 * Math.sin(t * 4)) * ramp(t, 33.6, 34.4);
  S.glint.scale.setScalar(0.8 + 0.3 * Math.sin(t * 4));
  // the footprints wake up, a soft wave running toward the cave
  const wake = ramp(t, 7.2, 8.4) * (1 - ramp(t, 23, 23.5));
  for (const m of S.prints) m.material.opacity = wake * (0.6 + 0.4 * Math.max(0, Math.sin(t * 2.6 - m.userData.s * 0.55)));
  S.haloMat.opacity = wake * (0.55 + 0.15 * Math.sin(t * 2.6));
  driftMotes(S.sparks, t, 0.5, 0.9 * wake);
  // cracks spread from the middle; the lid falls apart at FALL_AT
  const crack = ramp(t, 20.3, 22.3);
  S.cracks.material.opacity = Math.min(1, crack * 2.2) * (t < FALL_AT - 0.05 ? 1 : 0);
  S.cracks.scale.setScalar(0.15 + 0.85 * crack);
  for (const wdg of S.wedges) {
    const ft = Math.max(0, t - (FALL_AT - 0.05) - wdg.userData.delay * 0.3);
    wdg.position.set(wdg.userData.dir.x * ft * 0.8, -0.5 * 9 * ft * ft, wdg.userData.dir.z * ft * 0.8);
    wdg.rotation.set(wdg.userData.spin.x * ft, wdg.userData.spin.y * ft, wdg.userData.spin.z * ft);
    wdg.visible = ft < 2.5;
    if (t < FALL_AT - 0.05 && quake > 0) wdg.position.y = Math.sin(t * 40 + wdg.userData.delay * 30) * 0.015 * quake;
  }
  // drifting points
  driftMotes(S.pollen, t, 0.25, 0.6 * (1 - ramp(t, 19, 20)) * ramp(t, 0.2, 1.5));
  driftMotes(S.dust, t, 1.0, 0.8 * ramp(t, 20.2, 20.8) * (1 - ramp(t, 23, 24)), true);
  driftMotes(S.beamMotes, t, 0.15, 0.7 * ramp(t, 27, 28.5));
  for (const r of S.rays.children) r.visible = t < 23;
  S.rays.children.forEach((r, i) => { r.material.opacity = (0.14 + 0.05 * Math.sin(t * 0.7 + i)) * (1 - ramp(t, 19, 20.5)); });
  for (const b of S.flies) {
    const u = b.userData, x = u.at + Math.sin(t * 0.5 + u.i) * 2 + t * 0.9;
    b.position.set(x, 1.1 + Math.sin(t * 1.7 + u.i) * 0.4, u.z + Math.cos(t * 0.8 + u.i * 2) * 1.2);
    b.rotation.y = Math.sin(t * 0.6 + u.i) * 1.2;
    for (const wg of b.children) wg.rotation.y = wg.userData.side * (0.3 + Math.abs(Math.sin(t * 14 + u.i)) * 1.0);
    b.visible = t < 19.5;
  }
  // the crystals breathe; the watchers open their eyes one by one and blink
  for (const w of S.watchers) {
    w.mixer?.update(dt);
    let open = ramp(t, w.at, w.at + 0.5);
    const bt = ((t + w.blink) % 3.4);
    if (bt < 0.12) open *= 0.1;
    if (w.head) {
      w.head.getWorldPosition(q);
      w.body.getWorldDirection(tgt); // (the way it faces)
    } else { q.copy(w.pos); tgt.set(LAND.x - w.pos.x, 0, LAND.z - w.pos.z).normalize(); }
    const [fw, up, apart] = S.EYE[w.kind];
    for (const e of w.eyes) {
      e.position.set(q.x + tgt.x * fw + tgt.z * apart * e.userData.side, q.y + up, q.z + tgt.z * fw - tgt.x * apart * e.userData.side);
      e.material.opacity = open * 0.95;
      e.scale.y = e.scale.x * (bt < 0.12 ? 0.25 : 1);
    }
    if (w.body) w.body.visible = t > 26;
  }

  // ---- the camera
  shot(t, D, heading, cam, tgt);
  if (quake > 0) {
    const a = quake * 0.12;
    cam.x += Math.sin(t * 37) * a; cam.y += Math.sin(t * 43 + 1) * a * 0.7; cam.z += Math.sin(t * 29 + 2) * a;
    tgt.y += Math.sin(t * 31) * a * 0.5;
  }
  camera.position.copy(cam);
  camera.lookAt(tgt);
  if (quake > 0) camera.rotateZ(Math.sin(t * 23) * 0.012 * quake);
}

// the last shot looks at the dog from here (and the dog turns to it)
const HERO_CAM = new THREE.Vector3(-0.85, 0, 0.5).normalize();
const HERO_FACE = Math.atan2(HERO_CAM.x, HERO_CAM.z);

// where the camera is and what it looks at, at time t (dog at D, facing h)
function shot(t, D, h, cam, tgt) {
  if (t < 7) {
    // a crane down from the treetops to a side view walking along
    const k = ramp(t, 0.6, 4.6);
    const s = along(t);
    pathAt(s + 1.5, tgt).setY(0.7);
    tangentAt(s, F);
    const side = new THREE.Vector3(-F.z, 0, F.x);
    cam.set(D.x + F.x * 3.2 + side.x * 4.4, 1.35, D.z + F.z * 3.2 + side.z * 4.4);
    tgt.set(D.x + F.x * 0.6, 0.7, D.z + F.z * 0.6);
    const high = HIGH.set(D.x - 5, 9.5, D.z + 9);
    cam.lerpVectors(high, cam, k);
    LOOK.set(D.x + 14, 6.5, D.z - 4);
    tgt.lerpVectors(LOOK, tgt, k);
  } else if (t < 13.5) {
    if (t < 10.4) {
      // low by the footprints, the dog sniffing at the first one
      pathAt(14.2, cam); tangentAt(14.2, F);
      cam.set(cam.x - F.z * 1.5 + F.x * 0.4, 1.05, cam.z + F.x * 1.5 + F.z * 0.4);
      tgt.set(D.x + F.x * 0.9, 0.2, D.z + F.z * 0.9);
      cam.x += (t - 7) * 0.08;
    } else {
      // behind it, following the glowing trail
      tangentAt(along(t), F);
      cam.set(D.x - F.x * 3.4 - F.z * 1.3, 1.35, D.z - F.z * 3.4 + F.x * 1.3);
      pathAt(along(t) + 4, tgt).setY(0.3);
    }
  } else if (t < 19.5) {
    if (t < 16.7) {
      // the cave mouth, huge, from low behind the dog: pushing in
      const k = ramp(t, 13.5, 16.7);
      cam.set(smooth(-15.5, -11, k), smooth(1.25, 1.4, k), smooth(3.6, 2.6, k));
      tgt.set(5, smooth(4.1, 3.6, k), 0);
    } else {
      // three-quarter on its face, the cave above: "멍? 여기는 어디지?"
      cam.set(D.x + 2.0, 0.5, D.z + 1.9);
      tgt.set(D.x + 0.1, 0.8, D.z - 0.15);
    }
  } else if (t < 23.2) {
    // the shaking threshold, then looking down after it into the hole
    const k = ramp(t, 22.4, 23.1);
    cam.set(smooth(-5.6, -2.4, k), smooth(3.4, 6.2, k), smooth(4.6, 2.2, k));
    tgt.set(smooth(0.6, 0, k), smooth(0.6, Math.max(-5, D.y), k), 0);
  } else if (t < 26.5) {
    // under the dog, looking up: it tumbles down toward us, the sunlight shrinks
    cam.set(0.7, Math.max(FLOOR + 1, D.y - 4.2), 0.5);
    tgt.set(0, D.y + 2, 0);
  } else if (t < 34.1) {
    if (t < 30.0) {
      // in the pool of light
      const a = (t - 26.5) * 0.05;
      cam.set(LAND.x - 3.6 * Math.cos(a) - 0.3, FLOOR + 1.5, LAND.z + 2.4 + Math.sin(a) * 0.8);
      tgt.set(LAND.x + 0.2, FLOOR + 0.55, LAND.z);
    } else {
      // pulling back: the dark all round, and the eyes in it
      const k = ramp(t, 30.0, 33.6);
      cam.set(smooth(-3.9, -7.6, k), FLOOR + smooth(1.5, 3.4, k), smooth(2.7, 6.4, k));
      tgt.set(smooth(0.2, 2.6, k), FLOOR + smooth(0.55, 0.9, k), smooth(0, -2.4, k));
    }
  } else if (t < 37.4) {
    // low by the tools: the dog comes and picks them up
    const side = new THREE.Vector3(-TOOL_DIR.z, 0, TOOL_DIR.x);
    cam.copy(TOOLS).addScaledVector(TOOL_DIR, 2.1).addScaledVector(side, -1.2).setY(FLOOR + 0.95);
    tgt.copy(PICK_AT).addScaledVector(TOOL_DIR, 0.25).setY(FLOOR + 0.4);
  } else {
    // the hero shot, low, pushing in: "좋아! 반드시 여기서 나갈 거야!"
    const k = ramp(t, 37.4, 41.5);
    cam.copy(D).addScaledVector(HERO_CAM, smooth(3.4, 2.5, k)).setY(FLOOR + 0.42);
    tgt.copy(D).setY(FLOOR + smooth(0.75, 0.82, k));
  }
}

function driftMotes(pts, t, speed, opacity, rise = false) {
  pts.visible = opacity > 0.01;
  if (!pts.visible) return;
  pts.material.opacity = opacity;
  const b = pts.userData.base, p = pts.geometry.attributes.position;
  for (let i = 0; i < b.length / 2; i++) {
    const v = b[i * 2], ph = b[i * 2 + 1];
    if (rise) {
      const age = ((t * 0.9 + ph) % 2.2);
      p.setXYZ(i, v.x * (1 + age * 0.5), age * 1.4 + v.y * 0.2, v.z * (1 + age * 0.5));
    } else p.setXYZ(i, v.x + Math.sin(t * speed + ph) * 0.6, v.y + Math.sin(t * speed * 1.3 + ph * 2) * 0.4, v.z + Math.cos(t * speed + ph) * 0.6);
  }
  p.needsUpdate = true;
}

// Let go of everything the set made: geometries, its own materials and
// textures, the lights' shadow maps, the intro-only models' sources.
function dispose(S, renderer) {
  const { scene, own } = S;
  scene.traverse((o) => {
    if (o.geometry) own.geometries.add(o.geometry);
    if (o.skeleton) o.skeleton.dispose();
    if (o.isLight) o.dispose?.();
    if (o.isInstancedMesh) o.dispose();
  });
  // the intro-only models' own materials (the game's shared ones stay)
  for (const p of S.placed) if (S.keep.includes(p.key)) p.o.traverse((m) => { for (const mt of [m.material].flat()) if (mt) own.materials.add(mt); });
  for (const g of own.geometries) g.dispose();
  const glow = softGlowTexture();
  for (const m of own.materials) {
    for (const k of ['map', 'alphaMap', 'emissiveMap']) if (m[k] && m[k] !== glow) own.textures.add(m[k]);
    m.dispose();
  }
  for (const tx of own.textures) if (tx !== glow) tx.dispose();
  scene.clear();
  unloadModels(S.keep);
  renderer.renderLists.dispose();
}
