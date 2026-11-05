// W5: growth for good (GDD §8.3, §8.4, §8.5), pure: no three.js, so
// test/w5.test.js checks every rule. The save (core/state.js) holds:
//   unlocks     unlock id -> true (bought at the star altar, data/unlocks.js)
//   wear        { head, neck, feet }: the cosmetics the Maltese has on
//   secrets     secret id -> true once its crystal door opened (a star)
//   milestones  'half' | 'all' -> true once the codex got that far (a star)
//   bossLosses  boss id -> faints in a row in that boss's fight (an extra
//               herb from the second on; cleared when the boss sleeps)
//   world.shard the purple shard after the ending was taken (a star)
import { ALTAR, ALTAR_BY_ID, BASE_HEARTS } from '../data/unlocks.js';
import { ITEMS } from '../data/items.js';
import { addStars } from './state.js';

// ---- the star altar
// { ok, reason }: 'gone' (no such unlock), 'owned', 'needs' (another first),
// 'stars' (not enough)
export function canUnlock(s, id) {
  const u = ALTAR_BY_ID[id];
  if (!u) return { ok: false, reason: 'gone' };
  if (s.unlocks?.[id]) return { ok: false, reason: 'owned' };
  if (u.needs && !s.unlocks?.[u.needs]) return { ok: false, reason: 'needs' };
  if ((s.stars ?? 0) < u.cost) return { ok: false, reason: 'stars' };
  return { ok: true, reason: null };
}
// Spend the stars; a cosmetic goes on straight away (its slot). Returns
// { ok, reason, unlock }.
export function buyUnlock(s, id) {
  const check = canUnlock(s, id);
  const u = ALTAR_BY_ID[id] ?? null;
  if (!check.ok) return { ...check, unlock: u };
  s.stars -= u.cost;
  s.unlocks = { ...s.unlocks, [id]: true };
  if (u.wear) s.wear = { ...s.wear, [u.wear]: id };
  return { ok: true, reason: null, unlock: u };
}
// What the altar shows: every unlock, whether it is open and whether it can
// be bought now (and, for cosmetics, whether it is worn).
export const altarShelf = (s) => ALTAR.map((u) => ({ ...u, owned: !!s.unlocks?.[u.id], worn: !!u.wear && s.wear?.[u.wear] === u.id, ...canUnlock(s, u.id) }));

// A cosmetic on or off (only an owned one). Returns whether it is now worn.
export function toggleWear(s, id) {
  const u = ALTAR_BY_ID[id];
  if (!u?.wear || !s.unlocks?.[id]) return false;
  const on = s.wear?.[u.wear] !== id;
  s.wear = { ...s.wear, [u.wear]: on ? id : null };
  return on;
}
export const worn = (s) => ({ head: null, neck: null, feet: null, ...s.wear });

// The numbers the unlocks give a run (at every expedition's start and right
// after a purchase): the most hearts, the water tank's size, the mask's
// extra seconds. A new heart comes filled; the hearts are never left above
// the most.
export function growthOf(s) {
  let hearts = BASE_HEARTS, tank = 1, mask = 0, herbs = 0;
  for (const u of ALTAR) {
    if (!s.unlocks?.[u.id]) continue;
    hearts += u.heart ?? 0;
    tank = Math.max(tank, u.tank ?? 1);
    mask += u.mask ?? 0;
    herbs = Math.max(herbs, u.herbs ?? 0);
  }
  return { hearts, tank, mask, herbs };
}
export function applyGrowth(run, s) {
  const g = growthOf(s);
  const more = g.hearts - (run.maxHearts ?? BASE_HEARTS);
  run.maxHearts = g.hearts;
  run.hearts = Math.min(run.maxHearts, run.hearts + Math.max(0, more));
  run.tank = g.tank;
  run.maskBonus = g.mask;
  return g;
}
// An expedition sets out: with the herb pouch, at least its herbs in the
// belt. Returns how many were added.
export function pouchHerbs(run, s) {
  const want = Math.min(ITEMS.herb.max, growthOf(s).herbs);
  const add = Math.max(0, want - (run.herbs ?? 0));
  run.herbs = (run.herbs ?? 0) + add;
  return add;
}

// ---- stars for first deeds
// A secret pocket's crystal door opened: a star the first time.
export function findSecret(s, id) {
  s.secrets ??= {};
  if (s.secrets[id]) return false;
  s.secrets[id] = true;
  addStars(s, 1);
  return true;
}
// The codex: half of it seen, then all of it, a star each the first time.
// `ids`: every codex entry (data/codex.js CODEX_IDS). Returns the
// milestones reached just now.
export const MILESTONES = [['half', 0.5], ['all', 1]];
export function codexMilestones(s, ids) {
  s.milestones ??= {};
  const seen = ids.filter((id) => s.seen?.[id]).length;
  const got = [];
  for (const [id, part] of MILESTONES) {
    if (s.milestones[id] || seen < Math.ceil(ids.length * part)) continue;
    s.milestones[id] = true;
    addStars(s, 1);
    got.push(id);
  }
  return got;
}
// W5: the purple shard after the ending (only once the hero has got out)
export const shardWaiting = (s) => !!s.world?.won && !s.world?.shard;
export function takePurpleShard(s) {
  if (!shardWaiting(s)) return false;
  s.world.shard = true;
  addStars(s, 1);
  return true;
}

// ---- GDD §8.5 도움 장치: losing to the same boss again and again
export const ASSIST_LOSSES = 2; // from the second faint in a row, a herb more
export function bossLost(s, bossId) {
  s.bossLosses ??= {};
  s.bossLosses[bossId] = (s.bossLosses[bossId] ?? 0) + 1;
  return s.bossLosses[bossId];
}
export function bossWon(s, bossId) { if (s.bossLosses) delete s.bossLosses[bossId]; }
// Waking after a boss fight was lost again: one herb more (the belt has
// room). Returns the herbs added (0 or 1).
export function lossHerb(run, s, bossId) {
  if ((s.bossLosses?.[bossId] ?? 0) < ASSIST_LOSSES || run.herbs >= ITEMS.herb.max) return 0;
  run.herbs += 1;
  return 1;
}
