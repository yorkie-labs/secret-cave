// The items (GDD §6.2, §6.3, §10.4): numbers live here, not in the code that
// uses them, so balancing means editing data. Damage is counted in hammer
// hits (an enemy's hp is "how many hammer hits"), times in seconds, ranges in
// metres. M2: hammer, water gun. M3: vine, shield, herb, the chest table.
// `got`: the toast when the hero picks it up.
export const ITEMS = {
  hammer: {
    slot: 'main', name: '망치', icon: '🔨',
    damage: 1, range: 2, rate: 1, // one swing a second
    arc: 120, // the cone in front of the hero that a swing covers (degrees)
    breaks: ['ice', 'crackedRock'],
    // every 3rd hit in a row (no more than `window` s apart) shakes the ground
    combo: { every: 3, window: 2.2, radius: 2.6, damage: 0.5, push: 1.5 },
    // W5 (GDD §6.5): rare reaches half as far again; legend also shakes the
    // ground a little with every swing that lands (a small shockwave)
    grades: { rare: { range: 3 }, legend: { range: 3, wave: { radius: 2, damage: 0.34, push: 1.1 } } },
  },
  waterGun: {
    slot: 'tool', name: '물총', icon: '💧',
    // push 1.5 m (GDD said 3 m: a few shots pinned wolves to the walls, M3 review)
    damage: 1 / 3, range: 10, rate: 2, water: 1 / 8, push: 1.5,
    speed: 16, // m/s, the water blob in flight
    refill: 10, // seconds for an empty tank to fill up again…
    refillDelay: 1, // …starting this long after the last shot
    wet: 3, // s an animal stays wet after a hit (the vine binds it longer)
    // W5 (GDD §6.5): rare shoots two streams (`spread`° apart); legend's
    // blobs burst like a water bomb where they land (everything round is
    // pushed and wetted)
    grades: { rare: { streams: 2, spread: 9 }, legend: { streams: 2, spread: 9, bomb: { radius: 2.6, damage: 1 / 3, push: 1.6 } } },
  },
  vine: {
    slot: 'tool', name: '덩굴', icon: '🌿', damage: 0, range: 6, bind: 3, bindWet: 5, cooldown: 8,
    speed: 14, // m/s, the vine's tip in flight
    got: '덩굴을 얻었어요! 우클릭으로 던지고, Q로 바꿔요',
  },
  // M6a: the mask (GDD §6.3): five seconds as an animal, which the animals
  // notice from a third as far; the first hammer from behind it hits twice as
  // hard, and any attack takes it off. `cooldown` counts from when it comes off.
  mask: {
    slot: 'tool', name: '탈', icon: '🎭', duration: 5, detectScale: 1 / 3, cooldown: 20, ambush: 2,
    got: '탈을 얻었어요! Q로 바꾸고 우클릭으로 써요 (동물인 척!)',
  },
  shield: {
    slot: 'key3', name: '방패', icon: '🛡️', arc: 120, hold: 2, cooldown: 4, // cooldown from release or timeout
    slow: 0.5, // × walking speed while it is up
    bounce: 1.2, // m a blocked animal is pushed back
    got: '방패를 얻었어요! 3을 누르고 있으면 앞을 막아요',
  },
  herb: {
    slot: 'key4', name: '약초', icon: '🌱', heal: 2, useTime: 1, max: 3,
    got: '약초를 얻었어요! 4를 누르면 먹어요',
  },
  // W3: armour (GDD §6.3): blue hearts over the red ones, taken first; the
  // springs fill them again. Its grade (§6.5) says how many.
  armor: {
    slot: 'gear', name: '갑옷', icon: '🦺', blueHearts: { common: 1, rare: 2, legend: 3 },
    grades: { common: '일반', rare: '희귀', legend: '전설' },
    got: '갑옷을 입었어요! 파란 하트가 빨간 하트보다 먼저 닳아요 (샘에서 다시 차요)',
  },
  necklace: { slot: 'key', name: '황금 목걸이', icon: '🏅', opens: 'secretDoor' }, // (📿 draws as red beads: a gold medallion reads as the pendant)
};

// A run starts with these (GDD §11.1 MVP: the hammer and the water gun; the
// shield, the herbs and the vine come out of chests).
export const START = { owned: ['hammer', 'waterGun'], tool: 'waterGun', herbs: 0 };

// What a treasure chest may hold (GDD §6.5, §11.1 "상자에서 랜덤 아이템").
// `once`: only while the hero does not have it yet; the herb only while there
// is room in the belt. Shards come `count` [min, max] at a time.
export const CHEST_LOOT = [
  { item: 'herb', weight: 3 },
  { item: 'vine', weight: 3, once: true },
  { item: 'shield', weight: 3, once: true },
  { item: 'shards', weight: 2, count: [3, 5] },
  { item: 'mask', weight: 2, once: true, from: 1 }, // M6a: from the mushroom cave on (`from`: area index)
  // W5: a grade-up gem (GDD §6.5), likelier the deeper (`weights` by area
  // index: the moss valley 0 … the Crystal Heart 3); never once both are
  // legend. Only in the big world (`world`): the old caves' dice stay as they were
  { item: 'gradeUp', weight: 1, weights: [0.6, 1, 1.4, 1.8], world: true },
];
export const SHARDS = { name: '수정 조각', icon: '💎' };

// W5: item grades (GDD §6.5): the HUD slot's border says which. The hammer
// and the water gun go back to common when the hero faints (the armour,
// found as a whole item, stays: §14).
export const GRADES = {
  common: { name: '일반', color: '#f4f1e8' },
  rare: { name: '희귀', color: '#4fa3ff' },
  legend: { name: '전설', color: '#ffcf4a' },
};
// a grade-up (a gem from a chest, the merchant, a secret chest): the next
// grade for the hammer or the water gun. In chests from region 1 on, more
// often the deeper (`weights` by region, data/items.js CHEST_LOOT)
export const GRADE_UP = { name: '강화 보석', icon: '✨', got: '강화 보석! 아이템이 더 세졌어요' };

// A fight room put to sleep sometimes leaves a herb (GDD §7.3 "가끔 약초").
export const CLEAR_DROP = { herb: 0.25 };
// GDD §8.5 도움 장치: at or below a quarter of the hearts, herbs come up more
// often, from chests (× the herb's weight) and from cleared rooms (× the
// chance, never above `maxChance`).
export const ASSIST = { lowHearts: 0.25, herbBoost: 3, maxChance: 0.75 };

// M6a: the bat merchant's shop (GDD §7.3 상점 방, §14 #11), prices in crystal
// shards. `once`: a tool the hero does not have yet; `heal`: hearts back.
// [call] no item grades yet (GDD §6.5 comes with M8): herbs, the mask, a
// heart refill, and the vine and the shield for a hero who missed them.
export const SHOP = [
  { id: 'herb', item: 'herb', price: 3, name: '약초', icon: '🌱', note: '하트 2칸 회복 (4)' },
  { id: 'mask', item: 'mask', price: 6, once: true, name: '탈', icon: '🎭', note: '동물인 척 5초 (우클릭)' },
  { id: 'heart', price: 4, heal: 2, name: '하트 물약', icon: '❤️', note: '지금 하트 2칸' },
  { id: 'vine', item: 'vine', price: 6, once: true, name: '덩굴', icon: '🌿', note: '늑대를 묶어요' },
  { id: 'shield', item: 'shield', price: 6, once: true, name: '방패', icon: '🛡️', note: '앞을 막아요 (3)' },
  // W3: armour (common: one blue heart), for a hero who has none yet
  { id: 'armor', item: 'armor', price: 8, once: true, name: '갑옷', icon: '🦺', note: '파란 하트 +1 (샘에서 다시 참)' },
  // W5: grade-ups (GDD §6.5, §14 #41): the next grade of the hammer or the
  // water gun, the price by the grade it becomes (kept until a faint)
  { id: 'hammerUp', upgrade: 'hammer', price: { rare: 8, legend: 14 }, name: '망치 강화', icon: '🔨', note: '희귀: 범위 +50 % · 전설: 작은 충격파' },
  { id: 'waterUp', upgrade: 'waterGun', price: { rare: 8, legend: 14 }, name: '물총 강화', icon: '💧', note: '희귀: 두 줄기 · 전설: 물폭탄' },
];
