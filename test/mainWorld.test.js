import { describe, it, expect } from 'vitest';
import { createWorld, MAX_SLOPE, STEP, gateBlocks } from '../src/world/world.js';
import { buildNavGrid } from '../src/world/navGrid.js';
import { MAIN_WORLD, M, H, layout } from '../src/world/worlds/main.js';
import { seedEncounters, expeditionSeed, faintPenalty, FILL } from '../src/world/encounters.js';
import { newState, save, load, openGate, gateOpen, findCamp, keepBag, restoreBag, resetWorld } from '../src/core/state.js';
import { newRun } from '../src/core/run.js';

// W1 (tasks/20261102-world-redesign-todo.md): the real world's data — the
// entrance, Moss Valley and the camp built, regions 2–4 blocked out behind
// gates — and the expedition loop's pure rules.
const world = createWorld(MAIN_WORLD);
const nav = buildNavGrid(world);
const tan = (deg) => Math.tan((deg * Math.PI) / 180);
const nodeNear = (x, z, r = 2, y) => nav.nearest({ x, z, y }, r);

// every node a walker on `from` can reach with these gates shut (W4: and
// by the stepping stones' hops: the walking grid's jump links)
function flood(from, closed = []) {
  const gates = closed.map((id) => world.gate(id));
  const shut = (n) => { const p = nav.posOf(n); return gates.some((g) => gateBlocks(g, p.x, p.z)); };
  const seen = new Uint8Array(nav.y.length);
  const stack = [from], nb = [];
  seen[from] = 1;
  while (stack.length) {
    const n = stack.pop();
    nav.neighbours(n, nb, true);
    for (let q = 0; q < nb.length; q += 2) {
      const m = nb[q];
      if (seen[m] || shut(m)) continue;
      seen[m] = 1; stack.push(m);
    }
  }
  return (x, z, r = 3) => {
    const n = nodeNear(x, z, r);
    return n >= 0 && seen[n] === 1;
  };
}
const spawn = nodeNear(...MAIN_WORLD.spawn, 3);
const C = MAIN_WORLD.camp;
// a point well inside each place (map frame → world)
const PLACES = {
  entrance: MAIN_WORLD.spawn, upper: M(-60, 300), mid: M(-60, 200), valley: M(-60, 125), mine: M(170, 125),
  camp: C.at, meadow: M(150, 8), mush: M(300, 40), mushE: M(450, 40), mushLow: M(360, -60), mushDeep: M(262, -180), ring: M(295, -188),
  ice: M(-266, 60), iceLow: M(-320, 6), pit: M(-110, -180), heart: M(0, -212),
};

describe('the main world (W1)', () => {
  it('is about 270 m across (W6: squeezed twice from 750 m), built the same every time', () => {
    const [x0, z0, x1, z1] = world.bounds;
    expect(x1 - x0).toBeLessThanOrEqual(560);
    expect(z1 - z0).toBeLessThanOrEqual(560);
    // the ground a paw can reach, end to end
    let a = [Infinity, -Infinity, Infinity, -Infinity];
    for (let n = 0; n < nav.y.length; n++) if (nav.ok(n)) { const p = nav.posOf(n); a = [Math.min(a[0], p.x), Math.max(a[1], p.x), Math.min(a[2], p.z), Math.max(a[3], p.z)]; }
    for (const d of [a[1] - a[0], a[3] - a[2]]) { expect(d).toBeGreaterThan(230); expect(d).toBeLessThan(300); }
    const again = createWorld(MAIN_WORLD);
    for (const [x, z] of Object.values(PLACES)) expect(again.heightAt(x, z)).toBe(world.heightAt(x, z));
  });

  it('squeezes the design without folding it (W6: whatever met still meets, in the same order)', () => {
    for (let v = -400; v <= 430; v += 10) { let prev = -Infinity; for (let u = -500; u <= 560; u += 1) { const x = layout(u, v)[0]; expect(x, `across at ${u}, ${v}`).toBeGreaterThan(prev); prev = x; } }
    for (let u = -500; u <= 560; u += 10) { let prev = -Infinity; for (let v = -400; v <= 430; v += 1) { const y = layout(u, v)[1]; expect(y, `along at ${u}, ${v}`).toBeGreaterThan(prev); prev = y; } }
  });

  it('puts every place at its level (valley 0 → −24, camp −30, regions 2–4 deeper)', () => {
    const levels = { entrance: 0, upper: -8, mid: -16, valley: -24, mine: -24, camp: -30, meadow: -30, mush: -40, mushE: -40, mushLow: -55, mushDeep: -70, ring: -76, ice: -50, iceLow: -65, pit: -90, heart: -112 };
    for (const [id, y] of Object.entries(levels)) expect(world.heightAt(...PLACES[id]), id).toBeCloseTo(H(y), 0);
    expect(spawn, 'the spawn is on walkable ground').toBeGreaterThanOrEqual(0);
  });

  it('reaches every region from the entrance once all its gates are open', () => {
    const reach = flood(spawn);
    for (const [id, p] of Object.entries(PLACES)) expect(reach(...p), id).toBe(true);
  });

  it('keeps regions 2–4 shut while their gates are (before the chief: region 1 and the camp)', () => {
    // the necklace taken, the chief not yet beaten: the shortcut, region 2
    // and the ice door are shut, the arena's gate is open
    const reach = flood(spawn, ['region2', 'shortcut', 'ice', 'pit2', 'pit3']);
    for (const id of ['entrance', 'upper', 'mid', 'valley', 'mine', 'camp', 'meadow']) expect(reach(...PLACES[id]), id).toBe(true);
    for (const id of ['mush', 'mushE', 'mushLow', 'mushDeep', 'ring', 'ice', 'iceLow', 'pit', 'heart']) expect(reach(...PLACES[id]), id).toBe(false);
  });

  it('opens region 2 with the chief asleep (W2), regions 3 and 4 still shut', () => {
    const reach = flood(spawn, ['ice', 'pit2', 'pit3']);
    for (const id of ['meadow', 'mush', 'mushE', 'mushLow', 'mushDeep', 'ring']) expect(reach(...PLACES[id]), id).toBe(true);
    for (const id of ['ice', 'iceLow', 'pit', 'heart']) expect(reach(...PLACES[id]), id).toBe(false);
  });

  it('shuts each gate for real: closed, its far side cannot be reached', () => {
    // the entrance's gate alone keeps the hero in the sinkhole
    const inHole = flood(spawn, ['entrance', 'shortcut', 'region2', 'ice']);
    expect(inHole(...PLACES.entrance)).toBe(true);
    for (const id of ['upper', 'valley', 'camp', 'meadow']) expect(inHole(...PLACES[id]), id).toBe(false);
    // the arena sealed (the shortcut still shut): nobody gets in or out
    const sealed = flood(nodeNear(...PLACES.mine), ['arena', 'shortcut', 'region2', 'ice']);
    expect(sealed(...PLACES.meadow)).toBe(false);
    expect(sealed(...PLACES.camp)).toBe(true);
    // the shortcut: shut, the meadow is not reached from the camp over the trestle
    const fromCamp = flood(nodeNear(...C.at), ['shortcut', 'arena', 'region2', 'ice']);
    expect(fromCamp(...PLACES.meadow)).toBe(false);
    const open = flood(nodeNear(...C.at), ['arena', 'region2', 'ice']);
    expect(open(...PLACES.meadow)).toBe(true);
    // W2: the crystal door on the forest's way down stops the pit (W4: the
    // lake's too; either one open lets the hero in)
    expect(flood(spawn, ['pit2', 'pit3'])(...PLACES.pit)).toBe(false);
    expect(flood(spawn, ['pit2', 'ice'])(...PLACES.pit)).toBe(false);
    expect(flood(spawn, ['ice', 'pit3'])(...PLACES.pit)).toBe(true);
    expect(flood(spawn, ['pit2'])(...PLACES.pit)).toBe(true);
    // and each gate spans its passage: the cells either side of it are walkable
    for (const g of world.gates) {
      const [dx, dz] = g.dir;
      const a = nodeNear(g.at[0] - dx * 3, g.at[1] - dz * 3, 3), b = nodeNear(g.at[0] + dx * 3, g.at[1] + dz * 3, 3);
      expect(a >= 0 && b >= 0, `${g.id} stands in a passage`).toBe(true);
    }
  });

  it('joins its levels only by ramps no steeper than MAX_SLOPE, walkable all along', () => {
    for (const r of world.ramps) {
      let prev = null, run = 0;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], len = Math.hypot(bx - ax, bz - az);
        for (let s = i === 0 ? 0 : 0.5; s <= len; s += 0.5) {
          const x = ax + ((bx - ax) * s) / len, z = az + ((bz - az) * s) / len;
          const h = world.heightAt(x, z);
          if (prev !== null) expect(Math.abs(h - prev) / 0.5, `${r.id} at ${(run + s).toFixed(1)} m`).toBeLessThanOrEqual(tan(MAX_SLOPE) + 0.02);
          prev = h;
          expect(nodeNear(x, z, 1, h), `${r.id} walkable at ${(run + s).toFixed(1)} m`).toBeGreaterThanOrEqual(0);
        }
        run += len;
      }
      expect(Math.abs(r.y1 - r.y0), `${r.id} joins two levels`).toBeGreaterThan(H(5));
    }
  });

  it('spans the gorge with the viaduct and the trestle (W2: the chasm with the web; W4: the abyss with ropes and crystal), high over its floor', () => {
    for (const b of world.bridges) {
      // (W6: the squeezed world's bridges are shorter: the viaduct was 94 m)
      expect(b.length, b.id).toBeGreaterThan({ web: 10, rope4: 10, trestle: 15 }[b.id] ?? 20);
      if (b.id === 'viaduct') expect(b.length).toBeLessThan(32);
      for (let t = 0; t <= 1; t += 0.02) {
        const x = b.a[0] + (b.b[0] - b.a[0]) * t, z = b.a[1] + (b.b[1] - b.a[1]) * t;
        const deck = world.deckAt(x, z);
        expect(deck, `${b.id} t=${t.toFixed(2)}`).not.toBeNull();
        expect(nodeNear(Math.round(x), Math.round(z), 1, deck.y), `${b.id} deck walkable at t=${t.toFixed(2)}`).toBeGreaterThanOrEqual(0);
        if (deck.island) continue; // (W4: the rope bridge ends on a floating rock)
        // nothing solid pokes up through the deck (a cliff's lip would wall it off)
        for (const side of [-1, 0, 1]) {
          const sx = x + (-(b.b[1] - b.a[1]) / b.length) * side * (b.width / 2), sz = z + ((b.b[0] - b.a[0]) / b.length) * side * (b.width / 2);
          expect(world.heightAt(sx, sz), `${b.id}: ground under the deck at t=${t.toFixed(2)}`).toBeLessThan(deck.y + 0.35);
        }
      }
      const mid = world.heightAt((b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2);
      expect(mid, `${b.id}: the gorge's floor far below`).toBeLessThan(b.y0 - H(b.id === 'exitBridge' ? 20 : 30));
    }
    // the viaduct runs level from the valley's lowest step (−24) to the
    // camp's bridgehead (−24; a ramp goes down into the camp at −30)
    const v = world.bridges.find((b) => b.id === 'viaduct');
    expect(v.y0).toBeCloseTo(H(-24), 0);
    expect(v.y1).toBeCloseTo(H(-24), 0);
  });

  it('finds the camp from the entrance on foot (through the valley, over the viaduct)', () => {
    const path = nav.findPath({ x: MAIN_WORLD.spawn[0], z: MAIN_WORLD.spawn[1] }, { x: C.at[0], z: C.at[1] });
    expect(path && !path.partial).toBe(true);
    const v = world.bridges.find((b) => b.id === 'viaduct');
    expect(path.points.some((p) => world.deckAt(p.x, p.z)?.bridge === v), 'over the viaduct').toBe(true);
    for (const k of ['spring', 'merchant', 'codex', 'altar', 'balcony']) {
      expect(world.areaAt(...C[k])?.id, k).toBe('camp');
      expect(world.heightAt(...C[k]), k).toBeCloseTo(H(-30), 0);
    }
  });

  it('lets the camp\'s balcony overlook the deep pit (the Crystal Heart far below)', () => {
    const [bx, bz] = C.balcony;
    expect(nodeNear(bx, bz, 2)).toBeGreaterThanOrEqual(0);
    // up the screen from the balcony (toward −x −z): the rim within ~15 m,
    // then a drop of 60 m and more
    const up = [-Math.SQRT1_2, -Math.SQRT1_2];
    const at = (d) => world.heightAt(bx + up[0] * d, bz + up[1] * d);
    expect(at(0)).toBeCloseTo(H(-30), 0);
    const rim = [...Array(40).keys()].find((d) => at(d) < H(-40));
    expect(rim).toBeLessThan(18);
    // beyond the ground the lip hides from a 40° lens (drop / tan 40°), the pit floor
    const hidden = (H(-30) - H(-100)) / Math.tan((40 * Math.PI) / 180);
    expect(at(rim + hidden + 10)).toBeLessThan(H(-88));
    expect(world.areaAt(bx + up[0] * (rim + hidden + 10), bz + up[1] * (rim + hidden + 10))?.region).toBe(4);
  });

  it('names its places (the HUD and the map)', () => {
    expect(world.areaAt(...MAIN_WORLD.spawn).id).toBe('entrance');
    expect(world.areaAt(...C.at).id).toBe('camp');
    expect(world.areaAt(...PLACES.meadow).id).toBe('meadow');
    expect(world.areaAt(...PLACES.mine).id).toBe('mine');
    expect(world.areaAt(...PLACES.mid).id).toBe('valley');
    expect(world.areaAt(...PLACES.mush).region).toBe(2);
    expect(world.areaAt(...PLACES.ice).region).toBe(3);
    expect(world.areaAt(...PLACES.pit).region).toBe(4);
  });

  it('keeps every boss arena clear of hand-placed solid things (W6: squeezed, burrows had come into the chief\'s)', () => {
    const arenas = [MAIN_WORLD.arena, MAIN_WORLD.queen, MAIN_WORLD.iceBear, MAIN_WORLD.king];
    for (const l of MAIN_WORLD.landmarks) {
      if (!(l.radius > 0) || l.noBody) continue;
      for (const a of arenas) expect(Math.hypot(l.x - a.at[0], l.z - a.at[1]) - l.radius, `${l.model} in ${a.boss}'s arena`).toBeGreaterThan(a.r);
    }
  });

  it('puts its encounter spots on walkable ground of their region, the arenas clear of them', () => {
    for (const s of MAIN_WORLD.spots) {
      expect(nodeNear(s.at[0], s.at[1], 1), s.id).toBeGreaterThanOrEqual(0);
      expect(world.areaAt(...s.at)?.region, s.id).toBe(s.region ?? 1);
      for (const a of [MAIN_WORLD.arena, MAIN_WORLD.queen]) expect(Math.hypot(s.at[0] - a.at[0], s.at[1] - a.at[1]), s.id).toBeGreaterThan(a.r + 10);
    }
  });
});

describe('the expedition\'s encounters', () => {
  const place = (x, z) => { const n = nav.nearest({ x, z }, 3); if (n < 0) return null; const p = nav.posOf(n); return [p.x, p.z]; };
  const spots = MAIN_WORLD.spots;

  it('rolls the same encounters from the same seed, others from another', () => {
    const a = seedEncounters(spots, 1234, { expedition: 2, place });
    const b = seedEncounters(spots, 1234, { expedition: 2, place });
    expect(a).toEqual(b);
    const kinds = (e) => e.map((s) => s.kind).join();
    const seeds = [1, 2, 3, 4, 5].map((n) => kinds(seedEncounters(spots, expeditionSeed(77, n), { expedition: n, place })));
    expect(new Set(seeds).size).toBeGreaterThan(2);
  });

  it('fills a spot with what its kind says, near the spot, on walkable ground', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const e of seedEncounters(spots, seed, { expedition: 3, place })) {
        const s = spots.find((q) => q.id === e.spot);
        expect(Object.keys(s.kinds)).toContain(e.kind);
        if (FILL[e.kind]) {
          const n = e.enemies.length;
          const [lo, hi] = Object.values(FILL[e.kind]).reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
          expect(n).toBeGreaterThanOrEqual(lo - 1); // (a point that found no ground is dropped)
          expect(n).toBeLessThanOrEqual(hi);
        }
        for (const p of [...e.enemies, ...e.chests, ...e.herbs, ...e.shards]) {
          expect(Math.hypot(p.x - s.at[0], p.z - s.at[1])).toBeLessThan(s.r + 4);
          expect(nodeNear(p.x, p.z, 1)).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('starts gently: the first expedition\'s gentle spot holds at most two wolves', () => {
    for (let seed = 0; seed < 30; seed++) {
      const first = seedEncounters(spots, seed, { expedition: 1 }).find((e) => spots.find((s) => s.id === e.spot).gentle);
      expect(first.enemies.length).toBeLessThanOrEqual(2);
      expect(first.enemies.every((e) => e.kind === 'wolf')).toBe(true);
    }
  });

  it('numbers its chests uniquely within an expedition and across expeditions', () => {
    const idx = [1, 2].flatMap((n) => seedEncounters(spots, 5, { expedition: n }).flatMap((e) => e.chests.map((c) => c.index)));
    expect(new Set(idx).size).toBe(idx.length);
  });

  it('gives each expedition its own seed, the first the save\'s own', () => {
    expect(expeditionSeed(42, 1)).toBe(42);
    expect(expeditionSeed(42, 2)).not.toBe(42);
    expect(expeditionSeed(42, 2)).toBe(expeditionSeed(42, 2));
    expect(expeditionSeed(42, 3)).not.toBe(expeditionSeed(42, 2));
  });
});

describe('fainting and the camp', () => {
  it('loses half of the shards found on this expedition (rounded down), never those brought', () => {
    expect(faintPenalty(10, 4)).toEqual({ keep: 7, lost: 3 });
    expect(faintPenalty(9, 0)).toEqual({ keep: 5, lost: 4 });
    expect(faintPenalty(4, 4)).toEqual({ keep: 4, lost: 0 });
    expect(faintPenalty(2, 6)).toEqual({ keep: 2, lost: 0 }); // spent at the shop: nothing found
    expect(faintPenalty(1, 0)).toEqual({ keep: 1, lost: 0 });
  });

  it('keeps the world\'s progress in the save: gates, bosses, the camp, the bag, the fog', () => {
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
    const s = newState();
    expect(s.world.started).toBe(false);
    expect(gateOpen(s, 'shortcut')).toBe(false);
    expect(openGate(s, 'shortcut')).toBe(true);
    expect(openGate(s, 'shortcut')).toBe(false);
    expect(findCamp(s)).toBe(true);
    s.world.bosses.rabbitChief = true;
    s.world.fog = 'AAEC';
    const run = newRun(3);
    run.shards = 12; run.owned.push('vine'); run.herbs = 2;
    keepBag(s, run);
    save(s, storage);
    const back = load(storage);
    expect(back.world.gates.shortcut).toBe(true);
    expect(back.world.camp).toBe(true);
    expect(back.world.bosses.rabbitChief).toBe(true);
    expect(back.world.fog).toBe('AAEC');
    const fresh = newRun(9);
    expect(restoreBag(back, fresh)).toBe(true);
    expect(fresh.shards).toBe(12);
    expect(fresh.owned).toContain('vine');
    expect(fresh.herbs).toBe(2);
    // an old save (before W1) loads with an empty world
    storage.setItem('secret-cave-save-v1', JSON.stringify({ version: 1, seen: { wolf: true }, stars: 1 }));
    const old = load(storage);
    expect(old.world.gates).toEqual({});
    expect(old.seen.wolf).toBe(true);
    // 처음부터: the world over again, the codex and stars kept
    back.stars = 2;
    resetWorld(back);
    expect(back.world.camp).toBe(false);
    expect(back.world.gates).toEqual({});
    expect(back.stars).toBe(2);
  });
});
