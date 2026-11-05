import * as THREE from 'three';
import { noise } from './world.js';

// The height world (world/world.js) drawn and made solid:
// - chunked ground meshes (CHUNK m square, one per draw call, so the camera
//   culls whole chunks), one flat colour per face by what the ground is
//   (moss, the ramp's packed earth, cliff rock, chasm dark, the wall's top)
// - one shared material: cliff faces get horizontal bands of strata in the
//   shader (any steep face, however it is cut), and terrain between the lens
//   and the hero is cut away in a dithered round hole (GDD §5.1: the hero is
//   never lost behind a cliff), which `update()` aims every frame
// - Rapier: a heightfield per chunk on exactly the drawn vertices, the
//   bridges' decks, and an invisible wall along every edge of the walkable
//   grid (world/navGrid.js `edges`), so nobody walks off a cliff
// - the lake's water
// W1: a 700 m world is ~1M triangles, so a chunk's mesh is only built while
// the hero is within `view` m of it (a couple a frame, nearest first) and
// dropped again far away; the colliders are all built up front. The ground
// gets a fine procedural texture (moss speckle, patches) in the shader, and
// the depth ramp (`look`) keeps the lowest levels readable.
export const CHUNK = 64;
const VIEW = 210; // m: chunk meshes within this of the hero are drawn
const CUT_RADIUS = 4.5; // m round the line of sight at the hero (a cone from the lens)
const CUT_FEET = 0.9; // m from the hero's feet up to where the line of sight aims
const CUT_OPEN = 0.1; // m over the feet the ground a cut line of sight comes down on may stand (more: it is rock)
const CUT_LOW = 0.3; // m over the feet: lower ground is never cut (the floor round the hero)
const CUT_BODY = 1.0; // m round the line of sight at the hero: what hides the hero and its ring is always cut
const CUT_SIDE = 1.5; // m: the lens-side cut fades out over this much before the hero's depth
const CUT_STEPS = 8; // samples of a line of sight on its way down to the feet (is there open air behind?)
const CUT_AIR = 0.6; // m a sample on the way must be over the ground to count as open air (a line grazing a bank is not)
const WALL_UP = 2.4, WALL_DOWN = 1.6; // the edge walls, from the walker's height
const CLEAR_PROBES = [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8], [6, 6], [-6, 6], [6, -6], [-6, -6]];

const AO_R = 5, LIP_R = 2; // m
// W3: the Ice Lake's grounds (their cliffs are blue ice, not grey rock)
const ICY = new Set(['ice', 'snow', 'iceTop', 'iceRock']);
// W4: the Crystal Heart's grounds (violet rock, amethyst, ruined flagstones)
const CRY = new Set(['crystalTop', 'crystalRock', 'crystalPath', 'ruin', 'abyss', 'heartstone', 'sun']);
const C = (hex) => new THREE.Color(hex);
const LIP = C('#b9c98a'), LIP_ICE = C('#f2fbff'), LIP_CRY = C('#dcc2ff');
const PALETTE = {
  moss: [C('#5f7a4c'), C('#4f6a42'), C('#6f8a52'), C('#7a8650')],
  meadow: [C('#7a8f52'), C('#6c844a'), C('#8a9a5a')],
  mine: [C('#7a7266'), C('#6a645a'), C('#857a68'), C('#6f7460')],
  camp: [C('#86985c'), C('#7c8e54'), C('#94a062'), C('#9a946a')],
  crystal: [C('#4f4466'), C('#463c5c'), C('#5c4f75')],
  // W2: the forest floor: violet lichen with mossy plum patches
  mushroom: [C('#5a4a6e'), C('#4c3f63'), C('#66507a'), C('#574a5c')],
  loam: [C('#6a4f45'), C('#5c4440'), C('#76584a')], // soft dug earth (the moles)
  sand: [C('#6f6a55'), C('#625e4b')],
  // W3: the Ice Lake: bare blue ice (glossy and cracked in the shader), snow
  // (cool white, a little blue in its hollows), the snowy rock top round the
  // lake, and its cliffs: blue ice strata
  ice: [C('#9cc9e4'), C('#86b8da'), C('#a9d3ec'), C('#7fb0d4')],
  snow: [C('#b9c9d9'), C('#aabdd0'), C('#c4d2e0'), C('#a3b6ca')],
  iceTop: [C('#8a9cb0'), C('#7b8ea4'), C('#9aacbf')],
  iceRock: [C('#7ea6c8'), C('#6c96bc'), C('#8fb6d6'), C('#6088b0')],
  ramp: [C('#7a6a52'), C('#6d5f4a')],
  // W4: the Crystal Heart: its rock top and cliffs violet, the canyons'
  // crystal grit, the ruins' flagstones, the heart's amethyst platform, the
  // abyss far down (deep violet: its crystals glow, world/scatter.js), the
  // sunlit floor at the way out
  crystalTop: [C('#2e2740'), C('#28223a'), C('#352d48')],
  crystalRock: [C('#4c4064'), C('#42385a'), C('#574a70'), C('#3f3554')],
  crystalPath: [C('#5d5476'), C('#524a6a'), C('#6a6084'), C('#5a4f78')],
  ruin: [C('#605a72'), C('#565068'), C('#6a637e'), C('#5c5470')],
  heartstone: [C('#7a5aa6'), C('#6a4c96'), C('#8a6ab6')],
  abyss: [C('#3a2462'), C('#2f1d54'), C('#45296e')],
  sun: [C('#bfae8a'), C('#ad9e7c'), C('#c8b894')],
  rock: [C('#4a5550'), C('#414b47'), C('#525e58')],
  wallTop: [C('#262d2d'), C('#20272a'), C('#2b3333')],
  chasm: [C('#151a1c'), C('#11161a')],
};

export function buildTerrain(G, world, nav, { view = VIEW, lazy = false } = {}) {
  const grid = world.sample();
  // the depth ramp: higher ground lighter, the deep darker (from `look`)
  const look = world.def.look ?? {};
  const liftLo = look.liftLo ?? -45, liftSpan = look.liftSpan ?? 40;
  const { W, D, x0, z0, cell, h } = grid;
  const k0 = (i, j) => Math.min(D - 1, Math.max(0, j)) * W + Math.min(W - 1, Math.max(0, i));
  const H = (i, j) => h[k0(i, j)];
  // drawn only: vertices on a cliff face wander a little sideways, so a cliff
  // cut on the 1 m grid reads as broken rock, not as saw teeth (nothing walks
  // there; the colliders keep the exact grid)
  const steepV = (i, j) => Math.max(Math.abs(H(i + 1, j) - H(i - 1, j)), Math.abs(H(i, j + 1) - H(i, j - 1))) > 2.5;
  const JX = (i, j) => (steepV(i, j) ? (noise(i * 0.71 + 3, j * 0.71) - 0.5) * 0.9 : 0);
  const JZ = (i, j) => (steepV(i, j) ? (noise(j * 0.71, i * 0.71 + 9) - 0.5) * 0.9 : 0);
  // (W6/W7: over each cell, the highest the drawn ground gets: its corners
  // and theirs, for the cut-away's "is there open air behind it" test)
  // R: the cell's own corners, G: those and their neighbours
  const hMax = new Float32Array(W * D * 2);
  {
    const at = (i, j) => h[Math.min(D - 1, Math.max(0, j)) * W + Math.min(W - 1, Math.max(0, i))];
    const four = new Float32Array(W * D);
    for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) four[j * W + i] = Math.max(at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1));
    for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
      let m = -Infinity;
      for (let b = j - 1; b <= j + 1; b++) for (let a = i - 1; a <= i + 1; a++) m = Math.max(m, four[Math.min(D - 1, Math.max(0, b)) * W + Math.min(W - 1, Math.max(0, a))]);
      hMax[(j * W + i) * 2] = four[j * W + i];
      hMax[(j * W + i) * 2 + 1] = m;
    }
  }
  const heightsMax = new THREE.DataTexture(hMax, W, D, THREE.RGFormat, THREE.FloatType);
  heightsMax.magFilter = heightsMax.minFilter = THREE.NearestFilter;
  heightsMax.needsUpdate = true;
  const uniforms = {
    uHero: { value: new THREE.Vector3(0, -1e4, 0) }, uCutR: { value: CUT_RADIUS },
    uHeightsMax: { value: heightsMax }, uGrid: { value: new THREE.Vector3(x0, z0, cell) }, uGridSize: { value: new THREE.Vector2(W, D) },
    uDeep: { value: new THREE.Color(look.deep ?? '#1d3440') }, uDeepMax: { value: look.deepMax ?? 0.5 }, uTex: { value: look.texture ?? 0 },
  };
  const material = terrainMaterial(uniforms);
  const group = new THREE.Group();
  group.name = 'terrain';
  group.userData.noFade = true;
  G.scene.add(group);
  G.groundMeshes?.push(group);

  const regionMat = (k) => {
    const id = grid.ids[grid.region[k]];
    if (id === 'wall') return 'wallTop';
    const r = world.ramps.find((q) => q.id === id);
    if (r) return r.material ?? 'ramp'; // (W3: the Ice Lake's ramps are snow)
    const t = world.terraces.find((q) => q.id === id);
    return t?.material ?? world.def.base.material ?? 'moss';
  };
  // what the ground near each vertex is like: how far up the highest ground
  // within AO_R m stands (the foot of a cliff lies in its shade) and how far
  // down the lowest within LIP_R m (a cliff's lip catches the light)
  const above = windowExtreme(h, W, D, AO_R, Math.max), below = windowExtreme(h, W, D, LIP_R, Math.min);
  const tmp = new THREE.Color();
  // what a face is: steep faces are cliff rock (the shader bands them)
  function faceKind(pa, pb, pc, va) {
    const ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2], vx = pc[0] - pa[0], vy = pc[1] - pa[1], vz = pc[2] - pa[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const up = Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1);
    const k = k0(...va);
    let kind = regionMat(k);
    // (W3: the Ice Lake's cliffs are blue ice, its rock top snowy; W4: the
    // Crystal Heart's violet)
    const icy = ICY.has(kind), cry = CRY.has(kind);
    const cliff = icy ? 'iceRock' : cry ? 'crystalRock' : 'rock';
    if ((kind === 'wallTop' || kind === 'iceTop' || kind === 'crystalTop') && up < 0.75) kind = cliff;
    else if (up < 0.62) kind = cliff;
    const walk = nav.ok(k * 2) || nav.ok(k * 2 + 1);
    // (W3: a chasm floor far down; walkable ground that deep keeps its own
    // colour: the forest's deep, the frozen lake; W4: the abyss glows violet)
    if ((pa[1] + pb[1] + pc[1]) / 3 < (look.chasm ?? -60) && !walk && !icy && !cry) kind = 'chasm';
    // a cliff's lip or a ledge in it (not walkable, not water): rock
    if (!SOLID.has(kind) && kind !== 'ramp' && !walk && Number.isNaN(grid.water[k])) kind = cliff;
    return { kind, flat: up > 0.8, ice: kind === 'ice' && up > 0.8 ? 1 : kind === 'snow' && up > 0.7 ? 0.5 : 0 };
  }
  // a vertex's colour on a face of that kind (per vertex, so bands of shade
  // and light blend softly instead of following the triangles)
  const SOLID = new Set(['rock', 'wallTop', 'chasm', 'iceRock', 'iceTop', 'crystalTop', 'crystalRock', 'abyss']);
  function vertexColor(f, i, j, x, y, z) {
    // flat ground takes the colour of the vertex's own cell, so two kinds of
    // ground meet in a soft blend, not along the triangles' saw teeth
    let kind = f.kind;
    if (!SOLID.has(kind)) { const v = regionMat(k0(i, j)); if (!SOLID.has(v) && PALETTE[v]) kind = v; }
    const pal = PALETTE[kind];
    const t = noise(x * 0.09 + 7, z * 0.09) * (pal.length - 1);
    const a = Math.floor(t);
    tmp.copy(pal[a]).lerp(pal[Math.min(pal.length - 1, a + 1)], t - a);
    // higher ground is lighter, the deep darker: the levels read at a glance
    const lift = THREE.MathUtils.clamp((y - liftLo) / liftSpan, 0, 1.2);
    let lum = 0.62 + lift * 0.55 + (noise(x * 0.6, z * 0.6 + 11) - 0.5) * 0.1;
    if (f.flat) {
      const k = k0(i, j);
      lum *= 1 - 0.5 * THREE.MathUtils.clamp((above[k] - y - 2) / 14, 0, 1); // in a cliff's shade
      if (y - below[k] > 3 && f.kind !== 'wallTop' && f.kind !== 'iceTop' && f.kind !== 'crystalTop') { lum *= 1.25; tmp.lerp(ICY.has(kind) ? LIP_ICE : CRY.has(kind) ? LIP_CRY : LIP, 0.22); } // on its lip
    }
    return tmp.multiplyScalar(lum);
  }

  // --- chunk meshes
  const chunks = [];
  const nI = W - 1, nJ = D - 1;
  function chunkMesh(ch) {
    const { ci, cj, i1, j1 } = ch;
    const pos = [], col = [], ice = [];
    const tri = (a, b, c) => {
      const X = (v) => x0 + v[0] * cell + JX(...v), Z = (v) => z0 + v[1] * cell + JZ(...v);
      const pa = [X(a), H(...a), Z(a)], pb = [X(b), H(...b), Z(b)], pc = [X(c), H(...c), Z(c)];
      pos.push(...pa, ...pb, ...pc);
      // the face's own cell: the one its middle falls in
      const mid = [Math.round((a[0] + b[0] + c[0]) / 3), Math.round((a[1] + b[1] + c[1]) / 3)];
      const f = faceKind(pa, pb, pc, mid);
      for (const [v, p] of [[a, pa], [b, pb], [c, pc]]) { const vc = vertexColor(f, v[0], v[1], p[0], p[1], p[2]); col.push(vc.r, vc.g, vc.b); ice.push(f.ice); }
    };
    for (let j = cj; j < j1; j++) for (let i = ci; i < i1; i++) {
      // split each square along the diagonal that follows the ground best
      if (Math.abs(H(i, j) - H(i + 1, j + 1)) < Math.abs(H(i + 1, j) - H(i, j + 1))) {
        tri([i, j], [i, j + 1], [i + 1, j + 1]); tri([i, j], [i + 1, j + 1], [i + 1, j]);
      } else {
        tri([i, j], [i, j + 1], [i + 1, j]); tri([i + 1, j], [i, j + 1], [i + 1, j + 1]);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('aIce', new THREE.Float32BufferAttribute(ice, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = 'terrainChunk';
    mesh.receiveShadow = true;
    group.add(mesh);
    ch.mesh = mesh;
    ch.tris = pos.length / 9;
    return mesh;
  }
  for (let cj = 0; cj < nJ; cj += CHUNK / cell) for (let ci = 0; ci < nI; ci += CHUNK / cell) {
    const i1 = Math.min(nI, ci + CHUNK / cell), j1 = Math.min(nJ, cj + CHUNK / cell);
    // its collider: a heightfield on the same vertices
    const nx = i1 - ci, nz = j1 - cj;
    const hs = new Float32Array((nx + 1) * (nz + 1));
    for (let a = 0; a <= nx; a++) for (let b = 0; b <= nz; b++) hs[a * (nz + 1) + b] = H(ci + a, cj + b);
    const { RAPIER, world: pw } = G.physics;
    const body = pw.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x0 + (ci + nx / 2) * cell, 0, z0 + (cj + nz / 2) * cell));
    const collider = pw.createCollider(RAPIER.ColliderDesc.heightfield(nz, nx, hs, { x: nx * cell, y: 1, z: nz * cell }).setFriction(0.8), body);
    const ch = { mesh: null, body, collider, ci, cj, i1, j1, tris: 0, x: x0 + (ci + nx / 2) * cell, z: z0 + (cj + nz / 2) * cell };
    chunks.push(ch);
    if (!lazy) chunkMesh(ch);
  }
  // lazy: the meshes near the hero, a couple at a time, nearest first
  let streamAt = { x: Infinity, z: 0 };
  function stream(at, budget = 2) {
    if (!lazy) return 0;
    let built = 0;
    const want = chunks.filter((c) => Math.hypot(c.x - at.x, c.z - at.z) < view).sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z));
    for (const c of want) { if (built >= budget) break; if (!c.mesh) { chunkMesh(c); built++; } }
    for (const c of chunks) {
      if (c.mesh && Math.hypot(c.x - at.x, c.z - at.z) > view + CHUNK * 1.5) {
        group.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh = null; c.tris = 0;
      }
    }
    streamAt = { x: at.x, z: at.z };
    return built;
  }

  // --- the invisible walls along the walkable grid's edges, a trimesh per chunk
  G.invisibleColliders ??= new Set();
  const terrainHandles = new Set(chunks.map((c) => c.collider.handle));
  const walls = new Map();
  for (const e of nav.edges()) {
    const key = `${Math.floor((e.x - x0) / CHUNK)},${Math.floor((e.z - z0) / CHUNK)}`;
    if (!walls.has(key)) walls.set(key, { v: [], i: [] });
    const w = walls.get(key);
    const mx = e.x + e.dx * cell / 2, mz = e.z + e.dz * cell / 2;
    const px = -e.dz * cell / 2, pz = e.dx * cell / 2; // along the side
    const b = w.v.length / 3;
    w.v.push(mx - px, e.y - WALL_DOWN, mz - pz, mx + px, e.y - WALL_DOWN, mz + pz, mx + px, e.y + WALL_UP, mz + pz, mx - px, e.y + WALL_UP, mz - pz);
    w.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  let edgeCount = 0;
  for (const w of walls.values()) {
    const { RAPIER, world: pw } = G.physics;
    const body = pw.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const c = pw.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(w.v), new Uint32Array(w.i)), body);
    G.invisibleColliders.add(c.handle);
    terrainHandles.add(c.handle);
    edgeCount += w.i.length / 6;
  }

  // --- bridge decks: a slab under each deck (the model is only looks)
  for (const b of world.bridges) {
    const { RAPIER, world: pw } = G.physics;
    const yaw = Math.atan2(b.b[0] - b.a[0], b.b[1] - b.a[1]);
    const pitch = Math.atan2(b.y0 - b.y1, b.length);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    const down = new THREE.Vector3(0, -0.3, 0).applyQuaternion(q);
    const body = pw.createRigidBody(RAPIER.RigidBodyDesc.fixed()
      .setTranslation((b.a[0] + b.b[0]) / 2 + down.x, (b.y0 + b.y1) / 2 + down.y, (b.a[1] + b.b[1]) / 2 + down.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
    const c = pw.createCollider(RAPIER.ColliderDesc.cuboid(b.width / 2 + 0.6, 0.3, b.length / 2 + 0.5), body);
    terrainHandles.add(c.handle);
  }
  // --- W4: the floating rocks' decks: a flat round slab under each (the
  // rock itself is looks: world/heart.js)
  for (const s of world.islands ?? []) {
    const { RAPIER, world: pw } = G.physics;
    const body = pw.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(s.at[0], s.y - 0.5, s.at[1]));
    const c = pw.createCollider(RAPIER.ColliderDesc.cylinder(0.5, s.r + 0.4), body);
    terrainHandles.add(c.handle);
  }
  // the ground's colliders never count as "something in the way" for a
  // click or for a sight line (the ground meshes answer those)
  for (const c of chunks) G.invisibleColliders.add(c.collider.handle);

  // --- water
  const waters = world.water.map((w) => buildWater(G, grid, w));

  const frustum = new THREE.Frustum(), m4 = new THREE.Matrix4();
  // Aim the cut-away at the hero (from the camera loop).
  const sight = new THREE.Vector3();
  let streamTimer = 0, last = performance.now();
  function update(hero) {
    uniforms.uHero.value.set(hero.x, hero.y + CUT_FEET, hero.z);
    const now = performance.now();
    streamTimer -= (now - last) / 1000; last = now;
    if (lazy && (streamTimer <= 0 || Math.hypot(hero.x - streamAt.x, hero.z - streamAt.z) > 40)) { streamTimer = 0.2; stream(hero); }
  }
  // all the meshes within `view` of a point, now (a teleport, the first frame)
  function warm(at) { while (stream(at, 64) > 0); }
  // every chunk's mesh, kept until the hero moves on (checks: the whole world
  // from far up)
  function warmAll() { for (const c of chunks) if (!c.mesh) chunkMesh(c); streamTimer = 30; }
  // Is this point of the ground cut away right now? (the shader's test, for
  // clicks: a click through the hole means the ground beyond it)
  const seg = new THREE.Vector3(), rel = new THREE.Vector3();
  const hAt = (x, z) => h[Math.min(D - 1, Math.max(0, Math.round((z - z0) / cell))) * W + Math.min(W - 1, Math.max(0, Math.round((x - x0) / cell)))];
  const hMaxAt = (x, z, near = 1) => hMax[(Math.min(D - 1, Math.max(0, Math.floor((z - z0) / cell))) * W + Math.min(W - 1, Math.max(0, Math.floor((x - x0) / cell)))) * 2 + near];
  function isCut(p, cam = G.camera.position) {
    return cutKeep(p, cam) < 0.5;
  }
  // (the shader's cutKeep, line for line: 0 cut … 1 drawn)
  function cutKeep(p, cam) {
    const hero = uniforms.uHero.value, feetY = hero.y - CUT_FEET;
    seg.subVectors(hero, cam);
    const len = seg.length();
    rel.subVectors(p, cam);
    const t = rel.dot(seg) / len;
    if (!(t > 0 && rel.y < 0 && p.y > feetY + CUT_LOW)) return 1;
    const off = Math.sqrt(Math.max(0, rel.lengthSq() - t * t));
    const r = Math.max(0.6, (uniforms.uCutR.value * t) / len);
    const hl = Math.hypot(seg.x, seg.z) || 1, dv = (rel.x * seg.x + rel.z * seg.z) / hl, dh = hl;
    let keep = 1;
    if (off < r || dv < dh) {
      // does this line of sight come out into the open on its way down to
      // the feet's height? (then this rock hides something; if not, it is
      // just the ground, and a cut would show the void under it)
      const rl = rel.length(), L = (p.y - feetY) / (-rel.y / rl);
      let open = false;
      for (let i = 1; i <= CUT_STEPS && !open; i++) {
        const s = (L * i) / CUT_STEPS / rl;
        const y = p.y + rel.y * s;
        const qx = p.x + rel.x * s, qz = p.z + rel.z * s;
        if (i === CUT_STEPS ? hMaxAt(qx, qz, 0) < y + CUT_OPEN : hMaxAt(qx, qz) < y - CUT_AIR) open = true;
      }
      if (open) {
        if (off < r) keep = smooth(r - 0.7, r, off);
        keep = Math.min(keep, smooth(dh - CUT_SIDE, dh, dv));
      }
    }
    const rb = Math.max(0.4, (CUT_BODY * t) / len);
    if (t < len && p.y > cam.y + (seg.y / len) * t - (CUT_FEET * t) / len) keep = Math.min(keep, smooth(rb - 0.4, rb, off));
    return keep;
  }
  // The highest ground within ~8 m of (x, z): what the lens must stay over.
  function clearAbove(x, z) {
    let top = -Infinity;
    for (const [dx, dz] of CLEAR_PROBES) top = Math.max(top, hAt(x + dx, z + dz));
    return top;
  }
  // W7: does rock stand over the line from a lens at (x, y, z) to the
  // hero's feet, more than 1.5 m over it (the ground's grid: cheap enough for
  // the camera to ask a few times a frame)? The last 3 m to the feet do not
  // count (the ground the hero stands on).
  function blocksSight(x, y, z, hero) {
    const dx = hero.x - x, dy = hero.y + 0.3 - y, dz = hero.z - z, len = Math.hypot(dx, dz);
    for (let s = 1; s < len - 3; s += 1) {
      const k = s / len;
      if (hAt(x + dx * k, z + dz * k) > y + dy * k + 1.5) return true;
    }
    return false;
  }
  // Does the ground stand between the lens and the hero? (checks, debug)
  function occludes(cam, hero) {
    sight.subVectors(hero, cam);
    const len = sight.length();
    for (let s = 2; s < len - 1.5; s += 0.5) {
      const x = cam.x + (sight.x * s) / len, y = cam.y + (sight.y * s) / len, z = cam.z + (sight.z * s) / len;
      if (world.heightAt(x, z) > y + 0.2) return true;
    }
    return false;
  }

  // W2: is the ground's mesh at (x, z) built? (what stands on an unbuilt chunk
  // is hidden: no props floating in the void at the widest zoom)
  const perRow = Math.ceil(nI / (CHUNK / cell));
  function builtAt(x, z) {
    const ci = Math.floor((x - x0) / CHUNK), cj = Math.floor((z - z0) / CHUNK);
    if (ci < 0 || cj < 0 || ci >= perRow) return false;
    return !!chunks[cj * perRow + ci]?.mesh;
  }

  return {
    group, chunks, material, uniforms, waters, terrainHandles, edgeCount,
    update, warm, warmAll, occludes, isCut, clearAbove, blocksSight, builtAt,
    // how many chunks the camera draws (three culls each by its bounds)
    inView(camera) {
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      return chunks.filter((c) => c.mesh && frustum.intersectsSphere(c.mesh.geometry.boundingSphere)).length;
    },
    get tris() { return chunks.reduce((n, c) => n + c.tris, 0); },
    get built() { return chunks.filter((c) => c.mesh).length; },
  };
}

// The highest (or lowest) value within r cells of each one, in two passes.
function windowExtreme(src, W, D, r, pick) {
  const tmp = new Float32Array(W * D), out = new Float32Array(W * D);
  for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
    let m = src[j * W + i];
    for (let d = -r; d <= r; d++) { const q = i + d; if (q >= 0 && q < W) m = pick(m, src[j * W + q]); }
    tmp[j * W + i] = m;
  }
  for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
    let m = tmp[j * W + i];
    for (let d = -r; d <= r; d++) { const q = j + d; if (q >= 0 && q < D) m = pick(m, tmp[q * W + i]); }
    out[j * W + i] = m;
  }
  return out;
}

// The lake: one flat sheet over its cells' box, at its level; the ground
// above the level hides the rest, so the shore follows the terrain exactly.
function buildWater(G, grid, w) {
  const { W, D, x0, z0, cell, water } = grid;
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
    if (!(Math.abs(water[j * W + i] - w.level) < 1e-3)) continue;
    a = Math.min(a, i); b = Math.max(b, i); c = Math.min(c, j); d = Math.max(d, j);
  }
  const geo = new THREE.PlaneGeometry((b - a + 2) * cell, (d - c + 2) * cell).rotateX(-Math.PI / 2);
  // (W2 `glow`: a bioluminescent pool of the forest, lit from within)
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: w.glow ? new THREE.Color(w.glow).multiplyScalar(0.4) : '#2a5f78', emissive: w.glow ?? '#14384c', emissiveIntensity: w.glow ? 0.75 : 0.55, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.85,
  }));
  mesh.position.set(x0 + ((a + b) / 2) * cell, w.level, z0 + ((c + d) / 2) * cell);
  mesh.name = 'water';
  mesh.userData.noFade = true;
  mesh.renderOrder = 1;
  G.scene.add(mesh);
  return mesh;
}

// The ground's material: vertex colours, flat faces, strata on steep faces
// and the dithered cut-away round the line of sight to the hero.
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// The cut-away's rule (GDD §5.1), shared by the ground and what stands on it:
// how much of the point p to keep, 0 (cut) … 1 (drawn). Terrain over the
// hero's feet is cut where it stands between the lens and the hero and hides
// open air behind it (its line of sight comes out of the rock on the way down
// to the feet's height, so the cut shows ground, never the void under the
// rock):
// - in a cone round the line of sight to the hero (wide at the hero), and
// - W7: anywhere nearer the lens than the hero (a half-space, faded over
//   CUT_SIDE m before the hero's depth): a ridge or a rock top across the
//   lower screen never covers it (the review's "rock covering the screen")
// - and always what stands in front of the hero's body over the line to its
//   feet (a narrow cone: the body and its ring).
// isCut (CPU) is its twin, for clicks.
const CUT_GLSL = `
uniform sampler2D uHeightsMax;
// the highest the drawn ground gets over this cell: r its own corners (the
// two triangles between them), g with its neighbours' too (the cliff
// vertices are drawn a little jittered)
vec2 cutHMax(vec2 p) { return texture2D(uHeightsMax, (floor((p - uGrid.xy) / uGrid.z) + 0.5) / uGridSize).rg; }
float cutKeep(vec3 p) {
  vec3 seg = uHero - cameraPosition;
  float len = length(seg);
  vec3 dir = seg / len;
  vec3 rel = p - cameraPosition;
  float t = dot(rel, dir);
  float feetY = uHero.y - ${CUT_FEET.toFixed(2)};
  if (!(t > 0.0 && rel.y < 0.0 && p.y > feetY + ${CUT_LOW.toFixed(2)})) return 1.0;
  float off = length(rel - dir * t);
  float r = max(0.6, uCutR * t / len);
  vec2 hd = normalize(seg.xz);
  float dv = dot(rel.xz, hd), dh = dot(seg.xz, hd);
  float keep = 1.0;
  if (off < r || dv < dh) {
    vec3 rd = normalize(rel);
    float L = (p.y - feetY) / -rd.y;
    bool open = false;
    for (int i = 1; i <= ${CUT_STEPS}; i++) {
      vec3 s = p + rd * (L * float(i) / ${CUT_STEPS.toFixed(1)});
      // (on the way: clearly in the air; at the feet's height: open ground)
      if (i == ${CUT_STEPS} ? cutHMax(s.xz).r < s.y + ${CUT_OPEN.toFixed(2)} : cutHMax(s.xz).g < s.y - ${CUT_AIR.toFixed(2)}) { open = true; break; }
    }
    if (open) {
      if (off < r) keep = smoothstep(r - 0.7, r, off);
      keep = min(keep, smoothstep(dh - ${CUT_SIDE.toFixed(2)}, dh, dv));
    }
  }
  float rb = max(0.4, ${CUT_BODY.toFixed(2)} * t / len);
  if (t < len && p.y > cameraPosition.y + dir.y * t - ${CUT_FEET.toFixed(2)} * t / len) keep = min(keep, smoothstep(rb - 0.4, rb, off));
  return keep;
}`;

// W7: an instanced prop standing on the ground (world/scatter.js) goes with
// its ground: where the cut-away opens the ground under its foot, the whole
// prop is dithered away too (no boulders floating over the hole).
const footCut = new WeakMap();
export function withFootCut(material, uniforms) {
  if (!uniforms) return material;
  if (footCut.has(material)) return footCut.get(material);
  const m = material.clone();
  const before = material.onBeforeCompile && Object.hasOwn(material, 'onBeforeCompile') ? material.onBeforeCompile : null;
  const key = material.customProgramCacheKey && Object.hasOwn(material, 'customProgramCacheKey') ? material.customProgramCacheKey() : material.uuid;
  m.onBeforeCompile = (shader, r) => {
    before?.(shader, r);
    for (const k of ['uHero', 'uCutR', 'uHeightsMax', 'uGrid', 'uGridSize']) shader.uniforms[k] = uniforms[k];
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFootPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
#ifdef USE_INSTANCING
  vFootPos = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz + vec3(0.0, 0.1, 0.0);
#else
  vFootPos = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz + vec3(0.0, 0.1, 0.0);
#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vFootPos;
#ifndef CUT_UHERO
#define CUT_UHERO
uniform vec3 uHero;
#endif
uniform float uCutR;
uniform vec3 uGrid;
uniform vec2 uGridSize;
float footBayer(vec2 p) {
  int i = int(mod(p.x, 4.0)) + int(mod(p.y, 4.0)) * 4;
  float B[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  return (B[i] + 0.5) / 16.0;
}
${CUT_GLSL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  if (cutKeep(vFootPos) < footBayer(gl_FragCoord.xy)) discard;`);
  };
  m.customProgramCacheKey = () => `foot-cut-${key}`;
  footCut.set(material, m);
  return m;
}

function terrainMaterial(uniforms) {
  // (both sides: looking into a cut-away, the far side of the rock shows as
  // its dark inside instead of the void under the ground)
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nattribute float aIce;\nvarying float vIce;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvIce = aIce;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
varying float vIce;
uniform vec3 uHero;
uniform float uCutR;
uniform vec3 uGrid;
uniform vec2 uGridSize;
uniform vec3 uDeep;
uniform float uDeepMax;
uniform float uTex;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}
// W3: how near the edge between two cells of a jittered grid (Worley F2 - F1)
vec2 h22(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float cellEdge(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 r = o + h22(i + o) * 0.85 - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return sqrt(d2) - sqrt(d1);
}
float bayer4(vec2 p) {
  int i = int(mod(p.x, 4.0)) + int(mod(p.y, 4.0)) * 4;
  float B[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  return (B[i] + 0.5) / 16.0;
}
${CUT_GLSL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  if (cutKeep(vWPos) < bayer4(gl_FragCoord.xy)) discard;`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
  // looking down from a ledge, the deep below goes hazy and blue
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uDeep, clamp((uHero.y - vWPos.y - 4.0) / 34.0, 0.0, uDeepMax));
  // (the rock's inside, seen through a cut: dark rock in its strata, not a hole)
  if (!gl_FrontFacing) gl_FragColor.rgb = vec3(0.19, 0.21, 0.22) * (0.8 + 0.2 * step(0.5, fract(vWPos.y / 1.9)));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  float steep = 1.0 - smoothstep(0.5, 0.75, abs(dot(normal, upV)));
  float wav = (sin(vWPos.x * 0.23) + sin(vWPos.z * 0.19 + 1.3)) * 0.45;
  float band = fract((vWPos.y + wav) / 1.9);
  float layer = floor((vWPos.y + wav) / 1.9);
  float tone = 0.9 + 0.16 * fract(sin(layer * 12.9898) * 43758.5453);
  float stripe = band < 0.16 ? 0.62 : (band > 0.84 ? 1.12 : 1.0);
  diffuseColor.rgb *= mix(1.0, stripe * tone, steep);
  // W1: the flat ground's own texture: soft patches, a fine speckle of moss
  // and grit, a little warmer where the patches are light
  if (uTex > 0.0) {
    float level = 1.0 - steep;
    vec2 q = vWPos.xz;
    float patches = vnoise(q * 0.07) * 0.55 + vnoise(q * 0.31 + 7.0) * 0.3 + vnoise(q * 1.7) * 0.15;
    float speck = vnoise(q * 5.3) * 0.6 + vnoise(q * 13.0) * 0.4;
    vec3 tint = mix(vec3(0.93, 0.97, 0.9), vec3(1.1, 1.08, 0.92), smoothstep(0.3, 0.75, patches));
    diffuseColor.rgb *= mix(vec3(1.0), tint * (0.92 + 0.16 * speck), level * uTex * (1.0 - min(1.0, vIce * 2.0) * 0.85));
  }
  // W3: bare lake ice: deep blue patches under a clear skin, and cracks (thin
  // white lines along the noise's contours, a darker seam in each)
  // W3: snow: soft drifts (light and blue-shadowed) and a few glints
  float isIce = step(0.75, vIce), isSnow = step(0.25, vIce) * (1.0 - isIce);
  if (isSnow > 0.0) {
    vec2 q = vWPos.xz;
    float drift = vnoise(q * 0.05 + 2.0) * 0.55 + vnoise(q * 0.19 + 9.0) * 0.3 + vnoise(q * 0.9) * 0.15;
    vec3 snowT = mix(vec3(0.84, 0.9, 1.02), vec3(1.07, 1.07, 1.06), smoothstep(0.3, 0.72, drift));
    float glint = step(0.93, h21(floor(q * 7.0))) * step(0.6, vnoise(q * 3.0 + uTex));
    diffuseColor.rgb *= snowT;
    diffuseColor.rgb += glint * vec3(0.35, 0.4, 0.45);
  }
  if (isIce > 0.0) {
    vec2 q = vWPos.xz;
    // dark clear ice where it is deep, frosted white where it is not, and
    // streaks of blown snow across it
    float deep = vnoise(q * 0.028 + 3.0) * 0.6 + vnoise(q * 0.09) * 0.3 + vnoise(q * 0.4) * 0.1;
    vec3 ice = mix(vec3(0.5, 0.68, 0.98), vec3(1.1, 1.12, 1.14), smoothstep(0.32, 0.72, deep));
    vec2 w = vec2(q.x * 0.7 + q.y * 0.7, q.y * 0.7 - q.x * 0.7);
    float streak = smoothstep(0.62, 0.8, vnoise(vec2(w.x * 0.05, w.y * 0.32) + 4.0)) * smoothstep(0.3, 0.6, vnoise(q * 0.02 + 8.0));
    ice = mix(ice, vec3(1.25, 1.27, 1.3), streak * 0.65);
    // plates of ice: the edges of a cell pattern (big plates, small ones in them)
    float big = cellEdge(q * 0.11 + vnoise(q * 0.05) * 0.6), small = cellEdge(q * 0.33 + 7.0);
    float crack = max(1.0 - smoothstep(0.0, 0.05, big), (1.0 - smoothstep(0.0, 0.035, small)) * 0.45);
    float seam = 1.0 - smoothstep(0.0, 0.018, big);
    ice = mix(ice, vec3(1.32, 1.38, 1.42), crack * 0.6);
    ice *= 1.0 - seam * 0.3;
    diffuseColor.rgb *= ice;
  }
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.3, step(0.75, vIce));`);
  };
  m.customProgramCacheKey = () => 'terrain-v10';
  return m;
}


// W2: the same cut-away for things standing on the ground (the forest's giant
// mushrooms, instanced: world/scatter.js `cut`): what stands above the line
// of sight to the hero, inside a cone from the lens, is dithered away (`r`:
// the hole's radius at the hero, wider than the ground's for a 6 m cap), so
// a canopy never hides the hero. `uniforms`: the terrain's (uHero).
export function addCutaway(material, uniforms, r = 6.5) {
  const m = material.clone();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uHero = uniforms.uHero;
    shader.uniforms.uCanopyR = { value: r };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCutPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
#ifdef USE_INSTANCING
  vCutPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vCutPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vCutPos;
#ifndef CUT_UHERO
#define CUT_UHERO
uniform vec3 uHero;
#endif
uniform float uCanopyR;
float cutBayer(vec2 p) {
  int i = int(mod(p.x, 4.0)) + int(mod(p.y, 4.0)) * 4;
  float B[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  return (B[i] + 0.5) / 16.0;
}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
{
  vec3 seg = uHero - cameraPosition;
  float len = length(seg);
  vec3 dir = seg / len;
  vec3 rel = vCutPos - cameraPosition;
  float t = dot(rel, dir);
  if (t > 0.0 && t < len - 0.5 && vCutPos.y > uHero.y + 0.6) {
    float rr = max(0.8, uCanopyR * t / len);
    float keep = smoothstep(rr - 1.2, rr, length(rel - dir * t));
    // and every cap over the ground round the hero on the lens's side: the
    // hero and what comes at the hero are never under a canopy
    vec2 off = vCutPos.xz - uHero.xz;
    if (vCutPos.y > uHero.y + 2.5 && dot(off, dir.xz) < 3.0) keep = min(keep, smoothstep(uCanopyR * 1.6, uCanopyR * 2.0, length(off)));
    if (keep < cutBayer(gl_FragCoord.xy)) discard;
  }
}`);
  };
  m.customProgramCacheKey = () => `canopy-cut-${material.uuid}`;
  return m;
}
