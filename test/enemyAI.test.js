import { describe, it, expect } from 'vitest';
import { newAI, stepAI, speedOf, tracks } from '../src/entities/enemyAI.js';
import { ENEMIES } from '../src/data/enemies.js';

const wolf = ENEMIES.wolf;
const far = { dist: 20, sees: false, hp: 3 };
// step the machine for `secs` with the same input, collecting events
function run(ai, input, secs, dt = 1 / 60) {
  const events = [];
  for (let t = 0; t < secs - 1e-9; t += dt) { const ev = stepAI(ai, input, dt, wolf); if (ev) events.push(ev); }
  return events;
}

describe('enemy AI (GDD §3.2: idle → alert → chase → windup → attack → recover → chase)', () => {
  it('stays idle while the hero is far or out of sight', () => {
    const ai = newAI();
    run(ai, far, 2);
    expect(ai.state).toBe('idle');
    run(ai, { dist: 6, sees: false, hp: 3 }, 2); // behind a wall
    expect(ai.state).toBe('idle');
  });

  it('spots the hero within 10 m: a ❗ for 0.5 s, then the chase', () => {
    const ai = newAI();
    expect(stepAI(ai, { dist: 9, sees: true, hp: 3 }, 1 / 60, wolf)).toBe('alert');
    run(ai, { dist: 9, sees: true, hp: 3 }, 0.45);
    expect(ai.state).toBe('alert');
    expect(run(ai, { dist: 9, sees: true, hp: 3 }, 0.1)).toEqual(['chase']);
  });

  it('the full attack loop, with the windup always before the bite', () => {
    const ai = newAI();
    const events = [
      ...run(ai, { dist: 8, sees: true, hp: 3 }, 1),
      ...run(ai, { dist: 1.2, sees: true, hp: 3 }, 0.05),
    ];
    expect(events).toEqual(['alert', 'chase', 'windup']);
    run(ai, { dist: 1.2, sees: true, hp: 3 }, wolf.windup - 0.05);
    expect(ai.state).toBe('windup');
    expect(run(ai, { dist: 1.2, sees: true, hp: 3 }, 0.1)).toEqual(['bite']);
    expect(ai.state).toBe('attack');
    expect(run(ai, { dist: 1.2, sees: true, hp: 3 }, wolf.attack)).toEqual(['recover']);
    expect(ai.t).toBeLessThan(0.1);
    run(ai, { dist: 1.2, sees: true, hp: 3 }, wolf.recover - 0.15);
    expect(ai.state).toBe('recover'); // the opening: no new windup yet
    expect(run(ai, { dist: 1.2, sees: true, hp: 3 }, 0.2)).toEqual(['chase', 'windup']);
  });

  it('a water push cancels a windup (no bite) and staggers', () => {
    const ai = { state: 'windup', t: 0.3 };
    expect(stepAI(ai, { dist: 1, sees: true, hp: 3, pushed: true }, 1 / 60, wolf)).toBe('stagger');
    const events = run(ai, { dist: 4, sees: true, hp: 3 }, wolf.stagger + 0.05);
    expect(events).toEqual(['chase']);
    expect(events).not.toContain('bite');
  });

  it('a hit from afar wakes an idle animal straight into the chase', () => {
    const ai = newAI();
    expect(stepAI(ai, { ...far, hit: true }, 1 / 60, wolf)).toBe('chase');
  });

  it('gives up when the hero gets far away', () => {
    const ai = { state: 'chase', t: 0 };
    expect(stepAI(ai, { dist: wolf.detect * 2 + 1, sees: false, hp: 3 }, 1 / 60, wolf)).toBe('idle');
  });

  it('out of hp: asleep for good, from any state', () => {
    for (const state of ['idle', 'chase', 'windup', 'recover']) {
      const ai = { state, t: 0 };
      expect(stepAI(ai, { dist: 1, sees: true, hp: 0 }, 1 / 60, wolf)).toBe('asleep');
      expect(run(ai, { dist: 1, sees: true, hp: 3, pushed: true }, 1)).toEqual([]);
      expect(ai.state).toBe('asleep');
    }
  });

  it('moves only while wandering or chasing; keeps its aim through a windup', () => {
    expect(speedOf('chase', wolf)).toBe(wolf.speed);
    expect(speedOf('idle', wolf)).toBe(wolf.walk);
    for (const s of ['alert', 'windup', 'attack', 'recover', 'stagger', 'asleep']) expect(speedOf(s, wolf)).toBe(0);
    expect(tracks('windup')).toBe(false);
    expect(tracks('chase')).toBe(true);
  });
});
