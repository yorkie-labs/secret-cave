// M6a: the Poison Mushroom Queen's patterns (GDD §3.3), pure: the shared
// scheduler (chiefAI.js stepBoss) runs them; test/m6a.test.js checks that
// every step that can hurt comes after one that shows where, and that every
// pattern ends in a rest.
//
//   spray  : puff (spore cones on the floor) → spray (hit) → droop (dizzy) → rest
//   summon : call (circles where mushrooms burst up) → sprout (hit) → rest
//   cloud  : seep (green-edged zones) → cloud (they turn to poison: the body
//            keeps them as clouds that tick) → droop (dizzy) → rest
export { phaseOf, pickPattern, newBossAI, doingOf, isDazed } from './chiefAI.js';

export function queenSteps(pattern, phase, def) {
  const tempo = def.tempo[phase - 1];
  const warn = (s) => Math.max(def.minWindup, s * tempo);
  const rest = { name: 'rest', dur: def.rest[phase - 1] * tempo, open: true };
  const droop = { name: 'droop', dur: def.dizzy, open: true, dazed: true };
  if (pattern === 'spray') {
    const s = def.spray;
    return [
      { name: 'puff', dur: warn(s.windup), tele: ['cones'], n: s.cones[phase - 1] },
      { name: 'spray', dur: s.blow, hit: 'spray' },
      droop, rest,
    ];
  }
  if (pattern === 'summon') {
    const s = def.summon;
    return [
      { name: 'call', dur: warn(s.windup), tele: ['circles'], n: s.count[phase - 1] },
      { name: 'sprout', dur: s.sprout, hit: 'sprout' },
      rest,
    ];
  }
  if (pattern === 'cloud') {
    const s = def.cloud;
    return [
      { name: 'seep', dur: warn(s.windup), tele: ['zones'], n: s.count[phase - 1] },
      { name: 'cloud', dur: s.form, hit: 'poison' },
      droop, rest,
    ];
  }
  throw new Error(`no such pattern: ${pattern}`);
}
