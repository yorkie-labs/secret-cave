// The animals' shared state machine (GDD §3.2, §10.5), pure: no three.js, so
// test/enemyAI.test.js can drive it with plain numbers.
//
//   idle (wander) → alert (❗, `alert` s) → chase → windup (red mark on the
//   floor, `windup` s) → attack (the bite lands as it starts) → recover (the
//   opening, `recover` s) → chase …
//
// A water-gun push knocks any awake animal into `stagger` (a windup is
// cancelled: no bite), a hit wakes an idle one, hp 0 puts it to sleep for
// good (animals never die, GDD §3.2). Running far away loses it (idle).
// The vine binds any awake animal (`bound`, M3): it stands frozen for the
// bind time, a windup is cancelled, water does not knock it out of the vine,
// and the hammer still lands (hp 0 → asleep), then it chases again.
// M5: `stun` (s) knocks it into a stagger that long (a rabbit hit while it
// sits dazed after landing), and a hopper only winds up again after `aim` s
// of keeping its distance.
export const STATES = ['idle', 'alert', 'chase', 'windup', 'attack', 'recover', 'stagger', 'bound', 'asleep'];

export const newAI = () => ({ state: 'idle', t: 0, bindFor: 0, stunFor: 0 });

// Seconds of vine left (0 unless bound).
export const bindLeft = (ai) => (ai.state === 'bound' ? Math.max(0, ai.bindFor - ai.t) : 0);

// One step. `input`: { dist (to the hero, m), sees (a clear line to the
// hero), hp, pushed (water hit this frame), hit (any hit this frame),
// bind (s: the vine caught it this frame), stun (s: knocked silly this
// frame), detect (m: how far it notices the hero now; M6a: the mask shrinks
// it, a hidden fox only springs up close; default the animal's own) }.
// `def`: the animal's data (data/enemies.js). Returns the event of this step
// (the name of the state just entered, or null); `bite` is entering `attack`.
export function stepAI(ai, input, dt, def) {
  ai.t += dt; // (asleep too: the body uses it to fade away)
  if (ai.state === 'asleep') return null;
  const go = (s) => { ai.state = s; ai.t = 0; ai.stunFor = 0; return s === 'attack' ? 'bite' : s; };
  if (input.hp <= 0) return go('asleep');
  if (input.bind > 0) { go('bound'); ai.bindFor = input.bind; return 'bound'; }
  if (input.stun > 0 && ai.state !== 'bound') { go('stagger'); ai.stunFor = input.stun; return 'stagger'; }
  if (input.pushed && ai.state !== 'idle' && ai.state !== 'alert' && ai.state !== 'bound') return go('stagger');
  const detect = input.detect ?? def.detect;
  switch (ai.state) {
    case 'idle':
      if (input.hit || input.pushed) return go('chase'); // hit from afar: no time for a ❗
      if (input.sees && input.dist <= detect) return go('alert');
      break;
    case 'alert':
      if (ai.t >= def.alert) return go('chase');
      break;
    case 'chase':
      if (input.dist > detect * 2) return go('idle');
      if (input.dist <= def.attackRange && ai.t >= (def.aim ?? 0)) return go('windup');
      break;
    case 'windup':
      if (ai.t >= def.windup) return go('attack');
      break;
    case 'attack':
      if (ai.t >= def.attack) return go('recover');
      break;
    case 'recover':
      if (ai.t >= def.recover) return go('chase');
      break;
    case 'stagger':
      if (ai.t >= (ai.stunFor || def.stagger)) return go('chase');
      break;
    case 'bound':
      if (ai.t >= ai.bindFor) return go('chase');
      break;
  }
  return null;
}

// How fast the animal moves in a state (the lunge of a bite is the body's).
export function speedOf(state, def) {
  if (state === 'chase') return def.speed;
  if (state === 'idle') return def.walk;
  return 0;
}

// Does it turn to face the hero in this state? A windup keeps the heading it
// started with, so the red mark on the floor stays where it was drawn.
export const tracks = (state) => state === 'alert' || state === 'chase' || state === 'recover' || state === 'stagger';

// M5, the rabbit's weakness (GDD §3.2): it has just landed from a jump-dash
// and sits there dazed — a hammer hit now knocks it silly.
export const landed = (ai, def) => !!def.landing && ai.state === 'recover';

// …and the rest of the time a swing at it may miss: hopping about (keeping
// its distance, or spotting the hero) it dodges out of the way.
export const canDodge = (ai, def) => !!def.dodge && (ai.state === 'chase' || ai.state === 'alert');

// W3, the deer's weakness (GDD §3.2): its charge stopped by a raised shield
// sticks its antlers fast: stunned this long (0: not blocked, or no antlers).
export const shieldStun = (def, blocked) => (blocked && def.stuck ? def.stuck : 0);

// W3, the bear's weakness: water in its face. Is (fx, fz) (where the shot
// came from) in front of an animal at (x, z) facing `heading`, within its
// `arc`°? Then it staggers `face.stagger` s; from behind, the water only wets it.
export function inFace(x, z, heading, fx, fz, arc) {
  let a = Math.atan2(fx - x, fz - z) - heading;
  a = Math.atan2(Math.sin(a), Math.cos(a));
  return Math.abs(a) <= (arc * Math.PI) / 360;
}
export const waterStun = (def, front) => (def.face && front ? def.face.stagger : 0);

// W3: how fast a push slides off on slippery ground (`slip` 0..1): a little
// grip is kept, so a shove on ice carries ~3× as far, never forever.
export const knockDecay = (decay, slip = 0) => decay * (1 - 0.65 * Math.min(1, Math.max(0, slip)));
