// W5: item grades (GDD §6.5), pure: common → rare → legend for the hammer
// and the water gun (`run.grades`). The numbers are data (data/items.js
// `grades`); the hammer (combat/items/hammer.js) and the water gun
// (waterGun.js) ask what their grade gives. A faint takes them back to
// common (the GDD rule: an expedition's grades are lost with it); the armour
// keeps its own grade (it is found as a whole item, §14).
import { ITEMS, GRADES } from '../data/items.js';

export const GRADE_ORDER = ['common', 'rare', 'legend'];
export const GRADED = ['hammer', 'waterGun'];
export const gradeOf = (run, item) => (item === 'armor' ? run.armorGrade ?? 'common' : run.grades?.[item] ?? 'common');
export const nextGrade = (g) => GRADE_ORDER[GRADE_ORDER.indexOf(g ?? 'common') + 1] ?? null;
export const gradeName = (g) => GRADES[g ?? 'common']?.name ?? '';
export const gradeColor = (g) => GRADES[g ?? 'common']?.color ?? GRADES.common.color;

// Which item a grade-up gem raises: the given one (if it can go up), else
// the lower-graded of the two the hero has (the hammer first on a tie);
// null when both are legend.
export function upgradeTarget(run, prefer = null) {
  const can = (k) => (k === 'hammer' || run.owned?.includes(k)) && nextGrade(gradeOf(run, k));
  if (prefer && prefer !== 'any' && can(prefer)) return prefer;
  const options = GRADED.filter(can);
  if (!options.length) return null;
  return options.sort((a, b) => GRADE_ORDER.indexOf(gradeOf(run, a)) - GRADE_ORDER.indexOf(gradeOf(run, b)))[0];
}
// One grade up. Returns { item, grade } or null (nothing to raise).
export function gradeUp(run, prefer = null) {
  const item = upgradeTarget(run, prefer);
  if (!item) return null;
  run.grades = { hammer: 'common', waterGun: 'common', ...run.grades, [item]: nextGrade(gradeOf(run, item)) };
  return { item, grade: run.grades[item] };
}
// a faint: back to common
export function resetGrades(run) { run.grades = { hammer: 'common', waterGun: 'common' }; }

// What a grade gives (the base numbers merged with the grade's)
export function hammerStats(grade, def = ITEMS.hammer) {
  const g = def.grades?.[grade] ?? {};
  return { range: g.range ?? def.range, arc: def.arc, wave: g.wave ?? null };
}
export function waterStats(grade, def = ITEMS.waterGun) {
  const g = def.grades?.[grade] ?? {};
  return { streams: g.streams ?? 1, spread: g.spread ?? 0, bomb: g.bomb ?? null };
}
// the headings of a shot's streams round the aim (radians)
export function streamHeadings(heading, { streams, spread }) {
  if (streams <= 1) return [heading];
  const step = (spread * Math.PI) / 180;
  return Array.from({ length: streams }, (_, i) => heading + (i - (streams - 1) / 2) * step);
}
