// The animals (GDD §3.2, §10.4). hp counts hammer hits, damage counts hearts
// (0.5 = half a heart), speeds are m/s, distances metres, times seconds.
// Every attack has a windup with a red mark on the floor (GDD §3.2, §6.1):
// `bite` is that mark, a cone in front of the animal.
//
// The shared AI (entities/enemyAI.js) reads: walk (wandering), speed
// (chasing), detect, attackRange (starts the windup), alert (the ❗),
// windup, attack, recover (the opening after an attack), stagger (after a
// water-gun push), aim (s of chasing before it may wind up again). The wolf
// (M2), the rabbit (M5), the fox and the mole (M6a) are wired up; the rest
// are data.
export const ENEMIES = {
  wolf: {
    name: '늑대', icon: '🐺', model: 'wolf', type: 'chaser',
    hp: 3, damage: 0.5, speed: 5.5, walk: 1.4, detect: 10, attackRange: 1.5,
    alert: 0.5, windup: 0.6, attack: 0.3, recover: 0.8, stagger: 0.5,
    bite: { reach: 2.3, arc: 70, lunge: 1.0 },
    weakTo: 'vine', hint: '덩굴로 묶으면 무방비!',
    size: [0.7, 0.6], // [radius, height] for clicking and hitting
  },
  // M5: the hopper. It keeps its distance (`keep`), aims a red lane on the
  // floor (`windup`), jump-dashes along it (`attack` s, `lane.length` m: a
  // touch on the way costs half a heart), then lands and sits there dazed
  // for `recover` s: the opening (GDD §3.2 "착지 직후 0.8초 빈틈"). A hammer
  // hit in that window knocks it silly (`landing.dizzy` s); a swing at it
  // while it is hopping about it dodges (once per `dodge.cooldown` s).
  rabbit: {
    name: '토끼', icon: '🐰', model: 'rabbit', type: 'charger',
    hp: 2, damage: 0.5, speed: 4.2, walk: 1.2, detect: 9, attackRange: 6.5,
    keep: 5.5, aim: 1.1,
    alert: 0.5, windup: 0.9, attack: 0.45, recover: 0.8, stagger: 0.5,
    lane: { length: 7, width: 1.3 },
    landing: { dizzy: 1.4 },
    dodge: { cooldown: 2.5, hop: 2.2 },
    weakTo: 'hammer', hint: '착지했을 때 망치로!',
    size: [0.5, 0.6],
  },
  // M6a: the ambusher (GDD §3.2). It waits hidden in a giant mushroom's
  // shade (a faint shimmer), springs when the hero comes within `ambush` m
  // (❗, then the red cone and the bite), then slinks back to the shade to
  // hide again. Water shows it up: wet, it cannot hide for `reveal` s and
  // fights in the open, where the hammer finds it.
  fox: {
    name: '여우', icon: '🦊', model: 'fox', type: 'ambusher',
    hp: 3, damage: 0.5, speed: 5.4, walk: 1.2, detect: 8, attackRange: 1.6,
    alert: 0.5, windup: 0.65, attack: 0.3, recover: 0.9, stagger: 0.6,
    bite: { reach: 2.3, arc: 70, lunge: 1.2 },
    hide: { ambush: 4.5, reveal: 7, shade: 14, cloak: 0.12, fade: 0.5 },
    weakTo: 'waterGun', hint: '물총을 맞으면 정체가 드러나요',
    size: [0.55, 0.6],
  },
  // M6a: the burrower (GDD §3.2). Underground it is a moving mound of earth;
  // close to the hero it stops, a red circle shows where it will burst out,
  // it pops up (a heart if it catches the hero) and stays up a moment (the
  // hammer's chance), then digs down again. Water into its mound floods it
  // out: it sits there stunned (💫) for `flooded` s.
  mole: {
    name: '두더지 괴물', icon: '🐹', model: 'mole', type: 'burrower',
    hp: 3, damage: 1, speed: 3.2, walk: 0.8, detect: 9, attackRange: 1.6,
    alert: 0.5, windup: 1.0, attack: 0.35, surface: 1.6, dig: 0.6, flooded: 2.6, chase: 3.5, regroup: 0.9,
    pop: { radius: 1.5 },
    weakTo: 'waterGun', hint: '흙더미 구멍에 물총!',
    size: [0.7, 0.7],
  },
  // W3: the antlered charger (GDD §3.2 돌진형). It keeps its distance on the
  // open snow, lowers its antlers (a long red lane, `windup` s), charges down
  // it (a heart if it catches the hero), then stands blowing (`recover`: the
  // opening). A raised shield in its way: the antlers stick fast, it stands
  // stuck `stuck` s (💫, the hammer's chance). On ice its charge slides on.
  deer: {
    name: '사슴', icon: '🦌', model: 'deer', type: 'charger',
    hp: 4, damage: 1, speed: 4.6, walk: 1.2, detect: 11, attackRange: 9.5,
    keep: 8, aim: 1.4,
    alert: 0.6, windup: 1.15, attack: 0.6, recover: 1.3, stagger: 0.6,
    lane: { length: 11, width: 1.7 },
    stuck: 2,
    weakTo: 'shield', hint: '방패로 막으면 뿔이 박혀요',
    size: [0.7, 1.3],
  },
  // W3: the brute (GDD §3.2 강한 적). It lumbers after the hero, rears up
  // (a red circle in front of it, `windup` s) and slams down (1½ hearts).
  // Water in its face (its front `face.arc`°) makes it stagger `face.stagger`
  // s (💫): then the hammer. From behind the water only wets it; pushes move
  // it a little (`heavy` × as far).
  bear: {
    name: '곰', icon: '🐻', model: 'bear', type: 'brute',
    hp: 6, damage: 1.5, speed: 2.6, walk: 0.9, detect: 9, attackRange: 2.8,
    alert: 0.7, windup: 1.2, attack: 0.35, recover: 1.3, stagger: 0.6,
    slam: { r: 2.3, ahead: 1.7 },
    face: { arc: 120, stagger: 2 },
    heavy: 0.3,
    weakTo: 'waterGun', hint: '얼굴에 물총을 맞으면 휘청!',
    size: [1.0, 1.2],
  },
};
// W3: the Ice Lake's rabbits are snow hares (Polyfork's mountain hare, a white
// winter coat): the rabbit's hops and weakness
ENEMIES.hare = { ...ENEMIES.rabbit, name: '눈토끼', icon: '🐇', model: 'hare' };
