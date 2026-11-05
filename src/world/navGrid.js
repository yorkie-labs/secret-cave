import { STEP, WALK_SLOPE, CLEARANCE } from './world.js';

// Where a paw can go in a height world (world/world.js), and how to get
// there: the CELL grid with up to two walkable layers per cell (the ground,
// and a bridge deck over it), split into connected pieces once, with A* on
// typed arrays. Pure: no three.js, no Rapier (props that stand in the way
// come in through `blocked`), so tests run it on the real worlds.
//
// The rules:
// - ground is walkable where the world says it may be (not a cliff face, a
//   chasm floor, the wall or under water) and no steeper than WALK_SLOPE to
//   any neighbour; a bridge deck always is
// - a step to a neighbouring cell (8 ways, no corner cutting) changes height
//   by at most STEP, so levels only meet where a ramp or a bridge joins them:
//   nobody walks off a cliff or up one
// - a step between the ground and a bridge deck (another layer) must be
//   nearly level (LAYER_STEP): onto a bridge only at its ends, never up the
//   side of its sloping slab
// - pieces smaller than MIN_PIECE cells (a ledge in a cliff) are dropped
// - every edge between a walkable cell and one it may not step to is an
//   `edge`: the terrain builder stands an invisible wall there, so the hero
//   is never on ground the paths do not know (kids don't fall off cliffs)
// W2: a world may also have jump links (`def.bounces`: a bounce mushroom's
// pad throws the walker to its landing, one way). They are not ground: the
// pieces and the invisible walls ignore them; a search that asks for them
// (`jumps: true`, the hero's clicks) may step from the pad's node straight to
// the landing's, at the cost of the flight. The pad and the landing stay in
// the path, so a walker following it steps onto the pad.
// W4: `def.hops` (the Crystal Heart's stepping stones: a hop from one
// floating rock to the next) are jump links of the same kind, each one way
// (a pair for the two ways). A floating rock is a piece of its own, so a
// search with jumps looks for its goal in every piece the jumps join
// (`group`), and `jumpOk(id)` may close a link for now (a sealed arena).
export const MIN_PIECE = 40;
export const BLOCK = 8; // cells: one square of the coarse map
export const LAYER_STEP = 0.35; // m: the most a step from ground to deck (or back) may rise
const FAR = 40; // m: paths longer than this use the coarse map first
const SPAN = 48; // nodes: the longest straight leg smoothing tries
const NONE = -1;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function buildNavGrid(world) {
  const g = world.sample();
  const { W, D, x0, z0, cell } = g;
  const N = W * D;
  const maxRise = Math.tan((WALK_SLOPE * Math.PI) / 180) * cell;
  // node = cell * 2 + layer (0 ground, 1 bridge deck)
  const y = new Float32Array(N * 2).fill(NaN);
  for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    if (!Number.isNaN(g.deck[k])) y[k * 2 + 1] = g.deck[k];
    if (!g.open[k] || g.h[k] > g.deck[k] - CLEARANCE || i === 0 || j === 0 || i === W - 1 || j === D - 1) continue;
    const h = g.h[k];
    // as steep as its steepest side: a cell on a cliff's lip is not walkable,
    // so the hero stays a step back from the edge
    let steep = 0;
    for (const [di, dj] of DIRS.slice(0, 4)) steep = Math.max(steep, Math.abs(g.h[k + dj * W + di] - h));
    if (steep <= maxRise) y[k * 2] = h;
  }
  const ok = (n) => !Number.isNaN(y[n]);
  const jumpsFrom = new Map(); // pad node -> [{ to, cost, id }] (W2, filled below)

  // the node on cell (i, j) a walker at height `fromY` (on layer `from`,
  // 0 ground, 1 deck; -1: either) can step onto
  function stepTo(i, j, fromY, from = -1) {
    if (i < 0 || j < 0 || i >= W || j >= D) return NONE;
    const k = (j * W + i) * 2;
    let best = NONE, bd = STEP + 1e-6;
    for (let l = 0; l < 2; l++) {
      const d = Math.abs(y[k + l] - fromY);
      if (from >= 0 && l !== from && d > LAYER_STEP) continue;
      if (d <= bd) { bd = d; best = k + l; } // (NaN never is)
    }
    return best;
  }
  // every node a walker on `n` may move to: [node, dist] (and with `jumps`,
  // the landings of the bounce pads on n)
  function neighbours(n, out, jumps = false) {
    out.length = 0;
    if (jumps && jumpsFrom.has(n)) for (const j of jumpsFrom.get(n)) if (jumps === true || jumps(j.id)) out.push(j.to, j.cost);
    const c = n >> 1, i = c % W, j = (c / W) | 0, fy = y[n], fl = n & 1;
    for (let d = 0; d < 8; d++) {
      const [di, dj] = DIRS[d];
      const m = stepTo(i + di, j + dj, fy, fl);
      if (m === NONE) continue;
      if (di && dj && (stepTo(i + di, j, fy, fl) === NONE || stepTo(i, j + dj, fy, fl) === NONE)) continue;
      out.push(m, di && dj ? Math.SQRT2 : 1);
    }
    return out;
  }

  // connected pieces (flood fill), small ones dropped
  const piece = new Int32Array(N * 2).fill(NONE);
  const sizes = [];
  {
    const stack = [], nb = [];
    for (let n = 0; n < N * 2; n++) {
      if (!ok(n) || piece[n] !== NONE) continue;
      const id = sizes.length, members = [n];
      piece[n] = id; stack.push(n);
      while (stack.length) {
        const cur = stack.pop();
        neighbours(cur, nb);
        for (let q = 0; q < nb.length; q += 2) {
          const m = nb[q];
          if (piece[m] === NONE) { piece[m] = id; stack.push(m); members.push(m); }
        }
      }
      sizes.push(members.length);
      if (members.length < MIN_PIECE) for (const m of members) { y[m] = NaN; piece[m] = NONE; }
    }
  }

  const toI = (x) => Math.round((x - x0) / cell), toJ = (z) => Math.round((z - z0) / cell);
  const posOf = (n) => { const c = n >> 1; return { x: x0 + (c % W) * cell, y: y[n], z: z0 + ((c / W) | 0) * cell }; };

  // The walkable node nearest a point (rings outward up to maxR cells);
  // `inPiece`: only in that connected piece. Height counts a little, so a
  // click on a bridge means the deck and one under it the ground.
  function nearest(p, maxR = 4, inPiece = NONE, blocked = null) {
    const ci = toI(p.x), cj = toJ(p.z);
    let best = NONE, bd = Infinity;
    for (let r = 0; r <= maxR; r++) {
      if (best !== NONE && r > bd + 1) break;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= W || j >= D) continue;
        for (let l = 0; l < 2; l++) {
          const n = (j * W + i) * 2 + l;
          if (!ok(n) || (typeof inPiece === 'function' ? !inPiece(n) : inPiece !== NONE && piece[n] !== inPiece) || blocked?.(n)) continue;
          const d = Math.hypot(di, dj) + (p.y === undefined || Number.isNaN(p.y) ? 0 : Math.abs(y[n] - p.y) * 0.5);
          if (d < bd) { bd = d; best = n; }
        }
      }
    }
    return best;
  }

  // A* from node `s` to node `t` (typed arrays, a binary heap; a generation
  // stamp instead of clearing). `costAt(n)`: extra cost of stepping on n
  // (a poison puddle); `blocked(n)`: a prop stands there.
  const gScore = new Float32Array(N * 2), came = new Int32Array(N * 2), seen = new Uint32Array(N * 2), shut = new Uint32Array(N * 2);
  let stamp = 0;
  const heapN = [], heapF = [];
  const hpush = (n, f) => {
    let i = heapN.length;
    heapN.push(n); heapF.push(f);
    while (i > 0) { const p = (i - 1) >> 1; if (heapF[p] <= f) break; heapN[i] = heapN[p]; heapF[i] = heapF[p]; i = p; }
    heapN[i] = n; heapF[i] = f;
  };
  const hpop = () => {
    const top = heapN[0], ln = heapN.pop(), lf = heapF.pop();
    if (heapN.length) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i, mf = lf;
        if (l < heapN.length && heapF[l] < mf) { m = l; mf = heapF[l]; }
        if (r < heapN.length && heapF[r] < mf) { m = r; mf = heapF[r]; }
        if (m === i) break;
        heapN[i] = heapN[m]; heapF[i] = heapF[m]; i = m;
      }
      heapN[i] = ln; heapF[i] = lf;
    }
    return top;
  };
  function astar(s, goal, { costAt, blocked, allowed, maxNodes = 400000, near = 0, weight = 1.6, jumps = false, jumpOk = null } = {}) {
    const via = jumps && jumpOk ? jumpOk : jumps;
    stamp++;
    heapN.length = 0; heapF.length = 0;
    const gp = posOf(goal);
    const gi = (gp.x - x0) / cell, gj = (gp.z - z0) / cell;
    const hOf = (n) => { const c = n >> 1, di = (c % W) - gi, dj = ((c / W) | 0) - gj; return Math.sqrt(di * di + dj * dj) * cell; };
    gScore[s] = 0; came[s] = NONE; seen[s] = stamp;
    hpush(s, hOf(s) * weight);
    let visited = 0, best = s, bestH = Infinity;
    const nb = [];
    while (heapN.length && visited < maxNodes) {
      const cur = hpop();
      if (shut[cur] === stamp) continue;
      shut[cur] = stamp;
      visited++;
      const hc = hOf(cur);
      if (hc < bestH) { bestH = hc; best = cur; }
      if (cur === goal || (hc <= near && Math.abs(y[cur] - gp.y) < 2)) return { end: cur, visited };
      neighbours(cur, nb, via);
      for (let q = 0; q < nb.length; q += 2) {
        const m = nb[q];
        if (shut[m] === stamp || (allowed && !allowed(m)) || blocked?.(m)) continue;
        const cost = gScore[cur] + nb[q + 1] + Math.abs(y[m] - y[cur]) * 0.5 + (costAt?.(m) ?? 0);
        if (seen[m] === stamp && cost >= gScore[m]) continue;
        seen[m] = stamp; gScore[m] = cost; came[m] = cur;
        hpush(m, cost + hOf(m) * weight);
      }
    }
    return { end: best, visited, partial: true };
  }
  const rebuild = (end) => { const out = []; for (let n = end; n !== NONE; n = came[n]) out.push(n); return out.reverse(); };

  // Walk the straight line from node a toward the point `to` cell by cell,
  // keeping to steps a paw can take; returns the last node reached (and
  // whether it got all the way). `strict`: stop at costly or blocked cells.
  // W2: the line is a walker's width (FAT m either side must be ground on the
  // same surface too), so a smoothed path keeps off the lip of a ramp's cut,
  // where a step aside leads up onto other ground the path does not follow.
  const FAT = 0.7;
  // (W3: only a cost of a whole step or more, a poison puddle, breaks a
  // straight line; the ice's little extra cost does not)
  function walkLine(a, tx, tz, { costAt: cost, blocked, strict = true } = {}) {
    const costAt = cost && ((n) => cost(n) >= 1);
    const pa = posOf(a);
    const d = Math.hypot(tx - pa.x, tz - pa.z);
    const n = Math.max(1, Math.ceil(d * 2 / cell));
    const sx = d ? -(tz - pa.z) / d * FAT : 0, sz = d ? (tx - pa.x) / d * FAT : 0;
    let cur = a;
    const costly = costAt?.(a);
    for (let s = 1; s <= n; s++) {
      const t = s / n;
      const lx = pa.x + (tx - pa.x) * t, lz = pa.z + (tz - pa.z) * t;
      if (strict && s < n && (stepTo(toI(lx + sx), toJ(lz + sz), y[cur], cur & 1) === NONE || stepTo(toI(lx - sx), toJ(lz - sz), y[cur], cur & 1) === NONE)) return { end: cur, full: false };
      const i = toI(lx), j = toJ(lz);
      if (((cur >> 1) % W) === i && (((cur >> 1) / W) | 0) === j) continue;
      const m = stepTo(i, j, y[cur], cur & 1);
      if (m === NONE || blocked?.(m) || (strict && costAt?.(m) && !costly)) return { end: cur, full: false };
      // no squeezing diagonally past a corner
      const ci = (cur >> 1) % W, cj = ((cur >> 1) / W) | 0;
      if (i !== ci && j !== cj && (stepTo(i, cj, y[cur], cur & 1) === NONE || stepTo(ci, j, y[cur], cur & 1) === NONE)) return { end: cur, full: false };
      cur = m;
    }
    return { end: cur, full: true };
  }

  // string-pulling: keep a node only where the straight line breaks
  function smoothPath(nodes, opts) {
    if (nodes.length <= 2) return nodes;
    const out = [nodes[0]];
    let anchor = nodes[0];
    let from = 0;
    for (let q = 2; q < nodes.length; q++) {
      const p = posOf(nodes[q]);
      // (a straight stretch is cut every SPAN nodes: smoothing stays linear)
      const w = q - from > SPAN ? null : walkLine(anchor, p.x, p.z, opts);
      if (!w || !w.full || w.end !== nodes[q]) { anchor = nodes[q - 1]; from = q - 1; out.push(anchor); }
    }
    out.push(nodes.at(-1));
    return out;
  }

  // A path of points from `from` toward `to`. A goal another piece of the
  // world (a lower level only a ramp reaches is the same piece; a chasm
  // floor, the lake or a cut-off plateau is not) is swapped for the nearest
  // spot the walker can reach, and the path says `partial`.
  function findPath(from, to, { near = 0.5, costAt, blocked, maxR = 60, jumps = false, jumpOk = null } = {}) {
    const s = nearest(from, 2, NONE, blocked);
    if (s === NONE) return null;
    // (W4: with jumps, any piece the jumps join to the walker's is in reach)
    const mine = jumps ? ((g) => (n) => group[piece[n]] === g)(group[piece[s]]) : piece[s];
    let goal = nearest(to, Math.max(2, Math.ceil(near)), mine, blocked);
    let partial = false;
    if (goal === NONE) { goal = nearest({ x: to.x, z: to.z }, maxR, mine, blocked); partial = true; }
    if (goal === NONE) return null;
    // far away: first the coarse map picks a corridor, then the fine search
    // stays in it (it falls back to the whole grid if props block it)
    const opts = { costAt, blocked, near: Math.max(near, 0.75), jumps, jumpOk };
    const sp = posOf(s), gp = posOf(goal);
    let res = null;
    if (Math.hypot(sp.x - gp.x, sp.z - gp.z) > FAR) {
      const allowed = corridor(s, goal, jumps && (jumpOk ?? true));
      if (allowed) { res = astar(s, goal, { ...opts, allowed }); if (res.partial) res = null; }
    }
    res ??= astar(s, goal, opts);
    const nodes = smoothPath(rebuild(res.end), { costAt, blocked });
    // (a landing reached by a jump says so: the walker bounces there from the point before)
    const points = nodes.map((n, i) => (i && jumpsFrom.get(nodes[i - 1])?.some((j) => j.to === n) ? { ...posOf(n), jump: jumpsFrom.get(nodes[i - 1]).find((j) => j.to === n).id } : posOf(n)));
    return { points, partial: partial || !!res.partial, visited: res.visited };
  }

  // As far as the ground lets a paw go straight from `from` toward `to`.
  function lineReach(from, to, { blocked } = {}) {
    const s = nearest(from, 1, NONE, blocked);
    if (s === NONE) return null;
    const pa = posOf(s);
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    let last = null, cur = s;
    for (let t = 0.5; t <= d; t += 0.5) {
      const x = from.x + ((to.x - from.x) * t) / d, z = from.z + ((to.z - from.z) * t) / d;
      const m = toI(x) === ((cur >> 1) % W) && toJ(z) === (((cur >> 1) / W) | 0) ? cur : stepTo(toI(x), toJ(z), y[cur], cur & 1);
      if (m === NONE || blocked?.(m)) break;
      cur = m;
      last = { x, y: y[m], z };
    }
    void pa;
    return last;
  }

  // The invisible walls: every side of a walkable cell its walker cannot
  // step across. { x, z, y, dx, dz }: the wall runs along the cell side
  // facing (dx, dz) from the cell centre (x, z), at the walker's height y.
  function edges() {
    const out = [];
    for (let n = 0; n < N * 2; n++) {
      if (!ok(n)) continue;
      const c = n >> 1, i = c % W, j = (c / W) | 0;
      for (const [di, dj] of DIRS.slice(0, 4)) if (stepTo(i + di, j + dj, y[n], n & 1) === NONE) out.push({ x: x0 + i * cell, z: z0 + j * cell, y: y[n], dx: di, dz: dj });
    }
    return out;
  }

  // W2: the bounce pads' jump links (world def `bounces`: { id, pad, land }),
  // from the walkable node at the pad to the one at the landing; the cost
  // is the flight's length (about as long as walking it, flat).
  const jumps = [];
  for (const b of [...(world.def?.bounces ?? []), ...(world.def?.hops ?? []).map((h) => ({ ...h, hop: true }))]) {
    const from = nearest({ x: b.pad[0], z: b.pad[1] }, 2), to = nearest({ x: b.land[0], z: b.land[1] }, 2);
    if (from === NONE || to === NONE) continue;
    const a = posOf(from), c = posOf(to);
    const j = { id: b.id, from, to, cost: Math.hypot(a.x - c.x, a.z - c.z) + 2, hop: !!b.hop };
    jumps.push(j);
    if (!jumpsFrom.has(from)) jumpsFrom.set(from, []);
    jumpsFrom.get(from).push(j);
  }

  // The coarse map (hierarchical paths): the grid in BLOCK × BLOCK squares;
  // each square's walkable nodes split into the parts connected inside it
  // (a square on a cliff has an upper and a lower part), and parts that
  // touch across a square's side are joined. A* on these few thousand parts
  // finds the corridor a long walk takes.
  const BW = Math.ceil(W / BLOCK), BD = Math.ceil(D / BLOCK);
  const part = new Int32Array(N * 2).fill(NONE);
  const parts = []; // { x, z, y, n: members, links: Map(part -> cost) }
  {
    const stack = [], nb = [];
    const blockOf = (n) => { const c = n >> 1; return ((((c / W) | 0) / BLOCK) | 0) * BW + (((c % W) / BLOCK) | 0); };
    for (let n = 0; n < N * 2; n++) {
      if (!ok(n) || part[n] !== NONE) continue;
      const id = parts.length, b = blockOf(n), P = { x: 0, z: 0, y: 0, n: 0, links: new Map() };
      parts.push(P);
      part[n] = id; stack.push(n);
      while (stack.length) {
        const cur = stack.pop(), c = cur >> 1;
        P.x += x0 + (c % W) * cell; P.z += z0 + ((c / W) | 0) * cell; P.y += y[cur]; P.n++;
        neighbours(cur, nb);
        for (let q = 0; q < nb.length; q += 2) {
          const m = nb[q];
          if (part[m] === NONE && blockOf(m) === b) { part[m] = id; stack.push(m); }
        }
      }
      P.x /= P.n; P.z /= P.n; P.y /= P.n;
    }
    for (let n = 0; n < N * 2; n++) {
      if (!ok(n)) continue;
      neighbours(n, nb);
      for (let q = 0; q < nb.length; q += 2) {
        const a = part[n], b = part[nb[q]];
        if (a === b || parts[a].links.has(b)) continue;
        const d = Math.hypot(parts[a].x - parts[b].x, parts[a].z - parts[b].z) + Math.abs(parts[a].y - parts[b].y) * 0.5;
        parts[a].links.set(b, d); parts[b].links.set(a, d);
      }
    }
  }
  // (and a jump: one way, from the pad's part to the landing's)
  for (const j of jumps) { const m = (parts[part[j.from]].jumps ??= new Map()); m.set(part[j.to], { cost: j.cost, id: j.id }); }
  // W4: the pieces the jumps join (union-find over the links): a click's goal
  // may lie in any of them
  const group = Int32Array.from(sizes.keys());
  const root = (a) => { while (group[a] !== a) { group[a] = group[group[a]]; a = group[a]; } return a; };
  for (const j of jumps) { const a = root(piece[j.from]), b = root(piece[j.to]); if (a !== b && a >= 0 && b >= 0) group[a] = b; }
  for (let p = 0; p < group.length; p++) group[p] = root(p);
  // the parts a walk from node s to node t goes through, and their
  // neighbours (some room either side): a test for the fine search
  const inCorridor = new Uint32Array(parts.length);
  let corridorStamp = 0;
  function corridor(s, t, withJumps = false) {
    const a = part[s], b = part[t];
    const g = new Map([[a, 0]]), came = new Map(), shut = new Set();
    const hOf = (m) => Math.hypot(parts[m].x - parts[b].x, parts[m].z - parts[b].z);
    heapN.length = 0; heapF.length = 0; // (the fine search's heap, free until it runs)
    hpush(a, hOf(a));
    while (heapN.length) {
      const cur = hpop();
      if (cur === b) break;
      if (shut.has(cur)) continue;
      shut.add(cur);
      const step = (m, d) => {
        const cost = g.get(cur) + d;
        if (cost >= (g.get(m) ?? Infinity)) return;
        g.set(m, cost); came.set(m, cur);
        hpush(m, cost + hOf(m));
      };
      for (const [m, d] of parts[cur].links) step(m, d);
      if (withJumps && parts[cur].jumps) for (const [m, j] of parts[cur].jumps) if (withJumps === true || withJumps(j.id)) step(m, j.cost);
    }
    if (!g.has(b)) return null;
    corridorStamp++;
    for (let p = b; p !== undefined; p = came.get(p)) {
      inCorridor[p] = corridorStamp;
      for (const m of parts[p].links.keys()) inCorridor[m] = corridorStamp;
    }
    return (n) => inCorridor[part[n]] === corridorStamp;
  }

  let walkableCount = 0;
  for (let n = 0; n < N * 2; n++) if (ok(n)) walkableCount++;

  return {
    W, D, x0, z0, cell, y, piece, sizes, walkableCount, parts: parts.length, jumps, group,
    toI, toJ, posOf, ok, stepTo, neighbours, nearest, astar, walkLine, findPath, lineReach, edges,
    node: (i, j, l = 0) => (i < 0 || j < 0 || i >= W || j >= D ? NONE : (j * W + i) * 2 + l),
    pieceAt: (p) => { const n = nearest(p, 1); return n === NONE ? NONE : piece[n]; },
  };
}
