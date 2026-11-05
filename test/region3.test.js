import { describe, it, expect } from 'vitest';
import { createWorld, gateBlocks, SLIP, SLIP_COST } from '../src/world/world.js';
import { buildNavGrid } from '../src/world/navGrid.js';
import { MAIN_WORLD, M, H, K } from '../src/world/worlds/main.js';
const m = (x) => x * K; // (W6: a design size in the world)
import { seedEncounters, expeditionSeed, FILL, REGION_DIFFICULTY } from '../src/world/encounters.js';
import { slideVelocity, slideDistance, ICE } from '../src/player/movement.js';
import { newAI, stepAI, shieldStun, inFace, waterStun, knockDecay } from '../src/entities/enemyAI.js';
import { ENEMIES } from '../src/data/enemies.js';
import { BOSSES, ICICLE } from '../src/data/bosses.js';
import { newBossAI, stepBoss, doingOf, isDazed } from '../src/entities/bosses/chiefAI.js';
import { iceBearSteps } from '../src/entities/bosses/iceBearAI.js';
import { takeDamage, armorHearts, betterArmor } from '../src/combat/hits.js';
import { grant, maxArmor, refillArmor } from '../src/combat/loadout.js';
import { canBuy, buy } from '../src/core/shop.js';
import { newRun } from '../src/core/run.js';
import { newState, keepBag, restoreBag, presetProgress } from '../src/core/state.js';
import { ITEMS } from '../src/data/items.js';
import { rng } from '../src/core/rng.js';

// W3 (tasks/20261102-world-redesign-todo.md): region 3, the Ice Lake —
// reached from the camp once the queen sleeps, its frozen lake (slippery),
// the ice walls the hammer breaks, the frozen falls on the cliffs facing the
// lens; the deer, the bear, armour, and the Ice Bear's patterns.
const world = createWorld(MAIN_WORLD);
const nav = buildNavGrid(world);
const D = MAIN_WORLD;
const near = (p, r = 2, y) => nav.nearest({ x: p[0], z: p[1], y }, r);
const levelAt = (p) => world.heightAt(...p);
const S = Math.SQRT1_2;
const toMap = (x, z) => [(x - z) * S, (x + z) * S];

function flood(from, closed = []) {
  const gates = closed.map((id) => world.gate(id));
  const shut = (n) => { const p = nav.posOf(n); return gates.some((g) => gateBlocks(g, p.x, p.z)); };
  const seen = new Uint8Array(nav.y.length);
  const stack = [from], nb = [];
  seen[from] = 1;
  while (stack.length) {
    const n = stack.pop();
    nav.neighbours(n, nb);
    for (let q = 0; q < nb.length; q += 2) {
      const m = nb[q];
      if (seen[m] || shut(m)) continue;
      seen[m] = 1; stack.push(m);
    }
  }
  return (p, r = 3) => { const n = near(p, r); return n >= 0 && seen[n] === 1; };
}
const camp = near(D.camp.at, 3);
const P = {
  threshold: M(-196, -4), shelf: M(-262, 20), shelfN: M(-262, -80), shelfS: M(-262, 110), lake: M(-320, 20), lakeW: M(-410, -10),
  lakeS: M(-330, 80), rink: D.iceBear.at, grotto: M(-232, -146), nook: M(-268, 166),
};
const WALLS = ['iceWall1', 'iceWall2'];

describe('region 3: the Ice Lake (W3)', () => {
  it('lies at its levels: the threshold −38, the shelf −50, the lake −65, the rink −71', () => {
    expect(levelAt(P.threshold)).toBeCloseTo(H(-38), 0);
    for (const k of ['shelf', 'shelfN', 'shelfS', 'grotto', 'nook']) expect(levelAt(P[k]), k).toBeCloseTo(H(-50), 0);
    for (const k of ['lake', 'lakeW', 'lakeS']) expect(levelAt(P[k]), k).toBeCloseTo(H(-65), 0);
    expect(levelAt(P.rink)).toBeCloseTo(H(-71), 0);
    for (const [k, p] of Object.entries(P)) expect(world.areaAt(...p)?.region, k).toBe(3);
    expect(world.areaAt(...P.rink).id).toBe('bearRing');
  });

  it('is big (~125 × 135 m, W6: squeezed twice from 300 × 300; a lake of ~60 × 95 m) and one walkable piece with the camp', () => {
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, cells = 0, lake = 0;
    let lu0 = Infinity, lu1 = -Infinity, lv0 = Infinity, lv1 = -Infinity;
    for (let n = 0; n < nav.y.length; n++) {
      if (!nav.ok(n)) continue;
      const p = nav.posOf(n);
      if (world.areaAt(p.x, p.z)?.region !== 3) continue;
      const [u, v] = toMap(p.x, p.z);
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
      cells++;
      expect(nav.piece[n]).toBe(nav.piece[camp]);
      if (world.slipAt(p.x, p.z) > 0 && Math.abs(p.y - H(-65)) < 0.2) { lake++; lu0 = Math.min(lu0, u); lu1 = Math.max(lu1, u); lv0 = Math.min(lv0, v); lv1 = Math.max(lv1, v); }
    }
    expect(u1 - u0).toBeGreaterThan(110);
    expect(v1 - v0).toBeGreaterThan(120);
    expect(cells).toBeGreaterThan(4500);
    // (W6: the lake shrank least: still a real slippery space)
    expect(lu1 - lu0).toBeGreaterThan(50);
    expect(lv1 - lv0).toBeGreaterThan(80);
    expect(lake).toBeGreaterThan(1700); // m² of bare ice
  });

  it('is reached from the camp only once the queen sleeps (the ice door), the pit behind its crystal doors', () => {
    const before = flood(camp, ['ice', 'pit2', 'pit3', ...WALLS]);
    for (const [k, p] of Object.entries(P)) expect(before(p), k).toBe(false);
    const after = flood(camp, ['pit2', 'pit3', ...WALLS]);
    for (const k of ['threshold', 'shelf', 'shelfN', 'shelfS', 'lake', 'lakeW', 'lakeS', 'rink']) expect(after(P[k]), k).toBe(true);
    expect(after(M(-110, -205)), 'the pit (W4: its west ledge)').toBe(false);
    expect(flood(camp, ['pit2', ...WALLS])(M(-110, -205)), 'the pit by the lake\'s crystal door').toBe(true);
    const path = nav.findPath({ x: D.camp.at[0], z: D.camp.at[1] }, { x: P.lake[0], z: P.lake[1] });
    expect(path && !path.partial).toBe(true);
  });

  it('keeps the grotto and the nook behind ice walls until the hammer breaks them', () => {
    const shut = flood(camp, ['pit2', 'pit3', ...WALLS]);
    expect(shut(P.grotto)).toBe(false);
    expect(shut(P.nook)).toBe(false);
    expect(flood(camp, ['pit2', 'pit3', 'iceWall2'])(P.grotto)).toBe(true);
    expect(flood(camp, ['pit2', 'pit3', 'iceWall1'])(P.nook)).toBe(true);
    for (const id of WALLS) {
      const g = world.gate(id);
      expect(g.kind).toBe('ice');
      expect(g.opens).toBe('hammer');
      expect(g.hits).toBeGreaterThanOrEqual(2);
    }
    // the grotto holds the armour chest, the nook the resting spring
    expect(world.areaAt(...D.armorChest).id).toBe('grotto');
    expect(world.areaAt(...D.rest3).id).toBe('nook');
    expect(near(D.armorChest, 1)).toBeGreaterThanOrEqual(0);
    expect(near(D.rest3, 1)).toBeGreaterThanOrEqual(0);
  });

  it('seals the Ice Bear\'s rink behind its gate; the rope lift joins the lake and the camp', () => {
    const fromLake = near(P.lake);
    expect(flood(fromLake, ['bearGate', 'pit3', ...WALLS])(P.rink)).toBe(false);
    expect(flood(fromLake, ['pit3', ...WALLS])(P.rink)).toBe(true);
    expect(flood(near(P.rink), ['bearGate', 'pit3', ...WALLS])(P.lake)).toBe(false);
    expect(world.slipAt(...P.rink)).toBe(1); // the rink is bare ice
    expect(D.iceBear.keep).toBeLessThan(D.iceBear.r);
    expect(levelAt(D.lift3.lake)).toBeCloseTo(H(-65), 0);
    expect(world.areaAt(...D.lift3.camp).id).toBe('camp');
    expect(near(D.lift3.lake, 1)).toBeGreaterThanOrEqual(0);
    expect(near(D.lift3.camp, 1)).toBeGreaterThanOrEqual(0);
  });

  it('hangs its frozen falls on cliffs facing the lens: the lake at the foot, a ledge 15 m+ up behind', () => {
    const falls = D.landmarks.filter((l) => l.model === 'iceFall');
    expect(falls.length).toBeGreaterThanOrEqual(4);
    for (const f of falls) {
      // the fall's front (+z turned by ry) points into the lake, toward the lens's side (+v on the map)
      const fx = Math.sin(f.ry), fz = Math.cos(f.ry);
      const [fu, fv] = toMap(fx, fz);
      expect(fv, 'faces down the screen (the lens)').toBeGreaterThan(0.3);
      void fu;
      expect(Math.abs(world.heightAt(f.x + fx * m(8), f.z + fz * m(8)) - H(-65)), 'the lake in front').toBeLessThan(0.8);
      expect(world.heightAt(f.x - fx * m(10), f.z - fz * m(10)), 'the ledge behind').toBeGreaterThan(H(-50));
      expect(world.areaAt(f.x + fx * 6, f.z + fz * 6)?.region).toBe(3);
    }
  });

  it('starts its ramps right at the lip (no deep trench beside them)', () => {
    for (const id of ['ramp3', 'rampIce', 'ramp3b', 'ramp3d', 'rampBear']) {
      const r = world.ramps.find((q) => q.id === id);
      expect(r, id).toBeTruthy();
      expect(r.material).toBe('snow');
      const [ax, az] = r.pts[0], [bx, bz] = r.pts.at(-1), len = Math.hypot(bx - ax, bz - az);
      const sx = -(bz - az) / len, sz = (bx - ax) / len;
      // (beside it either rock, or walkable ground no more than a step or three above it)
      for (let t = 0.1; t <= 0.9; t += 0.2) {
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t, h = world.heightAt(x, z);
        for (const side of [-1, 1]) {
          const off = r.width / 2 + 1.5, px = x + sx * off * side, pz = z + sz * off * side;
          if (nav.nearest({ x: px, z: pz }, 0) < 0) continue;
          expect(world.heightAt(px, pz) - h, `${id} at ${t.toFixed(1)}`).toBeLessThan(3.5);
        }
      }
    }
  });

  it('has icicle passes on walkable ground, clear of the rink and the lift', () => {
    expect(D.icicles.length).toBeGreaterThanOrEqual(2);
    for (const z of D.icicles) {
      expect(near(z.at, 3), 'on ground').toBeGreaterThanOrEqual(0);
      expect(Math.hypot(z.at[0] - D.iceBear.at[0], z.at[1] - D.iceBear.at[1])).toBeGreaterThan(D.iceBear.r + z.r);
      expect(Math.hypot(z.at[0] - D.lift3.lake[0], z.at[1] - D.lift3.lake[1])).toBeGreaterThan(z.r);
    }
    // the warning is long enough to walk out of (≥ 1.2 s, a radius of ~1 m)
    expect(ICICLE.warn).toBeGreaterThanOrEqual(1.2);
    expect(ICICLE.radius / 4).toBeLessThan(ICICLE.warn); // walking (4 m/s) clears it in time
  });
});

describe('slippery ice (W3)', () => {
  it('knows its ice: the lake and the rink slide, the snow and the ramps do not', () => {
    expect(SLIP.ice).toBe(1);
    expect(world.slipAt(...P.lake)).toBe(1);
    expect(world.slipAt(...P.shelf)).toBe(0);
    expect(world.slipAt(...P.threshold)).toBe(0);
    expect(world.slipAt(...D.camp.at)).toBe(0);
    const ramp = world.ramps.find((r) => r.id === 'ramp3b');
    expect(world.slipAt(...ramp.pts[0])).toBe(0);
  });

  it('turns slowly and slides on after stopping (rolls slide further); off the ice, at once', () => {
    const dt = 1 / 60;
    // off the ice: the input applies at once
    expect(slideVelocity({ x: 0, z: 0 }, { x: 4, z: 0 }, 0, dt)).toEqual({ x: 4, z: 0 });
    // on the ice: from rest it takes a while to get going
    let v = { x: 0, z: 0 };
    for (let t = 0; t < 0.1; t += dt) v = slideVelocity(v, { x: 4, z: 0 }, 1, dt);
    expect(v.x).toBeGreaterThan(0.5);
    expect(v.x).toBeLessThan(2.5);
    for (let t = 0; t < 2; t += dt) v = slideVelocity(v, { x: 4, z: 0 }, 1, dt);
    expect(v.x).toBeCloseTo(4, 1);
    // let go: it slides on, about slideDistance, and stops
    let x = 0;
    for (let t = 0; t < 6; t += dt) { v = slideVelocity(v, { x: 0, z: 0 }, 1, dt); x += v.x * dt; }
    expect(x).toBeGreaterThan(1.2);
    expect(x).toBeLessThan(3);
    expect(Math.abs(x - slideDistance(4, 1))).toBeLessThan(0.15);
    expect(Math.abs(v.x)).toBeLessThan(0.01);
    // a roll (7 m/s) slides further than a walk
    let rv = { x: 7, z: 0 }, rx = 0;
    for (let t = 0; t < 8; t += dt) { rv = slideVelocity(rv, { x: 0, z: 0 }, 1, dt, { rolled: true }); rx += rv.x * dt; }
    expect(rx).toBeGreaterThan(x * 2);
    expect(rx).toBeLessThan(8); // never forever: the edge walls are near anyway
    expect(ICE.grip).toBeLessThan(ICE.firm);
  });

  it('makes paths walk the ice a little reluctantly, without breaking a straight line over it', () => {
    expect(SLIP_COST).toBeGreaterThan(0);
    expect(SLIP_COST).toBeLessThan(1); // (a cost of 1+ is a puddle: it breaks smoothing)
    const costAt = (n) => { const p = nav.posOf(n); return world.slipAt(p.x, p.z) * SLIP_COST; };
    const a = { x: M(-300, 40)[0], z: M(-300, 40)[1] }, b = { x: M(-400, -10)[0], z: M(-400, -10)[1] };
    const plain = nav.findPath(a, b), cold = nav.findPath(a, b, { costAt });
    expect(plain && cold && !cold.partial).toBe(true);
    expect(cold.points.length).toBeLessThanOrEqual(plain.points.length + 2);
  });

  it('lets a push slide on (about three times as far) on ice, never forever', () => {
    expect(knockDecay(6, 0)).toBe(6);
    expect(knockDecay(6, 1)).toBeCloseTo(2.1, 5);
    expect(6 / knockDecay(6, 1)).toBeLessThan(3.5);
    expect(knockDecay(6, 5)).toBeCloseTo(2.1, 5); // (clamped)
  });
});

describe('the deer and the bear (GDD §3.2)', () => {
  const deer = ENEMIES.deer, bear = ENEMIES.bear;
  it('has their numbers: deer hp 4, a heart, the shield; bear hp 6, 1½ hearts, the water gun', () => {
    expect([deer.hp, deer.damage, deer.weakTo]).toEqual([4, 1, 'shield']);
    expect([bear.hp, bear.damage, bear.weakTo]).toEqual([6, 1.5, 'waterGun']);
    expect(deer.stuck).toBe(2);
    expect(bear.face.stagger).toBe(2);
    expect(deer.keep).toBeGreaterThan(5); // keeps its distance
    expect(bear.speed).toBeLessThan(ENEMIES.wolf.speed); // a slow chase
    expect(deer.windup).toBeGreaterThanOrEqual(1); // a long, readable aim
    expect(bear.windup).toBeGreaterThanOrEqual(1);
    expect(ENEMIES.hare.model).toBe('hare');
    expect(ENEMIES.hare.lane).toEqual(ENEMIES.rabbit.lane);
  });

  it('the deer: keeps away, aims its lane, charges; a raised shield sticks its antlers fast for 2 s', () => {
    const ai = newAI();
    const run = (input, secs) => { const evs = []; for (let t = 0; t < secs; t += 0.05) { const e = stepAI(ai, { dist: 8, sees: true, hp: 4, ...input }, 0.05, deer); if (e) evs.push(e); } return evs; };
    expect(run({}, 0.1)).toContain('alert');
    run({}, deer.alert + 0.1);
    expect(ai.state).toBe('chase');
    // it may wind up only after `aim` s of keeping its distance
    run({ dist: 9 }, deer.aim + 0.1);
    expect(ai.state).toBe('windup');
    run({}, deer.windup + 0.05);
    expect(ai.state).toBe('attack');
    // the charge meets a raised shield: stuck
    expect(shieldStun(deer, true)).toBe(2);
    expect(shieldStun(deer, false)).toBe(0);
    expect(shieldStun(ENEMIES.rabbit, true)).toBe(0); // (a rabbit only bounces)
    stepAI(ai, { dist: 1, sees: true, hp: 4, stun: shieldStun(deer, true) }, 0.05, deer);
    expect(ai.state).toBe('stagger');
    run({ dist: 1 }, 1.9);
    expect(ai.state).toBe('stagger'); // still stuck after 1.9 s
    run({ dist: 1 }, 0.2);
    expect(ai.state).toBe('chase');
  });

  it('the bear: water in its face staggers it 2 s; from behind only wets it', () => {
    // facing +z (heading 0): a shot from in front, from the side, from behind
    expect(inFace(0, 0, 0, 0, 5, bear.face.arc)).toBe(true);
    expect(inFace(0, 0, 0, 4, 3, bear.face.arc)).toBe(true); // 53° off: within the 60° half arc
    expect(inFace(0, 0, 0, 5, 0, bear.face.arc)).toBe(false);
    expect(inFace(0, 0, 0, 0, -5, bear.face.arc)).toBe(false);
    expect(inFace(0, 0, Math.PI, 0, -5, bear.face.arc)).toBe(true);
    expect(waterStun(bear, true)).toBe(2);
    expect(waterStun(bear, false)).toBe(0);
    expect(waterStun(ENEMIES.wolf, true)).toBe(0);
    const ai = { ...newAI(), state: 'windup' };
    stepAI(ai, { dist: 2, sees: true, hp: 6, stun: waterStun(bear, true), pushed: false }, 0.05, bear);
    expect(ai.state).toBe('stagger'); // the slam is cancelled
    for (let t = 0; t < 1.9; t += 0.05) stepAI(ai, { dist: 2, sees: true, hp: 6 }, 0.05, bear);
    expect(ai.state).toBe('stagger');
    for (let t = 0; t < 0.2; t += 0.05) stepAI(ai, { dist: 5, sees: true, hp: 6 }, 0.05, bear);
    expect(ai.state).toBe('chase');
    // a slam is a circle in front of it, its heavy body hardly pushed
    expect(bear.slam.r).toBeGreaterThan(1.5);
    expect(bear.heavy).toBeLessThan(0.5);
  });
});

describe('armour: blue hearts (GDD §6.3)', () => {
  it('takes the blue hearts first, half a heart at a time', () => {
    expect(takeDamage(5, 2, 1.5)).toEqual({ hearts: 5, armor: 0.5 });
    expect(takeDamage(5, 0.5, 1)).toEqual({ hearts: 4.5, armor: 0 });
    expect(takeDamage(5, 0, 1.5)).toEqual({ hearts: 3.5, armor: 0 });
    expect(takeDamage(1, 1, 3)).toEqual({ hearts: 0, armor: 0 });
    expect(takeDamage(5, 3, 0.5)).toEqual({ hearts: 5, armor: 2.5 });
  });

  it('gives +1 / +2 / +3 by grade, puts on only a better one, and fills again', () => {
    expect([armorHearts('common'), armorHearts('rare'), armorHearts('legend'), armorHearts(null)]).toEqual([1, 2, 3, 0]);
    expect(ITEMS.armor.blueHearts).toEqual({ common: 1, rare: 2, legend: 3 });
    const run = newRun(1);
    expect(maxArmor(run)).toBe(0);
    grant(run, 'armor', 1, { grade: 'rare' });
    expect([run.armorGrade, run.armor, maxArmor(run)]).toEqual(['rare', 2, 2]);
    expect(run.owned).toContain('armor');
    grant(run, 'armor', 1, { grade: 'common' }); // worse: kept the rare one
    expect(run.armorGrade).toBe('rare');
    expect(betterArmor('legend', 'rare')).toBe(true);
    run.armor = 0;
    expect(refillArmor(run)).toBe(2);
    expect(run.armor).toBe(2);
  });

  it('is sold by the merchant (once) and kept in the bag between pages', () => {
    const run = newRun(2);
    run.shards = 20;
    expect(canBuy(run, 'armor').ok).toBe(true);
    expect(buy(run, 'armor').ok).toBe(true);
    expect([run.armorGrade, run.armor]).toEqual(['common', 1]);
    expect(canBuy(run, 'armor').reason).toBe('owned');
    const s = newState();
    run.armor = 0;
    keepBag(s, run);
    const back = newRun(3);
    restoreBag(s, back);
    expect([back.armorGrade, back.armor]).toEqual(['common', 1]); // (full again)
  });
});

describe('the Ice Bear (GDD §3.3)', () => {
  const def = BOSSES.iceBear;
  it('draws every attack first, rests after each, and its fists stick in the ice after a pound', () => {
    for (const [i, pool] of def.patterns.entries()) {
      for (const p of pool) {
        const steps = iceBearSteps(p, i + 1, def);
        expect(steps.at(-1).name, p).toBe('rest');
        steps.forEach((s, k) => {
          if (s.hit) {
            expect(steps[k - 1].tele, `${p} ${s.name}`).toBeTruthy();
            expect(steps[k - 1].dur).toBeGreaterThanOrEqual(def.minWindup);
          }
        });
        if (p === 'fist') expect(steps.some((s) => s.name === 'stuck' && s.dazed)).toBe(true);
      }
    }
    expect(iceBearSteps('fist', 3, def).filter((s) => s.name === 'pound').length).toBe(2); // phase 3: two pounds
    expect(iceBearSteps('chunks', 1, def)[0].n).toBe(3);
    expect(iceBearSteps('chunks', 3, def)[0].n).toBe(5);
    // kid-friendly: the chunks never cover much of the rink
    expect(def.chunks.count[2] * Math.PI * def.chunks.radius ** 2).toBeLessThan(Math.PI * 15 ** 2 * 0.2);
  });

  it('runs three phases at 66 % and 33 %, each telegraph before its hit in time, dazed while stuck', () => {
    const ai = newBossAI();
    const rand = rng(7);
    const log = [];
    let hp = def.hp;
    let t = 0;
    const tick = (secs) => { for (let s = 0; s < secs; s += 0.05) { t += 0.05; for (const ev of stepBoss(ai, { hp, maxHp: def.hp, started: true, stun: 0 }, 0.05, def, rand, iceBearSteps)) if (ev.type === 'step') log.push({ ...ev.step, at: t, phase: ai.phase }); } };
    tick(1);
    tick(40);
    const names1 = new Set(log.map((s) => s.name));
    expect(names1.has('raise') && names1.has('call')).toBe(true);
    expect(names1.has('inhale')).toBe(false); // phase 1: no blizzard
    hp = def.hp * 0.6;
    tick(30);
    expect(log.some((s) => s.name === 'roar' && s.phase === 2)).toBe(true);
    expect(log.some((s) => s.name === 'inhale')).toBe(true);
    hp = def.hp * 0.3;
    tick(40);
    expect(log.some((s) => s.name === 'roar' && s.phase === 3)).toBe(true);
    // every hit comes after its telegraph, at least the minimum warning later
    for (let k = 1; k < log.length; k++) if (log[k].hit) { expect(log[k - 1].tele, log[k].name).toBeTruthy(); expect(log[k].at - log[k - 1].at).toBeGreaterThanOrEqual(def.minWindup - 0.06); }
    // stuck: the hammer counts double
    const st = { ...newBossAI(), state: 'pattern', step: { name: 'stuck', dazed: true } };
    expect(doingOf(st)).toBe('stuck');
    expect(isDazed(st)).toBe(true);
    expect(def.hammerBonus).toBe(2);
  });
});

describe('region 3\'s encounters and checks', () => {
  const place = (x, z) => { const n = nav.nearest({ x, z }, 3); if (n < 0) return null; const p = nav.posOf(n); return [p.x, p.z]; };
  it('has deer, bears, snow hares and herds, tougher still (GDD §8.5: ×1.5 hp, ×1.3 damage)', () => {
    expect(REGION_DIFFICULTY[3]).toEqual({ hp: 1.5, damage: 1.3 });
    expect(FILL.bears).toEqual({ bear: [1, 1] });
    const spots = D.spots.filter((s) => s.region === 3);
    expect(spots.length).toBeGreaterThanOrEqual(6);
    const seen = new Set();
    for (let n = 1; n <= 30; n++) {
      for (const e of seedEncounters(D.spots, expeditionSeed(13, n), { expedition: n, place })) {
        const s = D.spots.find((q) => q.id === e.spot);
        for (const en of e.enemies) {
          if (s.region === 3) seen.add(en.kind);
          else if (s.region !== 4) expect(['deer', 'bear', 'hare']).not.toContain(en.kind); // (W4: the Crystal Heart has every animal)
          expect(Math.hypot(en.x - s.at[0], en.z - s.at[1])).toBeLessThan(s.r + 4);
        }
      }
    }
    for (const k of ['deer', 'bear', 'hare']) expect(seen.has(k), k).toBe(true);
    // the deer have room to charge: their spots on the open snow or the lake
    for (const s of spots.filter((q) => q.kinds.deer)) expect(['ice', 'snow']).toContain(world.terrain(...s.at).top?.material);
  });

  it('starts ?start=ice with the queen asleep, the ice door open, the shield in the bag', () => {
    const s = newState();
    expect(presetProgress(s, { start: 'ice', seed: 4 })).toBe(true);
    expect(s.world.bosses).toMatchObject({ rabbitChief: true, mushroomQueen: true });
    expect(s.world.gates).toMatchObject({ region2: true, shortcut: true, lift: true, ice: true });
    expect(s.world.bag.owned).toContain('shield');
    expect(s.stars).toBeGreaterThanOrEqual(2);
    expect(near(D.starts.ice, 1)).toBeGreaterThanOrEqual(0);
    expect(world.areaAt(...D.starts.ice)?.region).toBe(3);
    expect(world.gate('ice').opens).toBe('mushroomQueen');
  });
});
