import { describe, it, expect } from 'vitest';
import { createWorld, gateBlocks } from '../src/world/world.js';
import { buildNavGrid } from '../src/world/navGrid.js';
import { MAIN_WORLD, M, H } from '../src/world/worlds/main.js';
import { seedEncounters, expeditionSeed, FILL, REGION_DIFFICULTY } from '../src/world/encounters.js';

// W2 (tasks/20261102-world-redesign-todo.md): region 2, the Mushroom Forest —
// reached from the camp once the chief's gate opens, the orb web walked
// across its chasm, the bounce mushrooms as jump links the paths know, the
// queen's ring shut by its gate, and its encounter spots.
const world = createWorld(MAIN_WORLD);
const nav = buildNavGrid(world);
const D = MAIN_WORLD;
const near = (p, r = 2, y) => nav.nearest({ x: p[0], z: p[1], y }, r);
const levelAt = (p) => world.heightAt(...p);

// every node a walker reaches from `from` with these gates shut (and,
// optionally, the jump links too, one way)
function flood(from, closed = [], { jumps = false, skip = null } = {}) {
  const gates = closed.map((id) => world.gate(id));
  const shut = (n) => { const p = nav.posOf(n); return gates.some((g) => gateBlocks(g, p.x, p.z)) || skip?.(n); };
  const seen = new Uint8Array(nav.y.length);
  const stack = [from], nb = [];
  seen[from] = 1;
  while (stack.length) {
    const n = stack.pop();
    nav.neighbours(n, nb, jumps);
    for (let q = 0; q < nb.length; q += 2) {
      const m = nb[q];
      if (seen[m] || shut(m)) continue;
      seen[m] = 1; stack.push(m);
    }
  }
  return (p, r = 3) => { const n = near(p, r); return n >= 0 && seen[n] === 1; };
}
const camp = near(D.camp.at, 3);
const P = { west: M(300, 40), east: M(450, 40), hollow: M(360, -60), deep: M(262, -180), ring: D.queen.at, gate: M(282, 12) };

describe('region 2: the Mushroom Forest (W2)', () => {
  it('lies at its levels: the upper forest −40, the hollow −55, the deep −70, the ring −76', () => {
    expect(levelAt(P.west)).toBeCloseTo(H(-40), 0);
    expect(levelAt(P.east)).toBeCloseTo(H(-40), 0);
    expect(levelAt(P.hollow)).toBeCloseTo(H(-55), 0);
    expect(levelAt(P.deep)).toBeCloseTo(H(-70), 0);
    expect(levelAt(P.ring)).toBeCloseTo(H(-76), 0);
    for (const p of Object.values(P)) expect(world.areaAt(...p)?.region).toBe(2);
    expect(world.areaAt(...P.ring).id).toBe('ring');
  });

  it('is about 95 × 150 m (W6: squeezed twice from 300 × 400; still bug\'s-eye big), one walkable piece with the camp', () => {
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, cells = 0;
    const S = Math.SQRT1_2;
    for (let n = 0; n < nav.y.length; n++) {
      if (!nav.ok(n)) continue;
      const p = nav.posOf(n);
      if (world.areaAt(p.x, p.z)?.region !== 2) continue;
      const u = (p.x - p.z) * S, v = (p.x + p.z) * S;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
      cells++;
      expect(nav.piece[n]).toBe(nav.piece[camp]);
    }
    expect(u1 - u0).toBeGreaterThan(85);
    expect(v1 - v0).toBeGreaterThan(130);
    expect(cells).toBeGreaterThan(5000); // m² to walk
  });

  it('is reached from the camp once the chief\'s gate opens (and not before)', () => {
    const shut = flood(camp, ['region2', 'ice', 'pit2']);
    for (const [id, p] of Object.entries(P)) expect(shut(p), id).toBe(false);
    const open = flood(camp, ['ice', 'pit2']);
    for (const [id, p] of Object.entries(P)) expect(open(p), id).toBe(true);
    // a walk from the camp to the hollow, on foot
    const path = nav.findPath({ x: D.camp.at[0], z: D.camp.at[1] }, { x: P.hollow[0], z: P.hollow[1] });
    expect(path && !path.partial).toBe(true);
  });

  it('crosses its chasm by the orb web: the deck walkable, the only way over on foot', () => {
    const web = world.bridges.find((b) => b.id === 'web');
    expect(web.y0).toBeCloseTo(H(-40), 0);
    expect(web.y1).toBeCloseTo(H(-40), 0);
    for (let t = 0; t <= 1; t += 0.02) {
      const x = web.a[0] + (web.b[0] - web.a[0]) * t, z = web.a[1] + (web.b[1] - web.a[1]) * t;
      expect(nav.nearest({ x, z, y: H(-40) }, 1) >= 0, `web deck at t=${t.toFixed(2)}`).toBe(true);
    }
    expect(world.heightAt((web.a[0] + web.b[0]) / 2, (web.a[1] + web.b[1]) / 2)).toBeLessThan(web.y0 - H(30)); // the chasm far below
    // west → east on foot: over the web
    const path = nav.findPath({ x: P.west[0], z: P.west[1] }, { x: P.east[0], z: P.east[1] });
    expect(path && !path.partial).toBe(true);
    expect(path.points.some((p) => world.deckAt(p.x, p.z)?.bridge === web)).toBe(true);
    // without the web (its deck taken away) the east shelf is cut off on foot
    const noWeb = flood(near(P.west), ['ice', 'pit2'], { skip: (n) => (n & 1) === 1 });
    expect(noWeb(P.east)).toBe(false);
    expect(noWeb(P.hollow)).toBe(true); // (down the ramp, the long way)
  });

  it('has bounce mushrooms as valid jump links: on walkable ground, between levels, one way each, one pair', () => {
    expect(D.bounces.length).toBeGreaterThanOrEqual(4);
    expect(nav.jumps.filter((j) => !j.hop).length).toBe(D.bounces.length);
    for (const b of D.bounces) {
      const pad = near(b.pad, 1), land = near(b.land, 1);
      expect(pad, `${b.id} pad`).toBeGreaterThanOrEqual(0);
      expect(land, `${b.id} landing`).toBeGreaterThanOrEqual(0);
      expect(Math.abs(nav.y[pad] - nav.y[land]), `${b.id} joins two levels`).toBeGreaterThan(H(10));
      const d = Math.hypot(b.pad[0] - b.land[0], b.pad[1] - b.land[1]);
      expect(d, b.id).toBeGreaterThan(10);
      expect(d, b.id).toBeLessThan(60);
      // no landing next to a pad (it would throw the hero straight back)
      for (const q of D.bounces) expect(Math.hypot(q.pad[0] - b.land[0], q.pad[1] - b.land[1]), `${b.id} lands clear of ${q.id}`).toBeGreaterThan(4);
      // off the walking lanes' middles and the spots
      for (const s of D.spots) expect(Math.hypot(s.at[0] - b.pad[0], s.at[1] - b.pad[1]), `${b.id} clear of ${s.id}`).toBeGreaterThan(s.r);
    }
    // one way down, one way up, and a two-way pair
    const lv = (p) => world.heightAt(...p);
    expect(D.bounces.some((b) => lv(b.pad) > lv(b.land) + H(10))).toBe(true);
    expect(D.bounces.some((b) => lv(b.pad) < lv(b.land) - H(10))).toBe(true);
    const pair = D.bounces.some((a) => D.bounces.some((b) => a !== b && Math.hypot(a.pad[0] - b.land[0], a.pad[1] - b.land[1]) < 20 && Math.hypot(b.pad[0] - a.land[0], b.pad[1] - a.land[1]) < 20));
    expect(pair, 'a two-way pair').toBe(true);
  });

  it('routes a click by the bounce mushrooms when that is shorter (and never without asking)', () => {
    for (const [id, from, to] of [['b1', M(318, 0), M(334, -60)], ['b3', M(282, -140), M(300, -100)], ['b2r', M(428, -56), M(436, 4)]]) {
      const by = nav.findPath({ x: from[0], z: from[1] }, { x: to[0], z: to[1] }, { jumps: true });
      expect(by && !by.partial, id).toBe(true);
      expect(by.points.some((p) => p.jump === id), `${id} taken`).toBe(true);
      // the pad is on the way, right before the landing
      const k = by.points.findIndex((p) => p.jump === id);
      const pad = D.bounces.find((b) => b.id === id).pad;
      expect(Math.hypot(by.points[k - 1].x - pad[0], by.points[k - 1].z - pad[1]), `${id}: walk onto the pad`).toBeLessThan(1.5);
      const walk = nav.findPath({ x: from[0], z: from[1] }, { x: to[0], z: to[1] });
      expect(walk.points.some((p) => p.jump), `${id}: an animal's path never jumps`).toBe(false);
      const len = (pts) => pts.reduce((s, p, i) => s + (i ? Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) : 0), 0);
      expect(len(by.points), `${id} saves the walk round`).toBeLessThan(len(walk.points));
    }
    // a long way through the forest (the coarse map) still finds the jump
    const far = nav.findPath({ x: P.west[0], z: P.west[1] }, { x: P.hollow[0], z: P.hollow[1] }, { jumps: true });
    expect(far && !far.partial).toBe(true);
  });

  it('shuts the queen\'s ring behind its gate, and the way to the pit (region 4) behind a crystal door', () => {
    const fromHollow = near(P.hollow);
    expect(flood(fromHollow, ['ring', 'pit2', 'ice'])(P.ring)).toBe(false);
    expect(flood(fromHollow, ['pit2', 'ice'])(P.ring)).toBe(true);
    const inRing = flood(near(P.ring), ['ring', 'pit2', 'ice']);
    expect(inRing(P.hollow)).toBe(false);
    expect(inRing(D.lift.ring)).toBe(true);
    expect(world.areaAt(...D.lift.ring).id).toBe('ring');
    expect(levelAt(D.lift.camp)).toBeCloseTo(H(-30), 0);
    expect(world.areaAt(...D.lift.camp).id).toBe('camp');
  });

  it('keeps its poison off the lanes, its rest spring and mask chest on open ground', () => {
    const lanes = D.lanes.filter((l) => l.pts.some(([x, z]) => world.areaAt(x, z)?.region === 2));
    const dLane = (x, z) => Math.min(...lanes.flatMap((l) => l.pts.slice(1).map((b, i) => {
      const a = l.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) - l.width / 2;
    })));
    for (const h of [...D.hazards.mud, ...D.hazards.tar]) {
      expect(near(h.at, 1), 'pool on ground').toBeGreaterThanOrEqual(0);
      expect(dLane(...h.at), 'a pool clear of the lanes').toBeGreaterThan(h.r);
    }
    for (const v of [...D.hazards.vents, ...D.hazards.poison]) {
      expect(near(v, 1)).toBeGreaterThanOrEqual(0);
      expect(dLane(...v), 'a vent clear of the lanes').toBeGreaterThan(1.5);
      for (const b of D.bounces) expect(Math.hypot(v[0] - b.land[0], v[1] - b.land[1])).toBeGreaterThan(5);
    }
    for (const p of [D.rest, D.maskChest]) { expect(near(p, 1)).toBeGreaterThanOrEqual(0); expect(world.areaAt(...p).region).toBe(2); }
  });
});

describe('region 2\'s encounters', () => {
  const place = (x, z) => { const n = nav.nearest({ x, z }, 3); if (n < 0) return null; const p = nav.posOf(n); return [p.x, p.z]; };
  const spots = D.spots.filter((s) => s.region === 2);

  it('has foxes, moles and mixed packs, a little tougher (GDD §8.5: ×1.25 hp, ×1.15 bite)', () => {
    expect(spots.length).toBeGreaterThanOrEqual(6);
    expect(FILL.foxes).toEqual({ fox: [1, 2] });
    expect(FILL.moles).toEqual({ mole: [1, 2] });
    expect(REGION_DIFFICULTY[2]).toEqual({ hp: 1.25, damage: 1.15 });
    expect(REGION_DIFFICULTY[1]).toEqual({ hp: 1, damage: 1 });
    const seen = new Set();
    for (let n = 1; n <= 30; n++) {
      for (const e of seedEncounters(D.spots, expeditionSeed(11, n), { expedition: n, place })) {
        const s = D.spots.find((q) => q.id === e.spot);
        for (const en of e.enemies) {
          if (s.region === 2) seen.add(en.kind);
          else if ((s.region ?? 1) === 1) expect(['wolf', 'rabbit']).toContain(en.kind); // (W3: region 3 has its own)
          expect(Math.hypot(en.x - s.at[0], en.z - s.at[1])).toBeLessThan(s.r + 4);
          expect(nav.nearest({ x: en.x, z: en.z }, 1)).toBeGreaterThanOrEqual(0);
        }
      }
    }
    for (const k of ['fox', 'mole', 'wolf', 'rabbit']) expect(seen.has(k), k).toBe(true);
  });

  it('puts its moles on soft loam', () => {
    const loam = (x, z) => world.terrain(x, z).top?.material === 'loam';
    const moleSpots = spots.filter((s) => s.kinds.moles);
    expect(moleSpots.length).toBeGreaterThanOrEqual(3);
    for (const s of moleSpots) expect(loam(...s.at), s.id).toBe(true);
  });
});

describe('the scatter\'s level of detail (W2)', async () => {
  const { lodCount, boxDist, zoomFar, zoomDensity, LOD_NEAR, RULES } = await import('../src/world/scatter.js');

  it('draws a whole batch near the hero, thinner further out, none past its reach', () => {
    expect(lodCount(40, 0, 100)).toBe(40);
    expect(lodCount(40, 100 * LOD_NEAR, 100)).toBe(40);
    const mid = lodCount(40, 75, 100, 0.25), edge = lodCount(40, 99.9, 100, 0.25);
    expect(mid).toBeLessThan(40);
    expect(edge).toBeLessThan(mid);
    expect(edge).toBeGreaterThanOrEqual(10); // `keep` of them at the edge
    expect(lodCount(40, 100, 100)).toBe(0);
    expect(lodCount(40, 250, 100)).toBe(0);
    expect(lodCount(3, 90, 100, 0)).toBeGreaterThanOrEqual(1); // (never 0 inside its reach)
    // monotone: further is never more
    let prev = Infinity;
    for (let d = 0; d < 120; d += 2) { const k = lodCount(100, d, 100, 0.3); expect(k).toBeLessThanOrEqual(prev); prev = k; }
  });

  it('measures from the nearest edge of a batch, and thins small clutter when the lens pulls back', () => {
    expect(boxDist(5, 5, [0, 0, 10, 10])).toBe(0);
    expect(boxDist(13, 14, [0, 0, 10, 10])).toBe(5);
    expect(zoomFar(62, 30)).toBe(1);
    expect(zoomFar(62, 45)).toBeLessThan(0.75);
    expect(zoomFar(62, 400)).toBe(0.55);
    expect(zoomFar(230, 45)).toBe(1); // the giants and the rocks keep their reach
    expect(zoomDensity(62, 30)).toBe(1);
    expect(zoomDensity(62, 45)).toBeCloseTo(2 / 3, 2);
    expect(zoomDensity(230, 45)).toBe(1);
  });

  it('keeps the far-off things that make the vistas (giant mushrooms, the pit\'s crystals)', () => {
    const giants = RULES.filter((r) => r.key === 'bonnet');
    expect(giants.length).toBeGreaterThanOrEqual(2);
    for (const r of giants) { expect(r.far).toBeGreaterThan(150); expect(r.keep).toBeGreaterThan(0.4); expect(r.cut).toBe(true); }
    expect(RULES.find((r) => r.key === 'crystalSpire').lod).toBe(false);
  });
});
