// Pure combat maths (GDD §6.1, §12): hearts in half steps, the water tank,
// the hammer's combo counter and the cone a swing or a bite covers. No
// three.js here, so all of it is unit-tested (test/combat.test.js).

// Hearts after taking `amount` (rounded to half hearts, never below 0).
export function damageHearts(hearts, amount) {
  const half = Math.round(amount * 2) / 2;
  return Math.max(0, Math.round((hearts - half) * 2) / 2);
}

// The heart orb's number: 4.5 → "4½", 0.5 → "½".
export function heartsText(hearts) {
  const whole = Math.floor(hearts), half = hearts - whole >= 0.5;
  return half ? `${whole || ''}½` : `${whole}`;
}

// Can the hero be hurt right now? Not while invulnerable (after a hit or
// all through a roll), and not once out of hearts.
export const canBeHurt = ({ invulnerable, hearts }) => invulnerable <= 0 && hearts > 0;

// The water tank, 0..1: fills up from empty in `refill` seconds.
export const refillTank = (water, dt, refill) => Math.min(1, water + dt / refill);

// Spend `cost` of the tank for one shot, if there is that much.
export function spendWater(water, cost) {
  if (water + 1e-9 < cost) return { ok: false, water };
  return { ok: true, water: Math.max(0, water - cost) };
}

// The hammer's combo: hits in a row, each no more than `window` s after the
// last. Every `every`-th one shakes the ground (`wave`). (A swing that hits
// nothing does not break the chain, the pause does: kinder to small hands.)
export function comboHit(combo, now, { every, window }) {
  const count = combo.last !== null && now - combo.last <= window ? combo.count + 1 : 1;
  return { count: count % every === 0 ? 0 : count, last: count % every === 0 ? null : now, wave: count % every === 0 };
}
export const newCombo = () => ({ count: 0, last: null, wave: false });

// Is the point (tx, tz) inside the cone from (x, z) facing `heading` (yaw,
// 0 = +Z), `reach` metres long and `arc` degrees wide? `pad`: the target's
// own radius (a big animal is hit by its edge, not its middle).
export function inCone(x, z, heading, tx, tz, reach, arc, pad = 0) {
  const dx = tx - x, dz = tz - z;
  const d = Math.hypot(dx, dz);
  if (d - pad > reach) return false;
  if (d <= pad + 0.15) return true; // standing on it
  let a = Math.atan2(dx, dz) - heading;
  a = Math.atan2(Math.sin(a), Math.cos(a));
  // the target's radius widens the cone a little at that distance
  return Math.abs(a) <= (arc * Math.PI) / 360 + Math.asin(Math.min(1, pad / d));
}

// W3, armour (GDD §6.3): the blue hearts over the red ones are taken first,
// half a heart at a time. Returns { hearts, armor } after `amount` hearts.
export function takeDamage(hearts, armor, amount) {
  const half = Math.round(amount * 2) / 2;
  const blue = Math.min(Math.max(0, armor), half);
  return { hearts: damageHearts(hearts, half - blue), armor: Math.round((Math.max(0, armor) - blue) * 2) / 2 };
}
// how many blue hearts a grade of armour gives (0: none)
export const ARMOR_RANK = { common: 1, rare: 2, legend: 3 };
export const armorHearts = (grade) => ARMOR_RANK[grade] ?? 0;
// a better grade than the one worn?
export const betterArmor = (grade, worn) => armorHearts(grade) > armorHearts(worn);

// An enemy's hp after `damage` (fractions from the water gun add up; a hair
// above zero counts as zero so three 1/3 shots make one hammer hit).
export function damageHp(hp, damage) {
  const left = hp - damage;
  return left < 1e-6 ? 0 : left;
}

// M6a, GDD §8.5: an area's damage multiplier (× 1.15 in the mushroom cave)
// meets hearts counted in halves. A hit takes the nearest half hearts at or
// below what it is worth, and the rest is carried over until it adds up to
// another half heart, so × 1.15 really costs a little more over a fight
// (a 0.575 bite takes ½, and every 7th or so takes 1) without odd fractions
// on the heart orb. Returns { hearts (to take), carry (left over) }.
export function carryDamage(amount, carry = 0) {
  const total = amount + carry;
  const hearts = Math.floor(total * 2 + 1e-9) / 2;
  return { hearts, carry: Math.max(0, total - hearts) };
}
// An animal's numbers in an area (GDD §8.5): hp and damage × the area's.
export const scaled = (def, diff = { hp: 1, damage: 1 }) => ({ hp: def.hp * diff.hp, damage: def.damage * diff.damage });
