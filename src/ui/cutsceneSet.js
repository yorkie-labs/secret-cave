import * as THREE from 'three';
import { stage } from '../vendor/polyfork/stage.mjs';
import { instance, unloadModels } from '../world/models.js';
import { softGlowTexture } from '../world/glow.js';
import { ramp } from './timeline.js';

// The set both cutscenes stand on (the intro, GDD §2.1: the dog walks
// through it to the cave mouth and falls; the ending, GDD §2.3: it comes
// back out of that same cave mouth): a sunny meadow round a small hole,
// a worn path through a forest of Polyfork trees, a rocky hill with the
// big cave mouth dug into it. Each cutscene is its own THREE.Scene (the
// cave world is not touched) built with a kit (`createKit`) that keeps
// every geometry, material and texture it makes, so `disposeSet` lets all
// of it go (with the cutscene-only models' sources) when it ends.

export const HILL_X = 21; // the hill the cave mouth is dug into (its middle, +x)
export const HOLE = 2.25; // m: the hole's radius at the cave mouth's threshold (the intro's fall)

// The walk: a gentle curve through the forest to the cave mouth's threshold
// (the hole is at the origin, the cave mouth just beyond it, +x).
export const PATH = new THREE.CatmullRomCurve3([[-34, 0, 3], [-25, 0, 1.4], [-17, 0, -0.9], [-9, 0, 0.7], [-3, 0, 0.1], [0, 0, 0]].map((p) => new THREE.Vector3(...p)));
export const PATH_LEN = PATH.getLength();
export const pathAt = (s, out = new THREE.Vector3()) => PATH.getPointAt(Math.min(1, Math.max(0, s / PATH_LEN)), out);
export const tangentAt = (s, out = new THREE.Vector3()) => PATH.getTangentAt(Math.min(1, Math.max(0, s / PATH_LEN)), out);
// distance from a point to the walk (sampled)
const PATH_PTS = PATH.getSpacedPoints(80);
export const pathDist = (x, z) => { let d = 1e9; for (const p of PATH_PTS) d = Math.min(d, Math.hypot(p.x - x, p.z - z)); return d; };

export const smooth = (a, b, k) => a + (b - a) * k;
export function lerpAngle(a, b, k) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; }

// a tiny seeded generator, so the set is the same every time
export function seeded(seed) { let a = seed >>> 0; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }
export const noise2 = (x, z) => Math.sin(x * 0.071 + 1.3) * Math.cos(z * 0.053 - 0.7) + 0.5 * Math.sin(x * 0.19 - z * 0.23);
// The forest's own draws: the intro's generator (seed 7) where it stands when
// the intro plants its trees (after its threshold's 7 wedges × 4 draws), so
// the ending, which has no wedges, grows the very same forest.
export function forestRnd() { const r = seeded(7); for (let i = 0; i < 28; i++) r(); return r; }

// The kit: a scene with the day rig (render/quality.js's shadow map size),
// what it made (to let go of), and two ways to place Polyfork models.
export function createKit(renderer, keep, { time = 'day', azimuth = 38, shadowMap = 2048, seed = 7 } = {}) {
  const scene = new THREE.Scene();
  const own = { geometries: new Set(), materials: new Set(), textures: new Set() };
  const track = (o) => { o.traverse((m) => { if (m.geometry) own.geometries.add(m.geometry); for (const mt of [m.material].flat()) if (mt) own.materials.add(mt); }); return o; };
  const tex = (t) => { own.textures.add(t); return t; };
  const look = stage(renderer, scene, { time, shadowSpan: 48, far: 150, shadowMap, azimuth });
  look.hemi.intensity *= 1.05;
  const kit = { scene, own, track, tex, look, keep, placed: [], rnd: seeded(seed) };
  // a Polyfork model placed
  kit.put = (key, x, z, { s = 1, ry = kit.rnd() * Math.PI * 2, y = 0, parent = scene } = {}) => {
    const o = instance(key);
    o.scale.setScalar(s);
    o.rotation.y = ry;
    o.position.set(x, y, z);
    look.shadows(o);
    parent.add(o);
    kit.placed.push({ key, o });
    return o;
  };
  // many of one, as instances. spots: [x, y, z, s, ry]
  kit.many = (key, spots) => {
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
    kit.placed.push({ key, o: group, inst: true });
    return group;
  };
  return kit;
}

// The ground: a meadow round the hole, finer near it, rising into far
// hills, with a worn path along the walk (a ring: the hole is its middle).
export function buildGround(kit) {
  const ring = new THREE.RingGeometry(HOLE, 170, 120, 70).rotateX(-Math.PI / 2);
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
  const blotch = kit.tex(meadowTexture());
  const ground = new THREE.Mesh(ring, new THREE.MeshStandardMaterial({ vertexColors: true, map: blotch, roughness: 1 }));
  ground.receiveShadow = true;
  kit.scene.add(kit.track(ground));
  return { ground, blotch };
}

// The forest round the walk, the hill and its cave mouth, shafts of light,
// pollen, butterflies. Draws from `kit.rnd` (see forestRnd).
export function buildForest(kit) {
  const { scene, put, many, rnd, placed, track, tex } = kit;
  // -- big trees off the path, bushes, ferns, flowers, grass
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

  // -- sunny details: shafts of light through the trees, pollen, butterflies
  const rayTex = tex(rayTexture());
  const rays = new THREE.Group();
  const P = new THREE.Vector3();
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
  scene.add(track(pollen));
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
  return { hill, mouth, rays, pollen, flies };
}

// the butterflies: drifting along the walk, wings beating (a function of t)
export function poseFlies(flies, t, shown, { from = 0, speed = 0.9 } = {}) {
  for (const b of flies) {
    const u = b.userData, x = u.at + Math.sin(t * 0.5 + u.i) * 2 + (t - from) * speed;
    b.position.set(x, 1.1 + Math.sin(t * 1.7 + u.i) * 0.4, u.z + Math.cos(t * 0.8 + u.i * 2) * 1.2);
    b.rotation.y = Math.sin(t * 0.6 + u.i) * 1.2;
    for (const wg of b.children) wg.rotation.y = wg.userData.side * (0.3 + Math.abs(Math.sin(t * 14 + u.i)) * 1.0);
    b.visible = shown;
  }
}

// a rock tube seen from inside (a shaft, a chamber's wall, a tunnel): rough, flat-shaded
export function rockTube(r0, r1, y0, y1, seg, rows, colors, rough, seed) {
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
export function paint(g, [a, b], seed, mix) {
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
export function lidColor() {
  const c = new THREE.Color('#79b84e').lerp(new THREE.Color('#5e9a3e'), 0.5);
  c.lerp(new THREE.Color('#b99a68'), 0.75).lerp(new THREE.Color('#b99a68'), 0.8);
  return c;
}
// the hill the cave is dug into: a lumpy dome, grass on top, rock on the steep sides
export function hillHeight(x, z) { const d = Math.hypot(x / 15, z / 19); return 10.5 * Math.sqrt(Math.max(0, 1 - d * d)) - 0.4; }
// the meadow's height: flat near the walk, rising into hills far out
export function groundHeight(x, z) { const far = ramp(Math.hypot(x, z), 55, 120); return far * (7 + 6 * noise2(x * 0.6 + 40, z * 0.6 - 25)); }
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

// soft round points that drift (pollen, dust, motes in a beam); their
// motion is a function of time, set by driftMotes
export function motes(n, at, color, size, glow = true) {
  const r = seeded(n * 31 + size * 1000), base = [], pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = at(r); base.push(v, r() * 100); pos.set([v.x, v.y, v.z], i * 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: softGlowTexture(), color, size, transparent: true, opacity: 0, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, fog: false }));
  pts.userData.base = base;
  pts.frustumCulled = false;
  return pts;
}
export function driftMotes(pts, t, speed, opacity, rise = false) {
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

// ---- canvas textures (drawn once; disposed with the set)
export function canvasTex(w, h, draw) {
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
// a soft column of light: bright at the top, gone at the bottom, soft at the sides
export function beamTexture() {
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

// Let go of everything a set made: geometries, its own materials and
// textures, the lights' shadow maps, the cutscene-only models' sources
// (`S.keep`: the ones fetched for it; the game's own stay).
export function disposeSet(S, renderer) {
  const { scene, own } = S;
  scene.traverse((o) => {
    if (o.geometry) own.geometries.add(o.geometry);
    if (o.skeleton) o.skeleton.dispose();
    if (o.isLight) o.dispose?.();
    if (o.isInstancedMesh) o.dispose();
  });
  // the cutscene-only models' own materials (the game's shared ones stay)
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
