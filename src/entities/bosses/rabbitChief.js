import * as THREE from 'three';
import { BOSSES } from '../../data/bosses.js';
import { ITEMS } from '../../data/items.js';
import { createRabbitModel, createRabbitAnimator } from '../rabbit.js';
import { textSprite } from '../enemy.js';
import { newBossAI, stepBoss, doingOf, isDazed } from './chiefAI.js';
import { inCone, damageHp } from '../../combat/hits.js';
import { dampAngle } from '../../player/movement.js';
import { rng, subSeed } from '../../core/rng.js';
import { sfx } from '../../audio/sound.js';

// The Giant Rabbit Chief (GDD §3.3), the moss cave's boss: the rabbit model
// six times over with a gold crown and an old scar, in the round arena.
// The pure brain (chiefAI.js) picks the steps; this body draws every attack
// on the floor first (a red circle where it lands, the ring its shockwave
// will reach, a cone for the ear wind, a lane per dash), moves, hurts the
// hero only inside what it drew, and sits dazed after landing (💫, the
// hammer hits twice as hard). The name plate up top shows its hp, the stun
// gauge and a hint for what is coming (Scary Island's boss plates).
//
// It lives in G.enemies like any animal (the dungeon waits for it to fall
// asleep, items find it there), with `isBoss` set.
const SCALE = 6.2;
const HERO_RADIUS = 0.3;
const KNOCK_DECAY = 8; // the hero's knock (player.js) slides v0 / 8 m

const hintOf = {
  intro: '대장이 나타났어요!', idle: null, rest: null,
  crouch: '높이 뛰어요! 빨간 원 밖으로!', air: '빨간 원 밖으로!',
  land: '충격파! 구르기(2)로 넘어요!', wave: '충격파! 구르기(2)로 넘어요!',
  dizzy: '어지러워해요! 지금 망치로!', stunned: '넘어졌어요! 지금 망치로!',
  ears: '귀 바람! 부채꼴 밖으로!', blow: '귀 바람! 부채꼴 밖으로!',
  aim: '빨간 길을 피해요! 세 번 와요!', run: '빨간 길을 피해요!', gap: '또 와요!',
  roar: '화가 났어요! 새 기술이 와요!', asleep: '쿨쿨… 잠들었어요',
};

// `center`, `arena`: the arena's middle and how far from it the chief keeps
// (M5's 24 m room by default; the open cave map's arena is bigger).
// W1: `floor`, the arena's ground height (the meadow lies at −30 m).
export function createRabbitChief(G, { x, z, heading = 0, center: at = { x: 0, z: 0 }, arena: ARENA = 10.6, floor = 0 }) {
  const def = BOSSES.rabbitChief;
  const model = createRabbitModel({ scale: SCALE, coat: '#d9cde8' });
  model.name = 'rabbitChief';
  const animate = createRabbitAnimator(model, { leap: 0 });
  const { rig } = model.userData;
  addCrown(rig);
  const home = new THREE.Vector3(x, floor, z);
  const center = new THREE.Vector3(at.x, floor, at.z); // the arena's middle
  model.position.copy(home);
  model.rotation.y = heading;
  G.scene.add(model);
  G.look.shadows(model);
  const mover = G.physics.createMover({ x, y: floor, z, radius: 1.1, height: 2.2 });
  const glow = G.addLight({ pos: () => model.position.clone().setY(floor + 2.6), color: '#c9a8ff', intensity: 5, distance: 9 });

  // the telegraphs, all on the floor
  const circle = discMark();
  const ringLine = ringMark(0.12);
  const wave = ringMark(def.slam.wave.band, '#ffcf6a');
  const cone = coneMark(def.gust.reach, def.gust.arc);
  const lane = laneMark(def.dash.width);
  const stars = textSprite('💫', 1.6);
  const zz = textSprite('Zz', 1.4, '#d9ccff');
  G.scene.add(circle, ringLine, wave, cone, lane, stars, zz);
  const gusts = windStreaks();
  G.scene.add(gusts);

  const rand = rng(subSeed(G.run.seed, 9100));
  const e = {
    kind: 'rabbitChief', isBoss: true, def, name: def.name, model, mover, home,
    size: def.size, hp: def.hp, maxHp: def.hp,
    ai: newBossAI(), heading, speed: 0,
    knock: new THREE.Vector2(), gone: false, wetUntil: -Infinity,
    started: false, // the intro is over and the fight is on
    get doing() { return doingOf(e.ai); },
    get state() { return e.ai.state === 'asleep' ? 'asleep' : doingOf(e.ai); },
    get phase() { return e.ai.phase; },
    get stun() { return e.ai.stun; },
    get dazed() { return isDazed(e.ai); },
    get pos() { return model.position; },
    get active() { return !e.gone && e.started && e.ai.state !== 'asleep'; },
    hint: () => hintOf[doingOf(e.ai)] ?? def.hint,
    marks: { circle, ringLine, wave, cone, lane }, // (for checks)
  };
  // what this pattern is aiming at
  const aim = { target: new THREE.Vector3(), from: new THREE.Vector3(), heading: 0, len: 0, hit: false, waveR: 0 };
  let stunIn = 0, flash = 0;

  G.addHittable({
    enemy: e, radius: def.size[0],
    enabled: () => e.started && e.ai.state !== 'asleep',
    pos: () => model.position.clone().setY(model.position.y + 0.9),
    onHit: (o) => e.hurt(o),
  });

  // a hit: the hammer twice as hard while it is dazed; every hit fills the stun gauge
  e.hurt = ({ damage = 1, kind: by = 'hammer' }) => {
    if (!e.started || e.ai.state === 'asleep') return false;
    const dazed = isDazed(e.ai);
    let dmg = damage;
    if (by === 'hammer') { if (dazed) dmg *= def.hammerBonus; stunIn += dazed ? def.stun.dazedHammer : def.stun.hammer; }
    else if (by === 'water') { stunIn += def.stun.water; e.wetUntil = G.time + ITEMS.waterGun.wet; }
    else stunIn += def.stun.hammer * 0.5; // the hammer's shockwave
    e.hp = damageHp(e.hp, dmg);
    flash = 0.2;
    if (by !== 'water') sfx.bonk();
    G.discover?.('rabbitChief');
    G.emit('enemyHit', { enemy: e, damage: dmg, by, dazed });
    return true;
  };
  // the vine: too big to tie up, but it trips over it (the stun gauge)
  e.bind = () => {
    if (!e.started || e.ai.state === 'asleep') return false;
    stunIn += def.stun.vine;
    flash = 0.2;
    G.emit('bossTangled', { enemy: e });
    return true;
  };

  // What its telegraphs cover now (null: nothing), like the animals' hazard().
  e.hazard = () => {
    const d = doingOf(e.ai);
    const out = [];
    const t = e.ai.t, dur = e.ai.step?.dur ?? 0;
    if (d === 'crouch' || d === 'air') {
      const left = (dur - t) + (d === 'crouch' ? def.slam.air : 0);
      out.push({ kind: 'slam', shape: 'circle', x: aim.target.x, z: aim.target.z, r: def.slam.radius, hitAt: G.time + left });
      out.push({ kind: 'wave', shape: 'ring', x: aim.target.x, z: aim.target.z, r: def.slam.radius, rMax: def.slam.wave.radius, band: def.slam.wave.band, speed: (def.slam.wave.radius - def.slam.radius) / def.slam.wave.time, hitAt: G.time + left + 0.05 });
    }
    if (d === 'wave') out.push({ kind: 'wave', shape: 'ring', x: aim.target.x, z: aim.target.z, r: aim.waveR, rMax: def.slam.wave.radius, band: def.slam.wave.band, speed: (def.slam.wave.radius - def.slam.radius) / def.slam.wave.time, hitAt: G.time });
    if (d === 'ears' || d === 'blow') out.push({ kind: 'gust', shape: 'cone', x: model.position.x, z: model.position.z, heading: aim.heading, r: def.gust.reach, arc: def.gust.arc, hitAt: G.time + (d === 'ears' ? dur - t : 0) });
    if (d === 'aim' || d === 'run') out.push({ kind: 'dash', shape: 'lane', x: aim.from.x, z: aim.from.z, heading: aim.heading, len: aim.len, width: def.dash.width, hitAt: G.time + (d === 'aim' ? dur - t : 0) });
    return out.length ? out : null;
  };

  const tele = (kind) => G.emit('bossTelegraph', { kind, at: G.time, phase: e.ai.phase });
  const attack = (kind) => G.emit('bossAttack', { kind, at: G.time, phase: e.ai.phase });
  const hurtHero = (kind, from) => {
    const ok = G.hurtPlayer(from, def.damage[kind]);
    G.emit('bossHurt', { kind, at: G.time, hurt: !!ok });
    return ok;
  };
  const toHero = () => Math.atan2(G.player.position.x - model.position.x, G.player.position.z - model.position.z);
  // a point kept inside the arena
  const inArena = (p) => {
    const d = Math.hypot(p.x - center.x, p.z - center.z);
    if (d > ARENA) p.set(center.x + ((p.x - center.x) / d) * ARENA, floor, center.z + ((p.z - center.z) / d) * ARENA);
    return p;
  };
  // how far a lane from `from` along `heading` runs before the arena's edge
  const laneLength = (from, h) => {
    const dx = Math.sin(h), dz = Math.cos(h);
    const fx = from.x - center.x, fz = from.z - center.z;
    const b = fx * dx + fz * dz, c = fx * fx + fz * fz - ARENA * ARENA;
    const reach = -b + Math.sqrt(Math.max(0, b * b - c));
    return Math.max(2, Math.min(def.dash.length, reach));
  };

  function onStep(step) {
    const name = step.name;
    if (name === 'crouch') {
      aim.target.copy(inArena(G.player.position.clone().setY(floor)));
      for (const m of [circle, ringLine]) m.position.set(aim.target.x, floor + 0.05, aim.target.z);
      circle.scale.setScalar(def.slam.radius);
      ringLine.userData.set(def.slam.wave.radius);
      e.heading = toHero();
      tele('slam'); tele('wave');
      sfx.growl();
    }
    if (name === 'air') {
      aim.from.copy(model.position).setY(floor);
      mover.setEnabled(false);
      sfx.whoosh();
    }
    if (name === 'land') {
      model.position.set(aim.target.x, floor, aim.target.z);
      mover.teleport(aim.target);
      mover.setEnabled(true);
      attack('slam');
      const pp = G.player.position;
      if (Math.hypot(pp.x - aim.target.x, pp.z - aim.target.z) < def.slam.radius + HERO_RADIUS) hurtHero('slam', aim.target);
      G.cam?.shake(0.7);
      sfx.slam?.();
      aim.hit = false;
      aim.waveR = def.slam.radius;
      attack('wave');
    }
    if (name === 'ears') { aim.heading = toHero(); e.heading = aim.heading; tele('gust'); sfx.flap?.(); }
    if (name === 'blow') {
      attack('gust');
      sfx.gust?.();
      if (heroInCone()) { hurtHero('gust', model.position); pushHero(1); }
    }
    if (name === 'aim') {
      aim.from.copy(model.position).setY(floor);
      aim.heading = toHero();
      e.heading = aim.heading;
      aim.len = laneLength(aim.from, aim.heading);
      lane.position.set(aim.from.x, floor + 0.05, aim.from.z);
      lane.rotation.y = aim.heading;
      lane.userData.set(aim.len);
      tele('dash');
      sfx.hop?.();
    }
    if (name === 'run') { aim.hit = false; attack('dash'); sfx.dash?.(); }
    if (name === 'dizzy') sfx.stun();
    if (name === 'roar') {
      sfx.roar?.();
      G.cam?.shake(0.5);
      G.toast(e.ai.phase === 2 ? '👑 대장이 화가 났어요! 귀 바람을 조심해요!' : '👑 더 빨라졌어요! 세 번 돌진을 조심해요!', 3200);
    }
  }

  function heroInCone() {
    const pp = G.player.position;
    return inCone(model.position.x, model.position.z, aim.heading, pp.x, pp.z, def.gust.reach, def.gust.arc, HERO_RADIUS);
  }
  // the wind shoves the hero away from the chief (a steady push while in the cone)
  function pushHero(k) {
    const pp = G.player.position;
    const away = new THREE.Vector2(pp.x - model.position.x, pp.z - model.position.z).normalize();
    const kn = G.player.state.knock;
    if (k >= 1) kn.copy(away.multiplyScalar(def.gust.push * KNOCK_DECAY * 0.6));
    else kn.addScaledVector(away, k);
  }

  function onEvent(ev) {
    if (ev.type === 'step') onStep(ev.step);
    if (ev.type === 'phase') G.emit('bossPhase', { phase: ev.phase, at: G.time, hp: e.hp });
    if (ev.type === 'stunned') {
      sfx.stun();
      G.toast('👑 대장이 넘어졌어요! 지금 망치로!', 2400);
      G.emit('bossStunned', { at: G.time });
    }
    if (ev.type === 'asleep') {
      mover.setEnabled(false);
      sfx.stun();
      G.run.asleep = (G.run.asleep ?? 0) + 1;
      G.emit('enemyAsleep', e);
      G.emit('bossDefeated', e);
    }
    if (ev.type === 'step') G.emit('bossStep', { name: ev.step.name, pattern: ev.pattern ?? null, at: G.time, phase: e.ai.phase });
  }

  // the fight starts the first time the hero is in the arena and playing:
  // a short look at the chief (GDD §5.1 "보스 등장 시 보스를 보여주는 짧은 컷")
  let intro = -1;
  e.beginIntro = () => {
    if (intro >= 0 || e.started) return;
    intro = 0;
    G.beginCutscene();
    G.pointer?.cancel();
    const cam = G.camera.position.clone();
    const look = model.position.clone().setY(floor + 1.6);
    const to = look.clone().add(new THREE.Vector3(Math.sin(Math.PI / 4), 0.55, Math.cos(Math.PI / 4)).normalize().multiplyScalar(11));
    G.cam?.fly(to, look, 0.9);
    G.hud.card(`<h2>👑 ${def.name}</h2><p>착지하면 어지러워해요. 그때 망치로!</p>`, 2600);
    sfx.roar?.();
    void cam;
  };
  const INTRO = 2.8;
  G.onUpdate((dt) => {
    if (intro < 0 || e.started) return;
    intro += dt;
    if (intro > 1.2 && intro - dt <= 1.2) { G.cam?.shake(0.4); sfx.stomp(); }
    if (intro >= INTRO) {
      e.started = true;
      G.cam?.release();
      G.cam?.snap(G.player.position);
      G.endCutscene();
      G.emit('bossStart', e);
    }
  });

  let introAnim = 0;
  e.update = (dt) => {
    if (e.gone) return;
    const pp = G.player.position;
    if (!e.started && intro < 0 && G.mode === 'play') e.beginIntro();
    for (const ev of stepBoss(e.ai, { hp: e.hp, maxHp: e.maxHp, started: e.started, stun: stunIn }, dt, def, rand)) onEvent(ev);
    stunIn = 0;
    const d = doingOf(e.ai);
    const t = e.ai.t, dur = e.ai.step?.dur ?? 1;
    let dx = 0, dz = 0;
    e.speed = 0;
    // movement by step
    if (d === 'air') {
      const u = Math.min(1, t / dur);
      model.position.set(
        THREE.MathUtils.lerp(aim.from.x, aim.target.x, u),
        floor + Math.sin(u * Math.PI) * def.slam.height,
        THREE.MathUtils.lerp(aim.from.z, aim.target.z, u),
      );
    } else if (d === 'run') {
      const v = aim.len / def.dash.run;
      dx = Math.sin(aim.heading) * v * dt; dz = Math.cos(aim.heading) * v * dt;
      e.speed = v;
      if (!aim.hit && Math.hypot(pp.x - model.position.x, pp.z - model.position.z) < def.size[0] + 0.45) {
        aim.hit = true;
        const blocked = G.ticking() && !!G.shield?.blocks(model.position);
        if (blocked) { G.shield.block(model.position); G.emit('bossHurt', { kind: 'dash', at: G.time, hurt: false, blocked: true }); }
        else hurtHero('dash', model.position);
      }
    } else if (d === 'rest' || d === 'idle') {
      // hops slowly toward the hero, never right on top of them
      const dist = Math.hypot(pp.x - model.position.x, pp.z - model.position.z);
      if (dist > 5 && e.started) {
        const h = toHero();
        e.heading = dampAngle(e.heading, h, 4, dt);
        dx = Math.sin(e.heading) * 1.6 * dt; dz = Math.cos(e.heading) * 1.6 * dt;
        e.speed = 1.6;
      } else e.heading = dampAngle(e.heading, toHero(), 3, dt);
    } else if (d === 'crouch' || d === 'roar') e.heading = dampAngle(e.heading, toHero(), 6, dt);
    if (d !== 'air' && e.ai.state !== 'asleep') {
      mover.move(dx, dz, dt);
      model.position.copy(mover.feet);
    }
    model.rotation.y = e.heading;

    // the wave: a ring rolling out from the landing
    if (d === 'wave') {
      const w = def.slam.wave;
      aim.waveR = def.slam.radius + (w.radius - def.slam.radius) * Math.min(1, t / w.time);
      const dist = Math.hypot(pp.x - aim.target.x, pp.z - aim.target.z);
      if (!aim.hit && Math.abs(dist - aim.waveR) < w.band / 2 + HERO_RADIUS) { aim.hit = true; hurtHero('wave', aim.target); }
    }
    if (d === 'blow' && heroInCone()) pushHero(28 * dt);
    drawMarks(d, t, dur);
    flash = Math.max(0, flash - dt);
    pose(d, t, dur, dt);
  };

  function drawMarks(d, t, dur) {
    const live = !G.fainted;
    circle.visible = live && (d === 'crouch' || d === 'air');
    ringLine.visible = circle.visible || (live && d === 'wave');
    if (circle.visible) {
      const k = d === 'crouch' ? 0.3 * (t / dur) : 0.3 + 0.7 * (t / dur);
      circle.userData.fill.scale.setScalar(Math.max(0.05, k));
      circle.userData.edge.material.opacity = 0.75 + Math.sin(G.time * 30) * 0.2;
    }
    wave.visible = live && d === 'wave';
    if (wave.visible) {
      wave.position.set(aim.target.x, floor + 0.07, aim.target.z);
      wave.userData.set(aim.waveR);
      wave.userData.mat.opacity = 0.9 * (1 - 0.5 * (t / dur));
    }
    cone.visible = live && (d === 'ears' || d === 'blow');
    if (cone.visible) {
      cone.position.set(model.position.x, floor + 0.05, model.position.z);
      cone.rotation.y = aim.heading;
      cone.userData.fill.scale.setScalar(d === 'ears' ? Math.max(0.05, t / dur) : 1);
    }
    gusts.visible = live && d === 'blow';
    if (gusts.visible) gusts.userData.step(model.position, aim.heading, t);
    lane.visible = live && (d === 'aim' || d === 'run');
    if (lane.visible) lane.userData.fill.scale.set(1, 1, d === 'aim' ? Math.max(0.05, t / dur) : 1);
    stars.visible = !G.fainted && (e.dazed);
    stars.position.set(model.position.x, model.position.y + 2.9 + Math.sin(G.time * 6) * 0.1, model.position.z);
    zz.visible = e.ai.state === 'asleep';
    if (zz.visible) zz.position.set(model.position.x + 0.6, model.position.y + 1.6 + (G.time % 1.5) * 0.4, model.position.z);
  }

  // the rabbit animator's poses for the chief's steps
  const fake = { state: 'idle', t: 0, def: { windup: 1, attack: 1 }, speed: 0 };
  function pose(d, t, dur, dt) {
    let p = 'idle';
    if (d === 'crouch' || d === 'aim' || d === 'ears' || d === 'roar') p = 'windup';
    else if (d === 'air' || d === 'run') p = 'attack';
    else if (d === 'dizzy' || d === 'stunned') p = 'recover';
    else if (d === 'land' || d === 'wave') p = 'recover';
    else if (e.ai.state === 'asleep') p = 'asleep';
    fake.state = p; fake.t = d === 'dizzy' || d === 'stunned' ? 0.3 + t : t; fake.speed = e.speed;
    fake.def.windup = d === 'roar' ? 0.4 : dur; fake.def.attack = dur;
    animate(dt, fake, { flash });
    // ear flaps for the wind, a shake for the roar, on its back when stunned
    if (d === 'ears' || d === 'blow') {
      const f = Math.sin(G.time * (d === 'blow' ? 38 : 16)) * (d === 'blow' ? 0.9 : 0.5);
      if (rig.earL) rig.earL.rotation.z += f;
      if (rig.earR) rig.earR.rotation.z -= f;
    }
    if (d === 'roar') rig.body.rotation.x = -0.25 + Math.sin(G.time * 30) * 0.04;
    if (d === 'stunned') rig.body.rotation.z = Math.min(1, t * 4) * 1.2;
    void dt;
  }

  // during the intro (cutscene: animals do not update) it rears up and roars
  G.onUpdate((dt) => {
    if (e.started || intro < 0) return;
    introAnim += dt;
    fake.state = 'windup'; fake.t = Math.min(0.4, introAnim); fake.def.windup = 0.4; fake.speed = 0;
    animate(dt, fake, {});
    rig.body.rotation.x = introAnim > 1.0 ? -0.3 + Math.sin(G.time * 30) * 0.05 : 0;
  });

  // the plate up top: name, hp, the stun gauge, a hint
  G.onUpdate(() => {
    // (only while the hero is at its fight: a woken boss far away, after a
    // teleport, never keeps its plate up)
    const show = (e.started || intro >= 0) && !(e.ai.state === 'asleep' && e.ai.t > 2.5) && G.mode !== 'title' && Math.hypot(G.player.position.x - e.pos.x, G.player.position.z - e.pos.z) < 40;
    G.hud.bossPlate(show ? { name: `👑 ${def.name}`, hp: e.hp, maxHp: e.maxHp, stun: e.ai.stun, phase: e.ai.phase, hint: e.hint(), dazed: e.dazed } : null);
  });

  e.index = G.enemies.length;
  G.enemies.push(e);
  void glow;
  return e;
}

// The crown and the scar: a gold band with five points and a purple crystal
// (the cave's power, GDD §2.2) between the ears; a dark scar over one eye.
// Sizes are in the rabbit model's own units (it is scaled up with it).
export function addCrown(rig) {
  const head = rig.head;
  if (!head) return;
  const gold = new THREE.MeshStandardMaterial({ color: '#ffcf4a', emissive: '#a8740c', emissiveIntensity: 0.7, metalness: 0.4, roughness: 0.35, flatShading: true });
  const gem = new THREE.MeshStandardMaterial({ color: '#c49bff', emissive: '#9b5cff', emissiveIntensity: 1.4, flatShading: true });
  const crown = new THREE.Group();
  crown.name = 'crown';
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.022, 10, 1, true), gold);
  band.material.side = THREE.DoubleSide;
  crown.add(band);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.026, 4), gold);
    spike.position.set(Math.sin(a) * 0.036, 0.022, Math.cos(a) * 0.036);
    crown.add(spike);
  }
  const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.011, 0), gem);
  g.position.set(0, 0.004, 0.04);
  g.scale.y = 1.5;
  crown.add(g);
  crown.position.set(0, 0.07, -0.015);
  crown.rotation.x = -0.15;
  head.add(crown);
  const scarMat = new THREE.MeshStandardMaterial({ color: '#5a3a4a', roughness: 1 });
  const scar = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.04, 0.006), scarMat);
  scar.position.set(0.032, 0.03, 0.05);
  scar.rotation.z = 0.5;
  head.add(scar);
  crown.traverse((o) => { if (o.isMesh) o.castShadow = true; });
}

// --- the telegraphs (drawn on the floor, under everyone)
const matOf = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
function layered(make) {
  const g = new THREE.Group();
  const edge = new THREE.Mesh(make(1), matOf('#ff2a2a', 0.8));
  const inner = new THREE.Mesh(make(0.94), matOf('#5a0000', 0.5));
  inner.position.y = 0.005;
  const fill = new THREE.Mesh(make(0.94), matOf('#ff4a3a', 0.8));
  fill.position.y = 0.01;
  g.add(edge, inner, fill);
  for (const m of [edge, inner, fill]) m.renderOrder = 5;
  g.userData = { edge, fill };
  g.visible = false;
  return g;
}
// where it will land: a disc (scaled to the radius), filling from the middle
export function discMark() {
  const g = layered((k) => new THREE.CircleGeometry(k, 40).rotateX(-Math.PI / 2));
  g.name = 'slamMark';
  return g;
}
// a ring on the floor of radius r (rebuilt when r changes): how far the
// shockwave will reach (thin), and the shockwave itself (thick, gold)
function ringMark(band, color = '#ff5a4a') {
  const mat = matOf(color, 0.85);
  const m = new THREE.Mesh(new THREE.RingGeometry(1, 1.01, 64).rotateX(-Math.PI / 2), mat);
  m.renderOrder = 5;
  let last = -1;
  m.userData = {
    mat,
    set(r) {
      if (Math.abs(r - last) < 0.02) return;
      last = r;
      m.geometry.dispose();
      m.geometry = new THREE.RingGeometry(Math.max(0.01, r - band / 2), r + band / 2, 64).rotateX(-Math.PI / 2);
    },
  };
  m.visible = false;
  m.name = 'ringMark';
  return m;
}
// the ear wind: a cone in front of it
export function coneMark(reach, arc) {
  const a = THREE.MathUtils.degToRad(arc);
  const g = layered((k) => new THREE.CircleGeometry(reach * k, 28, Math.PI / 2 - a / 2, a).rotateX(-Math.PI / 2).rotateY(Math.PI));
  g.name = 'gustMark';
  return g;
}
// a dash: a lane from its feet forward, `set(len)` stretches it
function laneMark(width) {
  const g = new THREE.Group();
  const strip = (w) => new THREE.PlaneGeometry(w, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
  const edge = new THREE.Mesh(strip(width), matOf('#ff2a2a', 0.8));
  const inner = new THREE.Mesh(strip(width * 0.86), matOf('#5a0000', 0.5));
  inner.position.y = 0.005;
  const fillMesh = new THREE.Mesh(strip(width * 0.86), matOf('#ff4a3a', 0.8));
  fillMesh.position.y = 0.01;
  const holder = new THREE.Group(); // stretched to the lane's length
  holder.add(edge, inner);
  const fill = new THREE.Group();
  fill.add(fillMesh);
  holder.add(fill);
  g.add(holder);
  for (const m of [edge, inner, fillMesh]) m.renderOrder = 5;
  g.userData = { edge, fill, set(len) { holder.scale.set(1, 1, len); } };
  g.visible = false;
  g.name = 'dashMark';
  return g;
}
// the wind itself: white streaks flying out along the cone
function windStreaks() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: '#f2fbff', transparent: true, opacity: 0.7, depthWrite: false, fog: false });
  const bits = Array.from({ length: 18 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.9), mat);
    m.userData = { a: ((i % 6) / 5 - 0.5), y: 0.4 + (i % 3) * 0.6, off: i / 18 };
    g.add(m);
    return m;
  });
  g.userData.step = (at, heading, t) => {
    g.position.set(at.x, 0, at.z);
    g.rotation.y = heading;
    for (const b of bits) {
      const u = (t * 1.6 + b.userData.off) % 1;
      const ang = b.userData.a * 1.1;
      const r = 1.5 + u * 8;
      b.position.set(Math.sin(ang) * r, b.userData.y, Math.cos(ang) * r);
      b.rotation.y = ang;
    }
  };
  g.visible = false;
  g.name = 'gust';
  return g;
}
