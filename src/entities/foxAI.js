// M6a: the fox's hiding (GDD §3.2 기습형), pure: no three.js, so
// test/m6a.test.js can drive it. The fox's moves are the shared state
// machine (enemyAI.js); this is the cloak on top of it:
//
//   hidden (a faint shimmer in a mushroom's shade; it notices the hero only
//   within `hide.ambush` m) → the hero comes close: it springs (❗, chase,
//   the red cone, the bite) → after the bite it slinks back to the shade →
//   arrived: hidden again.
//
// Water shows it up: wet, it cannot hide for `hide.reveal` s; it fights in
// the open like a wolf (the hammer finds it), and only slinks off once that
// time is over.
export const newCloak = () => ({ hidden: true, slinking: false, revealedUntil: -Infinity });

// may it go back into hiding now?
export const canHide = (c, now) => now >= c.revealedUntil;

// how far it notices the hero: hidden, only up close (the ambush)
export const senseRange = (c, def) => (c.hidden ? def.hide.ambush : def.detect);

// One step. input: { now, water (a water hit this frame), ev (the AI event
// this step, enemyAI.js: 'alert', 'chase', …), from (the state before that
// event), arrived (back in the shade) }. Returns what changed: 'revealed'
// (water), 'ambush' (it springs from hiding), 'slink' (off to hide: the
// body sends it home to the shade), 'hidden' (in the shade again), or null.
export function stepCloak(c, { now, water = false, ev = null, from = null, arrived = false }, def) {
  if (water) {
    c.hidden = false; c.slinking = false;
    c.revealedUntil = now + def.hide.reveal;
    return 'revealed';
  }
  if (c.hidden && (ev === 'alert' || ev === 'chase')) { c.hidden = false; return 'ambush'; }
  // on its way to the shade the hero came after it: it turns and fights
  if (c.slinking && (ev === 'alert' || ev === 'chase')) { c.slinking = false; return 'turn'; }
  // the bite is over (recover → chase): slink off, unless the water still shows it
  if (!c.hidden && !c.slinking && ev === 'chase' && from === 'recover' && canHide(c, now)) { c.slinking = true; return 'slink'; }
  // shown up for a while and now free again, not after anyone: slink off
  if (!c.hidden && !c.slinking && ev === 'idle' && canHide(c, now)) { c.slinking = true; return 'slink'; }
  if (c.slinking && arrived) { c.slinking = false; c.hidden = true; return 'hidden'; }
  return null;
}
