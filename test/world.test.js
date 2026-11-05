import { describe, it, expect } from 'vitest';
import { createWorld, MAX_SLOPE, STEP, CLEARANCE, alongPolyline } from '../src/world/world.js';
import { buildNavGrid } from '../src/world/navGrid.js';
import { TEST_WORLD } from '../src/world/worlds/test.js';

// W0 (tasks/20261102-world-redesign-todo.md): the height world and its
// walkable grid, on the test world (?world=test).
const world = createWorld(TEST_WORLD);
const nav = buildNavGrid(world);
const ramp = world.ramps[0], bridge = world.bridges[0];
const tan = (deg) => Math.tan((deg * Math.PI) / 180);
// the walkable node under a point (on the surface nearest y)
const nodeAt = (x, z, y) => nav.nearest({ x, z, y }, 0);
// heights along a line, every `ds` m
function profile(ax, az, bx, bz, ds = 0.25) {
  const len = Math.hypot(bx - ax, bz - az), out = [];
  for (let s = 0; s <= len; s += ds) out.push(world.heightAt(ax + ((bx - ax) * s) / len, az + ((bz - az) * s) / len));
  return out;
}
const maxJump = (hs) => hs.slice(1).reduce((m, h, i) => Math.max(m, Math.abs(h - hs[i])), 0);

describe('the height world', () => {
  it('is the same world every time', () => {
    const again = createWorld(TEST_WORLD).sample();
    const g = world.sample();
    expect(again.h).toEqual(g.h);
    expect(again.open).toEqual(g.open);
  });

  it('keeps each terrace flat and its ground continuous', () => {
    for (const [ax, az, bx, bz, level] of [[10, 20, 70, 70, -10], [30, -80, 80, -40, -12], [-80, 70, -60, 10, -30]]) {
      const hs = profile(ax, az, bx, bz);
      expect(maxJump(hs)).toBeLessThan(0.3);
      for (const h of hs) expect(Math.abs(h - level)).toBeLessThan(0.6);
    }
  });

  it('drops off its cliffs in a few metres (a step, not a slope)', () => {
    // across the plateau's north edge west of the chasm, and the chasm's rim
    for (const [ax, az, bx, bz, hi, lo] of [[0, 4, 0, -24, -10, -30], [40, 4, 40, -16, -10, -70]]) {
      const hs = profile(ax, az, bx, bz);
      expect(hs[0]).toBeCloseTo(hi, 0);
      expect(hs.at(-1)).toBeCloseTo(lo, 0);
      // the whole drop happens within ~12 m of the line
      const top = hs.findIndex((h) => h < hi - 0.5), bottom = hs.findIndex((h) => h < lo + 0.5);
      expect((bottom - top) * 0.25).toBeLessThan(12);
      expect(maxJump(hs)).toBeGreaterThan(1.5); // risers, not a ramp
    }
  });

  it('joins the ramp\'s two levels at no more than MAX_SLOPE', () => {
    expect(ramp.y0).toBeCloseTo(-10, 1);
    expect(ramp.y1).toBeCloseTo(-30, 1);
    const ds = 0.5;
    let prev = null;
    for (let s = 0; s <= ramp.length; s += ds) {
      // walk the centre line
      let run = s, p = ramp.pts[0];
      for (let i = 0; i < ramp.pts.length - 1; i++) {
        const [ax, az] = ramp.pts[i], [bx, bz] = ramp.pts[i + 1], len = Math.hypot(bx - ax, bz - az);
        if (run <= len) { p = [ax + ((bx - ax) * run) / len, az + ((bz - az) * run) / len]; break; }
        run -= len;
      }
      const h = world.heightAt(...p);
      if (prev !== null) expect(Math.abs(h - prev) / ds).toBeLessThanOrEqual(tan(MAX_SLOPE) + 1e-6);
      prev = h;
      expect(nodeAt(Math.round(p[0]), Math.round(p[1]), h), `ramp at ${p}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('spans its chasm with the bridge deck', () => {
    expect(bridge.y0).toBeCloseTo(-10, 0);
    expect(bridge.y1).toBeCloseTo(-12, 0);
    for (let t = 0; t <= 1; t += 0.05) {
      const x = bridge.a[0] + (bridge.b[0] - bridge.a[0]) * t, z = bridge.a[1] + (bridge.b[1] - bridge.a[1]) * t;
      const deck = world.deckAt(x, z);
      expect(deck).not.toBeNull();
      expect(nodeAt(Math.round(x), Math.round(z), deck.y), `deck at t=${t.toFixed(2)}`).toBeGreaterThanOrEqual(0);
    }
    // the middle hangs high over the chasm floor, which nobody walks on
    const mid = [(bridge.a[0] + bridge.b[0]) / 2, (bridge.a[1] + bridge.b[1]) / 2];
    expect(world.deckAt(...mid).y - world.heightAt(...mid)).toBeGreaterThan(40);
    expect(world.walkable(...mid)).toBe(false);
    expect(world.surfaces(...mid).map((s) => s.kind)).toEqual(['bridge']);
    expect(world.groundAt(...mid)).toBeCloseTo(world.deckAt(...mid).y, 3);
  });

  it('keeps water, the chasm floor, cliff faces and the wall unwalkable', () => {
    expect(world.walkable(-38, -32)).toBe(false); // the lake
    expect(world.walkable(60, -16)).toBe(false); // the chasm floor
    expect(world.walkable(-97, 0)).toBe(false); // the wall
    expect(world.walkable(30, 40)).toBe(true); // the plateau
    expect(world.regionAt(30, 40)).toBe('upper');
    expect(world.levelAt(-60, 60)).toBe(-30);
    expect(nodeAt(-38, -32)).toBeLessThan(0);
  });
});

describe('the walkable grid', () => {
  const plateau = { x: 22, z: 40 }, basin = { x: -40, z: 40 }, far = { x: 50, z: -60 };
  const below = { x: -22, z: 8 }; // in the basin at the foot of the plateau's west cliff

  it('is one piece: the ramp joins the basin, the bridge the far plateau', () => {
    const p = nav.pieceAt({ ...plateau, y: -10 });
    expect(p).toBeGreaterThanOrEqual(0);
    expect(nav.pieceAt({ ...basin, y: -30 })).toBe(p);
    expect(nav.pieceAt({ ...far, y: -12 })).toBe(p);
  });

  it('never steps more than STEP between walkable neighbours, and walls off the rest', () => {
    const nb = [];
    for (let n = 0; n < nav.y.length; n++) {
      if (!nav.ok(n)) continue;
      nav.neighbours(n, nb);
      for (let q = 0; q < nb.length; q += 2) expect(Math.abs(nav.y[nb[q]] - nav.y[n])).toBeLessThanOrEqual(STEP + 1e-6);
    }
    const edges = nav.edges();
    expect(edges.length).toBeGreaterThan(500);
    for (const e of edges.slice(0, 2000)) {
      const i = nav.toI(e.x) + e.dx, j = nav.toJ(e.z) + e.dz;
      expect(nav.stepTo(i, j, e.y)).toBe(-1);
    }
  });

  it('goes down to the basin below the cliff by the ramp, never off the cliff', () => {
    const res = nav.findPath({ ...plateau, y: -10 }, { ...below, y: -30 });
    expect(res.partial).toBe(false);
    expect(res.points.at(-1).y).toBeCloseTo(-30, 0);
    // dense: re-walk every leg cell by cell, no step bigger than STEP
    let used = false;
    for (let k = 1; k < res.points.length; k++) {
      const a = res.points[k - 1], b = res.points[k];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      let prev = a.y;
      for (let s = 0.5; s <= len; s += 0.5) {
        const x = a.x + ((b.x - a.x) * s) / len, z = a.z + ((b.z - a.z) * s) / len;
        const n = nav.stepTo(nav.toI(x), nav.toJ(z), prev);
        expect(n).toBeGreaterThanOrEqual(0);
        prev = nav.y[n];
        if (alongPolyline(x, z, ramp.pts).d < ramp.width / 2 && prev < -15 && prev > -25) used = true;
      }
    }
    expect(used).toBe(true);
  });

  it('crosses to the far plateau over the bridge', () => {
    const res = nav.findPath({ ...plateau, y: -10 }, { ...far, y: -12 });
    expect(res.partial).toBe(false);
    // the leg that crosses the chasm (z from −5 to −27) runs along the deck
    const legs = res.points.slice(1).map((b, k) => [res.points[k], b]).filter(([a, b]) => (a.z + 5) * (b.z + 27) < 0 || (a.z > -5 && b.z < -27));
    expect(legs.length).toBeGreaterThan(0);
    for (const [a, b] of legs) for (const p of [a, b]) expect(Math.abs(p.x - bridge.a[0])).toBeLessThan(bridge.width / 2 + 0.6);
  });

  it('stops at the nearest reachable spot for a click into the chasm or the lake', () => {
    const chasm = nav.findPath({ ...plateau, y: -10 }, { x: 30, z: -16, y: -70 });
    expect(chasm.partial).toBe(true);
    const end = chasm.points.at(-1);
    expect(end.y).toBeCloseTo(-10, 0);
    expect(Math.hypot(end.x - 30, end.z + 16)).toBeLessThan(16);
    const lake = nav.findPath({ ...basin, y: -30 }, { x: -38, z: -32, y: -31 });
    expect(lake.partial).toBe(true);
    expect(Math.hypot(lake.points.at(-1).x + 38, lake.points.at(-1).z + 32)).toBeLessThan(18);
  });

  it('finds a path across the whole world fast', () => {
    const t0 = performance.now();
    let visited = 0;
    for (let k = 0; k < 10; k++) visited += nav.findPath({ x: -70, z: 70, y: -30 }, { ...far, y: -12 }).visited;
    const ms = (performance.now() - t0) / 10;
    console.log(`test world: a ~250 m path in ${ms.toFixed(1)} ms (${Math.round(visited / 10)} cells looked at)`);
    expect(ms).toBeLessThan(60);
  });
});

describe('a world the size of the real one', () => {
  it('builds its grid and paths 300 m across in good time', { timeout: 60000 }, () => {
    // 700 × 700 m: four big walls of rock to walk round and a terrace with a ramp
    const def = {
      bounds: [-350, -350, 350, 350], base: { level: -30 },
      terraces: [
        { id: 'a', level: 0, cliff: 4, outline: [[-300, -50], [200, -50], [200, -30], [-300, -30]] },
        { id: 'b', level: 0, cliff: 4, outline: [[-200, 60], [300, 60], [300, 80], [-200, 80]] },
        { id: 'top', level: -10, cliff: 5, wobble: 3, outline: [[50, 120], [300, 120], [300, 300], [50, 300]] },
      ],
      ramps: [{ id: 'r', width: 8, pts: [[100, 140], [100, 90]] }],
    };
    const t0 = performance.now();
    const big = createWorld(def);
    big.sample();
    const t1 = performance.now();
    const g = buildNavGrid(big);
    const t2 = performance.now();
    // the long way round both walls (~800 m of walking), and a ~300 m walk
    // up the ramp; the best of five (the first runs warm the JIT up)
    const time = (a, b) => {
      let best = Infinity, res = null;
      for (let k = 0; k < 5; k++) { const t = performance.now(); res = g.findPath(a, b); best = Math.min(best, performance.now() - t); }
      return { res, best };
    };
    const long = time({ x: -150, z: -150, y: -30 }, { x: 150, z: 200, y: -10 });
    const mid = time({ x: -100, z: 100, y: -30 }, { x: 160, z: 250, y: -10 });
    console.log(`700 m world: sample ${(t1 - t0).toFixed(0)} ms, grid ${(t2 - t1).toFixed(0)} ms, ${g.parts} coarse parts; `
      + `800 m detour ${long.best.toFixed(1)} ms (${long.res.visited} cells), 300 m ${mid.best.toFixed(1)} ms (${mid.res.visited} cells)`);
    expect(long.res.partial).toBe(false);
    expect(mid.res.partial).toBe(false);
    expect(long.best).toBeLessThan(60);
    expect(mid.best).toBeLessThan(30);
    expect(CLEARANCE).toBeGreaterThan(1.5);
  });
});
