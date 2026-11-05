// W1: the real underground world (tasks/20261102-world-redesign-todo.md §1),
// carved out of solid rock: every place is a hollow (a terrace) at its own
// level, and the rock between keeps the regions apart. W6
// (tasks/20261104-world-shrink-todo.md): squeezed twice (the user: "too big
// to walk", then "still too big") from 750 m to ~270 m of walkable ground
// across, the depths ×0.45: see the layout below.
//
// It is written in the map's frame, the way the camera sees it: u to the
// right of the screen, v down it (the lens looks "up" the screen, toward
// −x −z; see ui/worldMap.js). M(u, v) turns that into world x, z. Going
// deeper means going up the screen, so from every terrace the hero looks
// out over the next one down: a cliff facing away from the lens hides
// ~1.2 × its height of ground under its lip, so the vistas are laid out to
// be seen beyond that.
//
// (design depths; the world's are ×0.45: camp −13.5, heart −50, abyss −63)
//                      4 수정의 심장 (pit: ledges −90, heart −112, abyss −140)
//                 ┌──── balcony ────┐
//   3 얼음 호수 ── 🔥 캠프 (−30) ══ shortcut ══ 토끼굴 초원 (−30) ── 2 버섯 숲
//   (−50…−65)     ║ viaduct over the gorge (−70)  ║ ramp           (−40…−70)
//                 ║        이끼 계곡  −24 · 옛 광산 −24
//                 ║          −16 (stepped falls)
//                 ║          −8
//                       ☀ 동굴 입구 (sinkhole, 0)
const S = Math.SQRT1_2;
const r1 = (v) => Math.round(v * 10) / 10;
const clamp01 = (t) => Math.min(1, Math.max(0, t));

// ---- W6: the layout (tasks/20261104-world-shrink-todo.md). The world was
// too big to walk ("맵의 크기가 너무 커서 절반 정도로", then "아직도 커서
// 50 % 더"): everything below is still written in the W1–W5 design frame
// (map u, v in design metres, the depths as first built), and the layout
// squeezes it into the world:
// - across (u) and along (v), piecewise (`axis`): the stretches between
//   places (the valley's bare steps, the gorge, the canyons, the long
//   passes, the outer rock) shrink to 0.15–0.3, the places themselves (the
//   camp, the meadow, the lake, the forest's deep, the ruins, the floating
//   rocks) to 0.45–0.7. Not a uniform ×0.3: ramps would climb three times
//   as steep and the arenas would be rooms again.
// - the rows up the screen (the Crystal Heart, v < −146) squeeze across on
//   their own knots (the ruins and the rocks, the canyons taking up the
//   difference), the rows down it (v > −112) on theirs, blended in the rock
//   between; the lake's columns (u < −170) and the forest's (u > 205)
//   squeeze along on their own, anchored on their passes. The squeeze never
//   folds (a test walks every row and column).
// - every depth ×0.45 (H), so the cliffs and drops fit the smaller ground.
// - sizes (a circle's r, a passage's or a ramp's or a gate's width, a cliff
//   band, a world-metre offset `Mo`, a ramp's run-up `lipRamp`, a hop's
//   rocks) ×K = 0.65 (m); the bosses' arenas ×0.85 (ka, Ma), the secret
//   pockets ×0.8 (mp), a floating rock never under 4.5 m (mi). A bridge's
//   deck keeps its width.
// Points go through M(u, v). The squeeze is continuous and one-way, so
// whatever met still meets; the tests keep every slope, gate, bridge, hop
// and level honest. Where the squeeze left less than a cliff band between
// two outlines (a ridge, a ramp starting halfway down), the data says it in
// world terms (`lipRamp`, `band`, `along`), not in design metres.
// segs: [from, to, slope] end to end; the value at `anchor` stays put
function axis(segs, anchor = 0) {
  const xs = [segs[0][0]], ys = [0];
  for (const [a, b, k] of segs) { xs.push(b); ys.push(ys.at(-1) + (b - a) * k); }
  const f = (x) => {
    let i = 0;
    while (i < segs.length - 1 && x > xs[i + 1]) i++;
    return ys[i] + (x - xs[i]) * segs[i][2]; // (past either end: the end's slope)
  };
  const shift = anchor - f(anchor);
  return (x) => f(x) + shift;
}
// across: the rows down the screen (the camp, the valley, the meadow, the
// lake, the forest), and the rows up it (the Crystal Heart: its ruins and
// rocks on their own knots, its two canyons taking up the difference, the
// lake's and the forest's columns the same as down the screen; W6: never
// folding back, the heart's ruins stay right of the lake's columns)
const ACROSS_S = axis([[-520, -300, 0.5], [-300, -150, 0.38], [-150, -80, 0.3], [-80, 41, 0.55], [41, 86, 0.2], [86, 216, 0.45], [216, 250, 0.2], [250, 340, 0.55], [340, 560, 0.28]]);
const HEART_ACROSS = axis([[-146, -64, 0.5], [-64, 64, 0.7], [64, 142, 0.5]]);
const lerp = (a, b, t) => a + (b - a) * t;
function ACROSS_N(u) {
  if (u <= -266 || u >= 250) return ACROSS_S(u);
  if (u < -146) return lerp(ACROSS_S(-266), HEART_ACROSS(-146), (u + 266) / 120);
  if (u > 142) return lerp(HEART_ACROSS(142), ACROSS_S(250), (u - 142) / 108);
  return HEART_ACROSS(u);
}
// along: the middle columns (the heart, the camp, the valley), the lake's
// (anchored on the icy pass) and the forest's (anchored on its pass)
const ALONG = axis([[-420, -330, 0.25], [-330, -296, 0.55], [-296, -268, 0.2], [-268, -146, 0.45], [-146, -90, 0.2], [-90, 47, 0.55], [47, 100, 0.2], [100, 150, 0.5], [150, 360, 0.22], [360, 440, 0.5]]);
const ALONG_W = axis([[-420, -124, 0.4], [-124, 100, 0.55], [100, 440, 0.25]], 4);
const ALONG_E = axis([[-420, -128, 0.6], [-128, -18, 0.32], [-18, 440, 0.24]], 12);
// the design point (u, v) in the world's map frame
export function layout(u, v) {
  const n = clamp01((v + 146) / 34); // 0 up the screen (the heart's rows) … 1 down it
  const e = clamp01((u - 205) / 45), w = clamp01((-170 - u) / 60); // the forest's columns, the lake's
  return [ACROSS_N(u) * (1 - n) + ACROSS_S(u) * n, ALONG(v) * (1 - e - w) + ALONG_E(v) * e + ALONG_W(v) * w];
}
// a design depth in the world (W6: ×0.45)
export const H = (y) => r1(y * 0.45 * 10) / 10;
// a design size in the world (W6: ×0.75): a round place's radius, a
// passage's or a ramp's width, a cliff band, a world-metre offset; the
// places shrink a little (the camp ×0.7 too), the ways between a lot
export const K = 0.65;
const m = (x) => r1(x * K);
// (the secret pockets and the ice's hollows, small already, shrink less;
// a floating rock never under 4.5 m round: it is its own walkable piece)
const KP = 1;
const mp = (x) => r1(x * KP);
const mg = (x) => r1(x * 0.8); // (the ice's two hollows behind their walls: a little smaller, or the squeezed shelf's rock round them would not shut them)
const mi = (x) => Math.max(4.5, m(x));
// (the four bosses' arenas shrink least: a fight needs its room)
const KA = 0.85;
const ka = (x) => r1(x * KA);
const Ma = (u, v, du, dv) => { const [a, b] = layout(u, v); return raw(a + du * KA, b + dv * KA); };
const raw = (u, v) => [r1((u + v) * S), r1((v - u) * S)];
export const M = (u, v) => raw(...layout(u, v));
// a design point moved by world metres (du, dv) in the map frame
const Mo = (u, v, du, dv) => { const [a, b] = layout(u, v); return raw(a + du * K, b + dv * K); };
export const toMap = (x, z) => [(x - z) * S, (x + z) * S];
const poly = (pts) => pts.map(([u, v]) => M(u, v));
// a round outline in the design frame (a big round thing: it squeezes with
// what is round it, where a `circle` keeps its world radius)
const roundOutline = (u, v, r, n = 28) => poly(Array.from({ length: n }, (_, k) => [u + Math.cos((k / n) * Math.PI * 2) * r, v + Math.sin((k / n) * Math.PI * 2) * r]));
// a direction in the map frame (the way through a gate, a fall's toward);
// with `at` (a design point), the way it points there after the squeeze
const dirOf = (du, dv, at) => {
  let [a, b] = [du, dv];
  if (at) { const [u0, v0] = layout(...at), [u1, v1] = layout(at[0] + du * 0.01, at[1] + dv * 0.01); [a, b] = [u1 - u0, v1 - v0]; }
  const [x, z] = [(a + b) * S, (b - a) * S]; const l = Math.hypot(x, z); return [r1(x / l * 100) / 100, r1(z / l * 100) / 100];
};
// a ramp down a cliff laid in world metres from a design point on its lip
// (the outline the drop is cut along): `up` m back onto the higher ground,
// `down` m out onto the lower, along the design direction `dir` as it
// points there after the squeeze (W6: the squeeze shortens a design ramp's
// run-up, never a cliff band, so a squeezed ramp began inside its band)
// (`dir` may instead be { from, to }: two design points whose squeezed
// line gives the way: a ramp that carries on a canyon's own last leg)
function lipRamp(id, at, dir, up, down, rest = {}) {
  const [u0, v0] = layout(...at);
  const [u1, v1] = dir.from ? ((a, b) => [u0 + b[0] - a[0], v0 + b[1] - a[1]])(layout(...dir.from), layout(...dir.to)) : layout(at[0] + dir[0] * 0.01, at[1] + dir[1] * 0.01);
  const l = Math.hypot(u1 - u0, v1 - v0), du = (u1 - u0) / l, dv = (v1 - v0) / l;
  return { id, ...rest, width: m(rest.width ?? 8), pts: [raw(u0 - du * up * K, v0 - dv * up * K), raw(u0 + du * down * K, v0 + dv * down * K)] };
}
// a point `t` of the way from design point a to b, straight in the squeezed
// frame (and the way from a to b there): a canyon laid straight after the
// squeeze, what stands in it
const along = (a, b, t) => { const [au, av] = layout(...a), [bu, bv] = layout(...b); return raw(au + (bu - au) * t, av + (bv - av) * t); };
const alongDir = (a, b) => { const [ax, az] = M(...a), [bx, bz] = M(...b), l = Math.hypot(bx - ax, bz - az); return [r1(((bx - ax) / l) * 100) / 100, r1(((bz - az) / l) * 100) / 100]; };
// a design point moved by design metres that keep their size (the secret
// pockets: their chest and old letters stay where they were in the pocket)
const Mp = (u, v, du, dv) => { const [a, b] = layout(u, v); return raw(a + du * KP, b + dv * KP); };

// W4: a band `w` m wide along a polyline (a corridor's outline), map frame
// (W6: laid out first, so it is `w` design metres ×K wide however it squeezes)
function band(pts, w, k = K) {
  const q = pts.map(([u, v]) => layout(u, v));
  const edge = (side) => q.map(([u, v], i) => {
    const [pu, pv] = q[Math.max(0, i - 1)], [nu, nv] = q[Math.min(q.length - 1, i + 1)];
    const du = nu - pu, dv = nv - pv, l = Math.hypot(du, dv) || 1;
    return [u - (dv / l) * (w * k / 2) * side, v + (du / l) * (w * k / 2) * side];
  });
  return [...edge(1), ...edge(-1).reverse()].map(([u, v]) => raw(u, v));
}
// W4: a hop between two floating rocks (or a rock and a ledge), both ways:
// each way's pad near the edge it leaves from and its landing near the edge
// it comes to, the two ways side by side (a pad is never where the other
// way lands). A, B: { at: [u, v], r } (r: how far in from the middle the
// edge is, along the hop), map frame.
function hop(id, A, B, side = 1.6) {
  A = { ...A, r: A.isle ? mi(A.r) : A.at === HEART.at ? A.r * KA : A.r * K }; B = { ...B, r: B.isle ? mi(B.r) : B.at === HEART.at ? B.r * KA : B.r * K }; // (W6: the rocks ×K, never under 4.5 m)
  // (W6: in the squeezed frame: the rocks' radii are world metres)
  const [au, av] = layout(...A.at), [bu, bv] = layout(...B.at);
  const du = bu - au, dv = bv - av, l = Math.hypot(du, dv);
  const [nu, nv] = [du / l, dv / l], [pu, pv] = [-nv * side, nu * side];
  const on = (S, k, inward, s) => Mo(...S.at, (nu * k * (S.r - inward) + pu * s) / K, (nv * k * (S.r - inward) + pv * s) / K);
  return [
    { id, pad: on(A, 1, 1.6, 1), land: on(B, -1, 2, 1) },
    { id: `${id}r`, pad: on(B, -1, 1.6, -1), land: on(A, 1, 2, -1) },
  ];
}
// W4: the Crystal Heart's floating rocks (map frame: [u, v], r, y)
const ISLES = {
  w1: { at: [-55, -197], r: 6.5, y: H(-95), isle: true }, w2: { at: [-36, -207], r: 5.5, y: H(-101), isle: true },
  e1: { at: [47, -222], r: 7.5, y: H(-90), isle: true }, e2: { at: [30, -218], r: 5, y: H(-100), isle: true },
};
const HEART = { at: [0, -212], r: 20 }; // the heart's platform (its walkable edge is ~5 m in)
const HEART_IN = { at: HEART.at, r: 14 }; // (where a hop lands on it: W6, a metre further in, clear of its lip)
// a pond at the foot of a fall: a gentle bowl under still water
function pond(id, u, v, r, depth, seed) {
  const level = H(depth);
  const pts = Array.from({ length: 10 }, (_, k) => {
    const a = (k / 10) * Math.PI * 2;
    return [u + Math.cos(a) * r * (1 + 0.18 * Math.sin(k * 2.3 + seed)), v + Math.sin(a) * r * 0.8 * (1 + 0.15 * Math.cos(k * 1.7 + seed))];
  });
  return {
    terrace: { id: `${id}Bed`, level: level - 1.6 * K, cliff: m(Math.max(4, r * 0.6)), smooth: true, wobble: m(1.5), seed, material: 'sand', outline: poly(pts) },
    water: { id, level: level - 0.45, wobble: 1, seed, outline: poly(pts.map(([pu, pv]) => [u + (pu - u) * 0.92, v + (pv - v) * 0.92])) },
  };
}
const ponds = [
  pond('poolE', -24, 371, 4.5, 0, 1), // the sinkhole's spring pool (it spills over the rim)
  pond('pool1', 8, 259, 8, -8, 2), // the falls' first step
  pond('pool2', 12, 163, 8, -16, 3),
  pond('pool3', 14, 111, 8, -24, 4), // the last pool: it pours into the gorge
  pond('poolM', 192, -38, 6, -30, 5), // in the meadow, under the fall off its back wall
  // W2: the forest's glowing pools (bioluminescent: purple and amber light)
  { ...pond('glowL', 420, -80, 6.5, -55, 6), glow: '#9a5cff' },
  { ...pond('glowD', 270, -150, 5, -70, 7), glow: '#ffa040' },
  { ...pond('glowW', 270, 72, 5.5, -40, 8), glow: '#c06bff' },
];

// the cave's outer wall (and the grid the world is built on: its box and a margin)
const WALL = poly([[-60, 420], [60, 410], [150, 330], [240, 250], [300, 230], [360, 180], [430, 112], [500, 42], [545, 0], [500, -45], [440, -105], [380, -165], [320, -222], [262, -262], [160, -290], [60, -380],
      [-60, -390], [-180, -310], [-285, -215], [-395, -110], [-460, -15], [-450, 25], [-405, 70], [-335, 140], [-240, 230], [-160, 320], [-100, 380]]);
const boundsOf = (pts, m) => [Math.min(...pts.map((p) => p[0])) - m, Math.min(...pts.map((p) => p[1])) - m, Math.max(...pts.map((p) => p[0])) + m, Math.max(...pts.map((p) => p[1])) + m].map((v) => Math.round(v / 10) * 10);

// W4: the Crystal Heart's two canyons (the lake's, the deep forest's), down to its ruined ledges
const CANYON_W = [[-310, -84], [-306, -104], [-280, -150], [-240, -182], [-195, -200], [-140, -205]];
// (W6: the forest's laid straight from the deep's mouth to the ledge's lip: squeezed, its bend
// had swollen into a wide hollow a door could not shut)
const CANYON_E = [[254, -206], [138, -214]];
// a ruined wall run with its door (two 2 m pieces left out) where a
// passage crosses it, however many pieces the squeezed run has (W6: the
// door had slid off the secret pocket's passage and the wall shut it)
const wallWithDoor = (u0, v0, u1, v1, du, dv) => {
  const [a, b] = [M(u0, v0), M(u1, v1)], [px, pz] = M(du, dv), n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
  let i = 0, best = Infinity;
  for (let k = 0; k < n; k++) { const t = (k + 0.5) / n, d = Math.hypot(a[0] + (b[0] - a[0]) * t - px, a[1] + (b[1] - a[1]) * t - pz); if (d < best) { best = d; i = k; } }
  return [u0, v0, u1, v1, [i, i + 1 < n ? i + 1 : i - 1], true];
};
// the guardians' wall across the way out, its gap (the four middle pieces) under its arch
const exitWall = () => { const [a, b] = [M(-22, -320), M(22, -320)], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2)), c = Math.floor(n / 2); return [-22, -320, 22, -320, [c - 2, c - 1, c, c + 1], true]; };
// W6: the stone viaduct over the gorge, straight across now (it was 94 m on a slant)
const VIADUCT = { a: [-62, 101], b: [-36, 30], spans: 3 };

export const MAIN_WORLD = {
  id: 'main',
  name: '비밀 동굴',
  // (W2: 50 m more east and north, x and −z: the map's east tip, for the forest)
  // (W6: the squeezed wall's box)
  bounds: boundsOf(WALL, 30),
  // how it is lit: the depth ramp (terrain.js) spans the whole 0 → −110 m so
  // the lowest places still read; a soft teal haze, a purple-blue deep;
  // the stage's fill and key a little brighter than W0's
  look: {
    liftLo: H(-112), liftSpan: H(100), chasm: H(-60), deep: '#2a3352', deepMax: 0.38, texture: 1,
    fog: '#27393a', background: '#0c1215', fill: 1.45, key: 1.2, fogNear: 18, fogFar: 175, far: 270,
  },
  // solid rock wherever nothing is carved, a bumpy dark top
  base: { level: 6, rough: 3, walkable: false, material: 'wallTop' },
  wall: {
    // (W2: pushed east, as far as the world's square allows, for the forest)
    outline: WALL,
    wobble: 8, seed: 21, band: 8,
    top: 22, // behind the cave: high walls into the dark
    low: 9, // the camera's side: a little over the entrance
  },
  terraces: [
    // W3: the Ice Lake's rock, lowered first (every terrace after it stands on
    // it): the solid rock (+6) round the lake would stand 70 m over it and fill
    // the screen; at −40 the cliffs round its hollows are 10–25 m (the W2
    // lesson). It keeps clear of the valley and the gorge (their rock stays).
    { id: 'rim3', level: H(-40), cliff: m(8), wobble: m(5), seed: 62, walkable: false, material: 'iceTop', outline: poly([[-150, -55], [-200, -150], [-262, -205], [-480, -20], [-470, 40], [-300, 200], [-247, 185], [-240, 120], [-247, 40], [-150, 30]]) },
    // W4: the Crystal Heart's rock, lowered first like the lake's (the W2
    // lesson): −57 round its two ways in (canyons only 8–13 m deep: the lens
    // sees into them; first laid at −48 the canyon floor was a hole in a
    // dark rock plain), −74 round
    // the pit itself (the ruined ledges at −90 stand 16 m under it), and the
    // pit: an abyss far down (−140, glowing crystals, nobody walks there)
    { id: 'rim4', level: H(-57), cliff: m(8), wobble: m(5), seed: 81, walkable: false, material: 'crystalTop', outline: poly([[-292, -114], [-250, -118], [-190, -132], [-120, -96], [-40, -94], [40, -94], [110, -118], [170, -150], [226, -172], [244, -196], [240, -232], [200, -262], [140, -318], [60, -372], [-60, -380], [-150, -300], [-230, -228], [-284, -186], [-314, -168], [-316, -140], [-298, -128]]) },
    // (W6: and along each canyon, world metres wide: squeezed, the rock
    // lowered round them had narrowed under the canyons' own width, and the
    // solid rock stood 48 m over a canyon's side)
    { id: 'rim4w', level: H(-57), cliff: m(4), wobble: m(2), seed: 79, walkable: false, material: 'crystalTop', outline: band(CANYON_W.slice(1), 48) },
    { id: 'rim4e', level: H(-57), cliff: m(4), wobble: m(2), seed: 80, walkable: false, material: 'crystalTop', outline: band(CANYON_E, 48) },
    { id: 'rim4b', level: H(-74), cliff: m(8), wobble: m(5), seed: 82, walkable: false, material: 'crystalTop', outline: roundOutline(0, -207, 146) },
    { id: 'abyss', level: H(-140), cliff: m(10), wobble: m(5), seed: 41, walkable: false, material: 'abyss', outline: roundOutline(0, -205, 112) },
    // W6: lowered rock round the burrow meadow, the gorge's upright arm and the
    // camp's right: squeezed, the solid rock (+6) stood 20 m over the meadow a
    // few metres from the chief's arena, and the lens saw the fight down a slot
    { id: 'rimMid', level: H(-20), cliff: m(6), wobble: m(3), seed: 90, walkable: false, material: 'wallTop', outline: poly([[24, -124], [236, -124], [236, 108], [24, 108]]) },
    // W5: lowered rock up the screen from the rabbit meadow round its secret
    // pocket (−22: the W2 lesson, a pocket cut into the solid rock sits at
    // the bottom of a well); the meadow and the gorge stand on it
    { id: 'sec1Rim', level: H(-22), cliff: m(6), wobble: m(3), seed: 91, walkable: false, material: 'wallTop', outline: poly([[104, -66], [166, -82], [170, -122], [104, -122]]) },
    // ---- region 1: Moss Valley, its hollow first (the lowest step, −24),
    // then each higher step standing on it, the entrance last
    {
      id: 'valley', level: H(-24), cliff: m(7), wobble: m(4), seed: 31, material: 'moss',
      outline: poly([[-205, 42], [-120, 40], [-20, 40], [60, 42], [96, 60], [110, 96], [160, 90], [218, 98], [232, 165], [222, 250], [170, 300], [100, 345], [30, 378], [-50, 385], [-120, 365], [-175, 300], [-212, 200]]),
    },
    // lower rock shelves round the passes into regions 2 and 3: the solid rock
    // (+6) there would stand 36 m over the pass on the lens's side and hide
    // its floor; at −25 it is a wall a kid can see over
    { id: 'shelf2', level: H(-25), cliff: m(6), wobble: m(4), seed: 51, walkable: false, material: 'wallTop', outline: poly([[196, -70], [252, -80], [256, 20], [252, 96], [196, 92]]) },
    { id: 'shelf3', level: H(-25), cliff: m(6), wobble: m(4), seed: 52, walkable: false, material: 'wallTop', outline: poly([[-230, -50], [-64, -50], [-60, 30], [-120, 34], [-230, 34]]) },
    {
      id: 'mid', level: H(-16), cliff: m(6), wobble: m(3.5), seed: 32, material: 'moss',
      outline: poly([[-180, 168], [-95, 152], [0, 146], [70, 152], [125, 172], [190, 178], [205, 240], [160, 290], [95, 335], [30, 372], [-50, 382], [-118, 362], [-170, 300], [-190, 230]]),
    },
    {
      id: 'upper', level: H(-8), cliff: m(6), wobble: m(3), seed: 33, material: 'moss',
      outline: poly([[-150, 252], [-60, 240], [30, 242], [105, 256], [128, 300], [95, 338], [30, 372], [-50, 382], [-115, 362], [-150, 320]]),
    },
    // the sinkhole: a round floor at 0 m, rock rising round its camera side
    { id: 'entrance', level: H(0), cliff: m(5), wobble: m(2), seed: 34, material: 'moss', circle: [...M(-40, 384), m(27)] },
    // the old mine's ledge in the valley's right (part of the −24 floor; its own
    // id so the ground reads as packed earth)
    {
      id: 'mine', level: H(-24), cliff: m(4), smooth: true, wobble: m(2), seed: 35, material: 'mine',
      outline: poly([[118, 104], [205, 106], [214, 160], [170, 168], [125, 150]]),
    },
    // the gorge: a deep slot in two arms, between the valley and the camp,
    // and between the camp and the meadow; it pours into the pit
    {
      id: 'gorge', level: H(-70), cliff: m(6), wobble: m(3), seed: 36, walkable: false, material: 'rock',
      // (its edges reach a whole cliff band under the camp's and the meadow's,
      // so their cliffs rise straight out of it with no lip between)
      outline: poly([[-232, 34], [-120, 34], [0, 34], [30, 34], [30, -20], [30, -112], [98, -112], [98, -62], [112, -56], [112, 60], [96, 96], [0, 96], [-120, 96], [-232, 96]]),
    },
    // the camp: a rock shelf at −30 between the gorge and the pit, its
    // balcony nosing out over the pit
    {
      id: 'camp', level: H(-30), cliff: m(5), wobble: m(2.5), seed: 37, material: 'camp',
      outline: poly([[-62, -38], [-34, -56], [-26, -88], [24, -90], [32, -58], [40, -40], [41, 0], [40, 45], [0, 47], [-50, 46], [-78, 18], [-80, -10]]),
    },
    // the viaduct's stone bridgehead on the camp's front edge (at the
    // valley's −24, so the bridge runs level; a ramp goes down into the camp)
    { id: 'bridgehead', level: H(-24), cliff: m(4), wobble: m(1), seed: 39, material: 'rock', outline: poly([[-50, 20], [-22, 20], [-22, 48], [-50, 48]]) },
    // the rabbit chief's burrow meadow across the gorge's upright arm
    {
      id: 'meadow', level: H(-30), cliff: m(6), wobble: m(3), seed: 38, material: 'meadow',
      outline: poly([[86, -60], [150, -78], [200, -52], [216, 10], [204, 66], [150, 90], [92, 86], [86, 20]]),
    },
    // ---- region 2 (W2): the Mushroom Forest past the meadow, three levels
    // going up the screen: the upper forest (−40) split by a chasm the giant
    // web spans, the glow hollow (−55) cut into it, the deep (−70) cut into
    // that, the Poison Mushroom Queen's sunken ring (−76) at its far end
    { id: 'pass2', level: H(-30), cliff: m(3), wobble: m(1), seed: 43, material: 'meadow', outline: band([[190, 12], [272, 12]], 20) },
    // the forest's rock: lower than the solid rock elsewhere, so the cliffs
    // round its hollows stay a dozen metres or two (not 70) and the lens sees
    // over them; lowest round the deep (none of it walkable)
    { id: 'rim2', level: H(-32), cliff: m(8), wobble: m(5), seed: 59, walkable: false, material: 'wallTop', outline: poly([[226, -60], [262, -70], [286, -100], [262, -118], [222, -150]]) },
    { id: 'rim2b', level: H(-30), cliff: m(8), wobble: m(5), seed: 60, walkable: false, material: 'wallTop', outline: poly([[255, -120], [330, -110], [420, -70], [500, -10], [470, 60], [380, 160], [300, 230], [258, 230], [248, 100], [250, -40]]) },
    { id: 'rimDeep', level: H(-50), cliff: m(8), wobble: m(4), seed: 61, walkable: false, material: 'wallTop', outline: poly([[220, -140], [268, -112], [292, -104], [380, -130], [380, -160], [330, -230], [290, -262], [250, -262], [218, -220]]) },
    {
      id: 'mush', level: H(-40), cliff: m(7), wobble: m(4), seed: 44, material: 'mushroom',
      outline: poly([[255, -70], [300, -90], [360, -95], [420, -80], [470, -45], [515, -5], [492, 30], [460, 62], [420, 100], [380, 138], [340, 170], [300, 200], [268, 215], [250, 170], [255, 100], [258, 30]]),
    },
    // soft loam where the moles dig (same level: no cliff)
    { id: 'loamW', level: H(-40), cliff: m(6), smooth: true, wobble: m(3), seed: 54, material: 'loam', circle: [...M(282, 130), m(17)] },
    { id: 'loamE', level: H(-40), cliff: m(6), smooth: true, wobble: m(3), seed: 55, material: 'loam', circle: [...M(450, 20), m(14)] },
    // the chasm the orb web spans: a deep slot from the hollow's lip south
    {
      id: 'webChasm', level: H(-100), cliff: m(6), wobble: m(2.5), seed: 56, walkable: false, material: 'rock',
      outline: poly([[342, -50], [374, -50], [378, 0], [374, 46], [374, 58], [380, 100], [372, 165], [346, 165], [340, 100], [350, 58], [350, 46], [344, 0]]),
    },
    {
      id: 'mushLow', level: H(-55), cliff: m(7), wobble: m(4), seed: 45, material: 'mushroom',
      outline: poly([[290, -150], [330, -165], [370, -150], [412, -108], [458, -62], [482, -40], [460, -25], [420, -18], [380, -22], [340, -24], [305, -28], [285, -60]]),
    },
    { id: 'loamL', level: H(-55), cliff: m(6), smooth: true, wobble: m(3), seed: 57, material: 'loam', circle: [...M(390, -75), m(14)] },
    {
      id: 'mushDeep', level: H(-70), cliff: m(6), wobble: m(3), seed: 46, material: 'mushroom',
      outline: poly([[232, -170], [238, -215], [262, -240], [278, -242], [300, -220], [330, -190], [358, -160], [365, -140], [330, -132], [300, -130], [268, -128], [245, -140]]),
    },
    // the queen's sunken ring of mushrooms (her arena: its gate shuts behind)
    { id: 'ring', level: H(-76), cliff: m(4), wobble: m(1.5), seed: 58, material: 'loam', circle: [...M(295, -188), ka(19)] },
    // ---- region 3 (W3): the Ice Lake left of the camp. Past the ice door the
    // icy pass (−30, icicles overhead) drops to the frozen threshold (−38),
    // then the snow shelf (−50), and under it, to the left, the great frozen
    // lake (−65): a slippery plain 160 × 240 m with snow isles, ice pillars,
    // the frozen falls on the cliff up the screen (facing the lens), and the
    // Ice Bear's round rink sunk into it (−70). Off the shelf, two hollows
    // behind ice walls the hammer breaks: the grotto (the armour chest) and
    // the nook (a resting spring, a lost explorer's camp).
    { id: 'pass3', level: H(-30), cliff: m(3), wobble: m(1), seed: 47, material: 'snow', outline: band([[-150, 4], [-62, 4]], 18) },
    // the lake first: its right edge runs on under the shelf (whose cliff then
    // drops straight onto the ice, no lip between)
    {
      id: 'iceLow', level: H(-65), cliff: m(6), wobble: m(4), seed: 49, material: 'ice',
      outline: poly([[-298, -124], [-335, -118], [-376, -76], [-420, -32], [-432, 10], [-415, 35], [-380, 68], [-345, 95], [-300, 115], [-268, 92], [-266, 0], [-270, -95]]),
    },
    // snow isles on the ice (a gentle bank: walked over), a rock isle with crystals
    { id: 'isle1', level: H(-63.6), cliff: m(5), smooth: true, wobble: m(2), seed: 65, material: 'snow', circle: [...M(-325, 55), m(8)] },
    { id: 'isle2', level: H(-63.6), cliff: m(5), smooth: true, wobble: m(2), seed: 66, material: 'snow', circle: [...M(-405, 5), m(7)] },
    { id: 'isle3', level: H(-58), cliff: m(3), wobble: m(1.5), seed: 67, walkable: false, material: 'iceTop', circle: [...M(-322, -62), m(4.5)] },
    // the Ice Bear's rink: a round basin of ice sunk into the lake (its gate on the ramp)
    { id: 'bearRing', level: H(-71), cliff: m(4), wobble: m(1.5), seed: 64, material: 'ice', circle: [...M(-368, -16), ka(22)] },
    {
      id: 'ice', level: H(-50), cliff: m(7), wobble: m(4), seed: 48, material: 'snow',
      outline: poly([[-214, -40], [-219, -94], [-248, -108], [-280, -100], [-292, -60], [-290, 0], [-290, 80], [-298, 120], [-275, 150], [-250, 150], [-242, 110], [-244, 40]]),
    },
    // the frozen threshold past the pass (over the shelf's right edge)
    { id: 'iceGate', level: H(-38), cliff: m(6), wobble: m(3), seed: 63, material: 'snow', outline: poly([[-150, -30], [-190, -40], [-232, -32], [-240, 0], [-236, 22], [-200, 26], [-152, 22]]) },
    // the grotto up the screen from the shelf (behind an ice wall) and the
    // nook down it (behind another), each by a short passage at −50
    { id: 'grottoPass', level: H(-50), cliff: m(3), wobble: m(1.5), seed: 68, material: 'snow', outline: band([[-231, -142], [-231, -80]], 14, 0.8) },
    { id: 'grotto', level: H(-50), cliff: mg(5), wobble: mg(2.5), seed: 69, material: 'snow', circle: [...M(-232, -144), mg(13)] },
    { id: 'nookPass', level: H(-50), cliff: m(3), wobble: m(1.5), seed: 70, material: 'snow', outline: band([[-267, 118], [-267, 168]], 12, 0.8) },
    { id: 'nook', level: H(-50), cliff: mg(4), wobble: mg(2), seed: 71, material: 'snow', circle: [...M(-268, 166), mg(9.5)] },
    // ---- region 4 (W4): the Crystal Heart, the deep round pit under the
    // camp's balcony. Two ways in (the lake's crystal door: a canyon at the
    // lake's −65; the deep forest's: a canyon at −70), each down a ramp from
    // its lip onto a ruined ledge (−90) over the abyss; from the ledges,
    // floating rocks (islands, by hops) down to the heart's platform (−112)
    // in the middle, where the Crystal King waits under the giant crystal
    // heart. Beyond it, up the screen, the hidden way out: a ledge (−112)
    // with the guardians, a rising tunnel to the sunlight (−96).
    { id: 'pass4w', level: H(-65), cliff: m(6), wobble: m(3), seed: 83, material: 'crystalPath', outline: band(CANYON_W, 30) },
    { id: 'pass4e', level: H(-70), cliff: m(6), wobble: m(3), seed: 84, material: 'crystalPath', outline: band(CANYON_E, 30) },
    { id: 'ruinsW', level: H(-90), cliff: m(6), wobble: m(3), seed: 85, material: 'ruin', outline: poly([[-138, -150], [-96, -146], [-74, -162], [-64, -192], [-66, -226], [-80, -256], [-112, -268], [-136, -250], [-146, -214]]) },
    { id: 'ruinsE', level: H(-90), cliff: m(6), wobble: m(3), seed: 86, material: 'ruin', outline: poly([[136, -158], [100, -150], [74, -164], [64, -196], [66, -232], [82, -258], [112, -266], [136, -250], [142, -224]]) },
    { id: 'heart', level: H(-112), cliff: m(5), wobble: m(1.5), seed: 42, material: 'heartstone', circle: [...M(...HEART.at), ka(HEART.r)] },
    // (the way out runs up a gully, its rock lowered to −100 first: the lens
    // sees the run, not a slot in a rock plain)
    { id: 'rimExit', level: H(-100), cliff: m(6), wobble: m(3), seed: 89, walkable: false, material: 'crystalTop', outline: poly([[-30, -300], [30, -300], [26, -376], [-26, -376]]) },
    { id: 'exitLedge', level: H(-112), cliff: m(6), wobble: m(2.5), seed: 87, material: 'ruin', outline: poly([[-26, -296], [26, -296], [30, -316], [12, -326], [-12, -326], [-30, -316]]) },
    { id: 'sunHole', level: H(-96), cliff: m(4), wobble: m(1.5), seed: 88, material: 'sun', circle: [...M(0, -366), m(10)] },
    // W5: the secret pockets, one a region, each down a short passage behind
    // a crystal door the golden necklace opens (once a sniff has found it):
    // up the screen from the rabbit meadow (−30), from the forest's left edge
    // (−40, in its lowered rock), up the screen from the icy pass past the
    // ice door (−30, in the low shelf rock) and up the screen from the west
    // ruins (−90)
    { id: 'sec1Pass', level: H(-30), cliff: m(3), wobble: m(1), seed: 94, material: 'meadow', outline: band([[130, -102], [130, -60]], 12, KP) },
    { id: 'sec1', level: H(-30), cliff: mp(4), wobble: mp(1.5), seed: 95, material: 'moss', circle: [...M(130, -102), mp(9)] },
    { id: 'sec2Pass', level: H(-40), cliff: m(3), wobble: m(1), seed: 96, material: 'mushroom', outline: band([[268, -98], [268, -46]], 12, KP) },
    { id: 'sec2', level: H(-40), cliff: mp(4), wobble: mp(1.5), seed: 97, material: 'loam', circle: [...M(268, -98), mp(9)] },
    { id: 'sec3Pass', level: H(-30), cliff: m(3), wobble: m(1), seed: 98, material: 'snow', outline: band([[-110, -33], [-110, 3]], 12, KP) },
    { id: 'sec3', level: H(-30), cliff: mp(4), wobble: mp(1.5), seed: 99, material: 'snow', circle: [...M(-110, -34), mp(9)] },
    { id: 'sec4Pass', level: H(-90), cliff: m(3), wobble: m(1), seed: 100, material: 'ruin', outline: band([[-104, -287], [-104, -244]], 12, KP) },
    { id: 'sec4', level: H(-90), cliff: mp(4), wobble: mp(1.5), seed: 101, material: 'ruin', circle: [...M(-104, -287), mp(8.5)] },
    ...ponds.map((p) => p.terrace),
  ],
  ramps: [
    // the sinkhole's way out (its gate waits for the necklace)
    { id: 'rampE', width: m(7), pts: [M(-40, 368), M(-40, 340), M(-48, 326)] },
    // down the valley's steps, on its left and its right
    { id: 'ramp12', width: m(8), pts: [M(-92, 268), M(-98, 236), M(-108, 222)] },
    lipRamp('ramp23', [-122, 160], [-10, -36], 8, 20),
    lipRamp('ramp12b', [104, 254], [16, -28], 11, 14, { width: 7 }),
    { id: 'rampCamp', width: m(7), pts: [M(-36, 25), M(-36, 10), M(-36, 0)] }, // the bridgehead down into the camp
    { id: 'rampMine', width: m(8), pts: [M(160, 196), M(165, 160), M(158, 146)] },
    // down into the meadow (the chief's arena: its gate shuts behind)
    { id: 'rampMeadow', width: m(7), pts: [M(150, 124), M(150, 96), M(150, 72)] },
    // region 2 (W2): the pass, the forest's steps down, the queen's ring, and
    // from the deep down into the pit (region 4: 곧 열려요). (Each starts a
    // few metres before the lip: a ramp begun far back cuts a trench into
    // the floor whose sheer sides catch the walker.)
    { id: 'ramp2', width: m(8), pts: [M(246, 12), M(282, 12)] },
    lipRamp('ramp2b', [305, -28], [1, -7], 14, 22),
    lipRamp('ramp2e', [318, -131], [-11, -18], 15, 22),
    { id: 'rampRing', width: m(7), pts: [Ma(295, -188, 12, 21), Ma(295, -188, 4, 8)] },
    // W3: region 3, each from right at its lip: the pass down to the
    // threshold, the threshold down to the shelf, two from the shelf down
    // onto the lake, one into the Ice Bear's rink, and from the lake's far
    // corner down to the pit (region 4, behind a crystal door: 곧 열려요)
    lipRamp('ramp3', [-150, 4], [-1, 0], 4, 16, { material: 'snow' }),
    lipRamp('rampIce', [-239.5, 6], [-1, 0], 7, 13, { material: 'snow' }),
    lipRamp('ramp3b', [-290, 30], [-1, 0], 9, 23, { material: 'snow' }),
    lipRamp('ramp3d', [-292, -60], [-1, 0], 9, 16, { material: 'snow' }),
    { id: 'rampBear', material: 'snow', width: m(7), pts: [Ma(-368, -16, 19.1, 19.1), Ma(-368, -16, 7.8, 7.8)] },
    // W4: region 4, each from right at its canyon's lip down onto its ledge
    // (re-laid: no ramp cuts a trench through the rock now), and the way out:
    // a rising tunnel from the guardians' ledge to the sunlight
    lipRamp('ramp4w', [-146, -204], { from: [-195, -200], to: [-140, -205] }, 6, 30, { material: 'ruin' }),
    lipRamp('ramp4e', [141, -214], [-51, -5], 6, 30, { material: 'ruin' }),
    { id: 'rampExit', material: 'ruin', width: m(9), pts: [M(0, -318), M(0, -362)] },
  ],
  bridges: [
    // Polyfork's stone viaduct over the gorge, three spans on rock piers
    { id: 'viaduct', a: M(...VIADUCT.a), b: M(...VIADUCT.b), width: 3.6, model: 'viaduct', spans: VIADUCT.spans, region: 'gorge' },
    // the old mine's timber trestle: the shortcut from the meadow to the camp
    { id: 'trestle', a: M(98, 2), b: M(30, 2), width: 3.4, model: 'trestle', spans: 3, region: 'gorge' },
    // W2: the giant orb web across the forest's chasm, walked on its strands
    { id: 'web', a: M(338, 52), b: M(386, 52), width: 4, model: 'orbWeb', region: 'webChasm' },
    // W4: an old rope bridge from the east ledge to the big floating rock,
    // and (hidden until the Crystal King sleeps) the crystal bridge from the
    // heart's platform to the guardians' ledge: the way out
    { id: 'rope4', a: Mo(...ISLES.e1.at, ISLES.e1.r + 19.4, 0), b: Mo(...ISLES.e1.at, ISLES.e1.r - 0.6, 0), y: H(-90), width: 2.6, model: 'ropeBridge', spans: 3, region: 'ruinsE' },
    { id: 'exitBridge', a: Ma(0, -212, 0, -12), b: M(0, -305), y: H(-112), width: 4, model: 'crystalBridge', region: 'heart' },
  ],
  // W4: the floating rocks (world.js islands: decks over the abyss)
  islands: Object.entries(ISLES).map(([id, s]) => ({ id, at: M(...s.at), r: mi(s.r), y: s.y, region: 'stones' })),
  // W4: the hops between them (navGrid jump links, both ways; entities: world/heart.js)
  hops: [
    ...hop('hw1', { at: [-79, -194], r: 2.6 }, ISLES.w1), // the west ledge's lip → w1
    ...hop('hw2', ISLES.w1, ISLES.w2),
    ...hop('hw3', ISLES.w2, HEART_IN),
    ...hop('he2', ISLES.e1, ISLES.e2),
    ...hop('he3', ISLES.e2, HEART_IN),
  ],
  water: ponds.map((p) => (p.glow ? { ...p.water, glow: p.glow } : p.water)),
  regions: {
    base: { name: '바위', level: H(6) },
    valley: { name: '이끼 계곡', level: H(-24) }, mid: { name: '이끼 계곡', level: H(-16) }, upper: { name: '이끼 계곡', level: H(-8) },
    entrance: { name: '동굴 입구', level: H(0) }, mine: { name: '옛 광산', level: H(-24) }, bridgehead: { name: '캠프', level: H(-24) },
    gorge: { name: '큰 골짜기', level: H(-70) }, camp: { name: '캠프', level: H(-30) }, meadow: { name: '토끼굴 초원', level: H(-30) },
    // W4: the Crystal Heart
    rim4: { name: '바위', level: H(-57) }, rim4w: { name: '바위', level: H(-57) }, rim4e: { name: '바위', level: H(-57) }, rim4b: { name: '바위', level: H(-74) }, rimExit: { name: '바위', level: H(-100) }, abyss: { name: '수정의 심연', level: H(-140) },
    pass4w: { name: '수정 협곡', level: H(-65) }, pass4e: { name: '보라 협곡', level: H(-70) }, ruinsW: { name: '서쪽 유적', level: H(-90) }, ruinsE: { name: '동쪽 유적', level: H(-90) },
    heart: { name: '심장의 단', level: H(-112) }, exitLedge: { name: '수호자의 단', level: H(-112) }, sunHole: { name: '햇빛 구멍', level: H(-96) }, stones: { name: '떠 있는 바위', level: H(-95) },
    mush: { name: '버섯 숲', level: H(-40) }, mushLow: { name: '버섯 숲', level: H(-55) }, mushDeep: { name: '버섯 숲', level: H(-70) },
    loamW: { name: '버섯 숲', level: H(-40) }, loamE: { name: '버섯 숲', level: H(-40) }, loamL: { name: '버섯 숲', level: H(-55) },
    webChasm: { name: '거미줄 골짜기', level: H(-100) }, ring: { name: '버섯 고리', level: H(-76) },
    rim2: { name: '바위', level: H(-32) }, rim2b: { name: '바위', level: H(-30) }, rimDeep: { name: '바위', level: H(-46) },
    ice: { name: '얼음 호수', level: H(-50) }, iceLow: { name: '얼음 호수', level: H(-65) },
    rim3: { name: '바위', level: H(-40) }, iceGate: { name: '얼음 호수', level: H(-38) }, bearRing: { name: '얼음 곰의 빙판', level: H(-71) },
    isle1: { name: '얼음 호수', level: H(-63.6) }, isle2: { name: '얼음 호수', level: H(-63.6) }, isle3: { name: '바위', level: H(-58) },
    sec1Rim: { name: '바위', level: H(-22) }, rimMid: { name: '바위', level: H(-20) },
    sec1: { name: '토끼굴 비밀 굴', level: H(-30) }, sec1Pass: { name: '토끼굴 비밀 굴', level: H(-30) },
    sec2: { name: '버섯 그늘 비밀 굴', level: H(-40) }, sec2Pass: { name: '버섯 그늘 비밀 굴', level: H(-40) },
    sec3: { name: '고드름 비밀 굴', level: H(-30) }, sec3Pass: { name: '고드름 비밀 굴', level: H(-30) },
    sec4: { name: '유적 너머 비밀 굴', level: H(-90) }, sec4Pass: { name: '유적 너머 비밀 굴', level: H(-90) },
    grotto: { name: '얼음 동굴', level: H(-50) }, grottoPass: { name: '얼음 동굴', level: H(-50) }, nook: { name: '탐험가의 쉼터', level: H(-50) }, nookPass: { name: '탐험가의 쉼터', level: H(-50) },
  },
  // named places for the HUD (first match wins); `region`: which of the four
  // regions (0: the camp) it belongs to, for the "you entered…" card
  areas: [
    // W5: the secret pockets first (the HUD: "비밀 · 이끼 속 비밀 굴")
    { id: 'secret1', name: '토끼굴 비밀 굴', region: 1, icon: '✨', fog: '#2e4a3a', circle: [...M(130, -99), m(12)] },
    { id: 'secret2', name: '버섯 그늘 비밀 굴', region: 2, icon: '✨', fog: '#3a2850', circle: [...M(268, -95), m(12)] },
    { id: 'secret3', name: '고드름 비밀 굴', region: 3, icon: '✨', fog: '#284660', circle: [...M(-110, -31), m(12)] },
    { id: 'secret4', name: '유적 너머 비밀 굴', region: 4, icon: '✨', fog: '#33244c', circle: [...M(-104, -284), m(11)] },
    { id: 'entrance', name: '동굴 입구', region: 1, icon: '☀️', fog: '#2f4236', circle: [...M(-40, 384), m(30)] },
    { id: 'camp', name: '캠프', region: 0, icon: '🔥', fog: '#33304e', outline: poly([[-66, -42], [-28, -54], [-14, -92], [16, -94], [30, -56], [44, -42], [45, 46], [-54, 50], [-84, 20], [-84, -12]]) },
    { id: 'meadow', name: '토끼굴 초원', region: 1, icon: '🐰', fog: '#2f3d2e', outline: poly([[84, -64], [150, -82], [204, -54], [220, 10], [206, 70], [150, 96], [88, 90], [82, 20]]) },
    { id: 'mine', name: '옛 광산', region: 1, icon: '⛏️', fog: '#373430', outline: poly([[112, 98], [222, 100], [228, 170], [168, 175], [118, 156]]) },
    { id: 'gorge', name: '큰 골짜기', region: 1, icon: '🌉', label: M(-150, 68), outline: poly([[-232, 42], [36, 42], [36, -112], [90, -112], [90, 96], [-232, 96]]) },
    { id: 'valley', name: '이끼 계곡', region: 1, icon: '🌿', outline: poly([[-215, 95], [222, 92], [236, 165], [226, 252], [172, 304], [100, 350], [-55, 392], [-125, 368], [-180, 302], [-216, 200]]) },
    // W2: the forest's named corners first (the HUD: "버섯 숲 · 버섯 고리")
    { id: 'ring', name: '버섯 고리', region: 2, icon: '👑', fog: '#3a2346', circle: [...M(295, -188), ka(22)] },
    { id: 'web', name: '거미줄 다리', region: 2, icon: '🕸️', fog: '#2e2a44', outline: poly([[334, 40], [392, 40], [392, 64], [334, 64]]) },
    { id: 'mushDeep', name: '깊은 버섯굴', region: 2, icon: '🍄', fog: '#3a2741', outline: poly([[228, -170], [234, -218], [262, -246], [280, -248], [304, -222], [362, -162], [370, -138], [330, -127], [266, -124], [240, -140]]) },
    { id: 'mushLow', name: '반딧불 골짜기', region: 2, icon: '✨', fog: '#342a4c', outline: poly([[284, -154], [330, -170], [374, -152], [462, -64], [488, -40], [462, -20], [300, -22], [280, -60]]) },
    { id: 'mush', name: '버섯 숲', region: 2, icon: '🍄', fog: '#33284a', outline: poly([[226, -2], [252, -74], [300, -96], [362, -100], [424, -84], [522, -5], [462, 66], [342, 176], [266, 222], [244, 170], [226, 26]]) },
    // W4: the Crystal Heart's corners first (the HUD: "수정의 심장 · 서쪽 유적")
    { id: 'sunHole', name: '햇빛 구멍', region: 4, icon: '☀️', fog: '#4a4038', circle: [...M(0, -364), m(12)] },
    { id: 'exitWay', name: '수호자의 단', region: 4, icon: '🗿', fog: '#2b2140', outline: poly([[-34, -292], [34, -292], [14, -356], [-14, -356]]) },
    { id: 'kingHeart', name: '심장의 단', region: 4, icon: '💜', fog: '#2e1f48', circle: [...M(...HEART.at), ka(HEART.r + 3)] },
    { id: 'stones', name: '떠 있는 바위', region: 4, icon: '🪨', fog: '#2a2044', outline: poly([[-64, -186], [-26, -194], [22, -206], [60, -210], [60, -234], [22, -232], [-26, -222], [-64, -210]]) },
    { id: 'ruinsW', name: '서쪽 유적', region: 4, icon: '🏛️', fog: '#2b2340', outline: poly([[-142, -146], [-94, -142], [-70, -160], [-60, -192], [-62, -228], [-78, -260], [-112, -272], [-140, -252], [-150, -214]]) },
    { id: 'ruinsE', name: '동쪽 유적', region: 4, icon: '🏛️', fog: '#2b2340', outline: poly([[140, -154], [100, -146], [70, -162], [60, -196], [62, -234], [80, -262], [112, -270], [140, -252], [146, -224]]) },
    { id: 'pass4w', name: '수정 협곡', region: 4, icon: '💎', fog: '#2a2a46', outline: band([[-300, -118], [-280, -150], [-240, -182], [-195, -200], [-140, -205]], 22) },
    { id: 'pass4e', name: '보라 협곡', region: 4, icon: '💎', fog: '#2c2444', outline: band(CANYON_E, 24) },
    // W3: the Ice Lake's corners first (the HUD: "얼음 호수 · 얼음 곰의 빙판")
    { id: 'bearRing', name: '얼음 곰의 빙판', region: 3, icon: '🐻‍❄️', fog: '#24364f', circle: [...M(-368, -16), ka(25)] },
    { id: 'grotto', name: '얼음 동굴', region: 3, icon: '💎', fog: '#22374a', circle: [...M(-232, -138), mp(17)] },
    { id: 'nook', name: '탐험가의 쉼터', region: 3, icon: '⛺', fog: '#2c3a48', circle: [...M(-268, 160), mp(15)] },
    { id: 'iceShelf', name: '눈 선반', region: 3, icon: '🏔️', fog: '#2e4152', outline: poly([[-150, -45], [-230, -45], [-232, -95], [-252, -110], [-284, -104], [-294, -60], [-292, 80], [-300, 122], [-275, 154], [-246, 152], [-238, 110], [-240, 30], [-150, 30]]) },
    { id: 'ice', name: '얼음 호수', region: 3, icon: '❄️', fog: '#2a4058', outline: poly([[-150, -10], [-200, -150], [-262, -205], [-470, -20], [-460, 40], [-300, 200], [-247, 185], [-150, 18]]) },
    { id: 'heart', name: '수정의 심장', region: 4, icon: '💎', fog: '#2a2040', outline: roundOutline(0, -205, 125) },
  ],
  // barriers across passages (world/gates.js builds them; `kind`:
  // vine = rocks tied with vines, crystal = the necklace's door, soon = a
  // friendly "coming soon" fence, rail = the mine cart parked across the
  // shortcut). `opens`: what opens it.
  gates: [
    { id: 'entrance', at: M(-40, 357), dir: dirOf(0, -1, [-40, 357]), width: m(10), kind: 'vine', opens: 'necklace', sign: { icon: '🌿', name: '이끼 계곡' } },
    { id: 'arena', at: M(150, 90), dir: dirOf(0, -1, [150, 90]), width: m(10), kind: 'vine', opens: 'open', sign: { icon: '👑', name: '토끼굴' } },
    { id: 'region2', at: M(226, 12), dir: dirOf(1, 0, [226, 12]), width: m(22), kind: 'vine', opens: 'rabbitChief', sign: { icon: '🍄', name: '버섯 숲' } },
    // W2: the queen's ring (shuts behind the hero), the way down to the pit (W4)
    { id: 'ring', at: Ma(295, -188, 8.5, 15), dir: dirOf(-8, -13), width: m(9), kind: 'vine', opens: 'open', sign: { icon: '👑', name: '버섯 고리' } },
    { id: 'pit2', at: along(...CANYON_E, 0.4), dir: alongDir(...CANYON_E), width: m(22), kind: 'crystal', opens: 'heartDoor', sign: { icon: '💎', name: '수정의 심장' } },
    { id: 'shortcut', at: M(38, 2), dir: dirOf(-1, 0, [38, 2]), width: m(8), kind: 'rail', opens: 'rabbitChief', sign: { icon: '🛤️', name: '지름길' } },
    // W3: the ice door opens when the queen sleeps; inside, the hammer breaks
    // the ice walls (`hits`), the Ice Bear's rink shuts behind the hero, and
    // the lake's far corner keeps a crystal door down to the pit (W4)
    { id: 'ice', at: M(-86, 4), dir: dirOf(-1, 0, [-86, 4]), width: m(20), kind: 'crystal', opens: 'mushroomQueen', sign: { icon: '❄️', name: '얼음 호수' } },
    { id: 'iceWall1', at: M(-231, -112), dir: dirOf(0, -1, [-231, -112]), width: m(17), kind: 'ice', opens: 'hammer', hits: 3 },
    { id: 'iceWall2', at: M(-267, 149), dir: dirOf(0, 1, [-267, 149]), width: m(15), kind: 'ice', opens: 'hammer', hits: 3 },
    { id: 'bearGate', at: Ma(-368, -16, 15.2, 15.2), dir: dirOf(-1, -1), width: m(10), kind: 'frost', opens: 'open', sign: { icon: '🐻‍❄️', name: '얼음 곰' } },
    // W4: the two crystal doors down to the Crystal Heart open with the Ice
    // Bear asleep and the golden necklace (it glows as they open, GDD §6.4);
    // the way out past the Crystal King's platform shows only once he sleeps
    { id: 'pit3', at: M(-297, -124), dir: dirOf(12, -40, [-297, -124]), width: m(22), kind: 'crystal', opens: 'heartDoor', sign: { icon: '💎', name: '수정의 심장' } },
    { id: 'exit', at: Ma(0, -212, 0, -20), dir: dirOf(0, -1), width: m(6), kind: 'crystal', opens: 'crystalKing', hidden: true },
    // W5: the secret pockets' crystal doors (world/secrets.js): dim and
    // unmarked until a sniff finds them, then the golden necklace opens them
    { id: 'secret1', at: M(130, -84), dir: dirOf(0, -1, [130, -84]), width: m(10), kind: 'crystal', opens: 'secret', secret: true },
    { id: 'secret2', at: M(268, -82), dir: dirOf(0, -1, [268, -82]), width: m(10), kind: 'crystal', opens: 'secret', secret: true },
    { id: 'secret3', at: M(-110, -12), dir: dirOf(0, -1, [-110, -12]), width: m(10), kind: 'crystal', opens: 'secret', secret: true },
    { id: 'secret4', at: M(-104, -273), dir: dirOf(0, -1, [-104, -273]), width: m(10), kind: 'crystal', opens: 'secret', secret: true },
  ],
  // W5: what each secret pocket holds (world/secrets.js): its door, a
  // chest (refilled every expedition) and the old letters on its wall (the
  // codex page, data/codex.js SECRET_PAGES); the first find is a star
  secrets: [
    { id: 'secret1', region: 1, gate: 'secret1', at: M(130, -102), chest: Mp(130, -102, 0, -2.5), glyph: Mp(130, -102, -3.5, -2), loot: 'gradeUp', target: 'hammer' },
    { id: 'secret2', region: 2, gate: 'secret2', at: M(268, -98), chest: Mp(268, -98, 0, -2.5), glyph: Mp(268, -98, -3.5, -2), loot: 'gradeUp', target: 'waterGun' },
    { id: 'secret3', region: 3, gate: 'secret3', at: M(-110, -34), chest: Mp(-110, -34, 0, -2.5), glyph: Mp(-110, -34, -3.5, -2), loot: 'armor', grade: 'legend' },
    { id: 'secret4', region: 4, gate: 'secret4', at: M(-104, -287), chest: Mp(-104, -287, 0, -2.5), glyph: Mp(-104, -287, -3.5, -2), loot: 'gradeUp', target: 'any' },
  ],
  // W6: the layout's helpers (checks and scenarios place things by them)
  M, H, Mo, K,
  // (W6: a spot's animals wake this far past its radius: ×K too, or two
  // squeezed packs wake together; world/expedition.js WAKE)
  spotWake: m(6),
  // where a new game starts (the hero drops in through the sinkhole), and the camp
  spawn: M(-42, 390),
  // (checks: ?start=mushroom begins at the Mushroom Forest's edge, W2)
  starts: { mushroom: M(292, 16), ice: M(-196, -4), heart: M(-300, -96) },
  // (checks: G.expedition.jump(name))
  places: { ruinsW: M(-105, -213), ruinsE: M(110, -198), pass4w: M(-240, -182), pass4e: along(...CANYON_E, 0.6), stones: M(...ISLES.w1.at), exitLedge: M(0, -310) },
  camp: {
    at: M(-6, 6), // where the hero wakes (by the spring)
    spring: M(-6, -4),
    merchant: M(13, -14), merchantFaces: M(-2, 2),
    codex: M(-24, -10),
    altar: M(2, -26),
    balcony: M(1, -74), // the look-out over the pit
    lanterns: [M(-18, 16), M(16, 12), M(-30, -22), M(22, -30), M(-8, -60), M(10, -62)],
  },
  // the Giant Rabbit Chief's arena in the meadow (the arena gate seals it)
  arena: { at: M(150, 8), r: ka(30), keep: ka(14), boss: 'rabbitChief', gate: 'arena' },
  // the stepped falls: each from a lip toward the next step down
  waterfalls: [
    { ...xz(-24, 368), toward: dirOf(0, -1), width: 4, jet: 5 },
    { ...xz(8, 254), toward: dirOf(0, -1), width: 6.5, jet: 6 },
    { ...xz(12, 158), toward: dirOf(0, -1), width: 7, jet: 6 },
    { ...xz(14, 104), toward: dirOf(0, -1), width: 8, jet: 6 },
    // facing the lens: the camp's spring spills over the shelf into the
    // gorge (seen from the valley and the viaduct), and a fall off the rock
    // behind the meadow (the chief's arena's backdrop)
    { ...xz(17, 38), toward: dirOf(0, 1), width: 6, jet: 2.5 },
    { ...xz(188, -64), toward: dirOf(0, 1), width: 7, jet: 2 },
  ],
  // the shallow brooks between the pools (looks only: a paw wades them)
  brooks: [
    { pts: poly([[-23, 356], [-18, 334], [-6, 304], [4, 280], [8, 266]]), width: 2.6 },
    { pts: poly([[9, 238], [4, 220], [10, 192], [12, 170]]), width: 3 },
    { pts: poly([[12, 142], [16, 126], [14, 118]]), width: 3.2 },
    { pts: poly([[-12, -10], [-2, 8], [10, 24], [17, 40]]), width: 2.4 },
    { pts: poly([[188, -60], [191, -44]]), width: 3 },
  ],
  // the main walking lanes the scatter keeps clear (and the bot can follow)
  lanes: [
    { width: m(9), pts: poly([[-40, 384], [-40, 340], [-48, 326], [-92, 268], [-108, 222], [-118, 176], [-134, 128], VIADUCT.a]) },
    { width: m(7), pts: poly([[-36, 30], [-36, 0], [-6, 6], [30, 2]]) },
    { width: m(8), pts: poly([[-48, 326], [0, 300], [60, 285], [96, 268], [126, 232], [160, 196], [158, 146], [150, 124], [150, 72], [150, 8]]) },
    { width: m(8), pts: poly([[-134, 128], [-60, 120], [0, 126], [60, 122], [120, 130], [158, 146]]) },
    { width: m(7), pts: poly([[-108, 222], [-40, 212], [0, 208], [60, 205], [126, 232]]) },
    { width: m(7), pts: poly([[150, 8], [98, 2]]) },
    { width: m(7), pts: poly([[150, 8], [200, 12], [282, 12]]) },
    // W2: the forest's ways (the giant mushrooms stand clear of them)
    { width: m(8), pts: poly([[282, 12], [300, 26], [330, 52], [392, 52], [412, 30], [420, -2]]) },
    { width: m(7), pts: poly([[300, 26], [302, -14], [305, -30], [308, -50], [334, -60], [360, -40], [414, -44]]) },
    { width: m(7), pts: [...poly([[334, -60], [326, -100], [323, -116], [318, -132], [307, -150]]), Ma(295, -188, 12, 21), Ma(295, -188, 4, 8)] },
    { width: m(7), pts: poly([[306, -150], [262, -180], [248, -200], [228, -204]]) },
    { width: m(6), pts: poly([[300, 26], [292, 90], [282, 140], [275, 190]]) },
    { width: m(6), pts: poly([[412, 30], [450, 20], [470, 10]]) },
    { width: m(6), pts: poly([[392, 52], [410, 90], [400, 110]]) },
    // W3: the Ice Lake's ways (the ice blocks and crystals keep off them)
    { width: m(8), pts: poly([[-40, 2], [-146, 4], [-166, 4], [-200, -2], [-233, 6], [-262, 6], [-281, 30], [-313, 30], [-335, 12], [-351, -6]]) },
    { width: m(7), pts: poly([[-262, 6], [-266, -60], [-283, -60], [-315, -60]]) },
    { width: m(7), pts: poly([[-266, -60], [-240, -86], [-231, -96], [-231, -140]]) },
    { width: m(7), pts: poly([[-262, 6], [-266, 90], [-267, 140], [-268, 162]]) },
    { width: m(7), pts: poly([[-313, 30], [-306, 52], [-330, 80], [-380, 40], [-410, -15], [-390, -60], [-340, -95], [-304, -106]]) },
    // W4: the Crystal Heart's ways (the clutter keeps off them)
    { width: m(8), pts: poly([[-304, -106], [-300, -118], [-280, -150], [-240, -182], [-195, -200], [-151, -203], [-102, -213], [-79, -196]]) },
    { width: m(8), pts: [M(...CANYON_E[0]), M(148, -214), M(97, -219), M(76, -221)] },
    { width: m(6), pts: poly([[-102, -213], [-120, -190], [-112, -170]]) },
    { width: m(6), pts: poly([[97, -219], [110, -195], [108, -175]]) },
    // W5: down each secret pocket's passage (nothing strewn in the way)
    { width: m(7), pts: poly([[130, -58], [130, -104]]) },
    { width: m(7), pts: poly([[268, -56], [268, -100]]) },
    { width: m(7), pts: poly([[-110, 6], [-110, -36]]) },
    { width: m(7), pts: poly([[-104, -252], [-104, -289]]) },
    { width: m(8), pts: poly([[0, -305], [0, -318], [0, -362]]) },
  ],
  // the encounter spots: hand placed, filled per expedition by its seed
  // (world/encounters.js). kinds: weights of what a spot may hold.
  spots: [
    { id: 't1a', at: M(-100, 315), r: m(11), kinds: { wolves: 2, rabbits: 1, herbs: 1 }, gentle: true },
    { id: 't1b', at: M(55, 305), r: m(11), kinds: { rabbits: 2, wolves: 1, shards: 1 } },
    { id: 't1c', at: M(-20, 282), r: m(7), kinds: { chest: 1, herbs: 1, shards: 1 } },
    { id: 't2a', at: M(-140, 200), r: m(12), kinds: { wolves: 2, mixed: 1 } },
    { id: 't2b', at: M(-50, 182), r: m(9), kinds: { chest: 2, shards: 1 } },
    { id: 't2c', at: M(80, 210), r: m(12), kinds: { rabbits: 1, mixed: 2 } },
    { id: 't2d', at: M(150, 225), r: m(8), kinds: { herbs: 1, shards: 1, chest: 1 } },
    { id: 't3a', at: M(-160, 122), r: m(12), kinds: { wolves: 2, mixed: 1, rabbits: 1 } },
    { id: 't3b', at: M(-40, 125), r: m(9), kinds: { chest: 1, shards: 1, herbs: 1 } },
    { id: 't3c', at: M(70, 122), r: m(12), kinds: { rabbits: 2, mixed: 1 } },
    { id: 'mineA', at: M(180, 135), r: m(10), kinds: { wolves: 1, mixed: 2 } },
    { id: 'mineB', at: M(196, 122), r: m(6), kinds: { chest: 2, shards: 1 } },
    // W2: the Mushroom Forest (region 2: tougher animals, GDD §8.5): foxes in
    // the giants' shade, moles in the soft loam, mixed packs
    { id: 'f1', region: 2, at: M(292, 50), r: m(11), kinds: { foxes: 2, mixed: 1 } },
    { id: 'f2', region: 2, at: M(282, 130), r: m(12), kinds: { moles: 2, mixed: 1 } },
    { id: 'f3', region: 2, at: M(318, 90), r: m(7), kinds: { chest: 1, herbs: 1, shards: 1 } },
    { id: 'f4', region: 2, at: M(450, 20), r: m(12), kinds: { moles: 1, foxes: 2 } },
    { id: 'f5', region: 2, at: M(390, -75), r: m(12), kinds: { moles: 2, mixed: 1, foxes: 1 } },
    { id: 'f6', region: 2, at: M(330, -72), r: m(7), kinds: { chest: 2, herbs: 1 } },
    { id: 'f7', region: 2, at: M(269, -149), r: m(10), kinds: { foxes: 1, wolves: 1, mixed: 1 } },
    { id: 'f8', region: 2, at: M(392, 82), r: m(10), kinds: { mixed: 2, wolves: 1 } },
    // W3: the Ice Lake (region 3: ×1.5 hp, ×1.3 bite): deer on the open snow
    // and the ice (room to charge), bears on the lake, snow hares, herds
    { id: 'i1', region: 3, at: M(-195, -8), r: m(10), kinds: { hares: 2, wolves: 1 } },
    { id: 'i2', region: 3, at: M(-262, -32), r: m(12), kinds: { deer: 2, hares: 1 } },
    { id: 'i3', region: 3, at: M(-262, 82), r: m(12), kinds: { hares: 1, herd: 2 } },
    { id: 'i4', region: 3, at: M(-323, -32), r: m(12), kinds: { deer: 2, bears: 1 } },
    { id: 'i5', region: 3, at: M(-360, 58), r: m(12), kinds: { bears: 2, herd: 1 } },
    { id: 'i6', region: 3, at: M(-401, -7), r: m(11), kinds: { deer: 1, bears: 1, herd: 1 } },
    { id: 'i7', region: 3, at: M(-266, -82), r: m(7), kinds: { chest: 2, herbs: 1, shards: 1 } },
    { id: 'i8', region: 3, at: M(-302, 86), r: m(7), kinds: { chest: 1, shards: 2 } },
    // W4: the Crystal Heart (region 4: ×1.8 hp, ×1.5 bite, GDD §8.5): every
    // animal at once, tinted by the crystal (purple eyes and rims)
    { id: 'c1', region: 4, at: M(-236, -184), r: m(9), kinds: { crystalPack: 2, crystalHerd: 1 } },
    { id: 'c2', region: 4, at: M(-112, -178), r: m(11), kinds: { crystalPack: 2, crystalBear: 1 } },
    { id: 'c3', region: 4, at: M(-108, -240), r: m(9), kinds: { chest: 2, herbs: 1 } },
    { id: 'c4', region: 4, at: along(...CANYON_E, 0.6), r: m(8), kinds: { crystalPack: 2, crystalHerd: 1 } },
    { id: 'c5', region: 4, at: M(108, -190), r: m(11), kinds: { crystalHerd: 2, crystalBear: 1 } },
    { id: 'c6', region: 4, at: M(110, -244), r: m(8), kinds: { chest: 2, shards: 1 } },
    { id: 'c7', region: 4, at: M(-284, -146), r: m(7), kinds: { herbs: 2, shards: 1 } },
  ],
  // W2: the bounce mushrooms (entities/mushrooms.js createBounce): step on a
  // pad, fly to its landing. One way each; a pair is the two ways. The walking
  // grid knows them as jump links (world/navGrid.js), so a click below routes
  // by them.
  bounces: [
    { id: 'b1', pad: M(326, -10), land: M(334, -50) }, // one way down: the upper forest → the glow hollow
    { id: 'b2', pad: M(420, -2), land: M(414, -44) }, // a pair: the east shelf ⇄ the hollow
    { id: 'b2r', pad: M(428, -48), land: M(436, -4) },
    { id: 'b3', pad: M(282, -150), land: M(300, -110) }, // one way up: the deep → the hollow
  ],
  // W2: poison in the forest (entities/mushrooms.js): mud and tar pools (stand
  // in one: poison; the paths go round), fumarole vents that puff on a beat
  // (a ring first), poison mushrooms that puff when the hero comes close.
  // [u, v, r] / [u, v]
  hazards: {
    mud: [[282, 72, 2.2], [452, -8, 2], [400, -60, 2.2]].map(([u, v, r]) => ({ at: M(u, v), r: m(r) })),
    tar: [[312, 112, 2.4], [350, -92, 2.4], [262, -160, 2]].map(([u, v, r]) => ({ at: M(u, v), r: m(r) })),
    vents: [[318, 18], [308, 160], [424, 44], [386, -58], [272, -222]].map(([u, v]) => M(u, v)),
    poison: [[282, 34], [332, 120], [440, 52], [372, -100]].map(([u, v]) => M(u, v)),
  },
  // the Poison Mushroom Queen's ring (its gate seals it), the mushroom lift
  // home her sleep opens (the ring ⇄ the camp), the forest's resting spring
  // and the chest where the mask waits
  queen: { at: M(295, -188), r: ka(19), keep: ka(13), boss: 'mushroomQueen', gate: 'ring' },
  lift: { ring: Ma(295, -188, -8, -8), camp: M(20, -48) },
  rest: M(360, -40),
  maskChest: M(470, 10),
  // W3: the Ice Bear's rink on the lake (its gate seals it), the rope lift
  // home its sleep opens (the lake ⇄ the camp), the nook's resting spring,
  // the grotto's armour chest, and the passes where icicles fall (a shadow
  // on the floor first): [u, v, r]
  iceBear: { at: M(-368, -16), r: ka(22), keep: ka(15), boss: 'iceBear', gate: 'bearGate' },
  lift3: { lake: M(-306, 52), camp: M(-56, -22) },
  rest3: M(-270, 162),
  armorChest: Mo(-232, -144, 3.5, 3.5),
  icicles: [[-112, 4, 15], [-231, -118, 8], [-345, -86, 13]].map(([u, v, r]) => ({ at: M(u, v), r: m(r) })),
  // W4: the Crystal Heart (world/heart.js): where crystal spikes burst out of
  // the floor (a purple-and-red ring first) [u, v, r]; the Crystal King on his
  // platform under the giant crystal heart (walking onto it seals the hops);
  // the crystal lift home his sleep opens (the platform ⇄ the camp's
  // balcony); the way out (the crystal bridge, the guardians' ledge, the
  // rising tunnel, the sunlight); the ruins (Dungeon & Crypt pieces) and the
  // guardians; the floating rocks that only drift (looks)
  spikes: [[-262, -168, 8], [-92, -205, 9], [86, -222, 7]].map(([u, v, r]) => ({ at: M(u, v), r: m(r) })).concat({ at: along(...CANYON_E, 0.75), r: m(12) }),
  king: { at: M(...HEART.at), r: ka(HEART.r), keep: ka(13), boss: 'crystalKing', crystal: { y: H(-86), size: 9 } },
  lift4: { heart: Ma(0, -212, 8, 9), camp: M(12, -80) },
  escape: { from: Ma(0, -212, 0, -12), tunnel: [M(0, -305), M(0, -360)], sun: M(0, -364) },
  ruins: {
    // wall runs: [u0, v0, u1, v1, gaps (indices of 2 m pieces left out), arch?]
    walls: [
      [-130, -160, -104, -152, [3, 7]], [-140, -208, -134, -236, [2]], wallWithDoor(-118, -262, -88, -256, -104, -259),
      [-84, -170, -76, -192, [], true], [104, -152, 132, -164, [2, 9]], [140, -228, 132, -252, [3]],
      [84, -258, 112, -262, [5], true], [78, -172, 72, -190, [], true],
      exitWall(),
    ],
    stairs: [[-128, -196, 0.3], [124, -205, 3.4], [-70, -244, 1.2]],
    braziers: [[-96, -160], [-132, -226], [-90, -248], [96, -160], [134, -236], [90, -250], [-18, -300], [18, -300], [-100, -224], [-100, -201], [97, -230], [97, -207]],
    rubble: [[-120, -170], [-100, -262], [-74, -214], [118, -170], [80, -240], [126, -258], [-28, -310], [26, -312]],
    glyph: { at: M(-120, -196), face: M(-100, -205) },
  },
  guardians: [
    // [model, u, v, s, facing toward [u, v]] (standing 6 m as built: ×2 = 12 m)
    ['moai', -20, -313, 2.1, [0, -290]], ['moai', 20, -313, 2.1, [0, -290]],
    ['moai', -120, -250, 1.6, [-90, -205]], ['moai', 126, -172, 1.6, [96, -205]],
    ['moaiKneel', 49, -226, 1.5, [0, -212]], ['moaiKneel', -110, -160, 1.4, [-90, -190]],
    ['moaiLying', -128, -232, 1.0, [-100, -205]],
  ],
  drift: [
    // floating rocks that only drift and turn (looks): [size 'l'|'m'|'s', u, v, y, s]
    ['l', -70, -130, -84, 1.1], ['l', 70, -300, -96, 1.3], ['m', -40, -260, -100, 1.3], ['m', 44, -160, -92, 1.2],
    ['s', -18, -170, -94, 1.6], ['s', 22, -250, -98, 1.8], ['m', -86, -290, -104, 1.1], ['l', 96, -130, -112, 0.9],
    ['s', -60, -240, -108, 1.5], ['m', 70, -195, -104, 1.0], ['s', -10, -280, -90, 1.4], ['l', -100, -300, -120, 1.2],
  ].map(([k, u, v, y, sc]) => [k, u, v, H(y), sc]),
  // the big things, hand placed (scatter adds the small ones: world/scatter.js)
  landmarks: [
    // rock pillars rising out of the gorge (two of them carry the viaduct)
    ...[...Array.from({ length: VIADUCT.spans - 1 }, (_, k) => [lerp(VIADUCT.a[0], VIADUCT.b[0], (k + 1) / VIADUCT.spans), lerp(VIADUCT.a[1], VIADUCT.b[1], (k + 1) / VIADUCT.spans), 7.5]), [-180, 68, 9], [-10, 66, 8.5], [64, -60, 9.5], [62, 30, 8]].map(([u, v, s], i) => ({ model: 'seaStack', ...xz(u, v), s, ry: i * 1.3, radius: 0, sink: 2 })),
    // and out of the valley floor and the pit
    ...[[-190, 150, 6], [200, 130, 5.5], [-160, 250, 5], [190, 200, 4.6]].map(([u, v, s], i) => ({ model: 'seaStack', ...xz(u, v), s, ry: i * 2.1 + 0.4, radius: s * 0.62 })),
    // the sinkhole's giant ferns and moss
    { model: 'treeFern', ...xz(-62, 370), s: 1.5, ry: 0.4, radius: 0.7 },
    { model: 'treeFern', ...xz(-16, 396), s: 1.3, ry: 2.2, radius: 0.6 },
    { model: 'mossCushion', ...xz(-62, 398), s: 1.2, ry: 1.0, radius: 2.4 },
    // valley giants
    ...[[-150, 330, 1.6], [110, 320, 1.4], [-170, 210, 1.5], [180, 255, 1.2], [-60, 160, 1.2], [100, 160, 1.3]].map(([u, v, s], i) => ({ model: 'treeFern', ...xz(u, v), s, ry: i * 1.7, radius: 0.5 * s })),
    ...[[-120, 300, 1.4], [70, 340, 1.1], [-180, 180, 1.6], [120, 190, 1.2], [-90, 148, 1.3], [40, 135, 1.0], [-20, 230, 1.1]].map(([u, v, s], i) => ({ model: 'mossCushion', ...xz(u, v), s, ry: i * 2.3, radius: 2.1 * s })),
    ...[[-130, 345], [85, 295], [-165, 270], [195, 215], [-185, 135], [-10, 200]].map(([u, v], i) => ({ model: 'horsetail', ...xz(u, v), s: 1.4 + (i % 3) * 0.2, ry: i, radius: 0.5 })),
    // the old mine: its headframe over a shaft, rails, carts
    { model: 'headframe', ...xz(192, 150), s: 1.3, ry: Math.PI / 4, radius: 2.4 },
    { model: 'mineCart', ...xz(178, 132), s: 1.6, ry: 2.4, radius: 1 },
    { model: 'barrow', ...xz(198, 128), s: 1.8, ry: 0.6, radius: 0.6 },
    { model: 'ladder', ...xz(208, 162), s: 1.4, ry: 2.6, radius: 0 },
    { model: 'mineCart', ...xz(132, 116), s: 1.5, ry: 0.4, radius: 1 },
    { model: 'barrow', ...xz(140, 152), s: 1.7, ry: 2.2, radius: 0.6 },
    { model: 'ropeCoil', ...xz(186, 120), s: 2.2, ry: 0.3, radius: 0 },
    { model: 'torch', ...xz(160, 112), s: 1.6, ry: 0, radius: 0 },
    { model: 'torch', ...xz(178, 160), s: 1.6, ry: 0, radius: 0 },
    // the meadow's rabbit burrows round the arena, and a beast's old ribs
    ...[[118, -30], [178, -40], [196, 30], [110, 50], [106, -48]].map(([u, v], i) => ({ model: 'burrow', ...xza(150, 8, ...[Math.cos(Math.atan2(v - 8, u - 150)) * 36, Math.sin(Math.atan2(v - 8, u - 150)) * 36]), s: 1.2 + (i % 2) * 0.3, ry: i * 1.1, radius: 3 })),
    { model: 'ribcage', ...xz(186, 72), s: 2.4, ry: 0.7, radius: 0 },
    // the passes' arches into regions 2 and 3
    { model: 'caveMouth', ...xz(256, 12), s: 2.4, ry: -Math.PI / 4 + Math.PI / 2, radius: 0, noBody: true },
    { model: 'caveMouth', ...xz(-96, 2), s: 2.4, ry: -Math.PI / 4 - Math.PI / 2, radius: 0, noBody: true },
    // the camp's look-out and its old way-post
    { model: 'wayfinder', ...xz(-8, -70), s: 1.3, ry: 0.5, radius: 0.4 },
    // the camp's things: the bat merchant's stall and sign, crates of the old mine
    { model: 'stall', ...xz(22, -20), s: 1.3, ry: -0.6, radius: 1.2 },
    { model: 'signboard', ...xz(8, -8), s: 1.2, ry: 0.3, radius: 0 },
    { model: 'ropeCoil', ...xz(-16, 20), s: 2, ry: 1, radius: 0 },
    { model: 'mineCart', ...xz(26, 14), s: 1.5, ry: 1.2, radius: 1 },
    { model: 'cairn', ...xz(-46, 8), s: 1.6, ry: 0.2, radius: 0.6 },
    { model: 'mossCushion', ...xz(-50, -24), s: 0.9, ry: 0.4, radius: 1.9 },
    { model: 'treeFern', ...xz(-46, 30), s: 1.0, ry: 1.4, radius: 0.5 },
    { model: 'treeFern', ...xz(30, -40), s: 1.1, ry: 2.4, radius: 0.5 },
    { model: 'treeFern', ...xz(-34, -36), s: 1.2, ry: 0.4, radius: 0.5 },
    { model: 'horsetail', ...xz(34, -8), s: 1.3, ry: 0.4, radius: 0.5 },
    // ---- W2: the Mushroom Forest's big things (the forest of giant bonnets
    // itself is strewn by world/scatter.js; these are the hand-placed ones)
    // the ring of giant mushrooms round the queen's arena (a gap at its gate)
    ...Array.from({ length: 11 }, (_, i) => {
      const a = 1.02 + ((i + 1) / 12) * Math.PI * 2; // (the 12th place, toward the gate, stays open)
      return { model: 'bonnet', ...xza(295, -188, Math.cos(a) * 21, Math.sin(a) * 21), s: 1.9 + (i % 3) * 0.35, ry: i * 1.7, radius: 0.9, glow: i % 2 ? '#ffa040' : '#b46bff', light: i % 3 === 0 };
    }),
    // puffballs as big as houses, moss mounds, the wasps' paper nest, dead snags
    ...[[268, 44, 1.1], [326, 145, 1.3], [430, 80, 1.0], [298, -72, 1.2], [432, -58, 1.0], [256, -150, 1.2], [262, 172, 1.0]].map(([u, v, s], i) => ({ model: 'puffball', ...xz(u, v), s, ry: i * 2.2, radius: 2.0 * s })),
    ...[[300, 104, 1.4], [276, 60, 1.1], [442, 40, 1.2], [345, -122, 1.2], [362, -112, 0.9]].map(([u, v, s], i) => ({ model: 'mossCushion', ...xz(u, v), s, ry: i * 1.4, radius: 2.1 * s, tint: '#b07ad8' })),
    { model: 'waspNest', ...xz(304, -232), s: 1, ry: 0.6, radius: 0, sink: 3 },
    ...[[262, 110], [458, -6], [292, -116]].map(([u, v], i) => ({ model: 'deadSnag', ...xz(u, v), s: 1.6, ry: i * 2, radius: 0.6 })),
    // a second orb web hung across the chasm's mouth (looks only)
    { model: 'orbWeb', ...xz(360, -22), s: 1.05, ry: Math.PI / 4, radius: 0, y: H(-68) },
    // ---- W3: the Ice Lake's big things. Polyfork's frozen waterfall (back
    // against the cliff, its front +z toward the lake) on the cliffs up the
    // screen from the lake: they face the lens, seen from the shelf and the
    // ice; pillars of ice-blue rock out of the lake; ice blocks, blue-sheen
    // shards and basalt columns; the lost explorer's camp in the nook
    // (W4: the first one, by the lake's corner, made way for the crystal door)
    ...[[-346, -99, 4.4, 1], [-366, -81, 5, 1], [-392, -54, 4.2, 1], [-412, -36, 4.6, 1]].map(([u, v, s, d]) => ({ model: 'iceFall', ...xz(u, v), s, ry: d ? Math.PI / 2 : Math.PI / 4, radius: 0, y: H(-65.4), tint: '#d2ecff' })),
    ...[[-326, -66, 5], [-386, 52, 6.2], [-414, -6, 4], [-296, 102, 4.6]].map(([u, v, s], i) => ({ model: 'seaStack', ...xz(u, v), s, ry: i * 1.9, radius: s * 0.55, tint: '#a8d2f0', frost: true, sink: 1 })),
    ...[[-300, 10, 4.5], [-355, 85, 5.5], [-430, 15, 4], [-250, 125, 3.6], [-218, -20, 3.2], [-345, -78, 3.8]].map(([u, v, s], i) => ({ model: 'iceChunk', ...xz(u, v), s, ry: i * 2.3, radius: s * 0.42, tint: '#d4f0ff', frost: true })),
    ...[[-330, -104, 3.2], [-402, -50, 2.8], [-216, -138, 2.2], [-276, 44, 2.4]].map(([u, v, s], i) => ({ model: 'obsidian', ...xz(u, v), s, ry: i * 1.3, radius: s * 0.4, tint: '#8fcaf4', frost: true })),
    ...[[-248, -62, 3.2], [-286, 96, 3.6], [-236, 64, 3.0], [-200, -32, 2.6]].map(([u, v, s], i) => ({ model: 'basalt', ...xz(u, v), s, ry: i * 2.1, radius: s * 0.5, tint: '#8aa6c4' })),
    { model: 'firePit', ...xz(-263, 170), s: 1.3, ry: 0.4, radius: 0 },
    { model: 'snowLogs', ...xz(-275, 169), s: 1.4, ry: 1.2, radius: 1.1 },
    { model: 'iceAxe', ...xz(-262, 163), s: 2.2, ry: 2.2, radius: 0 },
  ],
  // the deep purple glow of the Crystal Heart, seen from the balcony (W4:
  // and the abyss glowing far below, world/heart.js the heart itself)
  glows: [
    { ...xz(0, -212), y: H(-86), color: '#b06bff', size: 60, light: 0 },
    { ...xz(-50, -150), y: H(-128), color: '#8f5bff', size: 46, light: 0 },
    { ...xz(60, -270), y: H(-128), color: '#c78cff', size: 50, light: 0 },
    { ...xz(-60, -270), y: H(-130), color: '#7a4cff', size: 44, light: 0 },
    { ...xz(60, -150), y: H(-130), color: '#a96bff', size: 40, light: 0 },
  ],
  // light falling through cracks in the ceiling (the sinkhole's is the big one)
  shafts: [
    { ...xz(-44, 392), r: 6, top: H(34), color: '#fff2c8', strength: 0.3 },
    { ...xz(-110, 290), r: 3, top: H(18), color: '#d8f3c0', strength: 0.2 },
    { ...xz(60, 210), r: 3.5, top: H(10), color: '#d8f3c0', strength: 0.2 },
    { ...xz(-150, 140), r: 3, top: H(4), color: '#cfeee0', strength: 0.2 },
    { ...xz(150, 8), r: 5, top: H(0), color: '#fff0c0', strength: 0.18 },
    { ...xz(-40, 20), r: 3.5, top: H(2), color: '#ffe6b0', strength: 0.2 },
    // W3: pale light through the ice far above the lake
    { ...xz(-345, 30), r: 7, top: H(-20), color: '#d8f0ff', strength: 0.14 },
    { ...xz(-262, -40), r: 4, top: H(-12), color: '#e0f4ff', strength: 0.18 },
  ],
  // the rails the mine carts ran on (looks; the shortcut's runs over the trestle)
  rails: [
    poly([[192, 146], [176, 132], [158, 130], [151, 122], [150, 96], [150, 60], [140, 30], [118, 6], [94, 2], [36, 2], [18, 0]]),
  ],
};

function xz(u, v) { const [x, z] = M(u, v); return { x, z }; }
function xzo(u, v, du, dv) { const [x, z] = Mo(u, v, du, dv); return { x, z }; }
function xza(u, v, du, dv) { const [x, z] = Ma(u, v, du, dv); return { x, z }; }
