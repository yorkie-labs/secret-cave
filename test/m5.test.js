import { describe, it, expect } from 'vitest';
import { newAI, stepAI, landed, canDodge } from '../src/entities/enemyAI.js';
import { ENEMIES } from '../src/data/enemies.js';
import { BOSSES } from '../src/data/bosses.js';
import { phaseOf, stepsOf, pickPattern, newBossAI, stepBoss, doingOf, isDazed } from '../src/entities/bosses/chiefAI.js';
import { newState, takeNecklace, beatBoss, save, load } from '../src/core/state.js';
import { rng } from '../src/core/rng.js';

const rabbit = ENEMIES.rabbit;
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
function run(ai, input, secs, def, dt = 1 / 60) {
  const events = [];
  for (let t = 0; t < secs - 1e-9; t += dt) { const ev = stepAI(ai, input, dt, def); if (ev) events.push(ev); }
  return events;
}

describe('rabbit AI (GDD §3.2: keeps its distance, jump-dash, 0.8 s opening on landing)', () => {
  const near = { dist: 5.5, sees: true, hp: 2 };
  it('spots, keeps its distance a while, then aims the lane before the dash', () => {
    const ai = newAI();
    expect(run(ai, near, 0.55, rabbit)).toEqual(['alert', 'chase']);
    const chaseAt = ai.t;
    // inside attackRange, but it keeps its distance for `aim` s first
    const ev = [];
    let waited = chaseAt;
    while (!ev.length) { const e = stepAI(ai, near, 1 / 60, rabbit); waited += 1 / 60; if (e) ev.push(e); }
    expect(ev).toEqual(['windup']);
    expect(waited).toBeGreaterThanOrEqual(rabbit.aim - 1e-6);
    run(ai, near, rabbit.windup - 0.05, rabbit);
    expect(ai.state).toBe('windup');
    expect(run(ai, near, 0.1, rabbit)).toEqual(['bite']); // the dash starts after the full windup
  });

  it('lands and sits dazed for exactly the landing window, then hops off again', () => {
    const ai = { ...newAI(), state: 'attack', t: 0 };
    expect(run(ai, near, rabbit.attack + 0.01, rabbit)).toEqual(['recover']);
    expect(landed(ai, rabbit)).toBe(true);
    expect(rabbit.recover).toBeCloseTo(0.8);
    run(ai, near, rabbit.recover - 0.05, rabbit);
    expect(landed(ai, rabbit)).toBe(true);
    expect(run(ai, near, 0.1, rabbit)).toEqual(['chase']);
    expect(landed(ai, rabbit)).toBe(false);
    // and waits `aim` again before the next lane
    expect(run(ai, near, rabbit.aim - 0.2, rabbit)).toEqual([]);
  });

  it('a hammer hit while landed knocks it silly for `landing.dizzy` s', () => {
    const ai = { ...newAI(), state: 'recover', t: 0.2 };
    expect(stepAI(ai, { ...near, hp: 1, hit: true, stun: rabbit.landing.dizzy }, 1 / 60, rabbit)).toBe('stagger');
    run(ai, { ...near, hp: 1 }, rabbit.landing.dizzy - 0.05, rabbit);
    expect(ai.state).toBe('stagger'); // longer than a water stagger (0.5 s)
    expect(run(ai, { ...near, hp: 1 }, 0.1, rabbit)).toEqual(['chase']);
  });

  it('dodges swings only while hopping about, never when landed, bound or winding up', () => {
    for (const state of ['chase', 'alert']) expect(canDodge({ state }, rabbit)).toBe(true);
    for (const state of ['recover', 'bound', 'windup', 'attack', 'stagger', 'idle']) expect(canDodge({ state }, rabbit)).toBe(false);
    expect(canDodge({ state: 'chase' }, ENEMIES.wolf)).toBe(false);
    expect(landed({ state: 'recover' }, ENEMIES.wolf)).toBe(false); // wolves have no landing
  });

  it('the wolf is unchanged: no aim delay, plain 0.5 s stagger', () => {
    const ai = { ...newAI(), state: 'chase', t: 0 };
    expect(stepAI(ai, { dist: 1.2, sees: true, hp: 3 }, 1 / 60, ENEMIES.wolf)).toBe('windup');
    const st = { ...newAI(), state: 'chase', t: 0 };
    stepAI(st, { dist: 3, sees: true, hp: 3, pushed: true }, 1 / 60, ENEMIES.wolf);
    run(st, { dist: 3, sees: true, hp: 3 }, 0.45, ENEMIES.wolf);
    expect(st.state).toBe('stagger');
    run(st, { dist: 3, sees: true, hp: 3 }, 0.1, ENEMIES.wolf);
    expect(st.state).toBe('chase');
  });
});

describe('Giant Rabbit Chief (GDD §3.3: three phases, telegraphs, rests)', () => {
  const def = BOSSES.rabbitChief;
  it('changes phase at 66 % and 33 % hp', () => {
    expect(phaseOf(30, 30)).toBe(1);
    expect(phaseOf(19.9, 30)).toBe(1); // 66.3 %
    expect(phaseOf(19.8, 30)).toBe(2); // 66 %
    expect(phaseOf(10, 30)).toBe(2);
    expect(phaseOf(9.9, 30)).toBe(3);
    expect(phaseOf(0.1, 30)).toBe(3);
  });

  it('every damaging step has a telegraph before it in its pattern, and every pattern ends in a rest', () => {
    for (const phase of [1, 2, 3]) {
      for (const p of def.patterns[phase - 1]) {
        const steps = stepsOf(p, phase, def);
        expect(steps.at(-1).name).toBe('rest');
        steps.forEach((s, i) => {
          if (!s.hit) return;
          const before = steps.slice(0, i).filter((b) => b.tele);
          expect(before.length, `${p} ${s.name}`).toBeGreaterThan(0);
          const warned = steps.slice(0, i).reduceRight((acc, b) => (acc.done ? acc : b.tele ? { t: acc.t + b.dur, done: true } : { t: acc.t + b.dur, done: false }), { t: 0, done: false });
          expect(warned.t, `${p} ${s.name} warning`).toBeGreaterThanOrEqual(def.minWindup);
        });
        for (const s of steps) if (s.tele) expect(s.dur).toBeGreaterThanOrEqual(s.name === 'air' ? 0.5 : def.minWindup);
      }
    }
  });

  it('slams in phase 1 only; gust joins in 2, the triple dash in 3, each new trick first', () => {
    const rand = rng(7);
    const h = [];
    for (let i = 0; i < 6; i++) { const p = pickPattern(1, h, rand, def); h.push({ pattern: p, phase: 1 }); expect(p).toBe('slam'); }
    const p2 = pickPattern(2, h, rand, def);
    expect(p2).toBe('gust');
    h.push({ pattern: p2, phase: 2 });
    for (let i = 0; i < 20; i++) { const p = pickPattern(2, h, rand, def); expect(p).not.toBe(h.at(-1).pattern); h.push({ pattern: p, phase: 2 }); }
    expect(pickPattern(3, h, rand, def)).toBe('dash');
    const dash = stepsOf('dash', 3, def);
    expect(dash.filter((s) => s.name === 'aim').length).toBe(3);
    expect(dash.filter((s) => s.name === 'run').length).toBe(3);
    // faster in phase 3, but never a warning under minWindup
    expect(stepsOf('slam', 3, def)[0].dur).toBeLessThan(stepsOf('slam', 1, def)[0].dur);
    expect(stepsOf('slam', 3, def).at(-1).dur).toBeLessThan(stepsOf('slam', 1, def).at(-1).dur);
  });

  it('runs a fight: intro, idle, slam steps in order, dizzy after the landing, roar at the phase line', () => {
    const ai = newBossAI();
    const rand = rng(1);
    const names = [];
    let hp = 30;
    const tick = (secs, extra = {}) => {
      for (let t = 0; t < secs; t += 1 / 30) {
        for (const ev of stepBoss(ai, { hp, maxHp: 30, started: true, ...extra }, 1 / 30, def, rand)) names.push(ev.type === 'step' ? ev.step.name : ev.type);
      }
    };
    expect(stepBoss(ai, { hp, maxHp: 30, started: false }, 0.1, def, rand)).toEqual([]);
    expect(ai.state).toBe('intro');
    tick(def.start + 9);
    expect(names.slice(0, 8)).toEqual(['idle', 'crouch', 'air', 'land', 'wave', 'dizzy', 'rest', 'crouch']);
    // dazed during the dizzy step only
    const at = names.indexOf('dizzy');
    expect(at).toBeGreaterThan(0);
    // the hp drops under 66 % during a rest: a roar, then the gust
    while (doingOf(ai) !== 'rest') tick(1 / 30);
    hp = 19;
    names.length = 0;
    tick(1 / 30);
    expect(names).toEqual(['phase', 'roar']);
    tick(def.roar + 0.1);
    expect(names).toContain('ears'); // gust's windup
    expect(ai.phase).toBe(2);
  });

  it('a phase line crossed mid-attack waits for the attack to finish', () => {
    const ai = newBossAI();
    const rand = rng(2);
    let names = [];
    const tick = (secs, hp) => { for (let t = 0; t < secs; t += 1 / 30) for (const ev of stepBoss(ai, { hp, maxHp: 30, started: true }, 1 / 30, def, rand)) names.push(ev.type === 'step' ? ev.step.name : ev.type); };
    tick(def.start + 0.1, 30);
    expect(doingOf(ai)).toBe('crouch');
    names = [];
    tick(def.slam.crouch + def.slam.air + 0.2, 19);
    expect(names[0]).toBe('phase');
    expect(names).toContain('land'); // the slam still lands (its circle was shown)
    expect(names).not.toContain('roar');
    tick(def.slam.wave.time + 0.2, 19);
    expect(names).toContain('roar'); // cut into the dizzy rest instead
  });

  it('the stun gauge fills from hits and knocks it over, then the fight goes on', () => {
    const ai = newBossAI();
    const rand = rng(3);
    stepBoss(ai, { hp: 30, maxHp: 30, started: true }, 1 / 30, def, rand);
    const ev = [];
    for (let i = 0; i < 12 && !ev.some((e) => e.type === 'stunned'); i++) ev.push(...stepBoss(ai, { hp: 30, maxHp: 30, started: true, stun: def.stun.dazedHammer }, 1 / 30, def, rand));
    expect(ev.some((e) => e.type === 'stunned')).toBe(true);
    expect(isDazed(ai)).toBe(true);
    expect(ai.stun).toBe(0);
    for (let t = 0; t < def.stunned + 0.1; t += 1 / 30) stepBoss(ai, { hp: 30, maxHp: 30, started: true }, 1 / 30, def, rand);
    expect(ai.state).toBe('pattern');
  });

  it('hp 0: asleep for good', () => {
    const ai = newBossAI();
    stepBoss(ai, { hp: 30, maxHp: 30, started: true }, 0.1, def, Math.random);
    expect(stepBoss(ai, { hp: 0, maxHp: 30, started: true }, 0.1, def, Math.random)).toEqual([{ type: 'asleep' }]);
    expect(stepBoss(ai, { hp: 0, maxHp: 30, started: true }, 0.1, def, Math.random)).toEqual([]);
  });
});

describe('the golden necklace and the ending (GDD §6.4, §2.3, §8.3)', () => {
  it('the necklace is found once and kept in the save', () => {
    const store = memory();
    const s = newState();
    expect(s.necklace).toBe(false);
    expect(takeNecklace(s)).toBe(true);
    expect(takeNecklace(s)).toBe(false);
    save(s, store);
    const back = load(store);
    expect(back.necklace).toBe(true);
  });

  it('a boss beaten is counted, with a star only the first time', () => {
    const s = newState();
    expect(beatBoss(s, 'rabbitChief')).toEqual({ first: true, stars: 1 });
    expect(beatBoss(s, 'rabbitChief')).toEqual({ first: false, stars: 1 });
    expect(s.beaten.rabbitChief).toBe(2);
    const store = memory();
    save(s, store);
    expect(load(store).beaten.rabbitChief).toBe(2);
  });

  it('old saves without the new fields load with them filled in', () => {
    const store = memory();
    store.setItem('secret-cave-save-v1', JSON.stringify({ version: 1, seen: { wolf: true }, stars: 0, unlocks: {}, necklace: false, runs: 3 }));
    const s = load(store);
    expect(s.beaten).toEqual({});
    expect(s.prologue).toBe(false);
  });
});
