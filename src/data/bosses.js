// The bosses (GDD §3.3, §10.3), plain data: phases, patterns and their
// timing. Balance lives here; the pure scheduler (entities/bosses/chiefAI.js)
// reads it, the body (entities/bosses/rabbitChief.js) draws it.
//
// GDD §3.3: three phases (2nd at 66 % hp, 3rd at 33 %), every attack drawn on
// the floor before it lands, and a rest after every big attack so one
// mistake never costs a lot. hp counts hammer hits.
//
// Times are seconds, distances metres, damage hearts.
export const BOSSES = {
  rabbitChief: {
    kind: 'rabbitChief',
    name: '거대 토끼 대장', icon: '👑', model: 'rabbit',
    hp: 30,
    phases: [0.66, 0.33], // hp fraction where phase 2 and phase 3 start
    // what each phase may do (the newest first when a phase begins)
    patterns: [['slam'], ['gust', 'slam'], ['dash', 'slam', 'gust']],
    tempo: [1, 0.95, 0.8], // × windups and rests per phase (faster at the end)
    minWindup: 0.6, // never a shorter warning than this, whatever the tempo
    rest: [2.0, 1.7, 1.4], // s of rest after every pattern, per phase
    start: 1.2, // s before the first attack once the fight begins
    roar: 1.6, // s of roaring when a new phase begins (no attack)
    stunned: 3.0, // s on its back when the stun gauge fills
    dizzy: 1.5, // s dazed after landing (slam) and after the triple dash
    // the hammer: double damage while it is dazed or stunned (GDD §3.3 "착지 후 빈틈에 망치")
    hammerBonus: 2,
    // the stun gauge (Island-style, on the name plate): fills from hits, full = stunned
    stun: { hammer: 0.1, dazedHammer: 0.18, water: 0.04, vine: 0.3, decay: 0.03 },
    damage: { slam: 1, wave: 0.5, gust: 0.5, dash: 0.5 },
    // high jump → slam: a red circle where it will land, then a shockwave ring
    slam: { crouch: 0.75, air: 1.1, radius: 2.8, height: 6, wave: { radius: 8, time: 1.3, band: 0.8 } },
    // ear-flap wind: a cone toward the hero, then a gust that pushes
    gust: { windup: 1.0, blow: 1.1, reach: 9, arc: 70, push: 5 },
    // three dashes in a row, each down its own red lane
    dash: { count: 3, aim: 0.85, run: 0.42, gap: 0.35, length: 13, width: 2.2 },
    hint: '착지하면 어지러워해요. 그때 망치로!',
    size: [1.3, 2.0], // [radius, height] for clicking and hitting
  },
};

// M6a: the Poison Mushroom Queen (GDD §3.3 row 2), the mushroom cave's boss.
// A big mushroom with a crown on her cap. Every attack is drawn first:
//   spray  : spore cones fan out on the floor (1, 2, 3 by phase) → the spores
//            blow along them → she droops, her cap low (dizzy: hammer × 2)
//   summon : red circles where poison mushrooms will burst up → they sprout
//            (a touch hurts as they come up), then puff poison at the hero
//   cloud  : green-edged zones seep on the floor → they turn into poison
//            clouds for a while (a half heart a tick inside). Water washes a
//            cloud away: a safe place to stand.
// Kid-friendly: clouds never cover the whole arena (a gap round the queen
// and between zones), only one pattern at a time, a rest after each.
BOSSES.mushroomQueen = {
  kind: 'mushroomQueen',
  name: '독버섯 여왕', icon: '🍄', model: 'queen',
  hp: 40, // the second boss: a little more than the chief's 30
  phases: [0.66, 0.33],
  patterns: [['spray', 'cloud'], ['summon', 'spray', 'cloud'], ['cloud', 'spray', 'summon']],
  tempo: [1, 0.92, 0.82],
  minWindup: 0.7,
  rest: [2.1, 1.8, 1.5],
  start: 1.2,
  roar: 1.6,
  stunned: 3.0,
  dizzy: 1.8, // s her cap droops after a spore spray and after the clouds (the hammer's chance)
  hammerBonus: 2,
  stun: { hammer: 0.1, dazedHammer: 0.18, water: 0.03, vine: 0.25, decay: 0.03 },
  damage: { spray: 0.5, sprout: 0.5, poison: 0.5 },
  spray: { windup: 1.1, blow: 0.6, reach: 9, arc: 46, cones: [1, 2, 3], spread: 62 },
  summon: { windup: 1.1, sprout: 0.35, count: [2, 2, 3], radius: 1.2, life: 14, max: 4 },
  cloud: { windup: 1.3, form: 0.4, count: [2, 2, 3], radius: 2.8, life: 9 },
  glide: 1.2, // m/s she drifts toward the hero between attacks
  hint: '포자를 뿜고 나면 갓이 내려와요. 그때 머리를 망치로!',
  size: [1.6, 2.6],
};

// M6a: poison (the mushroom cave's floor and the queen's clouds). A cloud or
// a puddle hurts `damage` every `tick` s while the hero stands in it (the
// first `grace` s after stepping in are free); water washes a cloud away (a
// puddle stays: walk round it). A poison mushroom swells `warn` s (a
// green-red ring on the floor) before it puffs a cloud of `radius` m that
// lasts `life` s, then rests `rest` s.
export const POISON = {
  damage: 0.5, tick: 1.3, grace: 0.45,
  mushroom: { near: 3.2, warn: 1.0, radius: 2.0, life: 6, rest: 5 },
};

// M6a: a bounce mushroom throws the hero along a fixed arc (`time` s, `height`
// m at the top) to its marked landing.
export const BOUNCE = { time: 1.05, height: 4.5, cooldown: 1.2 };

// W3: the Ice Bear (GDD §3.3 row 3), the Ice Lake's boss, on its round rink of
// bare ice (slippery: the hero slides, so its warnings are a little longer).
// Every attack is drawn first:
//   fist     : it rears up, a red circle in front where both fists come down
//              → the pound (a heart) → its fists stuck in the ice (`dizzy` s:
//              the hammer hits twice as hard). Phase 3: two pounds, then stuck.
//   chunks   : it roars at the roof: shadows on the ice where chunks will
//              fall (more each phase) → they crash down (half a heart each)
//   blizzard : it breathes in (a red cone) → a blizzard along the cone that
//              pushes the hero away (half a heart, once)
// Kid-friendly: a rest after every pattern, shadows never on top of each
// other and never under it (a place to stand by its side).
BOSSES.iceBear = {
  kind: 'iceBear',
  name: '얼음 곰', icon: '🐻‍❄️', model: 'bear',
  hp: 45, // the third boss: a little more than the queen's 40
  phases: [0.66, 0.33],
  patterns: [['fist', 'chunks'], ['blizzard', 'fist', 'chunks'], ['chunks', 'fist', 'blizzard']],
  tempo: [1, 0.92, 0.85],
  minWindup: 0.85,
  rest: [2.2, 1.9, 1.6],
  start: 1.3,
  roar: 1.6,
  stunned: 3.0,
  dizzy: 2.2, // s its fists stay stuck in the ice (the hammer's chance)
  hammerBonus: 2,
  stun: { hammer: 0.08, dazedHammer: 0.15, water: 0.04, vine: 0.25, decay: 0.03 },
  damage: { fist: 1, chunk: 0.5, blizzard: 0.5 },
  fist: { raise: 1.25, radius: 3.0, reach: 4.2, gap: 0.55, count: [1, 1, 2] },
  chunks: { warn: 1.5, fall: 0.45, count: [3, 4, 5], radius: 1.6, drop: 0.55 },
  blizzard: { inhale: 1.25, blow: 1.5, reach: 10, arc: 60, push: 5 },
  glide: 1.5, // m/s it lumbers toward the hero between attacks
  hint: '주먹이 얼음에 박히면 망치로!',
  size: [2.0, 2.6],
};

// W3: icicles in the Ice Lake's passes: while the hero is in one, now and
// then an icicle breaks loose over where the hero stands. Its shadow shows
// first (a red-edged dark circle, `warn` s, the icicle seen falling in the
// last `fall` s), then it shatters there (half a heart inside `radius`).
// Walking on is enough to miss it.
export const ICICLE = { warn: 1.35, fall: 0.4, every: 2.6, radius: 1.15, damage: 0.5, height: 13, first: 1.2 };

// W4: the Crystal King (GDD §3.3 row 4), the last boss, on the heart's
// platform under the giant crystal heart. A body of faceted violet crystal,
// two crystal fists floating at his sides, Polyfork's crown on his head.
// Every attack is drawn first:
//   laser  : he raises his fists and his chest glows; a red wedge on the
//            floor (and a bright line where the beam starts) shows where the
//            beam will sweep → it sweeps across the wedge once (a heart if it
//            crosses the hero) → he slumps, tired (`tired` s): his chest
//            crystal is bare, the hammer and the items hit harder
//   spikes : purple circles with red edges on the floor (the first on the
//            hero, the rest round, never under him, never on each other) →
//            crystal spikes burst up (half a heart each) → tired, a little less
//   summon : (phase 2 on) purple rings where crystal-tinted animals rise (2,
//            then 3; never more than `max` awake at once) → they come
// Phase 3 (33 %): he is angry: faster, a wider sweep, more spikes, three
// animals. Kid-friendly: a rest after every pattern, warnings ≥ 0.9 s, the
// laser's wedge always leaves room (behind him, out to the sides).
BOSSES.crystalKing = {
  kind: 'crystalKing',
  name: '크리스탈 킹', icon: '💎', model: 'king',
  hp: 50, // the last boss: more than the Ice Bear's 45 (W5: 56 → 50, the fight ran ~6 min)
  phases: [0.66, 0.33],
  patterns: [['laser', 'spikes'], ['summon', 'laser', 'spikes'], ['spikes', 'laser', 'summon']],
  tempo: [1, 0.92, 0.8],
  minWindup: 0.9,
  rest: [2.2, 1.9, 1.6],
  start: 1.4,
  roar: 1.8,
  stunned: 3.2,
  dizzy: 2.4, // (the scheduler's daze; his own is `tired`)
  tired: [2.8, 2.5, 2.2], // s slumped after a laser (× 0.85 after the spikes)
  hammerBonus: 2, // × the hammer while he is tired or stunned
  itemBonus: 3, // × the water gun while he is tired (it splashes the bare crystal)
  stun: { hammer: 0.08, dazedHammer: 0.14, water: 0.04, vine: 0.25, decay: 0.03 },
  damage: { laser: 1, spike: 0.5 },
  // (W5: aim 1.35 → 1.6 s: the bot took 3–5 lasers a fight; a sweep arrow shows its way)
  laser: { aim: 1.6, sweep: 1.15, reach: 15, arc: [70, 80, 96], width: 1.5 },
  spikes: { warn: 1.35, erupt: 0.5, count: [3, 4, 5], radius: 1.55 },
  summon: { warn: 1.25, call: 0.7, count: [0, 2, 3], max: 3, kinds: ['wolf', 'fox', 'hare'] },
  glide: 1.2, // m/s he floats toward the hero between attacks
  hint: '큰 공격 뒤에 지쳐서 주저앉아요. 그때 가슴의 수정을 망치로!',
  size: [1.8, 3.2],
};

// W4: crystal spikes on the Crystal Heart's ways (world/heart.js): while the
// hero is in a spot of them, now and then a ring shows on the floor where the
// hero stands (a little off: purple inside, red at the edge, `warn` s), then
// crystal spikes burst up there (half a heart inside `radius`). Walking on is
// enough to miss them.
export const CRYSTAL_SPIKE = { warn: 1.35, every: 3.2, radius: 1.25, damage: 0.5, first: 1.5, stay: 0.9 };

// W4: a hop from one floating rock to the next (world/heart.js): a short
// arc, faster than a bounce mushroom's
export const HOP = { base: 0.5, perM: 1 / 24, height: 2.2, rise: 0.2 };
export const hopFlight = (from, to) => {
  const d = Math.hypot(to.x - from.x, to.z - from.z), rise = (to.y ?? 0) - (from.y ?? 0);
  return { time: HOP.base + d * HOP.perM + Math.abs(rise) / 50, height: HOP.height + Math.max(0, rise) * HOP.rise };
};

// W4: the escape (GDD §2.3): after the Crystal King the hero runs from his
// platform over the crystal bridge, up the tunnel to the sunlight. Rocks
// fall ahead (a red circle first, world/escape.js), the cave shakes; a
// soft clock counts down (it only hurries: when it runs out the rocks come
// a little faster, nothing else). Fainting on the way wakes the hero back at
// the platform with every heart. The rocks are gentler than the old caves'
// short tunnel (a longer run: one every 1.2 s, 1.4 s of warning, further ahead).
export const ESCAPE = { time: 60, rocksFrom: 30, rocks: { every: 1.2, warn: 1.4, ahead: [5, 10] } };
