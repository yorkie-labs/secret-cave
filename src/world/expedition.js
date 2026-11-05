import * as THREE from 'three';
import { createGates } from './gates.js';
import { seedEncounters, expeditionSeed, faintPenalty, difficultyOfSpot, REGION_DIFFICULTY } from './encounters.js';
import { createForest } from './forest.js';
import { createLake } from './lake.js';
import { createIceBear } from '../entities/bosses/iceBear.js';
import { createCrystalKing } from '../entities/bosses/crystalKing.js';
import { crystalTint } from '../entities/crystalTint.js';
import { createHeart } from './heart.js';
import { createSecrets } from './secrets.js';
import { applyGrowth, pouchHerbs, bossLost, lossHerb } from '../core/growth.js';
import { resetGrades } from '../combat/grades.js';
import { refillArmor } from '../combat/loadout.js';
import { createMushroomQueen } from '../entities/bosses/mushroomQueen.js';
import { softGlowTexture } from './glow.js';
import { place, whenLoaded, allSettled, prioritizeRegion } from './models.js';
import { spawnEnemy, modelsOfKinds } from './spawn.js';
import { rollClearDrop } from '../core/loot.js';
import { createChest, dropLoot } from '../entities/chest.js';
import { dropShard, textSprite } from '../entities/enemy.js';
import { createSpring } from '../entities/spring.js';
import { createMerchant } from '../entities/bat.js';
import { dropNecklace, createGlyphWall } from '../entities/necklace.js';
import { createRabbitChief } from '../entities/bosses/rabbitChief.js';
import { signOf } from './gates.js';
import { BOSSES } from '../data/bosses.js';
import { START } from '../data/items.js';
import { beatBoss, save, openGate, findCamp, keepBag, restoreBag, heartDoorReady } from '../core/state.js';
import { rng, subSeed, randomSeed } from '../core/rng.js';
import { sfx } from '../audio/sound.js';

// W1: the expedition loop in the big world (tasks/20261102-world-redesign-
// todo.md §2):
//   - a new game drops the hero through the sinkhole; the golden necklace
//     lies there the first time and the entrance's gate waits for it;
//   - the valley's hand-placed spots are filled from the expedition's seed
//     (world/encounters.js); their animals doze until the hero comes near,
//     then wake (1.5 s calm first) and stay leashed to their spot; a spot
//     put to sleep may leave a herb, and its shards fly to the hero;
//   - the camp (spring: every heart; the bat merchant; the codex stone; the
//     star altar) is found once and kept; every return to it from outside
//     starts a new expedition (a new seed: new packs, chests, herbs);
//   - the Giant Rabbit Chief sleeps in the meadow's arena: walking in seals
//     its gate and wakes it; asleep, it opens the way to region 2 (only as
//     far as a "곧 열려요" fence in W1) and the shortcut to the camp over the
//     old mine's trestle (with a mine cart to ride); it stays asleep for good;
//   - fainting wakes the hero at the camp (or the entrance before the camp
//     is found) with half of this expedition's shards gone; gates, bosses,
//     the codex and the necklace stay (core/state.js `world`).
// W2: the chief asleep opens the way into the Mushroom Forest (region 2,
// world/forest.js: poison pools and vents, bounce mushrooms, a resting
// spring, the mask chest); its spots' animals are tougher (GDD §8.5); the
// Poison Mushroom Queen sleeps in her sunken ring at its far end (walking
// in seals the ring's gate and wakes her); asleep, she gives a star, wakes
// the mushroom lift (the ring ⇄ the camp: the way home) and the ice door
// says the lake is next ("곧 열려요").
// W3: the queen asleep opens the ice door into the Ice Lake (region 3,
// world/lake.js: icicles in its passes, its slippery lake, ice walls the
// hammer breaks into the grotto (the armour chest) and the nook (a resting
// spring)); its animals are tougher still (deer, bears, snow hares, GDD
// §8.5). The Ice Bear sleeps on its rink sunk into the lake (walking in seals
// the rink's frost gate and wakes it); asleep, it gives a star, wakes the
// rope lift (the lake ⇄ the camp) and the crystal door at the lake's far
// corner says the Crystal Heart is next ("곧 열려요", W4).
// W4: the Ice Bear asleep and the golden necklace open the two crystal doors
// down to the Crystal Heart (region 4, world/heart.js): walking up to one, the
// necklace glows and the door sinks. Its animals are the strongest (every
// kind, crystal-tinted, GDD §8.5). The floating rocks are crossed by hops; on
// the heart's platform under the giant crystal the Crystal King wakes (the
// hops off it close behind the hero). Asleep, the heart's light fades, the
// cave shakes, the crystal bridge forms toward the hidden way out and the
// escape begins (rocks fall in the tunnel, a soft clock): the sunlight at
// its end is the ending (ui/story.js), the win is saved, and the world stays
// open after it (이어 하기: the crystal lift takes the hero from the
// platform to the camp's balcony and back).
const WAKE = 6; // m past a spot's radius: its animals wake (W6: a world may scale it, `def.spotWake`)
const DOZE = 24; // m past its leash: they doze again (none still chasing)
const SHOW = 45; // m: dozing animals further off are not drawn
const LEASH = 1.9; // × the spot's radius
const MAGNET = 9; // m/s: a cleared spot's shards fly to the hero
const ARENA_IN = 8; // m inside the arena's edge: the gate shuts, the chief rises
const LOCKED = {
  entrance: { label: '✨ 반짝이는 것을 먼저 주워요', toast: '✨ 바닥에 반짝이는 것이 있어요! 먼저 주워 볼까요?' },
  arena: { label: '👑 대장을 재우면 열려요', toast: '👑 토끼 대장을 재우면 문이 열려요!' },
  region2: { label: '🔒 토끼 대장을 재우면 열려요', toast: '🔒 토끼굴 초원의 대장을 재우면 이 길이 열려요' },
  ring: { label: '👑 여왕을 재우면 열려요', toast: '👑 독버섯 여왕을 재우면 문이 열려요!' },
  pit2: { label: '🐻‍❄️ 얼음 곰을 재우면 열려요', toast: '💎 수정의 심장으로 가는 문이에요. 얼음 호수의 얼음 곰을 재우고 황금 목걸이를 가져오면 열려요!' },
  shortcut: { label: '🛤️ 지름길: 토끼 대장을 재우면 열려요', toast: '🛤️ 광산 수레가 길을 막고 있어요. 토끼 대장을 재우면 지름길이 열려요!' },
  ice: { label: '🔒 독버섯 여왕을 재우면 열려요', toast: '🔒 버섯 숲의 독버섯 여왕을 재우면 이 길이 열려요' },
  bearGate: { label: '🐻‍❄️ 얼음 곰을 재우면 열려요', toast: '🐻‍❄️ 얼음 곰을 재우면 문이 열려요!' },
  pit3: { label: '🐻‍❄️ 얼음 곰을 재우면 열려요', toast: '💎 수정의 심장으로 가는 문이에요. 얼음 곰을 재우고 황금 목걸이를 가져오면 열려요!' },
};
const QUEEN_IN = 6; // m inside the ring's edge: its gate shuts, the queen rises
const LIFT_UP = 22; // m the mushroom lift carries the hero up into the dark
const BEAR_IN = 6; // m inside the rink's edge: its gate shuts, the Ice Bear rises
const KING_IN = 6; // m inside the platform's edge: the hops off it close, the Crystal King rises
const DOOR_NEAR = 9; // m: walking this close to a crystal door with the necklace opens it
const SUN_R = 4.5; // m: inside the sunlight at the tunnel's end, the ending

export function createExpedition(G, def) {
  const { world, state, run } = G;
  const W = state.world;
  run.bigWorld = true; // (W5: the big world's own chest entries, core/loot.js)
  const x = {
    n: 0, seed: 0, rolls: [], spots: new Map(), scope: null, area: null, atCamp: false, left: false,
    chief: null, chiefScope: null, fighting: false, gates: null, necklace: null, riding: false,
    queen: null, queenScope: null, queenFight: false, forest: null,
    bear: null, bearScope: null, bearFight: false, lake: null,
    king: null, kingScope: null, kingFight: false, heart: null, escaping: false, ended: false,
    get camp() { return def.camp; },
  };
  const V = (p, y) => new THREE.Vector3(p[0], y ?? world.groundAt(p[0], p[1]), p[1]);
  const snap = (px, pz) => { const n = G.navGrid.nearest({ x: px, z: pz }, 3); if (n < 0) return null; const p = G.navGrid.posOf(n); return [p.x, p.z]; };
  let timers = [];
  const after = (s, fn) => timers.push({ at: G.time + s, fn });

  // ---- the gates
  const bossDone = () => !!W.bosses?.rabbitChief;
  const queenDone = () => !!W.bosses?.mushroomQueen;
  const bearDone = () => !!W.bosses?.iceBear;
  const kingDone = () => !!W.bosses?.crystalKing;
  x.gates = createGates(G, world, G.navGrid, {
    // (W3: the ice door opens with the queen asleep; an ice wall, once the hammer broke it)
    isOpen: (g) => (g.opens === 'necklace' ? !!state.necklace : g.opens === 'open' ? true
      : g.opens === 'rabbitChief' ? bossDone() || !!W.gates[g.id]
      : g.opens === 'mushroomQueen' ? queenDone() || !!W.gates[g.id]
      : g.opens === 'hammer' ? !!W.gates[g.id]
      // (W4: the Crystal Heart's doors, once the necklace opened them; the way out, the king asleep)
      : g.opens === 'heartDoor' ? heartDoorReady(state) && !!W.gates[g.id]
      // (W5: a secret pocket's door, once the necklace opened it)
      : g.opens === 'secret' ? !!W.gates[g.id]
      : g.opens === 'crystalKing' ? kingDone() : false),
    locked: (g) => (g.secret ? secretLock(g) : LOCKED[g.id] ?? { label: '🔒 아직 열리지 않아요', toast: '🔒 아직 열리지 않아요' }),
  });
  // W5: a secret door says what it waits for (a sniff, then the necklace)
  function secretLock(g) {
    const found = () => !!x.gates?.[g.id]?.revealed;
    return {
      get label() { return found() ? '✨ 비밀 수정 문' : '🪨 이끼 낀 바위 벽'; },
      get toast() { return found() ? (state.necklace ? '🏅 황금 목걸이를 가진 채 문 가까이 가 보세요!' : '✨ 무언가로 열 수 있을 것 같아요…') : '🐾 킁킁… 이 벽에서 신기한 냄새가 나요. 1번(냄새 맡기)!'; },
    };
  }
  // W5: the secret pockets (and the purple shard after the ending)
  x.secrets = createSecrets(G, def, { gates: x.gates, after });
  // W3: a broken ice wall stays broken
  G.on('iceWallBroken', (g) => {
    openGate(state, g.id);
    save(state);
    after(0.9, () => G.toast(g.id === 'iceWall1' ? '💎 얼음 벽이 깨졌어요! 안쪽에 반짝이는 동굴이 있어요' : '⛺ 얼음 벽이 깨졌어요! 누군가 쉬던 곳 같아요', 3000));
  });
  // W2: the Mushroom Forest's poison, bounce mushrooms, spores and spring
  if (def.hazards || def.bounces) x.forest = createForest(G, def);
  // W3: the Ice Lake's icicles, resting spring, snow and breath
  if (def.icicles || def.rest3) x.lake = createLake(G, def);
  // W4: the Crystal Heart's rocks, hops, crystal, ruins, spikes and way out
  if (def.king) x.heart = createHeart(G, def);

  // ---- the camp: the glowing spring, the bat merchant, the codex stone, the star altar
  const C = def.camp;
  const campY = world.groundAt(...C.at);
  x.spring = createSpring(G, { x: C.spring[0], z: C.spring[1], y: campY, full: true, endless: true });
  x.merchant = createMerchant(G, { x: C.merchant[0], y: campY, z: C.merchant[1] }, { x: C.merchantFaces[0], z: C.merchantFaces[1] });
  {
    const stone = place(G, 'glyphStone', C.codex[0], C.codex[1], { s: 1.8, ry: Math.atan2(C.at[0] - C.codex[0], C.at[1] - C.codex[1]), y: campY, body: 'none' });
    G.physics.addCylinder(C.codex[0], campY, C.codex[1], { radius: 0.8, height: 2 }); // (narrow: the hero reaches it to use it)
    const book = textSprite('📖', 1.2);
    book.position.set(C.codex[0], campY + 2.9, C.codex[1]);
    G.scene.add(book);
    G.addLight({ pos: V(C.codex, campY + 2), color: '#9fd8ff', intensity: 5, distance: 7 });
    G.addInteractable({ pos: V(C.codex, campY), radius: 2.8, name: '도감 돌', kind: 'codex', label: '📖 도감 돌 (본 것들)', action: () => G.codex?.open() });
    G.onUpdate(() => { book.position.y = campY + 2.9 + Math.sin(G.time * 2) * 0.1; });
    void stone;
  }
  {
    place(G, 'altar', C.altar[0], C.altar[1], { s: 1.7, ry: 0.4, y: campY, body: 'none' });
    G.physics.addCylinder(C.altar[0], campY, C.altar[1], { radius: 0.8, height: 1.6 });
    const star = textSprite('⭐', 1.3);
    star.position.set(C.altar[0], campY + 2.6, C.altar[1]);
    G.scene.add(star);
    G.addLight({ pos: V(C.altar, campY + 2), color: '#ffe08a', intensity: 6, distance: 8 });
    G.addInteractable({
      pos: V(C.altar, campY), radius: 2.8, name: '별 제단', kind: 'altar', label: () => `⭐ 별 제단 (별 ${state.stars}개)`,
      action: () => G.altar?.open(),
    });
    G.onUpdate(() => { star.position.y = campY + 2.6 + Math.sin(G.time * 1.6) * 0.12; star.material.rotation = Math.sin(G.time) * 0.2; });
  }
  for (const [i, p] of C.lanterns.entries()) {
    place(G, 'torch', p[0], p[1], { s: 1.6, ry: i, y: world.groundAt(...p), body: 'none' });
    G.addLight({ pos: V(p, world.groundAt(...p) + 2.6), color: '#ffb35a', intensity: 7, distance: 11, flicker: 0.12 });
  }
  G.addLight({ pos: V(C.at, campY + 5), color: '#ffd9a0', intensity: 16, distance: 24 });
  {
    const sign = signOf({ icon: '🔥', name: '캠프' });
    const b = world.bridges.find((q) => q.id === 'viaduct')?.b ?? C.at;
    sign.position.set(b[0] + (C.at[0] - b[0]) * 0.25, campY + 3.6, b[1] + (C.at[1] - b[1]) * 0.25);
    G.scene.add(sign);
    // the balcony: look down into the pit
    G.addInteractable({
      pos: V(C.balcony, campY), radius: 3.5, name: '전망대', kind: 'balcony', label: '🔭 저 아래를 내려다보기',
      action: () => G.toast('💎 저 깊은 아래에서 보랏빛이 반짝여요… 수정의 심장이에요!', 3400),
    });
  }

  // ---- the entrance: the necklace (first time) and the old letters by the gate
  const gateE = def.gates.find((g) => g.id === 'entrance');
  {
    const [sx, sz] = def.spawn;
    const gx = gateE.at[0] - gateE.dir[0] * 7 + gateE.dir[1] * 9, gz = gateE.at[1] - gateE.dir[1] * 7 - gateE.dir[0] * 9;
    const y = world.groundAt(gx, gz);
    const face = Math.atan2(sx - gx, sz - gz);
    place(G, 'glyphStone', gx, gz, { s: 2.6, ry: face, y, body: 'none' });
    G.physics.addCylinder(gx, y, gz, { radius: 1.6, height: 3 });
    const glyphs = createGlyphWall(G, { x: gx + Math.sin(face) * 0.95, z: gz + Math.cos(face) * 0.95, y: y + 0.9, facing: face, lit: !!state.necklace });
    if (!state.necklace) {
      const nx = sx + (gateE.at[0] - sx) * 0.35, nz = sz + (gateE.at[1] - sz) * 0.35;
      x.necklace = dropNecklace(G, { x: nx, y: world.groundAt(nx, nz), z: nz }, glyphs);
    }
  }
  G.on('necklace', () => { after(0.5, () => x.gates.entrance.unseal()); });

  // ---- the chief in its arena
  const A = def.arena;
  const arenaY = world.groundAt(...A.at);
  function spawnChief() {
    if (x.chiefScope) { G.disposeScope(x.chiefScope); x.chiefScope = null; }
    G.hud.bossPlate?.(null);
    if (bossDone()) { x.chief = null; return; }
    x.chiefScope = G.beginScope();
    x.chief = createRabbitChief(G, { x: A.at[0], z: A.at[1], heading: Math.PI / 4, center: { x: A.at[0], z: A.at[1] }, arena: A.keep, floor: arenaY });
    x.chief.dormant = true;
    G.endScope(x.chiefScope);
    x.fighting = false;
  }
  spawnChief();
  G.on('bossDefeated', (e) => { if (e === x.chief) chiefDown(); });
  function chiefDown() {
    const boss = BOSSES.rabbitChief;
    x.fighting = false;
    W.bosses.rabbitChief = true;
    const r = beatBoss(state, 'rabbitChief');
    run.hearts = run.maxHearts;
    refillArmor(run);
    G.hud.healed?.();
    G.toast(`${boss.icon} ${boss.name}이 잠들었어요! 동굴이 흔들려요…`, 3000);
    if (r.first) after(1.2, () => G.toast(`⭐ ${boss.name}을 처음 물리쳤어요! 별 하나!`, 2600));
    G.cam?.shake(0.9);
    sfx.quake?.();
    after(2.4, () => {
      for (const id of ['arena', 'region2', 'shortcut']) { x.gates[id]?.unseal(); if (id !== 'arena') openGate(state, id); }
      save(state);
      G.cam?.shake(0.5);
      G.toast('🛤️ 지름길이 열렸어요! 광산 수레를 타면 캠프로 금방 가요', 3600);
      G.emit('chiefBeaten');
    });
    G.refresh();
  }

  // ---- W2: the Poison Mushroom Queen in her sunken ring
  const Q = def.queen;
  const ringY = Q ? world.groundAt(...Q.at) : 0;
  function spawnQueen() {
    if (!Q) return;
    if (x.queenScope) { G.disposeScope(x.queenScope); x.queenScope = null; }
    G.hud.bossPlate?.(null);
    x.queenFight = false;
    if (queenDone()) { x.queen = null; return; }
    x.queenScope = G.beginScope();
    x.queen = createMushroomQueen(G, { x: Q.at[0], z: Q.at[1], heading: Math.PI / 4, center: { x: Q.at[0], z: Q.at[1] }, arena: Q.keep, floor: ringY });
    x.queen.dormant = true;
    G.endScope(x.queenScope);
  }
  spawnQueen();
  G.on('bossDefeated', (e) => { if (e === x.queen) queenDown(); });
  function queenDown() {
    const boss = BOSSES.mushroomQueen;
    x.queenFight = false;
    W.bosses.mushroomQueen = true;
    const r = beatBoss(state, 'mushroomQueen');
    run.hearts = run.maxHearts;
    refillArmor(run);
    G.hud.healed?.();
    G.toast(`${boss.icon} ${boss.name}이 잠들었어요! 숲이 조용해져요…`, 3000);
    if (r.first) after(1.2, () => G.toast(`⭐ ${boss.name}을 처음 물리쳤어요! 별 하나!`, 2600));
    G.cam?.shake(0.6);
    sfx.quake?.();
    after(2.4, () => {
      x.gates.ring?.unseal();
      openGate(state, 'lift');
      // W3: and the ice door by the camp opens: the Ice Lake
      x.gates.ice?.unseal();
      openGate(state, 'ice');
      save(state);
      G.toast('🍄 버섯 승강기가 깨어났어요! 타면 캠프로 금방 가요', 3600);
      after(3.8, () => G.toast('❄️ 캠프 옆 수정 문이 열렸어요! 얼음 호수로 가 봐요', 3400));
      G.emit('queenBeaten');
    });
    G.refresh();
  }

  // ---- W2: the mushroom lift (the queen's ring ⇄ the camp): a giant
  // glowing mushroom at each end; riding it, the cap carries the hero up into
  // the dark and down at the other end
  const L = def.lift;
  const liftOpen = () => queenDone() && !!W.gates.lift;
  if (L) {
    const ends = [{ at: L.ring, to: L.camp, name: '캠프' }, { at: L.camp, to: L.ring, name: '버섯 고리' }];
    for (const e of ends) {
      const y = world.groundAt(...e.at);
      const cap = place(G, 'bonnet', e.at[0], e.at[1], { s: 0.55, ry: 0.7, y, body: 'none' });
      cap.userData.noFade = true;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#ffb46b', transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.setScalar(6); glow.position.set(e.at[0], y + 3, e.at[1]); glow.raycast = () => {};
      G.scene.add(glow);
      const light = G.addLight({ pos: V(e.at, y + 3), color: '#ffb46b', intensity: 8, distance: 12 });
      G.onUpdate(() => { const on = liftOpen(); glow.visible = on; light.intensity = on ? 8 + Math.sin(G.time * 2) * 2 : 1.5; });
      G.addInteractable({
        pos: V(e.at, y), radius: 2.8, name: '버섯 승강기', kind: 'lift', enabled: () => liftOpen() && !x.riding,
        label: `🍄 버섯 승강기 타고 ${e.name}(으)로`, action: () => lift(e),
      });
      e.cap = cap;
    }
    ends[0].other = ends[1]; ends[1].other = ends[0];
    x.liftEnds = ends;
  }
  // a ride up into the dark and down at the other end. `follow`: how much of
  // the rise the end's own thing (the mushroom's cap: a little; the rope
  // lift's platform: all of it) comes along; each is put back after
  async function lift(e, { follow = 0.15, event = 'lifted' } = {}) {
    if (x.riding) return;
    x.riding = true;
    G.beginCutscene();
    G.pointer?.cancel();
    sfx.jump?.();
    const fly = (from, to, secs, ease, obj) => new Promise((done) => {
      let t = 0;
      const base = obj ? (obj.userData.y0 ??= obj.position.y) : 0;
      const step = (dt) => {
        t += dt;
        const u = Math.min(1, t / secs), k = ease(u);
        const p = from.clone().lerp(to, k);
        G.player.model.position.copy(p);
        if (obj) obj.position.y = base + (p.y - (to.y > from.y ? from.y : to.y)) * follow;
        if (u >= 1) { G.updaters.splice(G.updaters.indexOf(step), 1); done(); }
      };
      G.onUpdate(step);
    });
    const a = V(e.at), b = V(e.to);
    G.player.state.frozen = true;
    await fly(a, a.clone().setY(a.y + LIFT_UP), 1.4, (u) => u * u, e.cap);
    await G.hud.fade(true);
    if (e.cap) e.cap.position.y = e.cap.userData.y0;
    G.player.teleport(b.clone().setY(b.y + LIFT_UP), Math.PI);
    G.cam?.snap(b);
    G.terrain?.warm?.(b);
    G.hud.fade(false);
    await fly(b.clone().setY(b.y + LIFT_UP), b, 1.3, (u) => 1 - (1 - u) * (1 - u), e.other?.cap);
    if (e.other?.cap) e.other.cap.position.y = e.other.cap.userData.y0;
    G.player.state.frozen = false;
    // (W5: a lift with a `stepTo` steps the hero off its pad on arrival, so the
    // next tap or click nearby is not "ride back")
    const st = e.other?.stepTo;
    if (st) { const d = Math.hypot(st[0] - b.x, st[1] - b.z) || 1; const q = snap(b.x + (st[0] - b.x) / d * 3.5, b.z + (st[1] - b.z) / d * 3.5); if (q) b.set(q[0], world.groundAt(q[0], q[1], b.y), q[1]); }
    G.player.teleport(b, Math.PI);
    sfx.land?.();
    G.endCutscene();
    x.riding = false;
    G.emit(event, { to: e.name });
  }

  // ---- W3: the Ice Bear on its rink in the lake
  const B = def.iceBear;
  const rinkY = B ? world.groundAt(...B.at) : 0;
  function spawnIceBear() {
    if (!B) return;
    // (release: the bear's model may still be streaming in: made when it lands)
    if (!allSettled(['bear'])) { whenLoaded(['bear'], spawnIceBear); return; }
    if (x.bearScope) { G.disposeScope(x.bearScope); x.bearScope = null; }
    G.hud.bossPlate?.(null);
    x.bearFight = false;
    if (bearDone()) { x.bear = null; return; }
    x.bearScope = G.beginScope();
    x.bear = createIceBear(G, { x: B.at[0], z: B.at[1], heading: Math.PI / 4, center: { x: B.at[0], z: B.at[1] }, arena: B.keep, floor: rinkY });
    x.bear.dormant = true;
    G.endScope(x.bearScope);
  }
  spawnIceBear();
  G.on('bossDefeated', (e) => { if (e === x.bear) bearDown(); });
  function bearDown() {
    const boss = BOSSES.iceBear;
    x.bearFight = false;
    W.bosses.iceBear = true;
    const r = beatBoss(state, 'iceBear');
    run.hearts = run.maxHearts;
    refillArmor(run);
    G.hud.healed?.();
    G.toast(`${boss.icon} ${boss.name}이 잠들었어요! 호수가 조용해져요…`, 3000);
    if (r.first) after(1.2, () => G.toast(`⭐ ${boss.name}을 처음 물리쳤어요! 별 하나!`, 2600));
    G.cam?.shake(0.7);
    sfx.quake?.();
    after(2.4, () => {
      x.gates.bearGate?.unseal();
      openGate(state, 'lift3');
      save(state);
      G.toast('🪢 밧줄 승강기가 내려왔어요! 타면 캠프로 금방 가요', 3600);
      after(3.8, () => G.toast('💎 호수 끝 수정 문 너머, 수정의 심장이 곧 열려요!', 3400));
      G.emit('iceBearBeaten');
    });
    G.refresh();
  }

  // ---- W3: the rope lift (the lake ⇄ the camp): a mine headframe at each
  // end with a plank platform on ropes; riding it, the platform hauls the
  // hero up into the dark and lets them down at the other end
  const L3 = def.lift3;
  const lift3Open = () => bearDone() && !!W.gates.lift3;
  if (L3) {
    const ends = [{ at: L3.lake, to: L3.camp, name: '캠프' }, { at: L3.camp, to: L3.lake, name: '얼음 호수' }];
    for (const e of ends) {
      const y = world.groundAt(...e.at);
      const face = Math.atan2(-e.at[0] + e.to[0], -e.at[1] + e.to[1]);
      const tower = place(G, 'headframe', e.at[0], e.at[1], { s: 1.05, ry: face, y, body: 'none' });
      tower.userData.noFade = true;
      G.worldProps?.push({ obj: tower, x: e.at[0], z: e.at[1] });
      const platform = ropePlatform();
      platform.position.set(e.at[0], y + 0.12, e.at[1]);
      platform.rotation.y = face;
      G.scene.add(platform);
      G.worldProps?.push({ obj: platform, x: e.at[0], z: e.at[1] });
      const light = G.addLight({ pos: V(e.at, y + 3), color: '#ffd9a0', intensity: 6, distance: 11 });
      G.onUpdate(() => { const on = lift3Open(); light.intensity = on ? 6 + Math.sin(G.time * 2) : 1.2; platform.userData.ropes.visible = on; });
      G.addInteractable({
        pos: V(e.at, y), radius: 2.8, name: '밧줄 승강기', kind: 'lift', enabled: () => lift3Open() && !x.riding,
        label: `🪢 밧줄 승강기 타고 ${e.name}(으)로`, action: () => lift(e, { follow: 1, event: 'ropeLift' }),
      });
      e.cap = platform;
    }
    ends[0].other = ends[1]; ends[1].other = ends[0];
    x.lift3Ends = ends;
  }

  // ---- W4: the Crystal Heart's crystal doors: with the Ice Bear asleep,
  // walking up to one with the golden necklace makes it glow and open (GDD
  // §6.4); before that it says what it waits for
  let doorBusy = false;
  function doorTick(pp) {
    if (doorBusy || !heartDoorReady(state)) return;
    for (const id of ['pit2', 'pit3']) {
      const g = x.gates[id];
      if (!g || g.open || g.opening >= 0) continue;
      if (Math.hypot(pp.x - g.at.x, pp.z - g.at.z) > DOOR_NEAR || Math.abs(pp.y - g.y) > 4) continue;
      doorBusy = true;
      g.glow();
      G.hud.necklaceGlow?.(true);
      G.toast('🏅 황금 목걸이가 빛나요! 수정 문이 열려요…', 2600);
      G.emit('necklaceGlow', { gate: id, at: G.time });
      after(1.6, () => {
        g.unseal();
        openGate(state, id);
        save(state);
        after(1.2, () => { G.hud.necklaceGlow?.(false); doorBusy = false; G.toast('💎 수정의 심장으로 가는 길이 열렸어요!', 3000); G.emit('heartDoorOpened', id); });
      });
      return;
    }
  }
  // (the doors' signs hold these objects: changed in place)
  const doorReady = () => { for (const id of ['pit2', 'pit3']) Object.assign(LOCKED[id], { label: '🏅 목걸이를 가까이 대 봐요', toast: '🏅 황금 목걸이를 가진 채 문 가까이 가 보세요!' }); };
  if (bearDone()) doorReady();
  G.on('iceBearBeaten', doorReady);

  // ---- W4: the Crystal King on the heart's platform
  const K = def.king;
  const kingY = K ? world.groundAt(...K.at) : 0;
  const offPlatform = (def.hops ?? []).filter((h) => K && Math.hypot(h.pad[0] - K.at[0], h.pad[1] - K.at[1]) < K.r).map((h) => h.id);
  // his animals: crystal-tinted, region 4's strength, leashed to the platform
  function summon(kind, p) {
    const scope = G.beginScope();
    G.difficulty = REGION_DIFFICULTY[4];
    const en = spawnEnemy(G, { kind, x: p.x, z: p.z, heading: p.heading ?? 0 });
    G.difficulty = null;
    crystalTint(G, en);
    en.leash = { x: K.at[0], z: K.at[1], r: K.keep + 2 };
    en.calm = 0.8;
    en.summoned = true;
    G.endScope(scope);
    (x.summonScopes ??= []).push(scope);
    return en;
  }
  function clearSummons() { for (const sc of x.summonScopes ?? []) G.disposeScope(sc); x.summonScopes = []; }
  function spawnKing() {
    if (!K) return;
    clearSummons();
    if (x.kingScope) { G.disposeScope(x.kingScope); x.kingScope = null; }
    G.hud.bossPlate?.(null);
    x.kingFight = false;
    x.heart?.unseal();
    if (kingDone()) { x.king = null; return; }
    x.kingScope = G.beginScope();
    x.king = createCrystalKing(G, { x: K.at[0], z: K.at[1], heading: Math.PI / 4, center: { x: K.at[0], z: K.at[1] }, arena: K.keep, floor: kingY, summon });
    x.king.dormant = true;
    G.endScope(x.kingScope);
  }
  spawnKing();
  G.on('bossDefeated', (e) => { if (e === x.king) kingDown(); });
  function kingDown() {
    const boss = BOSSES.crystalKing;
    x.kingFight = false;
    W.bosses.crystalKing = true;
    const r = beatBoss(state, 'crystalKing');
    run.hearts = run.maxHearts;
    refillArmor(run);
    G.hud.healed?.();
    // his animals calm down and sleep, the heart's light fades
    for (const en of x.king?.summons ?? []) if (!en.gone && en.state !== 'asleep') for (let k = 0; k < 4 && en.state !== 'asleep' && en.hurt({ damage: 99 }); k++) en.update(0.016);
    x.heart?.crystal.fade();
    G.toast(`${boss.icon} ${boss.name}이 잠들었어요! 수정의 빛이 사라져요…`, 3000);
    if (r.first) after(1.2, () => G.toast(`⭐ ${boss.name}을 처음 물리쳤어요! 별 하나!`, 2600));
    G.cam?.shake(1.0);
    sfx.quake?.();
    save(state);
    after(1.6, () => { G.cam?.shake(0.8); sfx.quake?.(); G.toast('💥 동굴이 흔들려요! 숨겨진 출구가 열려요!', 2800); });
    after(3.2, () => {
      x.heart?.unseal();
      x.heart?.bridge?.grow();
      x.gates.exit?.unseal();
      openGate(state, 'exit');
      openGate(state, 'lift4');
      save(state);
      G.emit('kingBeaten');
      after(1.4, () => startEscape());
    });
    G.refresh();
  }
  // the escape: from the platform over the crystal bridge, up the tunnel
  function startEscape() {
    if (!x.heart || x.ended) return;
    x.escaping = true;
    x.heart.startEscape({ seed: subSeed(x.seed, 7700) });
    G.hud.card('<h2>☀️ 탈출!</h2><p>수정 다리를 건너 햇빛을 향해 달려요!<br>떨어지는 바위는 빨간 원을 보고 피해요</p>', 3200);
  }
  x.startEscape = startEscape;
  x.spawnKing = spawnKing;
  // the sunlight at the tunnel's end: the ending (GDD §2.3)
  async function toSun() {
    if (x.ended) return;
    x.ended = true;
    x.escaping = false;
    x.heart?.stopEscape();
    G.emit('sunlight', { at: G.time });
    await G.ending?.();
  }

  // ---- W4: the crystal lift (the king's platform ⇄ the camp's balcony): a
  // ring of crystal at each end; riding it, a column of light lifts the hero
  const L4 = def.lift4;
  const lift4Open = () => kingDone() && !!W.gates.lift4;
  if (L4) {
    const ends = [{ at: L4.heart, to: L4.camp, name: '캠프', stepTo: K?.at }, { at: L4.camp, to: L4.heart, name: '심장의 단', stepTo: C.at }];
    for (const e of ends) {
      const y = world.groundAt(...e.at);
      const pad = crystalPad();
      pad.position.set(e.at[0], y + 0.05, e.at[1]);
      G.scene.add(pad);
      G.worldProps?.push({ obj: pad, x: e.at[0], z: e.at[1] });
      const light = G.addLight({ pos: V(e.at, y + 2.5), color: '#d6b0ff', intensity: 0, distance: 12 });
      G.onUpdate(() => { const on = lift4Open(); pad.userData.column.visible = on; pad.userData.column.material.opacity = 0.25 + Math.sin(G.time * 2) * 0.08; light.intensity = on ? 9 : 0; pad.rotation.y = G.time * 0.3; });
      G.addInteractable({
        pos: V(e.at, y), radius: 2.8, name: '수정 승강기', kind: 'lift', enabled: () => lift4Open() && !x.riding && !x.escaping,
        label: `💎 수정 승강기 타고 ${e.name}(으)로`, action: () => lift(e, { follow: 0, event: 'crystalLift' }),
      });
    }
    ends[0].other = ends[1]; ends[1].other = ends[0];
    x.lift4Ends = ends;
  }

  // ---- the shortcut's mine cart: a ride over the trestle, either way
  const tr = world.bridges.find((b) => b.id === 'trestle');
  if (tr) {
    const ends = [{ at: tr.a, to: tr.b, name: '캠프' }, { at: tr.b, to: tr.a, name: '토끼굴 초원' }];
    for (const e of ends) {
      const dir = [(e.at[0] - e.to[0]) / tr.length, (e.at[1] - e.to[1]) / tr.length];
      const p = [e.at[0] + dir[0] * 4, e.at[1] + dir[1] * 4];
      const y = world.groundAt(...p);
      const cart = place(G, 'mineCart', p[0], p[1], { s: 1.5, ry: Math.atan2(-dir[0], -dir[1]) + Math.PI / 2, y, body: 'none' });
      G.addInteractable({
        pos: V(p, y), radius: 2.8, name: '광산 수레', kind: 'cart', obj: cart, enabled: () => x.gates.shortcut?.open && !x.riding,
        label: `🛤️ 수레 타고 ${e.name}(으)로`, action: () => ride(e, cart),
      });
    }
  }
  async function ride(e, cart) {
    if (x.riding) return;
    x.riding = true;
    G.beginCutscene();
    G.pointer?.cancel();
    sfx.whoosh?.();
    const from = [e.at[0] + (e.at[0] - e.to[0]) / tr.length * 3, e.at[1] + (e.at[1] - e.to[1]) / tr.length * 3];
    const to = [e.to[0] - (e.at[0] - e.to[0]) / tr.length * 5, e.to[1] - (e.at[1] - e.to[1]) / tr.length * 5];
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const heading = Math.atan2(to[0] - from[0], to[1] - from[1]);
    const home = cart.position.clone(), homeRot = cart.rotation.y;
    cart.rotation.y = heading + Math.PI / 2;
    let y = world.groundAt(...from);
    await new Promise((done) => {
      let t = 0;
      const step = (dt) => {
        t += dt;
        const u = Math.min(1, t / (len / 13));
        const k = u * u * (3 - 2 * u);
        const px = from[0] + (to[0] - from[0]) * k, pz = from[1] + (to[1] - from[1]) * k;
        y = world.groundAt(px, pz, y);
        cart.position.set(px, y, pz);
        G.player.teleport(new THREE.Vector3(px, y + 0.6, pz), heading);
        if (u >= 1) { G.updaters.splice(G.updaters.indexOf(step), 1); done(); }
      };
      G.onUpdate(step);
    });
    G.player.teleport(V(to), heading);
    cart.position.copy(home); cart.rotation.y = homeRot;
    sfx.land?.();
    G.endCutscene();
    x.riding = false;
    G.emit('rode', { to: e.name });
  }

  // ---- the expedition: the spots filled from its seed
  function startExpedition(n = W.expedition + 1) {
    if (x.scope) {
      G.removePickups((p) => p.kind === 'shard' || (p.kind === 'loot' && p.item === 'herb'));
      G.disposeScope(x.scope);
      x.scope = null;
    }
    W.seed ??= G.fixedSeed ?? randomSeed();
    x.n = n; W.expedition = n;
    x.seed = expeditionSeed(W.seed, n);
    run.seed = x.seed;
    x.rolls = seedEncounters(def.spots, x.seed, { expedition: n, place: snap });
    x.spots = new Map();
    x.scope = G.beginScope();
    G.chests = [];
    for (const roll of x.rolls) {
      const spot = def.spots.find((s) => s.id === roll.spot);
      const rec = { spot, roll, enemies: [], chests: [], awake: false, woke: false, cleared: false, clearedAt: 0 };
      const animals = () => {
        G.difficulty = difficultyOfSpot(spot); // GDD §8.5: the forest's animals are tougher
        for (const e of roll.enemies) {
          const en = spawnEnemy(G, e);
          if (spot.region === 4) crystalTint(G, en); // (W4: the crystal's animals)
          en.dormant = true;
          en.spot = spot.id;
          en.leash = { x: spot.at[0], z: spot.at[1], r: spot.r * LEASH };
          rec.enemies.push(en);
        }
        G.difficulty = null;
      };
      // (release: a later region's animals whose model is still streaming
      // in are made when it lands, into this expedition's scope; the spot
      // stays empty and asleep till then)
      const kinds = modelsOfKinds(roll.enemies);
      if (allSettled(kinds)) animals();
      else {
        const scope = x.scope;
        whenLoaded(kinds, () => {
          if (x.scope !== scope) return; // (a new expedition since: it rolled its own)
          const late = G.beginScope();
          animals();
          G.mergeScope(scope, G.endScope(late));
          G.emit('navChanged');
        });
      }
      rec.chests = roll.chests.map((c) => createChest(G, c));
      G.chests.push(...rec.chests);
      x.spots.set(spot.id, rec);
    }
    G.difficulty = null;
    // W2: the forest's chest where the mask waits (while the hero has none)
    if (def.maskChest) {
      const [mx, mz] = def.maskChest;
      x.maskChest = createChest(G, { x: mx, z: mz, heading: -Math.PI / 4, index: n * 100 + 99, loot: 'mask' });
      G.chests.push(x.maskChest);
    }
    // W3: the grotto's chest, where rare armour waits (while the hero wears worse)
    if (def.armorChest) {
      const [ax, az] = def.armorChest;
      x.armorChest = createChest(G, { x: ax, z: az, heading: Math.PI / 4 + Math.PI, index: n * 100 + 98, loot: 'armor', grade: 'rare' });
      G.chests.push(x.armorChest);
    }
    // W5: the secret pockets' chests (a rare reward every expedition)
    x.secretChests = x.secrets.spawnChests(n);
    G.chests.push(...x.secretChests);
    G.endScope(x.scope);
    if (x.forest?.spring) x.forest.spring.used = false; // (a sip again every expedition)
    if (x.lake?.spring) x.lake.spring.used = false;
    // (pickups are not scoped: the next expedition clears what was not taken)
    for (const roll of x.rolls) {
      for (const h of roll.herbs) dropLoot(G, 'herb', { x: h.x, z: h.z });
      for (const s of roll.shards) dropShard(G, { x: s.x, z: s.z });
    }
    W.departShards = run.shards;
    // W5: the star altar's growth, and the herb pouch's herb
    applyGrowth(run, state);
    if (pouchHerbs(run, state)) after(2.6, () => G.toast('🌱 약초 주머니: 약초 하나를 챙겼어요', 2200));
    G.emit('navChanged');
    G.emit('expedition', { n, seed: x.seed });
  }

  // (W6: the squeezed world's spots sit closer together: they wake nearer too)
  const wakeAt = world.def.spotWake ?? WAKE;
  function wake(rec) {
    rec.awake = true;
    for (const e of rec.enemies) {
      if (!e.dormant || e.gone) continue;
      e.dormant = false;
      e.model.visible = true;
      if (!rec.woke) e.calm = 1.5;
    }
    rec.woke = true;
  }
  function spotsTick(pp) {
    for (const rec of x.spots.values()) {
      if (!rec.enemies.length) continue;
      const d = Math.hypot(pp.x - rec.spot.at[0], pp.z - rec.spot.at[1]);
      if (!rec.awake && !rec.cleared && d < rec.spot.r + wakeAt && Math.abs(pp.y - world.groundAt(...rec.spot.at)) < 6) wake(rec);
      else if (rec.awake && d > rec.spot.r * LEASH + DOZE && rec.enemies.every((e) => !e.active)) {
        rec.awake = false;
        for (const e of rec.enemies) e.dormant = true;
      }
      for (const e of rec.enemies) if (e.dormant && !e.gone) e.model.visible = d < SHOW + rec.spot.r;
      if (!rec.cleared && rec.woke && rec.enemies.every((e) => e.state === 'asleep')) clear(rec);
    }
  }
  function clear(rec) {
    rec.cleared = true;
    rec.clearedAt = G.time;
    G.run.rooms++;
    G.toast('🌟 모두 잠들었어요!', 2200);
    const drop = rollClearDrop(run, rng(subSeed(x.seed, 5000 + def.spots.indexOf(rec.spot))));
    if (drop) {
      const last = [...rec.enemies].reverse().find((e) => e.state === 'asleep');
      const at = last ? last.pos.clone() : V(rec.spot.at);
      dropLoot(G, drop, G.nav?.lineReach(G.player.position, at) ?? at);
      G.toast('🌱 약초가 떨어져 있어요!', 2400);
    }
    G.emit('spotCleared', rec.spot.id);
  }
  // a cleared spot's shards fly to the hero while the hero is near
  function magnet(dt) {
    const pp = G.player.position;
    for (const rec of x.spots.values()) {
      if (!rec.cleared || G.time - rec.clearedAt < 0.8) continue;
      if (Math.hypot(pp.x - rec.spot.at[0], pp.z - rec.spot.at[1]) > rec.spot.r * LEASH + 12) continue;
      for (const p of G.pickups) {
        if (!p.alive || p.kind !== 'shard' || p.flight) continue;
        if (Math.hypot(p.pos.x - rec.spot.at[0], p.pos.z - rec.spot.at[1]) > rec.spot.r * LEASH + 6) continue;
        const dx = pp.x - p.pos.x, dz = pp.z - p.pos.z, dd = Math.hypot(dx, dz);
        if (dd < 0.3) continue;
        const s = Math.min(dd, MAGNET * dt);
        p.pos.x += (dx / dd) * s; p.pos.z += (dz / dd) * s; p.pos.y += (pp.y - p.pos.y) * Math.min(1, dt * 4);
      }
    }
  }

  // ---- where the hero is: the HUD's name, the cards, the camp's comings and goings
  const seenAreas = new Set(W.areas ?? []);
  const label = (a) => (a ? (a.region === 1 && a.id !== 'valley' && a.id !== 'entrance' ? `이끼 계곡 · ${a.name}` : a.region === 2 && a.id !== 'mush' ? `버섯 숲 · ${a.name}` : a.region === 3 && a.id !== 'ice' ? `얼음 호수 · ${a.name}` : a.region === 4 && a.id !== 'heart' ? `수정의 심장 · ${a.name}` : a.name) : '');
  function areaTick(pp) {
    const a = world.areaAt(pp.x, pp.z);
    if (!a || a === x.area) return;
    const before = x.area;
    x.area = a;
    G.hud.area(label(a));
    G.run.area = a.region >= 2 ? a.region - 1 : 0; // (a chest's dice: the mask from the forest on)
    if (!seenAreas.has(a.id)) {
      seenAreas.add(a.id);
      W.areas = [...seenAreas];
      if (a.id !== 'camp' && a.id !== 'entrance') G.hud.card(`<h2>${a.icon} ${a.name}</h2><p>${a.region ? `${a.region}번째 지역${a.region === 2 && a.id !== 'mush' ? ' · 버섯 숲' : a.region === 3 && a.id !== 'ice' ? ' · 얼음 호수' : a.region === 4 && a.id !== 'heart' ? ' · 수정의 심장' : ''}` : ''}</p>`, 2400);
    } else if (!before || before.region !== a.region) G.toast(`${a.icon} ${a.name}`, 1800);
    G.emit('areaEntered', a.id);
    prioritizeRegion(a.region); // (release: this region's models, and the next one's, load first)
    if (a.id === 'camp') atCamp();
    else if (before?.id === 'camp') leftCamp();
  }
  function atCamp() {
    x.atCamp = true;
    if (findCamp(state)) {
      G.hud.card('<h2>🔥 캠프를 찾았어요!</h2><p>빛나는 샘 · 박쥐 상인 · 도감 돌 · 별 제단</p>', 3200);
      after(1.2, () => G.say([
        { name: '박쥐 상인', text: '어머, 작은 모험가! 여기는 캠프예요. 샘물을 마시면 기운이 다 돌아와요.' },
        { name: '박쥐 상인', text: '쓰러져도 걱정 마요. 여기서 다시 깨어날 테니까요. 수정 조각을 모아 오면 물건도 바꿔 줄게요!' },
      ]));
      save(state);
    } else if (x.left) {
      // back from an expedition: a new one starts (new packs, chests, herbs)
      startExpedition();
      save(state);
      G.toast('🔄 새 탐험! 동물들과 보물이 새로 나타났어요', 2800);
    }
    x.left = false;
    G.emit('campReached', { n: x.n });
  }
  function leftCamp() {
    x.atCamp = false;
    x.left = true;
    W.departShards = run.shards;
    keepBag(state, run);
    save(state);
  }

  // ---- fainting: wake at the camp
  G.faint = async () => {
    if (G.fainted) return;
    G.fainted = true;
    if (G.screens?.menuOpen) G.screens.closeMenu();
    if (G.shop?.isOpen) G.shop.close();
    G.codex?.close(); G.altar?.close();
    G.beginCutscene();
    G.emit('faint');
    await new Promise((r) => setTimeout(r, 1600));
    await G.hud.fade(true);
    const { keep, lost } = faintPenalty(run.shards, W.departShards);
    run.shards = keep;
    // W5: the hammer's and the water gun's grades go back to common (GDD §6.5)
    const graded = run.grades?.hammer !== 'common' || run.grades?.waterGun !== 'common';
    resetGrades(run);
    // W5 (GDD §8.5): fainted in a boss's fight: counted (again: a herb more)
    const lostTo = x.fighting ? 'rabbitChief' : x.queenFight ? 'mushroomQueen' : x.bearFight ? 'iceBear' : x.kingFight ? 'crystalKing' : null;
    if (lostTo) bossLost(state, lostTo);
    run.hearts = run.maxHearts;
    refillArmor(run);
    run.hurtCarry = 0;
    G.fainted = false;
    const s = G.player.state;
    s.action = null; s.cooldown = 0; s.invulnerable = 1.5; s.shield = false;
    G.pointer?.cancel();
    G.hammer?.reset?.();
    for (const t of Object.values(G.tools ?? {})) t.reset?.();
    G.shield?.reset?.();
    if (x.fighting || x.gates.arena && !x.gates.arena.open) { x.gates.arena.open || x.gates.arena.unseal(); spawnChief(); }
    if (x.queenFight || x.gates.ring && !x.gates.ring.open) { x.gates.ring.open || x.gates.ring.unseal(); spawnQueen(); }
    if (x.bearFight || x.gates.bearGate && !x.gates.bearGate.open) { x.gates.bearGate.open || x.gates.bearGate.unseal(); spawnIceBear(); }
    if (x.kingFight) spawnKing(); // (W4: he waits on his platform again, the hops open)
    // (W4: fainting on the way out wakes the hero back on the king's platform:
    // the escape runs again)
    const escaping = x.escaping;
    if (escaping) x.heart?.stopEscape();
    const home = escaping ? def.escape.from : W.camp ? C.at : def.spawn;
    G.player.teleport(V(home), Math.PI);
    G.cam?.snap(G.player.position);
    x.area = null;
    x.left = false;
    startExpedition();
    const extra = lostTo ? lossHerb(run, state, lostTo) : 0;
    keepBag(state, run);
    G.refresh();
    await new Promise((r) => setTimeout(r, 300));
    G.hud.fade(false);
    G.cutscenes = 0;
    G.endCutscene();
    G.hud.card(`<h2>💤 ${escaping ? '심장의 단' : W.camp ? '캠프' : '동굴 입구'}에서 깨어났어요</h2><p>${lost ? `수정 조각 ${lost}개를 잃어버렸어요` : '잃어버린 것은 없어요'} · 열린 길은 그대로예요${graded ? '<br>강화한 망치·물총은 처음 등급으로 돌아갔어요' : ''}</p>`, 3000);
    if (extra) after(3.4, () => G.toast('🌱 박쥐 상인: 힘내요, 작은 모험가! 약초 하나 더 챙겨 줄게요', 3400));
    if (escaping) after(1.2, () => startEscape());
    G.emit('woke', { lost, keep, at: escaping ? 'heart' : W.camp ? 'camp' : 'entrance', lostTo, extraHerb: extra, graded });
  };

  // ---- every frame
  let tick = 0;
  G.onUpdate((dt) => {
    for (const t of timers.filter((q) => G.time >= q.at)) { timers.splice(timers.indexOf(t), 1); t.fn(); }
    if (G.mode !== 'play') return;
    const pp = G.player.position;
    tick -= dt;
    if (tick <= 0) { tick = 0.2; spotsTick(pp); areaTick(pp); x.secrets.tick(pp); }
    magnet(dt);
    // the arena: well inside it, the gate shuts and the chief rises
    const c = x.chief;
    if (c && c.dormant && !c.gone && Math.hypot(pp.x - A.at[0], pp.z - A.at[1]) < A.r - ARENA_IN && Math.abs(pp.y - arenaY) < 3) {
      c.dormant = false;
      x.fighting = true;
      x.gates.arena.seal();
      G.emit('arenaSealed');
    }
    // W2: the queen's ring, the same way
    const q = x.queen;
    if (q && q.dormant && !q.gone && Q && Math.hypot(pp.x - Q.at[0], pp.z - Q.at[1]) < Q.r - QUEEN_IN && Math.abs(pp.y - ringY) < 3) {
      q.dormant = false;
      x.queenFight = true;
      x.gates.ring.seal();
      G.emit('arenaSealed', { boss: 'mushroomQueen' });
    }
    // W4: the Crystal Heart's doors, the king's platform, the sunlight
    if (x.heart) {
      doorTick(pp);
      const k = x.king;
      if (k && k.dormant && !k.gone && K && Math.hypot(pp.x - K.at[0], pp.z - K.at[1]) < K.r - KING_IN && Math.abs(pp.y - kingY) < 3 && !G.player.state.flight) {
        k.dormant = false;
        x.kingFight = true;
        x.heart.seal(offPlatform);
        G.emit('arenaSealed', { boss: 'crystalKing' });
      }
      const sun = x.heart.sun;
      if (sun && kingDone() && !x.ended && Math.hypot(pp.x - sun.x, pp.z - sun.z) < SUN_R && Math.abs(pp.y - sun.y) < 3) toSun();
    }
    // W3: the Ice Bear's rink, the same way
    const b = x.bear;
    if (b && b.dormant && !b.gone && B && Math.hypot(pp.x - B.at[0], pp.z - B.at[1]) < B.r - BEAR_IN && Math.abs(pp.y - rinkY) < 3) {
      b.dormant = false;
      x.bearFight = true;
      x.gates.bearGate.seal();
      G.emit('arenaSealed', { boss: 'iceBear' });
    }
  });
  // what the hero carries is kept between pages and expeditions
  G.on('progress', () => { keepBag(state, run); save(state); });
  // (W4: every animal put to sleep in this world, for the ending's result)
  G.on('enemyAsleep', () => { W.asleep = (W.asleep ?? 0) + 1; });

  // ---- the start of a page: a new game drops in, a saved one wakes at camp
  x.begin = () => {
    if (!W.started) {
      W.started = true;
      W.seed ??= G.fixedSeed ?? randomSeed();
      Object.assign(run, { owned: [...START.owned], tool: START.tool, herbs: START.herbs, shards: 0 });
      startExpedition(1);
      // through the sinkhole: from high up, down onto the moss
      const sp = V(def.spawn);
      G.player.teleport(sp.clone().setY(sp.y + 16), Math.PI);
      G.cam?.snap(sp);
      sfx.whoosh?.();
      after(1.6, () => G.hud.card('<h2>☀️ 동굴 입구</h2><p>쿵! 구멍 아래로 떨어졌어요</p>', 2600));
      if (x.necklace) after(3.6, () => { if (x.necklace?.alive) G.toast('✨ 저기 반짝이는 게 있어요! 가까이 가 볼까요?', 3200); });
    } else {
      restoreBag(state, run);
      run.hearts = run.maxHearts;
      refillArmor(run);
      startExpedition();
      // (checks: ?start=mushroom begins at the forest's edge, ?start=ice past
      // the ice door: core/state.js presetProgress)
      const forest = (G.startAt === 'mushroom' || G.startAt === 'ice' || G.startAt === 'heart') && def.starts?.[G.startAt];
      const home = forest || (W.camp ? C.at : def.spawn);
      G.player.teleport(V(home), Math.PI);
      G.cam?.snap(G.player.position);
      G.terrain?.warm?.(G.player.position);
      if (forest) x.left = true; // (out of the camp: coming back starts a new expedition)
      after(0.6, () => G.toast(forest ? (G.startAt === 'heart' ? '💎 수정의 심장 문 앞에서 시작해요' : G.startAt === 'ice' ? '❄️ 얼음 호수 입구에서 시작해요' : '🍄 버섯 숲 입구에서 시작해요') : W.won ? '🌟 탈출한 뒤의 동굴이에요. 마음껏 둘러봐요!' : W.camp ? '🔥 캠프에서 다시 시작해요' : '☀️ 동굴 입구에서 다시 시작해요', 2400));
      // (W4: after the ending the heart has faded, its bridge is there)
      if (kingDone()) { x.heart?.crystal.fade(true); x.heart?.bridge?.grow(true); }
    }
    x.secrets.spawnShard(); // (W5: after the ending, the purple shard waits on the king's platform)
    keepBag(state, run);
    save(state);
    G.hud.necklace(!!state.necklace);
    G.refresh();
  };
  // where a new page puts the hero before the title goes (for the title's view)
  x.home = () => (def.starts?.[G.startAt] ? V(def.starts[G.startAt]) : W.started && W.camp ? V(C.at) : V(def.spawn));

  // ---- for checks and debugging
  x.startExpedition = startExpedition;
  x.spawnChief = spawnChief;
  x.spawnQueen = spawnQueen;
  x.spawnIceBear = spawnIceBear;
  x.toSun = toSun;
  // W4: after the ending and its result: on in the world (이어 하기, the
  // post-game: everything stays open, the camp's spring, a new expedition)
  x.afterEnding = () => {
    x.ended = false;
    x.escaping = false;
    const home = V(C.at);
    G.player.teleport(home, Math.PI);
    G.cam?.snap(home);
    G.terrain?.warm?.(home);
    x.area = null;
    x.left = false;
    run.hearts = run.maxHearts;
    refillArmor(run);
    startExpedition();
    keepBag(state, run);
    save(state);
    G.refresh();
    if (x.secrets.spawnShard()) after(4, () => G.toast('💜 심장의 단에서 무언가 보랏빛으로 반짝여요… (수정 승강기)', 3600));
    G.hud.card('<h2>🌟 다시 동굴 안으로</h2><p>탈출한 뒤에도 동굴은 그대로예요 · 도감을 채우고 별을 모아 봐요</p>', 3200);
  };
  x.jump = (p, y) => {
    let at = Array.isArray(p) ? p : p === 'camp' ? C.at : p === 'arena' ? A.at : p === 'entrance' ? def.spawn
      : p === 'ring' ? Q.at : p === 'forest' ? def.starts?.mushroom : p === 'ice' ? def.starts?.ice : p === 'rink' ? B?.at
      : p === 'lake' ? L3?.lake : p === 'heart' ? K?.at : p === 'heartDoor' ? def.starts?.heart : p === 'sun' ? def.escape?.sun : p === 'exit' ? def.escape?.tunnel?.[0]
      : def.places?.[p] ?? def.spots.find((s) => s.id === p)?.at ?? p;
    if (y === undefined) at = snap(...at) ?? at; // (onto walkable ground)
    G.player.teleport(V(at, y), Math.PI);
    G.cam?.snap(G.player.position);
    G.terrain?.warm?.(G.player.position);
  };
  // put every animal of a spot to sleep (checks)
  x.sleepSpot = (id) => {
    const rec = x.spots.get(id);
    if (!rec) return;
    if (!rec.woke) wake(rec);
    for (const e of rec.enemies) for (let k = 0; k < 4 && e.state !== 'asleep' && e.hurt({ damage: 99 }); k++) e.update(0.016);
  };
  x.spot = (id) => x.spots.get(id);
  x.label = () => label(x.area);
  return x;
}

// W3: the rope lift's platform: planks on a frame, four ropes up into the dark
function ropePlatform() {
  const g = new THREE.Group();
  g.name = 'ropeLift';
  const wood = new THREE.MeshStandardMaterial({ color: '#9a6a3a', emissive: '#2a1408', emissiveIntensity: 0.5, flatShading: true, roughness: 0.85 });
  const rope = new THREE.MeshStandardMaterial({ color: '#d8c08a', flatShading: true, roughness: 0.9 });
  for (let k = 0; k < 5; k++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 2.4), wood); p.position.set(-1 + k * 0.5, 0.06, 0); p.castShadow = true; g.add(p); }
  for (const z of [-1.1, 1.1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 0.18), wood); b.position.set(0, 0.2, z); g.add(b); }
  const ropes = new THREE.Group();
  for (const [x, z] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 14, 5), rope); r.position.set(x, 7.2, z); ropes.add(r); }
  g.add(ropes);
  g.userData.ropes = ropes;
  return g;
}

// W4: the crystal lift's ring: a disc of glowing crystal, six points round
// it, and a column of light up into the dark while it works
function crystalPad() {
  const g = new THREE.Group();
  g.name = 'crystalLift';
  const mat = new THREE.MeshStandardMaterial({ color: '#dcc4ff', emissive: '#8a4cff', emissiveIntensity: 0.9, flatShading: true, roughness: 0.15, transparent: true, opacity: 0.9 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.25, 6), mat);
  disc.position.y = 0.12;
  g.add(disc);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), mat);
    p.scale.y = 2.4;
    p.position.set(Math.cos(a) * 2.1, 0.7, Math.sin(a) * 2.1);
    g.add(p);
  }
  const column = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 30, 16, 1, true), new THREE.MeshBasicMaterial({ map: softGlowTexture(), color: '#d8b0ff', transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  column.position.y = 15;
  column.visible = false;
  g.add(column);
  g.userData.column = column;
  g.traverse((o) => { o.raycast = () => {}; });
  return g;
}
