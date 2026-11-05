// M6a: the mole monster's brain (GDD §3.2 특수형), pure: no three.js, so
// test/m6a.test.js drives it with plain numbers.
//
//   idle (a mound at home, underground) → alert (❗) → travel (the mound runs
//   at the hero, underground) → windup (a red circle where it will burst
//   out; the mound shakes there) → attack (it pops up: inside the circle
//   costs a heart) → surface (up, blinking: the hammer's chance) → dig (back
//   down) → travel (at least `regroup` s before it may come up again) …
//
// Water into the mound or the hole while it is underground floods it out:
// `flooded` (up and stunned, 💫, the hammer's chance), then it digs down.
// hp 0: asleep (like every animal). Too far away: it loses the hero (idle).
export const MOLE_STATES = ['idle', 'alert', 'travel', 'windup', 'attack', 'surface', 'dig', 'flooded', 'asleep'];

export const newMoleAI = () => ({ state: 'idle', t: 0 });

// under the ground (the mound shows; only water reaches it)
export const underground = (s) => s === 'idle' || s === 'alert' || s === 'travel' || s === 'windup' || s === 'dig';
// up where the hammer reaches it
export const exposed = (s) => s === 'attack' || s === 'surface' || s === 'flooded';

// One step. input: { dist (to the hero), sees, hp, water (a water hit on the
// mound this frame), detect (m: how far it notices the hero, the mask
// shrinks it) }. Returns the event (the state entered) or null; 'pop' is
// entering `attack` (the hit is checked then).
export function stepMole(ai, input, dt, def) {
  ai.t += dt;
  if (ai.state === 'asleep') return null;
  const go = (s) => { ai.state = s; ai.t = 0; return s === 'attack' ? 'pop' : s; };
  if (input.hp <= 0) return go('asleep');
  if (input.water && underground(ai.state)) return go('flooded');
  const detect = input.detect ?? def.detect;
  switch (ai.state) {
    case 'idle':
      if (input.sees && input.dist <= detect) return go('alert');
      break;
    case 'alert':
      if (ai.t >= def.alert) return go('travel');
      break;
    case 'travel':
      if (input.dist > detect * 2) return go('idle');
      if ((input.dist <= def.attackRange && ai.t >= (def.regroup ?? 0)) || ai.t >= def.chase) return go('windup');
      break;
    case 'windup':
      if (ai.t >= def.windup) return go('attack');
      break;
    case 'attack':
      if (ai.t >= def.attack) return go('surface');
      break;
    case 'surface':
      if (ai.t >= def.surface) return go('dig');
      break;
    case 'flooded':
      if (ai.t >= def.flooded) return go('dig');
      break;
    case 'dig':
      if (ai.t >= def.dig) return go(input.dist > detect * 2 ? 'idle' : 'travel');
      break;
  }
  return null;
}
