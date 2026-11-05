// What comes out of a treasure chest (GDD §6.5, §11.1), pure: the table is
// data (data/items.js CHEST_LOOT), the dice a seeded rng (core/rng.js).
import { CHEST_LOOT, ITEMS, CLEAR_DROP, ASSIST } from '../data/items.js';
import { upgradeTarget } from '../combat/grades.js';

// The entries this run can get right now: an item the hero already owns
// (`once`) or a herb with a full belt is left out, so a chest never gives
// something useless.
export function lootChoices(run, table = CHEST_LOOT) {
  const boost = herbBoost(run);
  return table.filter((e) => {
    if ((e.from ?? 0) > (run.area ?? 0)) return false; // not in this area yet (M6a: the mask)
    if (e.once && run.owned.includes(e.item)) return false;
    if (e.item === 'herb' && run.herbs >= ITEMS.herb.max) return false;
    if (e.world && !run.bigWorld) return false; // (W5: the big world's own entries)
    if (e.item === 'gradeUp' && !upgradeTarget(run)) return false; // (W5: both legend already)
    return e.weight > 0;
  }).map((e) => (e.weights ? { ...e, weight: e.weight * (e.weights[Math.min(e.weights.length - 1, run.area ?? 0)] ?? 1) } : e))
    .map((e) => (e.item === 'herb' && boost !== 1 ? { ...e, weight: e.weight * boost } : e));
}

// GDD §8.5: hearts this low make herbs likelier (data/items.js ASSIST).
export const lowHearts = (run) => run.hearts > 0 && run.hearts <= run.maxHearts * ASSIST.lowHearts;
export const herbBoost = (run) => (lowHearts(run) ? ASSIST.herbBoost : 1);

// A fight room put to sleep: maybe a herb (null: nothing). The belt full,
// nothing.
export function rollClearDrop(run, rand) {
  if (run.herbs >= ITEMS.herb.max) return null;
  const chance = Math.min(lowHearts(run) ? ASSIST.maxChance : 1, CLEAR_DROP.herb * herbBoost(run));
  return rand() < chance ? 'herb' : null;
}

// One roll: { item, count }. Shards come in a handful.
export function rollLoot(run, rand, table = CHEST_LOOT) {
  const choices = lootChoices(run, table);
  if (!choices.length) return { item: 'shards', count: 3 };
  const total = choices.reduce((s, e) => s + e.weight, 0);
  let x = rand() * total, pick = choices.at(-1);
  for (const e of choices) { if ((x -= e.weight) < 0) { pick = e; break; } }
  const [lo, hi] = pick.count ?? [1, 1];
  return { item: pick.item, count: lo + Math.floor(rand() * (hi - lo + 1)) };
}
