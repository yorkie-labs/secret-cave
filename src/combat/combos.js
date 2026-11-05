// W5: item combos (GDD §6.6), data and pure rules: two items together give
// something more. No three.js here (test/w5.test.js); the items call these
// and `G.itemCombo(id)` shows the little "콤보!" (core/game.js).
//   wetBind      water gun + vine: a wet animal is bound 5 s, not 3
//                (loadout.js bindTime, since M3)
//   hammerArmor  hammer + armour: a hammer hit mends half a blue heart, once
//                a fight (an encounter spot, a boss)
//   maskVine     mask + vine: the vine thrown in disguise keeps the mask on
//   shieldCounter shield + hammer: a hammer within `window` s of a block hits
//                × `mult`
//   herbHerb     herb + herb: 4 again while eating: two herbs at once mend
//                `heal` hearts
export const COMBOS = [
  { id: 'wetBind', items: ['waterGun', 'vine'], icon: '💧🌿', name: '젖은 덩굴', text: '물총에 젖은 동물은 덩굴에 5초 묶여요' },
  { id: 'hammerArmor', items: ['hammer', 'armor'], icon: '🔨🦺', name: '튼튼 망치', text: '망치를 맞히면 파란 하트 반 칸 (싸움마다 한 번)', heal: 0.5 },
  { id: 'maskVine', items: ['mask', 'vine'], icon: '🎭🌿', name: '몰래 덩굴', text: '탈을 쓴 채 덩굴을 던져도 탈이 안 벗겨져요' },
  { id: 'shieldCounter', items: ['shield', 'hammer'], icon: '🛡️🔨', name: '막고 쾅!', text: '막은 뒤 1초 안에 망치를 휘두르면 2배', window: 1, mult: 2 },
  { id: 'herbHerb', items: ['herb', 'herb'], icon: '🌱🌱', name: '약초 두 개', text: '약초를 먹는 동안 4를 한 번 더: 약초 2개로 하트 5칸', heal: 5 },
];
export const COMBO = Object.fromEntries(COMBOS.map((c) => [c.id, c]));

// hammer + armour: a hit mends half a blue heart, once per fight (`key`: the
// fight's id; `used`: a Set of the fights it already mended in). Returns the
// blue hearts mended (0 when it cannot).
export function armorMend(run, used, key, def = COMBO.hammerArmor) {
  const max = { common: 1, rare: 2, legend: 3 }[run.armorGrade] ?? 0;
  if (!max || !run.owned?.includes('armor') || used.has(key) || (run.armor ?? 0) >= max) return 0;
  used.add(key);
  const before = run.armor ?? 0;
  run.armor = Math.min(max, before + def.heal);
  return run.armor - before;
}
// mask + vine: does a vine throw keep the mask on?
export const maskKeptByVine = (owned) => owned.includes('mask') && owned.includes('vine');
// shield + hammer: the hammer's damage `now`, after the last block at `blockedAt`
export function counterDamage(damage, blockedAt, now, def = COMBO.shieldCounter) {
  return blockedAt !== null && now - blockedAt >= 0 && now - blockedAt <= def.window ? { damage: damage * def.mult, combo: true } : { damage, combo: false };
}
// herb + herb: two herbs eaten together (the second press while eating).
// Returns { ok, hearts, herbs } like loadout.eatHerb.
export function eatTwoHerbs({ hearts, maxHearts, herbs }, def = COMBO.herbHerb) {
  if (herbs < 2) return { ok: false, reason: 'one', hearts, herbs };
  if (hearts >= maxHearts) return { ok: false, reason: 'full', hearts, herbs };
  return { ok: true, hearts: Math.min(maxHearts, hearts + def.heal), herbs: herbs - 2 };
}
