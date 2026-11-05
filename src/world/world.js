// The big underground world as plain data plus one height function, the way
// Scary Island's map.js works (tasks/20261102-world-redesign-todo.md §3): the
// terrain mesh, the colliders, the walkable grid (world/navGrid.js), the
// minimap and the layout all ask the same pure functions. No three.js here,
// so it is all testable.
//
// Coordinates: metres, X east, Z south, Y up; the cave entrance is +0 m and
// the world goes down from there. A world definition (see worlds/test.js):
//   bounds   [x0, z0, x1, z1]: the grid the world is built on
//   base     { level, material }: the floor wherever nothing else says
//   wall     { outline, wobble, band, top, low }: the cave's outer wall. Out
//            of the outline the rock rises over `band` m to `top` (absolute
//            y); on the camera's side (+x +z) it stays near `low` so it never
//            hides the cave from the lens. Never walkable.
//   terraces [{ id, name, level, outline, wobble, cliff, smooth, walkable,
//            material }]: a plateau (or a pit) at `level` with an organic
//            outline. Its edge is a cliff `cliff` m wide (a near vertical
//            drop with a ledge or two in it), or a gentle bank when `smooth`.
//            Later terraces stand on earlier ones. `walkable: false`: a
//            chasm floor (nobody walks down there).
//   ramps    [{ id, pts, width, skirt }]: a walkable slope along a polyline;
//            it starts and ends at whatever height the terrain has there, so
//            it always joins its two levels (≤ MAX_SLOPE, checked in tests).
//   bridges  [{ id, a, b, width, model }]: a deck from a to b at the heights
//            of the ground at both ends, over a gap (a second walkable layer:
//            the ground under it may be walkable too).
//   water    [{ id, level, circle | outline, wobble }]: a lake surface;
//            anything deeper than a paw under it is not walkable.
//   regions  { id: { name, level } }: names for the terraces (and `base`).
//   W1 (worlds/main.js):
//   base     { walkable: false, rough }: solid rock wherever no terrace
//            hollows it out (its top bumpy by `rough` m), so regions are
//            carved hollows and the rock between them keeps them apart
//   areas    [{ id, name, region, outline | circle }]: named places for the
//            HUD and the map (`areaAt`, first match wins)
//   gates    [{ id, at, dir, width, kind }]: a barrier across a passage
//            (`dir`: the way through); `gateBlocks(g, x, z)` says which
//            ground it shuts, so paths and tests treat a closed one as rock
//   W4:
//   islands  [{ id, at, r, y, region }]: a floating rock (the Crystal Heart's
//            stepping stones): a round flat deck at `y` over whatever lies
//            below (the deck layer, like a bridge's: the abyss under it is
//            not ground). Only jump links (navGrid `hops`) reach most of them.
//   bridges  `y`: a deck at that height at both ends (one end on an island,
//            where the ground far below would say nothing)

export const CELL = 1; // m: one walkable-grid cell and one terrain vertex
export const MAX_SLOPE = 30; // ° a ramp may climb (kids' camera: gentle)
export const WALK_SLOPE = 34; // ° the steepest ground still walkable
export const STEP = 0.9; // m of rise between neighbouring cells on one walk
export const CLEARANCE = 2.2; // m of headroom under a bridge deck for ground to count
// W3: how slippery each kind of ground is (0 sure-footed … 1 bare ice): the
// hero (player/movement.js slideVelocity) and the animals keep sliding on it,
// and the paths walk it a little reluctantly (SLIP_COST per step)
export const SLIP = { ice: 1 };
export const SLIP_COST = 0.35;

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp01 = (t) => Math.min(1, Math.max(0, t));

// Cheap deterministic value noise (the same as Island's map.js).
function hash(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x, z) => noise(x, z) * 0.5 + noise(x * 2.1 + 17, z * 2.1) * 0.3 + noise(x * 4.3, z * 4.3 + 5) * 0.2;

export function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp01(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

// Signed distance to a closed polygon: < 0 inside, > 0 outside.
export function polygonSd(px, pz, pts) {
  let d = Infinity, inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, az] = pts[j], [bx, bz] = pts[i];
    d = Math.min(d, distToSegment(px, pz, ax, az, bx, bz));
    if ((bz > pz) !== (az > pz) && px < ((ax - bx) * (pz - bz)) / (az - bz) + bx) inside = !inside;
  }
  return inside ? -d : d;
}

// Nearest point on a polyline: distance and how far along it (0..1 by length).
export function alongPolyline(px, pz, pts) {
  let best = Infinity, at = 0, run = 0, total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    const t = clamp01(((px - ax) * dx + (pz - az) * dz) / (len * len || 1));
    const d = Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
    if (d < best) { best = d; at = (run + t * len) / (total || 1); }
    run += len;
  }
  return { d: best, t: at, length: total };
}

// Like alongPolyline, but how far along is blended between the legs within
// `reach` of the point (weights fall to 0 at `reach`), so the height along a
// bent ramp has no seam on the inside of its turns.
export function blendAlong(px, pz, pts, reach) {
  let best = Infinity, run = 0, total = 0, wsum = 0, tsum = 0;
  for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    const t = clamp01(((px - ax) * dx + (pz - az) * dz) / (len * len || 1));
    const d = Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
    best = Math.min(best, d);
    const w = Math.max(0, reach - d) ** 2;
    wsum += w; tsum += w * (run + t * len);
    run += len;
  }
  return { d: best, t: wsum > 0 ? tsum / wsum / (total || 1) : 0, length: total };
}

// W2: the same, fast, for a shape asked about ~500k times (world.sample()):
// its segments packed once with their boxes; a segment whose box is further
// than the nearest found so far (or than `cap`) is not measured. Past `cap`
// the distance comes back as ±cap (only the sign is exact there).
function segsOf(pts) {
  const n = pts.length, s = new Float64Array(n * 8);
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [ax, az] = pts[j], [bx, bz] = pts[i], o = i * 8;
    s[o] = ax; s[o + 1] = az; s[o + 2] = bx; s[o + 3] = bz;
    s[o + 4] = Math.min(ax, bx); s[o + 5] = Math.min(az, bz); s[o + 6] = Math.max(ax, bx); s[o + 7] = Math.max(az, bz);
  }
  return s;
}
function fastPolygonSd(px, pz, segs, cap) {
  let best = cap * cap, inside = false;
  for (let o = 0; o < segs.length; o += 8) {
    const ax = segs[o], az = segs[o + 1], bx = segs[o + 2], bz = segs[o + 3];
    if ((bz > pz) !== (az > pz) && px < ((ax - bx) * (pz - bz)) / (az - bz) + bx) inside = !inside;
    const ex = px < segs[o + 4] ? segs[o + 4] - px : px > segs[o + 6] ? px - segs[o + 6] : 0;
    const ez = pz < segs[o + 5] ? segs[o + 5] - pz : pz > segs[o + 7] ? pz - segs[o + 7] : 0;
    if (ex * ex + ez * ez >= best) continue;
    const dx = bx - ax, dz = bz - az;
    const t = clamp01(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1));
    const qx = px - (ax + dx * t), qz = pz - (az + dz * t), d2 = qx * qx + qz * qz;
    if (d2 < best) best = d2;
  }
  const d = Math.sqrt(best);
  return inside ? -d : d;
}

// A shape's signed distance with its organic wobble (< 0 inside). `far`:
// past this distance either way the exact value does not matter (the noise
// is skipped there: most of a big world is far from any edge).
function shapeSd(x, z, s, far = Infinity) {
  const cap = far === Infinity ? Infinity : far + (s.wobble ?? 0) + 1;
  const raw = s.circle ? Math.hypot(x - s.circle[0], z - s.circle[1]) - s.circle[2] : fastPolygonSd(x, z, s.segs ??= segsOf(s.outline), cap);
  const w = s.wobble ?? 0;
  if (!w || Math.abs(raw) > far + w) return raw;
  return raw + (fbm(x * 0.07 + (s.seed ?? 0), z * 0.07) - 0.5) * 2 * w;
}

// A shape's box (with its wobble and `pad`), for a cheap first test.
function shapeBox(s, pad = 0) {
  const w = (s.wobble ?? 0) + pad;
  if (s.circle) { const [x, z, r] = s.circle; return [x - r - w, z - r - w, x + r + w, z + r + w]; }
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of s.outline) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  return [x0 - w, z0 - w, x1 + w, z1 + w];
}
const inBox = (b, x, z) => x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3];

// Does a gate ({ at, dir, width, depth }) shut the ground at (x, z)? A
// slab `width` m across the passage and `depth` m along it.
export function gateBlocks(g, x, z) {
  const [dx, dz] = g.dir, l = Math.hypot(dx, dz) || 1;
  const rx = x - g.at[0], rz = z - g.at[1];
  const along = (rx * dx + rz * dz) / l, across = (rx * -dz + rz * dx) / l;
  return Math.abs(along) <= (g.depth ?? 1.6) / 2 && Math.abs(across) <= g.width / 2;
}

// How far up a cliff band of width 1 the ground has risen, 0..1: near
// vertical risers with a ledge or two between them (strata), the ledges
// wandering a little along the cliff.
function cliffProfile(t, x, z) {
  const u = clamp01(t + (noise(x * 0.11 + 3, z * 0.11) - 0.5) * 0.35);
  const steps = 3, k = u * steps, i = Math.min(steps - 1, Math.floor(k));
  return clamp01((i + smoothstep(0.55, 1, k - i)) / steps);
}

export function createWorld(def) {
  const terraces = def.terraces ?? [];
  const ramps = (def.ramps ?? []).map((r) => ({ skirt: 3, ...r }));
  const bridges = def.bridges ?? [];
  const islands = def.islands ?? [];
  const water = def.water ?? [];
  const areas = def.areas ?? [];
  const gates = def.gates ?? [];
  const wall = def.wall;
  // (W1: a 700 m world has dozens of shapes; each is only asked where its box is)
  for (const t of terraces) t.box ??= shapeBox(t);
  for (const w of water) w.box ??= shapeBox(w);
  for (const a of areas) a.box ??= shapeBox(a);
  const [bx0, bz0, bx1, bz1] = def.bounds;
  const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;

  // the terraces and the wall, before any ramp: { h, top, face }
  // `top`: the terrace that owns this ground, `face`: on a cliff face (a
  // riser or one of its narrow ledges), never walkable
  const rough = def.base.rough ?? 0;
  function terrain(x, z) {
    let h = def.base.level + (rough ? (fbm(x * 0.045 + 31, z * 0.045) - 0.5) * 2 * rough : 0), top = null, face = false;
    for (const t of terraces) {
      if (!inBox(t.box, x, z)) continue;
      const w = t.cliff ?? 4;
      const s = -shapeSd(x, z, t, w + 1);
      if (s <= 0) continue;
      const k = t.smooth ? smoothstep(0, 1, s / w) : s >= w ? 1 : cliffProfile(s / w, x, z);
      if (k <= 0.02) continue;
      const drop = Math.abs(t.level - h);
      h += (t.level - h) * k;
      if (k >= 0.98) { top = t; face = false; } else {
        // (a terrace at the level already there, a pass into a hollow, joins it seamlessly)
        face = !t.smooth && drop > 0.6;
        if (k > 0.5 || drop <= 0.6) top = t;
      }
    }
    if (wall) {
      // (exact out to where the wall's crest stops depending on it)
      const s = shapeSd(x, z, wall, (wall.band ?? 6) + 40);
      if (s > 0) {
        h += (wallTop(x, z, s) - h) * cliffProfile(Math.min(1, s / (wall.band ?? 6)), x, z);
        top = WALL;
        face = true;
      }
    }
    return { h, top, face };
  }
  // the outer wall's crest: tall behind the cave, low on the camera's side
  // (the lens looks down toward −x −z from +x +z)
  function wallTop(x, z, s) {
    const dx = x - cx, dz = z - cz, r = Math.hypot(dx, dz) || 1;
    const cam = smoothstep(0.15, 0.75, (dx + dz) / (r * Math.SQRT2));
    const tall = wall.top + (fbm(x * 0.05, z * 0.05) - 0.5) * 10;
    const low = (wall.low ?? wall.top) + Math.max(0, s - (wall.band ?? 6)) * 0.5;
    return tall + (Math.min(tall, low) - tall) * cam;
  }
  const WALL = { id: 'wall', walkable: false };

  // the ends of each ramp and bridge sit on the terrain as it is there
  for (const r of ramps) {
    r.box = shapeBox({ outline: r.pts }, r.width / 2 + r.skirt + 1.5);
    r.y0 = terrain(...r.pts[0]).h;
    r.y1 = terrain(...r.pts.at(-1)).h;
    r.length = alongPolyline(r.pts[0][0], r.pts[0][1], r.pts).length;
  }

  function heightAt(x, z) { return ground(x, z).h; }
  // terrain + ramps: { h, top, face, ramp }
  function ground(x, z) {
    const g = terrain(x, z);
    for (const r of ramps) {
      if (!inBox(r.box, x, z)) continue;
      const half = r.width / 2;
      const { d, t } = blendAlong(x, z, r.pts, half + r.skirt + 1);
      if (d > half + r.skirt) continue;
      const ry = r.y0 + (r.y1 - r.y0) * t;
      if (d <= half) { g.h = ry; g.ramp = r; g.face = false; continue; }
      // the skirt: an embankment down to lower ground beside the ramp
      if (g.h < ry) g.h = ry + (g.h - ry) * smoothstep(half, half + r.skirt, d);
    }
    return g;
  }

  for (const b of bridges) {
    b.y0 = b.y ?? heightAt(...b.a);
    b.y1 = b.y ?? heightAt(...b.b);
    b.length = Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]);
  }
  // the bridge deck (or W4: the floating island) over (x, z), if any: its height
  function deckAt(x, z) {
    for (const s of islands) if (Math.hypot(x - s.at[0], z - s.at[1]) <= s.r) return { y: s.y, island: s };
    for (const b of bridges) {
      const dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1];
      const t = ((x - b.a[0]) * dx + (z - b.a[1]) * dz) / (b.length * b.length);
      if (t < 0 || t > 1) continue;
      const side = Math.abs(((x - b.a[0]) * dz - (z - b.a[1]) * dx) / b.length);
      if (side <= b.width / 2) return { y: b.y0 + (b.y1 - b.y0) * t, bridge: b };
    }
    return null;
  }

  function waterAt(x, z) {
    for (const w of water) if (inBox(w.box, x, z) && shapeSd(x, z, w, 0) < 0) return w;
    return null;
  }

  function slopeAt(x, z, e = 0.5) {
    const hx = heightAt(x + e, z) - heightAt(x - e, z);
    const hz = heightAt(x, z + e) - heightAt(x, z - e);
    return Math.atan(Math.hypot(hx, hz) / (2 * e)) * (180 / Math.PI);
  }

  // Can a paw stand on the ground at (x, z)? (The ground layer only; a bridge
  // deck is always walkable.) Not in the wall, not on a chasm floor, not
  // under water, not on a cliff face.
  function walkable(x, z) {
    if (x < bx0 || x > bx1 || z < bz0 || z > bz1) return false;
    const g = ground(x, z);
    // (a ramp's own surface is walkable even where it cuts through rock)
    if (!g.ramp && g.top && g.top.walkable === false) return false;
    if (!g.top && !g.ramp && def.base.walkable === false) return false;
    if (g.face) return false;
    const w = waterAt(x, z);
    if (w && g.h < w.level - 0.1) return false;
    return slopeAt(x, z) <= WALK_SLOPE;
  }

  // The walkable surfaces at (x, z), lowest first: [{ y, kind }]
  function surfaces(x, z) {
    const out = [];
    const h = heightAt(x, z);
    if (walkable(x, z)) out.push({ y: h, kind: 'ground' });
    const d = deckAt(x, z);
    if (d) {
      if (out.length && h > d.y - CLEARANCE) out.pop(); // the deck itself, not ground under it
      out.push({ y: d.y, kind: 'bridge', bridge: d.bridge });
    }
    return out;
  }
  // The surface nearest `y` (or the top one), as G.groundAt wants it.
  function groundAt(x, z, y) {
    const s = surfaces(x, z);
    const d = deckAt(x, z);
    if (!s.length) return d ? Math.max(d.y, heightAt(x, z)) : heightAt(x, z);
    if (y === undefined) return s.at(-1).y;
    return s.reduce((a, b) => (Math.abs(b.y - y) < Math.abs(a.y - y) ? b : a)).y;
  }

  // Which named region the ground belongs to (the terrace it stands on).
  function regionAt(x, z) {
    const g = ground(x, z);
    const d = deckAt(x, z);
    if (d) return (d.bridge ?? d.island).region ?? g.top?.id ?? 'base';
    if (g.ramp) return g.ramp.region ?? 'base';
    return g.top?.id ?? 'base';
  }
  // The level (the named height) of the ground there.
  function levelAt(x, z) {
    const g = ground(x, z);
    return g.top?.level ?? def.base.level;
  }

  // The whole world on the CELL grid, once: the terrain mesh, the colliders
  // and the walkable grid all read this (one height per vertex, so the feet,
  // the drawn ground and the paths agree exactly).
  //   h: ground height, deck: bridge deck height (NaN: none; where a deck
  //   runs, it is the walkable layer, and ground under it only with headroom), open: 1 where
  //   the ground could be stood on (before the slope check), water: surface
  //   level (NaN: dry)
  let grid = null;
  function sample() {
    if (grid) return grid;
    const W = Math.round((bx1 - bx0) / CELL) + 1, D = Math.round((bz1 - bz0) / CELL) + 1;
    const h = new Float32Array(W * D), deck = new Float32Array(W * D).fill(NaN), water = new Float32Array(W * D).fill(NaN);
    const open = new Uint8Array(W * D), region = new Uint8Array(W * D);
    const ids = ['base', ...terraces.map((t) => t.id), 'wall', ...ramps.map((r) => r.id)];
    for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
      const x = bx0 + i * CELL, z = bz0 + j * CELL, k = j * W + i;
      const g = ground(x, z);
      h[k] = g.h;
      region[k] = Math.max(0, ids.indexOf(g.ramp?.id ?? g.top?.id ?? 'base'));
      const w = waterAt(x, z);
      if (w) water[k] = w.level;
      const rock = !g.top && !g.ramp && def.base.walkable === false;
      open[k] = !g.face && !rock && (g.ramp || g.top?.walkable !== false) && !(w && g.h < w.level - 0.1) ? 1 : 0;
      const d = deckAt(x, z);
      if (d) deck[k] = d.y;
    }
    grid = { W, D, x0: bx0, z0: bz0, cell: CELL, h, deck, open, water, region, ids };
    return grid;
  }
  // W2: a grid sampled elsewhere (world/sampleWorker.js, off the main thread
  // while the models load), the same numbers sample() would give
  function useSample(g) {
    if (g && g.W === Math.round((bx1 - bx0) / CELL) + 1 && g.D === Math.round((bz1 - bz0) / CELL) + 1) grid = g;
    return !!grid;
  }

  // W3: how slippery the ground at (x, z) is (its terrace's material, SLIP),
  // read off the sampled grid (cheap: asked every physics step)
  let slipOf = null;
  function slipAt(x, z) {
    const g = sample();
    const i = Math.round((x - bx0) / CELL), j = Math.round((z - bz0) / CELL);
    if (i < 0 || j < 0 || i >= g.W || j >= g.D) return 0;
    slipOf ??= Float32Array.from(g.ids, (id) => SLIP[terraces.find((t) => t.id === id)?.material] ?? 0);
    return slipOf[g.region[j * g.W + i]];
  }

  // W6: the ground's height as the terrain mesh draws it: the sampled grid's
  // two triangles a square, split along the diagonal that follows the ground
  // best (terrain.js chunkMesh); cheap enough to ask a few hundred times a
  // frame (the hero's ring lies on it)
  function heightOnGrid(x, z) {
    const g = sample();
    const fi = Math.min(g.W - 1.001, Math.max(0, (x - bx0) / CELL)), fj = Math.min(g.D - 1.001, Math.max(0, (z - bz0) / CELL));
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, k = j * g.W + i;
    const a = g.h[k], b = g.h[k + 1], c = g.h[k + g.W], d = g.h[k + g.W + 1];
    if (Math.abs(a - d) < Math.abs(b - c)) return v >= u ? a + (d - c) * u + (c - a) * v : a + (b - a) * u + (d - b) * v;
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }

  // W1: the named place at (x, z) (worlds/main.js `areas`), or null
  function areaAt(x, z) {
    for (const a of areas) if (inBox(a.box, x, z) && shapeSd(x, z, a, 0) < 0) return a;
    return null;
  }

  return {
    def, bounds: def.bounds, terraces, ramps, bridges, islands, water, areas, gates,
    terrain, ground, heightAt, deckAt, waterAt, slopeAt, walkable, surfaces, groundAt, regionAt, levelAt, sample, useSample, areaAt, slipAt, heightOnGrid,
    gate: (id) => gates.find((g) => g.id === id) ?? null,
    region: (id) => def.regions?.[id] ?? null,
  };
}
