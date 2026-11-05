// W3: the Ice Bear's patterns (GDD §3.3), pure: the shared scheduler
// (chiefAI.js stepBoss) runs them; test/region3.test.js checks that every
// step that can hurt comes after one that shows where, and that every
// pattern ends in a rest.
//
//   fist     : raise (a red circle in front) → pound (hit) [→ gap → raise →
//              pound, phase 3] → stuck (its fists in the ice: dazed) → rest
//   chunks   : call (shadows on the ice) → fall (hit) → rest
//   blizzard : inhale (a red cone) → breath (hit, pushes) → rest
export { phaseOf, pickPattern, newBossAI, doingOf, isDazed } from './chiefAI.js';

export function iceBearSteps(pattern, phase, def) {
  const tempo = def.tempo[phase - 1];
  const warn = (s) => Math.max(def.minWindup, s * tempo);
  const rest = { name: 'rest', dur: def.rest[phase - 1] * tempo, open: true };
  if (pattern === 'fist') {
    const s = def.fist, n = s.count[phase - 1], steps = [];
    for (let i = 0; i < n; i++) {
      if (i) steps.push({ name: 'gap', dur: s.gap });
      steps.push({ name: 'raise', dur: warn(s.raise), tele: ['circle'], n: i });
      steps.push({ name: 'pound', dur: 0.35, hit: 'fist', n: i });
    }
    return [...steps, { name: 'stuck', dur: def.dizzy, open: true, dazed: true }, rest];
  }
  if (pattern === 'chunks') {
    const s = def.chunks;
    return [
      { name: 'call', dur: warn(s.warn), tele: ['shadows'], n: s.count[phase - 1] },
      { name: 'fall', dur: s.fall, hit: 'chunk' },
      rest,
    ];
  }
  if (pattern === 'blizzard') {
    const s = def.blizzard;
    return [
      { name: 'inhale', dur: warn(s.inhale), tele: ['cone'] },
      { name: 'breath', dur: s.blow, hit: 'blizzard' },
      rest,
    ];
  }
  throw new Error(`no such pattern: ${pattern}`);
}
