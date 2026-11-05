// W4: the Crystal King's patterns (GDD §3.3), pure: the shared scheduler
// (chiefAI.js stepBoss) runs them; test/region4.test.js checks that every
// step that can hurt comes after one that shows where, that every big attack
// leaves him tired (his chest bare) and that every pattern ends in a rest.
//
//   laser  : aim (a red wedge, the beam's line) → sweep (hit) → tired → rest
//   spikes : call (circles on the floor) → erupt (hit) → tired → rest
//   summon : raise (rings where animals rise; nothing hurts) → call → rest
export { phaseOf, pickPattern, newBossAI, doingOf, isDazed } from './chiefAI.js';

export function crystalKingSteps(pattern, phase, def) {
  const tempo = def.tempo[phase - 1];
  const warn = (s) => Math.max(def.minWindup, s * tempo);
  const rest = { name: 'rest', dur: def.rest[phase - 1] * tempo, open: true };
  const tired = (k = 1) => ({ name: 'tired', dur: def.tired[phase - 1] * k, open: true, dazed: true, tired: true });
  if (pattern === 'laser') {
    const s = def.laser;
    return [
      { name: 'aim', dur: warn(s.aim), tele: ['wedge', 'beam'], arc: s.arc[phase - 1] },
      { name: 'sweep', dur: s.sweep * (phase === 3 ? 0.9 : 1), hit: 'laser', arc: s.arc[phase - 1] },
      tired(), rest,
    ];
  }
  if (pattern === 'spikes') {
    const s = def.spikes;
    return [
      { name: 'call', dur: warn(s.warn), tele: ['circles'], n: s.count[phase - 1] },
      { name: 'erupt', dur: s.erupt, hit: 'spike' },
      tired(0.85), rest,
    ];
  }
  if (pattern === 'summon') {
    const s = def.summon;
    return [
      { name: 'raise', dur: warn(s.warn), tele: ['summon'], n: s.count[phase - 1] },
      { name: 'call', dur: s.call, summon: true },
      { ...rest, dur: rest.dur + 0.6 },
    ];
  }
  throw new Error(`no such pattern: ${pattern}`);
}
