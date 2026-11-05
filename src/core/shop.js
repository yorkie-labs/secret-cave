// M6a: the bat merchant's rules (GDD §7.3 상점 방), pure: no three.js, so
// test/m6a.test.js checks them. The goods and prices are data
// (data/items.js SHOP); the shop room and its dialogue are entities/bat.js.
import { SHOP, ITEMS } from '../data/items.js';
import { grant } from '../combat/loadout.js';
import { gradeOf, nextGrade, gradeUp, gradeName } from '../combat/grades.js';

// W5: a grade-up's price is the price of the grade it becomes (null: the
// item is legend already)
export const priceOf = (run, g) => (g.upgrade ? g.price[nextGrade(gradeOf(run, g.upgrade))] ?? null : g.price);

// Can the hero buy `id` now? { ok, reason }: 'gone' (not sold here),
// 'owned' (a tool already in the bag), 'full' (the herb belt is full, or the
// hearts are), 'shards' (not enough crystal shards).
export function canBuy(run, id, table = SHOP) {
  const g = table.find((x) => x.id === id);
  if (!g) return { ok: false, reason: 'gone' };
  if (g.once && run.owned.includes(g.item)) return { ok: false, reason: 'owned' };
  if (g.item === 'herb' && run.herbs >= ITEMS.herb.max) return { ok: false, reason: 'full' };
  if (g.heal && run.hearts >= run.maxHearts) return { ok: false, reason: 'full' };
  if (g.upgrade && priceOf(run, g) === null) return { ok: false, reason: 'top' };
  if (g.upgrade === 'waterGun' && !run.owned.includes('waterGun')) return { ok: false, reason: 'gone' };
  if (run.shards < priceOf(run, g)) return { ok: false, reason: 'shards' };
  return { ok: true, reason: null };
}

// Buy it: the shards go, the goods come (a new tool is selected, like a
// chest's). Returns { ok, reason, good }.
export function buy(run, id, table = SHOP) {
  const check = canBuy(run, id, table);
  const good = table.find((x) => x.id === id) ?? null;
  if (!check.ok) return { ...check, good };
  run.shards -= priceOf(run, good);
  if (good.heal) run.hearts = Math.min(run.maxHearts, run.hearts + good.heal);
  else if (good.upgrade) return { ok: true, reason: null, good, up: gradeUp(run, good.upgrade) };
  else grant(run, good.item);
  return { ok: true, reason: null, good };
}

// What the shelf shows now: every good with its price and whether it can be
// bought (a tool already owned is left off).
export const shelf = (run, table = SHOP) => table.filter((g) => !(g.once && run.owned.includes(g.item)))
  .map((g) => ({ ...g, price: priceOf(run, g) ?? '—', grade: g.upgrade ? nextGrade(gradeOf(run, g.upgrade)) : null, ...canBuy(run, g.id, table) }))
  .map((g) => (g.upgrade ? { ...g, name: g.grade ? `${g.name} → ${gradeName(g.grade)}` : `${g.name} (전설)` } : g));

// the merchant's words when a purchase fails
export const SAY_NO = {
  shards: '수정 조각이 모자라요… 동물들을 재우면 조각이 나와요!',
  full: '이미 가득 찼어요!',
  owned: '이미 가지고 있어요!',
  gone: '그건 없어요.',
  top: '이미 전설이에요! 더 세질 수 없어요.',
};
