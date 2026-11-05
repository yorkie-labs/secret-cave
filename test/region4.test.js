import { describe, it, expect } from 'vitest';
import { createWorld, gateBlocks, MAX_SLOPE } from '../src/world/world.js';
import { buildNavGrid } from '../src/world/navGrid.js';
import { MAIN_WORLD, M, H, K } from '../src/world/worlds/main.js';
import { seedEncounters, FILL, REGION_DIFFICULTY } from '../src/world/encounters.js';
import { BOSSES, CRYSTAL_SPIKE, hopFlight, ESCAPE } from '../src/data/bosses.js';
import { newBossAI, stepBoss, doingOf, isDazed } from '../src/entities/bosses/chiefAI.js';
import { crystalKingSteps } from '../src/entities/bosses/crystalKingAI.js';
import { newState, save, load, presetProgress, recordFinalWin, resetWorld, heartDoorReady, beatBoss } from '../src/core/state.js';
import { rng } from '../src/core/rng.js';

// W4 (tasks/20261102-world-redesign-todo.md): region 4, the Crystal Heart —
// the deep round pit under the camp's balcony, reached through two crystal
// doors only once the Ice Bear sleeps and the hero has the golden necklace;
// its canyons down to two ruined ledges, the floating rocks crossed by hops
// down to the heart's platform, the Crystal King's patterns, the way out,
// the escape and the win.
const world = createWorld(MAIN_WORLD);
const nav = buildNavGrid(world);
const D = MAIN_WORLD;
const near = (p, r = 2, y) => nav.nearest({ x: p[0], z: p[1], y }, r);
const S = Math.SQRT1_2;
const toMap = (x, z) => [(x - z) * S, (x + z) * S];

// every node a walker reaches from `from` with these gates shut (`jumps`:
// the hero's clicks, which may hop; an animal never does)
function flood(from, closed = [], { jumps = true, jumpOk = null } = {}) {
  const gates = closed.map((id) => world.gate(id));
  const shut = (n) => { const p = nav.posOf(n); return gates.some((g) => gateBlocks(g, p.x, p.z)); };
  const seen = new Uint8Array(nav.y.length);
  const stack = [from], nb = [];
  seen[from] = 1;
  while (stack.length) {
    const n = stack.pop();
    nav.neighbours(n, nb, jumps && (jumpOk ?? true));
    for (let q = 0; q < nb.length; q += 2) {
      const m = nb[q];
      if (seen[m] || shut(m)) continue;
      seen[m] = 1; stack.push(m);
    }
  }
  return (p, r = 3, y) => { const n = near(p, r, y); return n >= 0 && seen[n] === 1; };
}
const camp = near(D.camp.at, 3);
const P = {
  pass4w: M(-240, -182), pass4e: D.places.pass4e, ruinsW: M(-110, -180), ruinsE: M(112, -190),
  heart: D.king.at, exit: M(0, -310), sun: D.escape.sun,
};
const isle = (id) => world.islands.find((s) => s.id === id);

describe('region 4: the Crystal Heart (W4)', () => {
  it('lies deepest: canyons −65/−70, ruined ledges −90, floating rocks −90…−101, the heart −112, the abyss −140', () => {
    expect(world.heightAt(...P.pass4w)).toBeCloseTo(H(-65), 0);
    expect(world.heightAt(...P.pass4e)).toBeCloseTo(H(-70), 0);
    for (const k of ['ruinsW', 'ruinsE']) expect(world.heightAt(...P[k]), k).toBeCloseTo(H(-90), 0);
    expect(world.heightAt(...P.heart)).toBeCloseTo(H(-112), 0);
    expect(world.heightAt(...P.exit)).toBeCloseTo(H(-112), 0);
    expect(world.heightAt(...P.sun)).toBeCloseTo(H(-96), 0);
    for (const s of world.islands) {
      expect(s.y, s.id).toBeLessThanOrEqual(H(-90));
      expect(world.heightAt(...s.at), `${s.id}: the abyss far under it`).toBeLessThan(s.y - H(30));
      expect(world.walkable(...s.at), `${s.id}: not ground`).toBe(false);
      expect(world.deckAt(...s.at)?.island, s.id).toBe(s);
    }
    // the abyss: far down, never walked
    expect(world.heightAt(...M(0, -150))).toBeLessThan(H(-130));
    expect(near(M(0, -150), 3)).toBe(-1);
    for (const [k, p] of Object.entries(P)) expect(world.areaAt(...p)?.region, k).toBe(4);
  });

  it('is about 150 × 90 m (W6: squeezed twice from 290), under the camp\'s balcony', () => {
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let n = 0; n < nav.y.length; n++) {
      if (!nav.ok(n)) continue;
      const p = nav.posOf(n);
      const a = world.areaAt(p.x, p.z);
      if (a?.region !== 4 || a.id.startsWith('pass4')) continue;
      const [u, v] = toMap(p.x, p.z);
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    expect(u1 - u0).toBeGreaterThan(130);
    expect(v1 - v0).toBeGreaterThan(75);
    // the balcony looks straight down into it
    const [bu, bv] = toMap(...D.camp.balcony);
    expect(Math.abs(bu - D.king.at[0] * 0 - toMap(...D.king.at)[0])).toBeLessThan(10);
    expect(bv - toMap(...D.king.at)[1]).toBeGreaterThan(40);
  });

  it('is reached only through its two crystal doors (the Ice Bear asleep and the necklace)', () => {
    const shut = flood(camp, ['pit2', 'pit3', 'iceWall1', 'iceWall2']);
    for (const [k, p] of Object.entries(P)) expect(shut(p), k).toBe(false);
    const west = flood(camp, ['pit2', 'iceWall1', 'iceWall2']);
    const east = flood(camp, ['pit3', 'iceWall1', 'iceWall2']);
    for (const k of ['ruinsW', 'ruinsE', 'heart']) { expect(west(P[k]), `${k} by the lake's door`).toBe(true); expect(east(P[k]), `${k} by the forest's door`).toBe(true); }
    for (const id of ['pit2', 'pit3']) expect(world.gate(id).opens).toBe('heartDoor');
    // the rule the doors open by (core/state.js heartDoorReady)
    const s = newState();
    expect(heartDoorReady(s)).toBe(false);
    s.world.bosses.iceBear = true;
    expect(heartDoorReady(s), 'the Ice Bear asleep, no necklace').toBe(false);
    s.necklace = true;
    expect(heartDoorReady(s)).toBe(true);
    s.world.bosses.iceBear = false;
    expect(heartDoorReady(s), 'the necklace, the Ice Bear awake').toBe(false);
  });

  it('keeps the way out shut until the Crystal King sleeps', () => {
    const before = flood(camp, ['exit']);
    expect(before(P.heart)).toBe(true);
    for (const k of ['exit', 'sun']) expect(before(P[k]), k).toBe(false);
    const after = flood(camp, []);
    for (const k of ['exit', 'sun']) expect(after(P[k]), k).toBe(true);
    expect(world.gate('exit').opens).toBe('crystalKing');
    expect(world.gate('exit').hidden).toBe(true);
  });

  it('lays its ramps from right at the lip (re-laid ramp3c: no trench), no steeper than MAX_SLOPE', () => {
    expect(world.ramps.find((r) => r.id === 'ramp3c')).toBeUndefined();
    for (const id of ['ramp4w', 'ramp4e', 'rampExit']) {
      const r = world.ramps.find((q) => q.id === id);
      let prev = null;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], len = Math.hypot(bx - ax, bz - az);
        for (let s = 0; s <= len; s += 0.5) {
          const x = ax + ((bx - ax) * s) / len, z = az + ((bz - az) * s) / len, h = world.heightAt(x, z);
          if (prev !== null) expect(Math.abs(h - prev) / 0.5, `${id} at ${s}`).toBeLessThanOrEqual(Math.tan((MAX_SLOPE * Math.PI) / 180) + 0.02);
          prev = h;
          expect(near([x, z], 1, h), `${id} walkable at ${s}`).toBeGreaterThanOrEqual(0);
        }
      }
    }
    // each starts on its canyon's floor and ends on its ledge
    const w = world.ramps.find((q) => q.id === 'ramp4w'), e = world.ramps.find((q) => q.id === 'ramp4e');
    expect(w.y0).toBeCloseTo(H(-65), 1); expect(w.y1).toBeCloseTo(H(-90), 0);
    expect(e.y0).toBeCloseTo(H(-70), 1); expect(e.y1).toBeCloseTo(H(-90), 0);
    // the rock round the canyons was lowered first: their walls stay low
    // enough for the lens to see in (a canyon, not a slot in a rock plain)
    // (W6: points on each canyon's middle, in the world: the forest's canyon
    // is laid straight after the squeeze, its middle known by its place)
    for (const [id, pts, floor] of [['pass4w', [M(-280, -150), M(-240, -182), M(-195, -200)], H(-65)], ['pass4e', [D.places.pass4e, D.spikes.at(-1).at], H(-70)]]) {
      for (const [cx, cz] of pts) {
        const u = cx, v = cz; // (named in the message)
        let top = -Infinity;
        for (let a = 0; a < 16; a++) for (const d of [15 * K, 18 * K]) top = Math.max(top, world.heightAt(cx + Math.cos(a / 16 * Math.PI * 2) * d, cz + Math.sin(a / 16 * Math.PI * 2) * d));
        expect(top - floor, `${id} at ${u},${v}: its walls`).toBeLessThan(15);
      }
    }
  });

  it('crosses its floating rocks by hops: valid jump links, both ways, nothing else reaches them', () => {
    const hops = nav.jumps.filter((j) => j.hop);
    expect(hops.length).toBe(D.hops.length);
    for (const h of D.hops) {
      const j = hops.find((q) => q.id === h.id);
      expect(j, h.id).toBeTruthy();
      const a = nav.posOf(j.from), b = nav.posOf(j.to);
      expect(Math.hypot(a.x - h.pad[0], a.z - h.pad[1]), `${h.id}: its pad is walkable where it is`).toBeLessThan(1.5);
      expect(Math.hypot(b.x - h.land[0], b.z - h.land[1]), `${h.id}: its landing too`).toBeLessThan(1.5);
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      expect(d, `${h.id}: a hop, not a flight`).toBeLessThan(22);
      expect(d).toBeGreaterThan(6);
      expect(Math.abs(a.y - b.y), `${h.id}: a step of height`).toBeLessThanOrEqual(12);
      const f = hopFlight(a, b);
      expect(f.time).toBeGreaterThan(0.6);
      expect(f.time).toBeLessThan(1.6);
      // the way back exists, and its pad is never where this one lands
      const back = D.hops.find((q) => q.id === (h.id.endsWith('r') ? h.id.slice(0, -1) : `${h.id}r`));
      expect(back, `${h.id}: both ways`).toBeTruthy();
      expect(Math.hypot(back.pad[0] - h.land[0], back.pad[1] - h.land[1]), `${h.id}: lands clear of the way back's pad`).toBeGreaterThan(2);
    }
    // every rock is its own piece: the walk alone never reaches it (an animal
    // never jumps), the hops join them all to the ledges
    for (const s of world.islands.filter((q) => q.id !== 'e1')) {
      const n = near(s.at, 1, s.y);
      expect(nav.piece[n], s.id).not.toBe(nav.piece[camp]);
      expect(nav.group[nav.piece[n]], `${s.id}: joined by hops`).toBe(nav.group[nav.piece[camp]]);
    }
    expect(flood(camp, [], { jumps: false })(P.heart), 'no walk to the heart').toBe(false);
    // the big rock by the east ledge: by its rope bridge, on foot
    expect(nav.piece[near(isle('e1').at, 1, isle('e1').y)]).toBe(nav.piece[camp]);
  });

  it('routes a click across the rocks by hops (the coarse map too), and the platform can be sealed', () => {
    const from = { x: P.ruinsW[0], z: P.ruinsW[1] }, to = { x: P.heart[0], z: P.heart[1] };
    const p = nav.findPath(from, to, { jumps: true });
    expect(p && !p.partial).toBe(true);
    expect(p.points.filter((q) => q.jump).map((q) => q.jump)).toEqual(['hw1', 'hw2', 'hw3']);
    const e = nav.findPath({ x: P.ruinsE[0], z: P.ruinsE[1] }, to, { jumps: true });
    expect(e.points.filter((q) => q.jump).map((q) => q.jump)).toEqual(['he2', 'he3']);
    expect(e.points.some((q) => world.deckAt(q.x, q.z)?.bridge?.id === 'rope4'), 'over the rope bridge').toBe(true);
    // all the way from the lake's door (the coarse map with jumps)
    const far = nav.findPath({ x: D.starts.heart[0], z: D.starts.heart[1] }, to, { jumps: true });
    expect(far && !far.partial).toBe(true);
    // an animal's path (no jumps) does not get onto the rocks
    const walk = nav.findPath(from, to, {});
    expect(walk.partial).toBe(true);
    // the king awake: the hops off his platform are closed (jumpOk)
    const sealed = (id) => id !== 'hw3r' && id !== 'he3r';
    const out = nav.findPath(to, from, { jumps: true, jumpOk: sealed });
    expect(out.partial).toBe(true);
    expect(nav.findPath(to, from, { jumps: true }).partial).toBe(false);
    expect(flood(near(P.heart, 2), ['exit'], { jumpOk: sealed })(P.ruinsW)).toBe(false);
  });

  it('puts its spots, spikes, lift and the sunlight on walkable ground of region 4', () => {
    const spots = D.spots.filter((s) => s.region === 4);
    expect(spots.length).toBeGreaterThanOrEqual(6);
    for (const s of spots) {
      expect(near(s.at, 1), s.id).toBeGreaterThanOrEqual(0);
      expect(world.areaAt(...s.at)?.region, s.id).toBe(4);
      expect(Math.hypot(s.at[0] - D.king.at[0], s.at[1] - D.king.at[1]), `${s.id} clear of the king`).toBeGreaterThan(D.king.r + 10);
    }
    for (const z of D.spikes) { expect(near(z.at, 2), 'a spike place').toBeGreaterThanOrEqual(0); expect(world.areaAt(...z.at)?.region).toBe(4); }
    for (const k of ['heart', 'camp']) expect(near(D.lift4[k], 1), `lift4 ${k}`).toBeGreaterThanOrEqual(0);
    expect(world.areaAt(...D.lift4.camp).id).toBe('camp');
    expect(world.areaAt(...D.lift4.heart).id).toBe('kingHeart');
    expect(near(D.escape.sun, 1)).toBeGreaterThanOrEqual(0);
    // the spikes: a ring first (as long as the icicles' shadows), half a heart
    expect(CRYSTAL_SPIKE.warn).toBeGreaterThanOrEqual(1.3);
    expect(CRYSTAL_SPIKE.damage).toBe(0.5);
    expect(CRYSTAL_SPIKE.every).toBeGreaterThan(CRYSTAL_SPIKE.warn + 1);
  });

  it('fills its spots with every animal, strongest (GDD §8.5: ×1.8 hp, ×1.5 damage)', () => {
    expect(REGION_DIFFICULTY[4]).toEqual({ hp: 1.8, damage: 1.5 });
    const kinds = new Set();
    for (let seed = 1; seed < 30; seed++) {
      for (const r of seedEncounters(D.spots, seed, { expedition: 3 })) {
        const s = D.spots.find((q) => q.id === r.spot);
        if (s.region === 4) for (const e of r.enemies) kinds.add(e.kind);
      }
    }
    for (const k of ['wolf', 'fox', 'deer', 'bear', 'hare']) expect(kinds.has(k), k).toBe(true);
    for (const k of ['crystalPack', 'crystalHerd', 'crystalBear']) expect(FILL[k], k).toBeTruthy();
  });
});

describe('the Crystal King (GDD §3.3)', () => {
  const def = BOSSES.crystalKing;
  it('draws every attack first, slumps tired after the big ones, rests after each', () => {
    for (const [i, pool] of def.patterns.entries()) {
      for (const p of pool) {
        const steps = crystalKingSteps(p, i + 1, def);
        expect(steps.at(-1).name, p).toBe('rest');
        steps.forEach((s, k) => {
          if (s.hit) {
            expect(steps[k - 1].tele, `${p} ${s.name}`).toBeTruthy();
            expect(steps[k - 1].dur).toBeGreaterThanOrEqual(def.minWindup);
          }
        });
        if (p === 'laser' || p === 'spikes') {
          const t = steps.find((s) => s.name === 'tired');
          expect(t && t.dazed && t.open && t.tired, `${p}: tired after`).toBeTruthy();
          expect(steps.indexOf(t)).toBe(steps.findIndex((s) => s.hit) + 1);
          expect(t.dur).toBeGreaterThanOrEqual(1.8);
        }
        if (p === 'summon') expect(steps.some((s) => s.hit), 'calling animals hurts nobody').toBe(false);
      }
    }
    // phase 1 has no animals; the summons come from phase 2, never more than 3
    expect(def.patterns[0]).not.toContain('summon');
    expect(def.summon.max).toBeLessThanOrEqual(3);
    expect(crystalKingSteps('spikes', 3, def)[0].n).toBe(5);
    expect(crystalKingSteps('laser', 3, def)[0].arc).toBeGreaterThan(crystalKingSteps('laser', 1, def)[0].arc);
    // kid-friendly: the laser's wedge never covers the whole platform (room behind and to the sides)
    expect(Math.max(...def.laser.arc)).toBeLessThanOrEqual(110);
    // and the spikes never cover much of it
    expect(def.spikes.count[2] * Math.PI * def.spikes.radius ** 2).toBeLessThan(Math.PI * 13 ** 2 * 0.25);
  });

  it('runs three phases at 66 % and 33 %, each telegraph before its hit in time, tired windows dazed', () => {
    const ai = newBossAI();
    const rand = rng(11);
    const log = [];
    let hp = def.hp, t = 0;
    const tick = (secs) => { for (let s = 0; s < secs; s += 0.05) { t += 0.05; for (const ev of stepBoss(ai, { hp, maxHp: def.hp, started: true, stun: 0 }, 0.05, def, rand, crystalKingSteps)) if (ev.type === 'step') log.push({ ...ev.step, at: t, phase: ai.phase, pattern: ai.pattern }); } };
    tick(45);
    const n1 = new Set(log.map((s) => s.name));
    expect(n1.has('aim') && n1.has('call')).toBe(true);
    expect(n1.has('raise'), 'no animals in phase 1').toBe(false);
    hp = def.hp * 0.6;
    tick(40);
    expect(log.some((s) => s.name === 'roar' && s.phase === 2)).toBe(true);
    // the newest trick first: phase 2 opens with the summons
    expect(log.find((s) => s.phase === 2 && ['aim', 'call', 'raise'].includes(s.name))?.name).toBe('raise');
    hp = def.hp * 0.3;
    tick(45);
    expect(log.some((s) => s.name === 'roar' && s.phase === 3)).toBe(true);
    for (let k = 1; k < log.length; k++) if (log[k].hit) { expect(log[k - 1].tele, log[k].name).toBeTruthy(); expect(log[k].at - log[k - 1].at).toBeGreaterThanOrEqual(def.minWindup - 0.06); }
    // never a hit straight after another: a rest (or his tiredness) between
    for (let k = 1; k < log.length; k++) if (log[k].tele) expect(['rest', 'idle', 'roar'], `${log[k].name} after ${log[k - 1].name}`).toContain(log[k - 1].name);
    // phase 3 is faster (shorter warnings, never under the minimum)
    const aim1 = log.find((s) => s.name === 'aim' && s.phase === 1), aim3 = log.find((s) => s.name === 'aim' && s.phase === 3);
    expect(aim3.dur).toBeLessThan(aim1.dur);
    expect(aim3.dur).toBeGreaterThanOrEqual(def.minWindup);
    // tired: the hammer counts double (dazed)
    const tired = { ...newBossAI(), state: 'pattern', step: crystalKingSteps('laser', 1, def).find((s) => s.name === 'tired') };
    expect(doingOf(tired)).toBe('tired');
    expect(isDazed(tired)).toBe(true);
    expect(def.hammerBonus).toBe(2);
    expect(def.itemBonus).toBeGreaterThan(1);
  });
});

describe('the escape, the ending and after (GDD §2.3)', () => {
  it('runs from the platform over the crystal bridge up the tunnel to the sunlight, forgiving', () => {
    const [fx, fz] = D.escape.from, [sx, sz] = D.escape.sun;
    const len = Math.hypot(sx - fx, sz - fz);
    expect(len).toBeGreaterThan(40); // (W6: squeezed twice from ~150 m)
    expect(len / 5).toBeLessThan(ESCAPE.time); // (a walk is enough to beat the soft clock)
    const p = nav.findPath({ x: fx, z: fz }, { x: sx, z: sz }, { jumps: true });
    expect(p && !p.partial).toBe(true);
    // (W6: the bridge is short enough now that the path runs straight over it:
    // look along its legs, not only at its corners)
    const along = p.points.slice(1).flatMap((q, i) => { const a = p.points[i], n = Math.ceil(Math.hypot(q.x - a.x, q.z - a.z)); return Array.from({ length: n }, (_, k) => [a.x + ((q.x - a.x) * k) / n, a.z + ((q.z - a.z) * k) / n]); });
    expect(along.some(([x, z]) => world.deckAt(x, z)?.bridge?.id === 'exitBridge'), 'over the crystal bridge').toBe(true);
    // (no rocks on the narrow bridge: they start past its far end)
    const bridge = world.bridges.find((b) => b.id === 'exitBridge');
    expect(ESCAPE.rocksFrom).toBeGreaterThan(Math.hypot(bridge.b[0] - fx, bridge.b[1] - fz));
    expect(ESCAPE.rocksFrom).toBeLessThan(len - 10); // (and some fall: W6, the run is ~50 m now)
  });

  it('records the final win once into the save, the world kept open after it', () => {
    const s = newState();
    presetProgress(s, { start: 'heart', seed: 4 });
    beatBoss(s, 'crystalKing');
    s.world.bosses.crystalKing = true;
    s.playTime = 1234.4;
    const a = recordFinalWin(s);
    expect(a).toEqual({ first: true, wins: 1 });
    expect(s.world.won).toBe(1);
    expect(s.world.wonAt).toBe(1234);
    s.playTime = 2000;
    const b = recordFinalWin(s);
    expect(b.first).toBe(false);
    expect(s.wins).toBe(2);
    expect(s.world.wonAt).toBe(1234); // (the first escape's time stays)
    // saved and loaded: the post-game (이어 하기) keeps everything open
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    save(s, storage);
    const back = load(storage);
    expect(back.world.started).toBe(true);
    expect(back.world.won).toBe(2);
    expect(back.world.bosses).toMatchObject({ rabbitChief: true, mushroomQueen: true, iceBear: true, crystalKing: true });
    expect(back.wins).toBe(2);
    expect(back.beaten.crystalKing).toBe(1);
    // 처음부터: the world starts over, the wins and stars stay
    resetWorld(back);
    expect(back.world.won).toBe(0);
    expect(back.wins).toBe(2);
    expect(back.stars).toBeGreaterThanOrEqual(4);
  });

  it('?start=heart: the chief, the queen and the Ice Bear asleep, the necklace, a bag for the deep', () => {
    const s = newState();
    expect(presetProgress(s, { start: 'heart', seed: 4 })).toBe(true);
    expect(s.world.bosses).toMatchObject({ rabbitChief: true, mushroomQueen: true, iceBear: true });
    expect(s.world.bosses.crystalKing).toBeUndefined();
    expect(s.necklace).toBe(true);
    expect(heartDoorReady(s)).toBe(true);
    expect(s.world.gates).toMatchObject({ lift: true, ice: true, lift3: true });
    expect(s.world.bag.owned).toEqual(expect.arrayContaining(['hammer', 'waterGun', 'vine', 'shield']));
    expect(s.world.bag.armorGrade).toBe('rare');
    expect(s.world.bag.herbs).toBe(3);
    expect(s.stars).toBeGreaterThanOrEqual(3);
  });
});
