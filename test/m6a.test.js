import { describe, it, expect } from 'vitest';
import { ENEMIES } from '../src/data/enemies.js';
import { ITEMS, SHOP, CHEST_LOOT } from '../src/data/items.js';
import { BOSSES, POISON, BOUNCE } from '../src/data/bosses.js';
import { carryDamage, scaled, damageHearts } from '../src/combat/hits.js';
import { newMask, wearMask, dropMask, stepMask, detectScale, ambushDamage, TOOL_ORDER, nextTool } from '../src/combat/loadout.js';
import { canBuy, buy, shelf } from '../src/core/shop.js';
import { newCloak, stepCloak, canHide, senseRange } from '../src/entities/foxAI.js';
import { newMoleAI, stepMole, underground, exposed } from '../src/entities/moleAI.js';
import { newBossAI, stepBoss, phaseOf, doingOf, isDazed } from '../src/entities/bosses/chiefAI.js';
import { queenSteps } from '../src/entities/bosses/queenAI.js';
import { newAI, stepAI } from '../src/entities/enemyAI.js';
import { lootChoices } from '../src/core/loot.js';
import { newRun } from '../src/core/run.js';
import { newState, recordFinalWin, beatBoss } from '../src/core/state.js';
import { rng } from '../src/core/rng.js';

// M6a (tasks/20261102-full-game-todo.md): the mushroom cave's pure rules.

describe('damage carried over (GDD §8.5)', () => {
  it('damage under half a heart is carried over, never lost or rounded up', () => {
    // moss: half a heart is half a heart
    let carry = 0, lost = 0;
    for (let i = 0; i < 10; i++) { const r = carryDamage(0.5, carry); carry = r.carry; lost += r.hearts; }
    expect(lost).toBe(5);
    expect(carry).toBeCloseTo(0);
    // mushroom: × 1.15 adds up to an extra half heart every few bites
    carry = 0; lost = 0;
    const taken = [];
    for (let i = 0; i < 20; i++) { const r = carryDamage(0.5 * 1.15, carry); carry = r.carry; lost += r.hearts; taken.push(r.hearts); }
    expect(lost + carry).toBeCloseTo(20 * 0.575);
    expect(taken.every((h) => h === 0.5 || h === 1)).toBe(true);
    expect(taken.filter((h) => h === 1).length).toBe(3);
    // the heart orb only ever sees half hearts
    expect(damageHearts(5, taken[0])).toBe(4.5);
    // a mole's whole heart × 1.15
    expect(carryDamage(1.15, 0).hearts).toBe(1);
    expect(carryDamage(1.15, 0.4).hearts).toBe(1.5);
  });
});

describe('the mask (GDD §6.3)', () => {
  const def = ITEMS.mask;
  it('joins the Q cycle after the vine', () => {
    expect(TOOL_ORDER).toEqual(['waterGun', 'vine', 'mask']);
    expect(nextTool('vine', ['waterGun', 'vine', 'mask'])).toBe('mask');
    expect(nextTool('mask', ['waterGun', 'vine', 'mask'])).toBe('waterGun');
    expect(nextTool('waterGun', ['waterGun', 'mask'])).toBe('mask');
  });
  it('5 s on, animals notice from a third as far, then 20 s to cool down', () => {
    const m = newMask();
    expect(detectScale(m)).toBe(1);
    expect(wearMask(m)).toBe(true);
    expect(detectScale(m)).toBeCloseTo(1 / 3);
    expect(ENEMIES.wolf.detect * detectScale(m)).toBeCloseTo(10 / 3);
    expect(wearMask(m)).toBe(false); // already on
    let off = null;
    for (let t = 0; t < def.duration + 0.05; t += 0.05) off = stepMask(m, 0.05) ?? off;
    expect(off).toBe('off');
    expect(m.active).toBe(false);
    expect(m.cooldown).toBeCloseTo(def.cooldown, 0);
    expect(wearMask(m)).toBe(false); // cooling down
    for (let t = 0; t < def.cooldown + 0.1; t += 0.1) stepMask(m, 0.1);
    expect(wearMask(m)).toBe(true);
  });
  it('the first hammer from behind it hits twice, and any attack takes it off', () => {
    const m = newMask();
    wearMask(m);
    expect(ambushDamage(1, m)).toBe(2);
    expect(dropMask(m)).toBe(true); // the attack
    expect(ambushDamage(1, m)).toBe(1);
    expect(dropMask(m)).toBe(false);
    expect(m.cooldown).toBe(def.cooldown);
  });
  it('a disguised hero walks past an animal that would have noticed it', () => {
    const wolf = ENEMIES.wolf;
    const plain = newAI(), masked = newAI();
    const input = { dist: 6, sees: true, hp: 3 };
    stepAI(plain, input, 0.1, wolf);
    stepAI(masked, { ...input, detect: wolf.detect / 3 }, 0.1, wolf);
    expect(plain.state).toBe('alert');
    expect(masked.state).toBe('idle');
    // and a chase is lost much sooner
    const chasing = { ...newAI(), state: 'chase' };
    stepAI(chasing, { dist: 8, sees: true, hp: 3, detect: wolf.detect / 3 }, 0.1, wolf);
    expect(chasing.state).toBe('idle');
  });
  it('comes out of chests from the mushroom cave on', () => {
    const run = newRun(1);
    expect(lootChoices(run).some((e) => e.item === 'mask')).toBe(false);
    run.area = 1;
    expect(lootChoices(run).some((e) => e.item === 'mask')).toBe(true);
    run.owned.push('mask');
    expect(lootChoices(run).some((e) => e.item === 'mask')).toBe(false);
    expect(CHEST_LOOT.find((e) => e.item === 'mask').once).toBe(true);
  });
});

describe('the bat merchant (GDD §7.3 상점)', () => {
  const price = (id) => SHOP.find((g) => g.id === id).price;
  it('sells for shards: the shards go, the goods come', () => {
    const run = newRun(1);
    run.shards = 10;
    const r = buy(run, 'herb');
    expect(r.ok).toBe(true);
    expect(run.herbs).toBe(1);
    expect(run.shards).toBe(10 - price('herb'));
    const m = buy(run, 'mask');
    expect(m.ok).toBe(true);
    expect(run.owned).toContain('mask');
    expect(run.tool).toBe('mask'); // a new tool is picked straight away
    expect(run.shards).toBe(10 - price('herb') - price('mask'));
  });
  it('cannot afford: nothing changes', () => {
    const run = newRun(1);
    run.shards = price('mask') - 1;
    const before = JSON.stringify(run);
    expect(canBuy(run, 'mask')).toEqual({ ok: false, reason: 'shards' });
    expect(buy(run, 'mask').ok).toBe(false);
    expect(JSON.stringify(run)).toBe(before);
  });
  it('a full herb belt, full hearts, a tool already owned: no sale', () => {
    const run = newRun(1);
    run.shards = 99;
    run.herbs = ITEMS.herb.max;
    expect(canBuy(run, 'herb').reason).toBe('full');
    expect(canBuy(run, 'heart').reason).toBe('full'); // hearts full
    run.hearts = 2;
    expect(buy(run, 'heart').ok).toBe(true);
    expect(run.hearts).toBe(4);
    run.hearts = 4.5;
    buy(run, 'heart');
    expect(run.hearts).toBe(5); // never past the maximum
    expect(canBuy(run, 'waterGun').reason).toBe('gone');
    run.owned.push('vine');
    expect(canBuy(run, 'vine').reason).toBe('owned');
    expect(shelf(run).some((g) => g.id === 'vine')).toBe(false);
    expect(shelf(run).find((g) => g.id === 'herb').ok).toBe(false);
  });
});

describe('the fox hides and ambushes (GDD §3.2 기습형)', () => {
  const def = ENEMIES.fox;
  it('hidden, it only notices the hero up close', () => {
    const c = newCloak();
    expect(c.hidden).toBe(true);
    expect(senseRange(c, def)).toBe(def.hide.ambush);
    const ai = newAI();
    stepAI(ai, { dist: 6, sees: true, hp: 3, detect: senseRange(c, def) }, 0.1, def);
    expect(ai.state).toBe('idle'); // 6 m: still hiding
    const ev = stepAI(ai, { dist: 4, sees: true, hp: 3, detect: senseRange(c, def) }, 0.1, def);
    expect(ev).toBe('alert');
    expect(stepCloak(c, { now: 1, ev, from: 'idle' }, def)).toBe('ambush');
    expect(c.hidden).toBe(false);
    expect(senseRange(c, def)).toBe(def.detect);
  });
  it('after the bite it slinks back to the shade and hides again', () => {
    const c = newCloak();
    stepCloak(c, { now: 0, ev: 'alert' }, def);
    expect(stepCloak(c, { now: 3, ev: 'chase', from: 'recover' }, def)).toBe('slink');
    expect(c.slinking).toBe(true);
    expect(stepCloak(c, { now: 4, arrived: false }, def)).toBe(null);
    // followed on the way: it turns to fight, then slinks off again after its bite
    const t = { ...c };
    expect(stepCloak(t, { now: 4, ev: 'alert', from: 'idle' }, def)).toBe('turn');
    expect(t.slinking).toBe(false);
    expect(stepCloak(t, { now: 6, ev: 'chase', from: 'recover' }, def)).toBe('slink');
    expect(stepCloak(c, { now: 5, arrived: true }, def)).toBe('hidden');
    expect(c.hidden).toBe(true);
  });
  it('water shows it up: it cannot hide again for a while', () => {
    const c = newCloak();
    expect(stepCloak(c, { now: 10, water: true }, def)).toBe('revealed');
    expect(c.hidden).toBe(false);
    expect(canHide(c, 10 + def.hide.reveal - 0.1)).toBe(false);
    // the bite is over, but it is still wet: it keeps fighting in the open
    expect(stepCloak(c, { now: 12, ev: 'chase', from: 'recover' }, def)).toBe(null);
    expect(c.slinking).toBe(false);
    // water on a slinking fox stops it too
    const d = newCloak();
    stepCloak(d, { now: 0, ev: 'alert' }, def);
    stepCloak(d, { now: 2, ev: 'chase', from: 'recover' }, def);
    expect(stepCloak(d, { now: 2.5, water: true }, def)).toBe('revealed');
    expect(d.slinking).toBe(false);
    expect(stepCloak(d, { now: 3, arrived: true }, def)).toBe(null);
    // once the time is up it may slink off again
    expect(canHide(c, 10 + def.hide.reveal)).toBe(true);
    expect(stepCloak(c, { now: 10 + def.hide.reveal + 1, ev: 'chase', from: 'recover' }, def)).toBe('slink');
  });
});

describe('the mole monster (GDD §3.2 특수형)', () => {
  const def = ENEMIES.mole;
  const run = (ai, input, secs, dt = 0.05) => { const evs = []; for (let t = 0; t < secs; t += dt) { const e = stepMole(ai, input, dt, def); if (e) evs.push(e); } return evs; };
  it('hp 3 and a whole heart (GDD §3.2)', () => {
    expect(def.hp).toBe(3);
    expect(def.damage).toBe(1);
    expect(def.weakTo).toBe('waterGun');
  });
  it('underground → telegraph → pops up → surfaced → digs down', () => {
    const ai = newMoleAI();
    expect(underground(ai.state)).toBe(true);
    let evs = run(ai, { dist: 7, sees: true, hp: 3 }, def.alert + 0.1);
    expect(evs).toEqual(['alert', 'travel']);
    expect(underground(ai.state)).toBe(true);
    evs = run(ai, { dist: 1.2, sees: true, hp: 3 }, def.regroup + 0.05);
    expect(evs).toEqual(['windup']);
    expect(exposed(ai.state)).toBe(false); // the red circle shows, it is still down
    evs = run(ai, { dist: 1.2, sees: true, hp: 3 }, def.windup + 0.05);
    expect(evs).toEqual(['pop']);
    expect(exposed(ai.state)).toBe(true);
    evs = run(ai, { dist: 1.2, sees: true, hp: 3 }, def.attack + def.surface + def.dig + 0.1);
    expect(evs).toEqual(['surface', 'dig', 'travel']);
    expect(underground(ai.state)).toBe(true);
  });
  it('it never takes long to come up: after `chase` s it bursts out anyway', () => {
    const ai = { state: 'travel', t: 0 };
    const evs = run(ai, { dist: 5, sees: true, hp: 3 }, def.chase + 0.1);
    expect(evs).toEqual(['windup']);
  });
  it('water into the mound floods it out: stunned, exposed; then it digs down', () => {
    for (const s of ['idle', 'travel', 'windup', 'dig']) {
      const ai = { state: s, t: 0 };
      expect(stepMole(ai, { dist: 4, sees: true, hp: 3, water: true }, 0.05, def), s).toBe('flooded');
      expect(exposed(ai.state)).toBe(true);
    }
    const ai = { state: 'flooded', t: 0 };
    const evs = run(ai, { dist: 4, sees: true, hp: 3 }, def.flooded + 0.05);
    expect(evs).toEqual(['dig']);
    // water when it is already up does not flood it again
    const up = { state: 'surface', t: 0 };
    expect(stepMole(up, { dist: 2, sees: true, hp: 3, water: true }, 0.05, def)).toBe(null);
    expect(up.state).toBe('surface');
  });
  it('the mask makes it notice the hero from a third as far', () => {
    const ai = newMoleAI();
    run(ai, { dist: 5, sees: true, hp: 3, detect: def.detect / 3 }, 0.5);
    expect(ai.state).toBe('idle');
  });
  it('asleep at hp 0', () => {
    const ai = { state: 'surface', t: 0 };
    expect(stepMole(ai, { dist: 2, hp: 0 }, 0.05, def)).toBe('asleep');
  });
});

describe('the Poison Mushroom Queen (GDD §3.3)', () => {
  const def = BOSSES.mushroomQueen;
  it('three phases at 66 % and 33 %', () => {
    expect(phaseOf(def.hp, def.hp, def.phases)).toBe(1);
    expect(phaseOf(def.hp * 0.65, def.hp, def.phases)).toBe(2);
    expect(phaseOf(def.hp * 0.3, def.hp, def.phases)).toBe(3);
    expect(def.patterns[0]).not.toContain('summon');
    expect(def.patterns[1][0]).toBe('summon'); // the new trick first
  });
  it('every step that can hurt comes after one that shows where, and every pattern ends in a rest', () => {
    for (const [i, pool] of def.patterns.entries()) {
      for (const p of pool) {
        const steps = queenSteps(p, i + 1, def);
        expect(steps.at(-1).name).toBe('rest');
        steps.forEach((s, k) => {
          if (s.hit) {
            expect(steps[k - 1].tele, `${p} ${s.name}`).toBeTruthy();
            expect(steps[k - 1].dur).toBeGreaterThanOrEqual(def.minWindup);
          }
        });
        // a dizzy window after the spores and the clouds (her cap droops)
        if (p !== 'summon') expect(steps.some((s) => s.dazed)).toBe(true);
      }
    }
  });
  it('more spore cones and clouds as she gets angrier, but never the whole arena', () => {
    expect(queenSteps('spray', 1, def)[0].n).toBe(1);
    expect(queenSteps('spray', 3, def)[0].n).toBe(3);
    expect(def.spray.cones[2] * def.spray.arc).toBeLessThan(360 / 2);
    const area = (n) => n * Math.PI * def.cloud.radius ** 2;
    expect(area(def.cloud.count[2])).toBeLessThan(Math.PI * 16 ** 2 * 0.3);
  });
  it('the scheduler: telegraph → hit → droop → rest, phase roars, dazed means the cap is open', () => {
    const ai = newBossAI();
    const rand = rng(5);
    const steps = [];
    let hp = def.hp;
    const tick = (secs) => { for (let t = 0; t < secs; t += 0.05) for (const ev of stepBoss(ai, { hp, maxHp: def.hp, started: true, stun: 0 }, 0.05, def, rand, queenSteps)) if (ev.type === 'step') steps.push(ev.step); };
    tick(30);
    const names = steps.map((s) => s.name);
    expect(names).toContain('puff');
    expect(names).toContain('seep');
    expect(names).not.toContain('call'); // phase 1: no summon
    for (let k = 1; k < steps.length; k++) if (steps[k].hit) expect(steps[k - 1].tele).toBeTruthy();
    hp = def.hp * 0.6;
    tick(20);
    expect(steps.map((s) => s.name)).toContain('roar');
    expect(steps.map((s) => s.name)).toContain('call');
    // in a droop the hammer counts double
    const d = { ...newBossAI(), state: 'pattern', step: { name: 'droop', dazed: true } };
    expect(isDazed(d)).toBe(true);
    expect(doingOf(d)).toBe('droop');
  });
  it('poison and bounce numbers are kind', () => {
    expect(POISON.tick).toBeGreaterThan(0.7); // longer than the hero's blink after a hit
    expect(POISON.mushroom.warn).toBeGreaterThanOrEqual(0.6);
    expect(POISON.damage).toBe(0.5);
    expect(BOUNCE.time).toBeGreaterThan(0.5);
  });
});

describe('bosses on the way and the win (GDD §8.3)', () => {
  it('each boss counts once, a star the first time; the way out counts a win', () => {
    const s = newState();
    expect(beatBoss(s, 'rabbitChief')).toEqual({ first: true, stars: 1 });
    expect(beatBoss(s, 'mushroomQueen')).toEqual({ first: true, stars: 2 });
    expect(recordFinalWin(s)).toEqual({ first: true, wins: 1 });
    expect(recordFinalWin(s).first).toBe(false);
    expect(s.beaten).toEqual({ rabbitChief: 1, mushroomQueen: 1 });
    expect(beatBoss(s, 'rabbitChief').first).toBe(false);
    expect(s.stars).toBe(2);
  });
});
