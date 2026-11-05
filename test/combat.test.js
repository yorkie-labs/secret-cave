import { describe, it, expect } from 'vitest';
import {
  damageHearts, heartsText, canBeHurt, refillTank, spendWater, comboHit, newCombo, inCone, damageHp,
} from '../src/combat/hits.js';
import { newRun, resetRun, MAX_HEARTS } from '../src/core/run.js';
import { ITEMS } from '../src/data/items.js';
import { ENEMIES } from '../src/data/enemies.js';

describe('hearts (GDD §3.1: five, half-heart steps)', () => {
  it('a run starts with 5 hearts, a full tank and no shards', () => {
    expect(newRun()).toMatchObject({ hearts: 5, maxHearts: MAX_HEARTS, water: 1, shards: 0 });
  });
  it('a bite takes half a heart', () => {
    expect(damageHearts(5, 0.5)).toBe(4.5);
    expect(damageHearts(4.5, ENEMIES.wolf.damage)).toBe(4);
  });
  it('damage rounds to half hearts and never goes below zero', () => {
    expect(damageHearts(3, 0.4)).toBe(2.5);
    expect(damageHearts(0.5, 1.5)).toBe(0);
    expect(damageHearts(5, 1.5)).toBe(3.5);
  });
  it('ten bites from full put the hero to sleep', () => {
    let h = 5;
    for (let i = 0; i < 10; i++) h = damageHearts(h, 0.5);
    expect(h).toBe(0);
  });
  it('the orb shows halves', () => {
    expect(heartsText(5)).toBe('5');
    expect(heartsText(4.5)).toBe('4½');
    expect(heartsText(0.5)).toBe('½');
    expect(heartsText(0)).toBe('0');
  });
  it('no hurting while invulnerable (after a hit, or rolling) or already out of hearts', () => {
    expect(canBeHurt({ invulnerable: 0, hearts: 5 })).toBe(true);
    expect(canBeHurt({ invulnerable: 0.7, hearts: 5 })).toBe(false);
    expect(canBeHurt({ invulnerable: 0, hearts: 0 })).toBe(false);
  });
  it('a new run puts everything back in the same object', () => {
    const run = newRun();
    Object.assign(run, { hearts: 0, water: 0.2, shards: 4 });
    expect(resetRun(run)).toBe(run);
    expect(run).toMatchObject({ hearts: 5, water: 1, shards: 0 });
  });
});

describe('the water tank (GDD §6.3: 1/8 a shot, full again in ~10 s)', () => {
  const { water, refill } = ITEMS.waterGun;
  it('eight shots empty a full tank, the ninth splutters', () => {
    let w = 1;
    for (let i = 0; i < 8; i++) {
      const r = spendWater(w, water);
      expect(r.ok).toBe(true);
      w = r.water;
    }
    expect(w).toBeCloseTo(0);
    expect(spendWater(w, water)).toEqual({ ok: false, water: w });
  });
  it('fills from empty in the refill time, and not past full', () => {
    let w = 0;
    for (let t = 0; t < refill - 1e-9; t += 0.1) w = refillTank(w, 0.1, refill);
    expect(w).toBeCloseTo(1, 5);
    expect(refillTank(0.95, 1, refill)).toBe(1);
  });
  it('after 1.25 s an empty tank has a shot again', () => {
    expect(spendWater(refillTank(0, 1.25, refill), water).ok).toBe(true);
    expect(spendWater(refillTank(0, 1.0, refill), water).ok).toBe(false);
  });
});

describe('the hammer combo (GDD §6.3: every 3rd hit in a row is a shockwave)', () => {
  const c = ITEMS.hammer.combo;
  it('three hits a second apart: the third shakes the ground', () => {
    let k = newCombo();
    k = comboHit(k, 0, c); expect(k.wave).toBe(false); expect(k.count).toBe(1);
    k = comboHit(k, 1, c); expect(k.wave).toBe(false); expect(k.count).toBe(2);
    k = comboHit(k, 2, c); expect(k.wave).toBe(true);
    // and counting starts again
    k = comboHit(k, 3, c); expect(k.wave).toBe(false); expect(k.count).toBe(1);
  });
  it('a pause longer than the window breaks the chain', () => {
    let k = comboHit(comboHit(newCombo(), 0, c), 1, c);
    k = comboHit(k, 1 + c.window + 0.1, c);
    expect(k.wave).toBe(false);
    expect(k.count).toBe(1);
  });
  it('a slow chain (a bite in between, a whiff) still counts within the window', () => {
    let k = comboHit(comboHit(newCombo(), 0, c), 1.9, c);
    k = comboHit(k, 3.9, c);
    expect(k.wave).toBe(true);
  });
});

describe('cones (the hammer swing, the bite mark)', () => {
  it('hits what is in front within reach, not behind or too far', () => {
    expect(inCone(0, 0, 0, 0, 1.5, 2, 120)).toBe(true);
    expect(inCone(0, 0, 0, 0, -1.5, 2, 120)).toBe(false);
    expect(inCone(0, 0, 0, 0, 2.5, 2, 120)).toBe(false);
  });
  it('a big target is hit by its edge', () => {
    expect(inCone(0, 0, 0, 0, 2.5, 2, 120, 0.7)).toBe(true);
  });
  it('respects the arc and the heading', () => {
    expect(inCone(0, 0, 0, 1.5, 0.2, 2.3, 70)).toBe(false); // off to the side of a narrow bite
    expect(inCone(0, 0, Math.PI / 2, 1.5, 0.2, 2.3, 70)).toBe(true); // facing +X
  });
});

describe('enemy hp', () => {
  it('three water shots count as one hammer hit', () => {
    let hp = 1;
    for (let i = 0; i < 3; i++) hp = damageHp(hp, ITEMS.waterGun.damage);
    expect(hp).toBe(0);
  });
  it('a wolf takes three hammer hits', () => {
    let hp = ENEMIES.wolf.hp, n = 0;
    while (hp > 0) { hp = damageHp(hp, ITEMS.hammer.damage); n++; }
    expect(n).toBe(3);
  });
});

describe('data (GDD §10.4)', () => {
  it('has the hammer, the water gun and the wolf as the GDD gives them', () => {
    expect(ITEMS.hammer).toMatchObject({ slot: 'main', damage: 1, range: 2, rate: 1 });
    expect(ITEMS.waterGun).toMatchObject({ slot: 'tool', range: 10, rate: 2, water: 1 / 8, push: 1.5 }); // GDD §6.3 after the M3 tuning
    expect(ITEMS.waterGun.damage).toBeCloseTo(1 / 3);
    expect(ENEMIES.wolf).toMatchObject({ hp: 3, damage: 0.5, speed: 5.5, detect: 10, attackRange: 1.5, weakTo: 'vine' });
  });
  it('every animal is weak to a real item', () => {
    for (const e of Object.values(ENEMIES)) expect(ITEMS[e.weakTo]).toBeTruthy();
  });
});
