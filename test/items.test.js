import { describe, it, expect } from 'vitest';
import {
  TOOL_ORDER, nextTool, otherTools, grant, bindTime, isWet,
  newShield, raiseShield, lowerShield, stepShield, inFront, shieldBlocks, eatHerb,
} from '../src/combat/loadout.js';
import { newAI, stepAI, bindLeft, speedOf, tracks } from '../src/entities/enemyAI.js';
import { rollLoot, lootChoices, rollClearDrop, herbBoost } from '../src/core/loot.js';
import { rng, subSeed } from '../src/core/rng.js';
import { newRun, resetRun } from '../src/core/run.js';
import { ITEMS, START, CHEST_LOOT, ASSIST } from '../src/data/items.js';
import { ENEMIES } from '../src/data/enemies.js';

const wolf = ENEMIES.wolf;

describe('the right-click tools and Q (GDD §4.1, §6.2)', () => {
  it('Q order is water gun → vine → mask, from the data', () => {
    expect(TOOL_ORDER).toEqual(['waterGun', 'vine', 'mask']);
  });
  it('cycles over owned tools only, wrapping round', () => {
    expect(nextTool('waterGun', ['hammer', 'waterGun'])).toBe('waterGun'); // only one: stays
    expect(nextTool('waterGun', ['hammer', 'waterGun', 'vine'])).toBe('vine');
    expect(nextTool('vine', ['hammer', 'waterGun', 'vine'])).toBe('waterGun');
    expect(nextTool('waterGun', ['waterGun', 'mask'])).toBe('mask'); // skips the vine it lacks
    expect(nextTool('mask', ['waterGun', 'vine', 'mask'])).toBe('waterGun');
    expect(nextTool('waterGun', ['hammer'])).toBe(null);
  });
  it('lists the other owned tools in the order Q reaches them', () => {
    expect(otherTools('waterGun', ['waterGun'])).toEqual([]);
    expect(otherTools('vine', ['waterGun', 'vine', 'mask'])).toEqual(['mask', 'waterGun']);
  });
});

describe('the starting bag (GDD §11.1)', () => {
  it('a run starts with the hammer and the water gun, no herbs, the water gun selected', () => {
    const run = newRun(7);
    expect(run.owned).toEqual(['hammer', 'waterGun']);
    expect(run).toMatchObject({ tool: 'waterGun', herbs: 0, seed: 7 });
    expect(START.owned).toEqual(['hammer', 'waterGun']); // newRun copies, never shares
    run.owned.push('vine');
    expect(newRun().owned).toEqual(['hammer', 'waterGun']);
  });
  it('a new tool from a chest is selected straight away; a reset empties the bag', () => {
    const run = newRun(1);
    grant(run, 'vine');
    expect(run.owned).toContain('vine');
    expect(run.tool).toBe('vine');
    grant(run, 'shield');
    expect(run.tool).toBe('vine'); // the shield is not a right-click tool
    resetRun(run, 2);
    expect(run).toMatchObject({ owned: ['hammer', 'waterGun'], tool: 'waterGun', herbs: 0, seed: 2 });
  });
});

describe('the vine (GDD §3.2, §6.3, §6.6)', () => {
  it('binds 3 s dry, 5 s when water hit the animal in the last few seconds', () => {
    const now = 10, wet = ITEMS.waterGun.wet;
    expect(bindTime(-Infinity, now)).toBe(3);
    expect(bindTime(now - 1 + wet, now)).toBe(5); // hit 1 s ago
    expect(bindTime(now - 0.01, now)).toBe(3); // dried off
    expect(isWet(now + 0.5, now)).toBe(true);
    expect(ITEMS.vine).toMatchObject({ range: 6, bind: 3, bindWet: 5, cooldown: 8 });
  });
  const runFor = (ai, input, secs, dt = 1 / 60) => {
    const events = [];
    for (let t = 0; t < secs - 1e-9; t += dt) { const ev = stepAI(ai, input, dt, wolf); if (ev) events.push(ev); }
    return events;
  };
  for (const secs of [3, 5]) {
    it(`a bound wolf holds still for ${secs} s, then chases again`, () => {
      const ai = newAI();
      runFor(ai, { dist: 4, sees: true, hp: 3 }, 1); // chasing
      expect(stepAI(ai, { dist: 4, sees: true, hp: 3, bind: secs }, 1 / 60, wolf)).toBe('bound');
      expect(speedOf('bound', wolf)).toBe(0);
      expect(tracks('bound')).toBe(false);
      runFor(ai, { dist: 1, sees: true, hp: 3 }, secs - 0.1); // the hero right beside it: no windup
      expect(ai.state).toBe('bound');
      expect(bindLeft(ai)).toBeGreaterThan(0);
      expect(runFor(ai, { dist: 4, sees: true, hp: 3 }, 0.2)).toEqual(['chase']);
      expect(bindLeft(ai)).toBe(0);
    });
  }
  it('cancels a windup: no bite', () => {
    const ai = newAI();
    runFor(ai, { dist: 8, sees: true, hp: 3 }, 1);
    runFor(ai, { dist: 1.2, sees: true, hp: 3 }, 0.2);
    expect(ai.state).toBe('windup');
    stepAI(ai, { dist: 1.2, sees: true, hp: 3, bind: 3 }, 1 / 60, wolf);
    expect(runFor(ai, { dist: 1.2, sees: true, hp: 3 }, 2)).not.toContain('bite');
  });
  it('water does not knock it out of the vine; the hammer still puts it to sleep', () => {
    const ai = newAI();
    stepAI(ai, { dist: 3, sees: true, hp: 3, bind: 3 }, 1 / 60, wolf);
    stepAI(ai, { dist: 3, sees: true, hp: 3, pushed: true, hit: true }, 1 / 60, wolf);
    expect(ai.state).toBe('bound');
    expect(stepAI(ai, { dist: 1, sees: true, hp: 0, hit: true }, 1 / 60, wolf)).toBe('asleep');
  });
});

describe('the shield (GDD §6.3: front 120°, 2 s hold, 4 s cooldown)', () => {
  it('covers the front, not the back or the sides', () => {
    // the hero at the origin facing +Z (heading 0)
    expect(inFront(0, 0, 0, 0, 2)).toBe(true); // straight ahead
    expect(inFront(0, 0, 0, 1.5, 1.5)).toBe(true); // 45° off: inside 60°
    expect(inFront(0, 0, 0, 2, 0.5)).toBe(false); // ~76° off
    expect(inFront(0, 0, 0, 0, -2)).toBe(false); // behind
    expect(inFront(0, 0, Math.PI, 0, -2)).toBe(true); // turned round
    const sh = newShield();
    expect(shieldBlocks(sh, 0, 0, 0, 0, 2)).toBe(false); // not raised
    raiseShield(sh);
    expect(shieldBlocks(sh, 0, 0, 0, 0, 2)).toBe(true);
    expect(shieldBlocks(sh, 0, 0, 0, 0, -2)).toBe(false);
  });
  it('drops after 2 s of holding, then waits 4 s', () => {
    const sh = newShield();
    expect(raiseShield(sh)).toBe(true);
    const steps = (n) => { let ev = null; for (let i = 0; i < n; i++) ev = stepShield(sh, 0.05) ?? ev; return ev; };
    expect(steps(39)).toBe(null); // 1.95 s
    expect(sh.up).toBe(true);
    expect(steps(2)).toBe('timeout'); // 2.05 s
    expect(sh.up).toBe(false);
    expect(sh.cooldown).toBeCloseTo(4, 1);
    expect(raiseShield(sh)).toBe(false); // still cooling down
    steps(78); // 3.9 s
    expect(raiseShield(sh)).toBe(false);
    steps(3);
    expect(raiseShield(sh)).toBe(true);
  });
  it('the cooldown starts on release', () => {
    const sh = newShield();
    raiseShield(sh);
    stepShield(sh, 0.5);
    expect(lowerShield(sh)).toBe(true);
    expect(sh.cooldown).toBe(ITEMS.shield.cooldown);
    expect(lowerShield(sh)).toBe(false);
  });
});

describe('herbs (GDD §6.3, §12: 2 hearts, never past the maximum, carry 3)', () => {
  it('heals 2 hearts', () => {
    expect(eatHerb({ hearts: 2, maxHearts: 5, herbs: 2 })).toEqual({ ok: true, hearts: 4, herbs: 1 });
  });
  it('caps at the maximum', () => {
    expect(eatHerb({ hearts: 4, maxHearts: 5, herbs: 1 })).toMatchObject({ ok: true, hearts: 5, herbs: 0 });
    expect(eatHerb({ hearts: 3.5, maxHearts: 5, herbs: 1 }).hearts).toBe(5);
  });
  it('none to eat, or hearts already full: nothing happens', () => {
    expect(eatHerb({ hearts: 2, maxHearts: 5, herbs: 0 })).toMatchObject({ ok: false, reason: 'none', hearts: 2 });
    expect(eatHerb({ hearts: 5, maxHearts: 5, herbs: 2 })).toMatchObject({ ok: false, reason: 'full', herbs: 2 });
  });
  it('carries 3 at most', () => {
    const run = newRun(1);
    expect([1, 2, 3, 4].map(() => grant(run, 'herb'))).toEqual([true, true, true, false]);
    expect(run.herbs).toBe(ITEMS.herb.max);
  });
});

describe('treasure chests (GDD §6.5, §11.1)', () => {
  it('the same seed gives the same loot', () => {
    const roll = (seed, n) => rollLoot(newRun(seed), rng(subSeed(seed, n)));
    for (const seed of [1, 3, 42, 99999]) for (const n of [0, 1, 2]) expect(roll(seed, n)).toEqual(roll(seed, n));
    // and different chests of one seed differ somewhere
    const many = Array.from({ length: 20 }, (_, n) => roll(5, n).item);
    expect(new Set(many).size).toBeGreaterThan(1);
  });
  it('seed 3 (the M3 test seed): RoomSmall gives the shield, RoomLarge the vine', () => {
    const run = newRun(3);
    const a = rollLoot(run, rng(subSeed(3, 0)));
    grant(run, a.item, a.count);
    expect(a.item).toBe('shield');
    expect(rollLoot(run, rng(subSeed(3, 1))).item).toBe('vine');
  });
  it('never gives what the hero already has, nor a herb into a full belt', () => {
    const run = newRun(1);
    run.owned.push('vine', 'shield');
    run.herbs = ITEMS.herb.max;
    expect(lootChoices(run).map((e) => e.item)).toEqual(['shards']);
    for (let s = 0; s < 50; s++) {
      const r = rollLoot(run, rng(s));
      expect(r.item).toBe('shards');
      expect(r.count).toBeGreaterThanOrEqual(3);
      expect(r.count).toBeLessThanOrEqual(5);
    }
  });
  it('rolls every entry of the table at about its weight (M6a: per area)', () => {
    for (const area of [0, 1]) {
      const counts = {};
      const rand = rng(123);
      for (let i = 0; i < 4000; i++) { const run = newRun(1); run.area = area; const r = rollLoot(run, rand); counts[r.item] = (counts[r.item] ?? 0) + 1; }
      const table = CHEST_LOOT.filter((e) => (e.from ?? 0) <= area && !e.world); // (W5: grade-ups only in the big world)
      const total = table.reduce((s, e) => s + e.weight, 0);
      for (const e of table) expect(counts[e.item] / 4000).toBeCloseTo(e.weight / total, 1);
      expect(counts.mask ?? 0).toBe(area ? counts.mask : 0);
    }
  });
});

describe('herbs when hearts are low (GDD §8.5 도움 장치)', () => {
  it('raises the herb weight in chests at ≤ 25% hearts', () => {
    const run = newRun(1);
    expect(herbBoost(run)).toBe(1);
    const base = lootChoices(run).find((e) => e.item === 'herb').weight;
    run.hearts = run.maxHearts * ASSIST.lowHearts; // 1.25 → at most 1 heart in half steps
    run.hearts = 1;
    expect(lootChoices(run).find((e) => e.item === 'herb').weight).toBe(base * ASSIST.herbBoost);
    // and it shows in the rolls
    const share = (r) => { const rand = rng(9); let h = 0; for (let i = 0; i < 4000; i++) if (rollLoot(r, rand).item === 'herb') h++; return h / 4000; };
    const low = share(run); run.hearts = 5; const full = share(run);
    expect(low).toBeGreaterThan(full * 1.8);
  });
  it('drops a herb from a cleared room more often when low, never into a full belt', () => {
    const run = newRun(1);
    const rate = (r) => { const rand = rng(5); let h = 0; for (let i = 0; i < 4000; i++) if (rollClearDrop(r, rand)) h++; return h / 4000; };
    const full = rate(run);
    expect(full).toBeGreaterThan(0.2); expect(full).toBeLessThan(0.3);
    run.hearts = 1;
    expect(rate(run)).toBeGreaterThan(0.65);
    run.herbs = 3;
    expect(rate(run)).toBe(0);
  });
});
