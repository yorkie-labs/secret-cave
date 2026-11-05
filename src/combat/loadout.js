// What the hero carries this run and the item rules that are plain maths
// (GDD §6.2, §6.3): the right-click tools and Q, the vine's bind time, the
// shield's hold and cooldown and its front arc, herbs. No three.js here, so
// all of it is unit-tested (test/items.test.js).
import { ITEMS } from '../data/items.js';
import { inCone, armorHearts, betterArmor } from './hits.js';
import { gradeUp } from './grades.js';

// The right-click tools in Q order (GDD §4.1: water gun → vine → mask).
export const TOOL_ORDER = Object.keys(ITEMS).filter((k) => ITEMS[k].slot === 'tool');

// Q: the next owned tool after `current` (wrapping), or `current` if it is
// the only one; null when the hero owns no tool at all.
export function nextTool(current, owned, order = TOOL_ORDER) {
  const have = order.filter((k) => owned.includes(k));
  if (!have.length) return null;
  return have[(have.indexOf(current) + 1) % have.length];
}

// The other owned tools, in the order Q reaches them (the HUD's little row).
export function otherTools(current, owned, order = TOOL_ORDER) {
  const out = [];
  for (let k = nextTool(current, owned, order); k && k !== current && !out.includes(k); k = nextTool(k, owned, order)) out.push(k);
  return out;
}

// Something from a chest goes into the bag. Returns whether it was taken (a
// full herb belt says no). A new tool is selected straight away.
export function grant(run, item, count = 1, { grade = 'common', target = null } = {}) {
  if (item === 'shards') { run.shards += count; return true; }
  // W5: a grade-up gem raises the hammer or the water gun a grade
  if (item === 'gradeUp') return !!gradeUp(run, target);
  // W3: armour: a better grade is put on (its blue hearts full), a worse one left
  if (item === 'armor') {
    if (!run.owned.includes('armor')) run.owned.push('armor');
    if (betterArmor(grade, run.armorGrade)) { run.armorGrade = grade; run.armor = armorHearts(grade); }
    return true;
  }
  if (item === 'herb') {
    if (run.herbs >= ITEMS.herb.max) return false;
    run.herbs = Math.min(ITEMS.herb.max, run.herbs + count);
    return true;
  }
  if (!run.owned.includes(item)) run.owned.push(item);
  if (ITEMS[item]?.slot === 'tool') run.tool = item;
  return true;
}

// The vine holds an animal `bind` s, `bindWet` s if water hit it in the last
// `wet` s (GDD §6.6: water gun + vine).
export const isWet = (wetUntil, now) => now < wetUntil;
export const bindTime = (wetUntil, now, def = ITEMS.vine) => (isWet(wetUntil, now) ? def.bindWet : def.bind);

// The shield (GDD §6.3): raised while 3 is held, `hold` s at most, then
// `cooldown` s before it can come up again (counted from release or timeout).
export const newShield = () => ({ up: false, t: 0, cooldown: 0 });
export function raiseShield(sh) {
  if (sh.up || sh.cooldown > 0) return false;
  sh.up = true; sh.t = 0;
  return true;
}
export function lowerShield(sh, def = ITEMS.shield) {
  if (!sh.up) return false;
  sh.up = false; sh.cooldown = def.cooldown;
  return true;
}
// One step; returns 'timeout' when the hold runs out this step.
export function stepShield(sh, dt, def = ITEMS.shield) {
  if (sh.up) {
    sh.t += dt;
    if (sh.t >= def.hold) { lowerShield(sh, def); return 'timeout'; }
  } else sh.cooldown = Math.max(0, sh.cooldown - dt);
  return null;
}
// Does a shield raised at (x, z), facing `heading`, cover an attack coming
// from (fx, fz)? Only the front `arc` degrees.
export const inFront = (x, z, heading, fx, fz, arc = ITEMS.shield.arc) => inCone(x, z, heading, fx, fz, Infinity, arc);
export const shieldBlocks = (sh, x, z, heading, fx, fz, def = ITEMS.shield) => sh.up && inFront(x, z, heading, fx, fz, def.arc);

// A herb (GDD §6.3): `heal` hearts, never past the maximum. Returns what is
// left; `ok` false with a reason when there is nothing to eat or no need.
export function eatHerb({ hearts, maxHearts, herbs }, def = ITEMS.herb) {
  if (herbs <= 0) return { ok: false, reason: 'none', hearts, herbs };
  if (hearts >= maxHearts) return { ok: false, reason: 'full', hearts, herbs };
  return { ok: true, hearts: Math.min(maxHearts, hearts + def.heal), herbs: herbs - 1 };
}

// M6a, the mask (GDD §6.3): `duration` s in disguise, the animals notice the
// hero from `detectScale` as far, the first hammer hit while disguised is
// `ambush` × stronger, and any attack (hammer, water, vine) takes it off.
// `cooldown` s from when it comes off before it can go on again.
export const newMask = () => ({ active: false, t: 0, cooldown: 0 });
export function wearMask(m) {
  if (m.active || m.cooldown > 0) return false;
  m.active = true; m.t = 0;
  return true;
}
// takes it off (an attack, or time up); false if it was not on
export function dropMask(m, def = ITEMS.mask) {
  if (!m.active) return false;
  m.active = false; m.cooldown = def.cooldown;
  return true;
}
// one step; 'off' when the time runs out this step
export function stepMask(m, dt, def = ITEMS.mask) {
  if (m.active) {
    m.t += dt;
    if (m.t >= def.duration) { dropMask(m, def); return 'off'; }
  } else m.cooldown = Math.max(0, m.cooldown - dt);
  return null;
}
// how far the animals notice the hero, × their own detect range
export const detectScale = (m, def = ITEMS.mask) => (m?.active ? def.detectScale : 1);
// the hammer from behind the mask: × ambush (the attack takes the mask off)
export const ambushDamage = (damage, m, def = ITEMS.mask) => (m?.active ? damage * def.ambush : damage);

// W3: the blue hearts the worn armour gives when full, and filling them (a
// spring, a boss put to sleep, waking at the camp)
export const maxArmor = (run) => armorHearts(run.armorGrade);
export function refillArmor(run) { const before = run.armor ?? 0; run.armor = maxArmor(run); return run.armor - before; }
