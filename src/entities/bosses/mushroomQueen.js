import * as THREE from 'three';
import { BOSSES } from '../../data/bosses.js';
import { ITEMS } from '../../data/items.js';
import { textSprite } from '../enemy.js';
import { addOutline } from '../outline.js';
import { newBossAI, stepBoss, doingOf, isDazed } from './chiefAI.js';
import { queenSteps } from './queenAI.js';
import { discMark, coneMark } from './rabbitChief.js';
import { createPoisonCloud, createPoisonMushroom } from '../mushrooms.js';
import { inCone, damageHp } from '../../combat/hits.js';
import { dampAngle } from '../../player/movement.js';
import { rng, subSeed } from '../../core/rng.js';
import { sfx } from '../../audio/sound.js';

// M6a: the Poison Mushroom Queen (GDD §3.3), the mushroom cave's boss: a big
// friendly-faced mushroom with a crown on her spotted cap, in the round
// arena. The pure scheduler (chiefAI.js stepBoss with queenAI.js patterns)
// picks the steps; this body draws every attack on the floor first (red
// cones for the spores, red circles where mushrooms will burst up, red-edged
// green zones where poison will seep), hurts only inside what it drew, and
// droops her cap after the spores and the clouds (💫, the hammer hits her
// head twice as hard). Her clouds are poison (entities/mushrooms.js): the
// water gun washes them away, a safe place to stand. The plate up top shows
// her hp, the stun gauge and a hint.
const HERO_RADIUS = 0.3;
const hintOf = {
  intro: '독버섯 여왕이 나타났어요!', idle: null, rest: null,
  puff: '포자가 날아와요! 빨간 부채꼴 밖으로!', spray: '포자! 부채꼴 밖으로!',
  droop: '갓이 내려왔어요! 지금 머리를 망치로!', stunned: '넘어졌어요! 지금 망치로!',
  call: '버섯이 솟아요! 빨간 원 밖으로!', sprout: '버섯이 솟아요!',
  seep: '독구름이 생겨요! 초록 구역 밖으로!', cloud: '독구름은 물총으로 씻어요!',
  roar: '화가 났어요! 새 기술이 와요!', asleep: '쿨쿨… 잠들었어요',
};

// W2: `floor`, her ring's ground height (the big world's sunken ring, −76 m).
export function createMushroomQueen(G, { x, z, heading = 0, center: at = { x: 0, z: 0 }, arena: ARENA = 15, floor = 0 }) {
  const def = BOSSES.mushroomQueen;
  const model = createQueenModel();
  const { rig } = model.userData;
  const home = new THREE.Vector3(x, floor, z);
  const center = new THREE.Vector3(at.x, floor, at.z);
  model.position.copy(home);
  model.rotation.y = heading;
  G.scene.add(model);
  G.look.shadows(model);
  const mover = G.physics.createMover({ x, y: floor, z, radius: 1.3, height: 2.6 });
  G.addLight({ pos: () => model.position.clone().setY(model.position.y + 3.4), color: '#c77bff', intensity: 7, distance: 12 });

  // the telegraphs: three spore cones, three circles, three seep zones
  const cones = [0, 1, 2].map(() => coneMark(def.spray.reach, def.spray.arc));
  const circles = [0, 1, 2].map(() => discMark());
  const zones = [0, 1, 2].map(() => zoneMark());
  const stars = textSprite('💫', 1.8);
  const zz = textSprite('Zz', 1.4, '#d9ccff');
  G.scene.add(...cones, ...circles, ...zones, stars, zz);
  const spores = sporeBurst();
  G.scene.add(spores);

  const rand = rng(subSeed(G.run.seed, 9200));
  const e = {
    kind: 'mushroomQueen', isBoss: true, def, name: def.name, model, mover, home,
    size: def.size, hp: def.hp, maxHp: def.hp,
    ai: newBossAI(), heading, speed: 0,
    knock: new THREE.Vector2(), gone: false, wetUntil: -Infinity,
    started: false,
    get doing() { return doingOf(e.ai); },
    get state() { return e.ai.state === 'asleep' ? 'asleep' : doingOf(e.ai); },
    get phase() { return e.ai.phase; },
    get stun() { return e.ai.stun; },
    get dazed() { return isDazed(e.ai); },
    get pos() { return model.position; },
    get active() { return !e.gone && e.started && e.ai.state !== 'asleep'; },
    hint: () => hintOf[doingOf(e.ai)] ?? def.hint,
    marks: { cones, circles, zones }, // (for checks)
    summoned: [],
  };
  // what this pattern aims at
  const aim = { headings: [], spots: [], hit: false };
  let stunIn = 0, flash = 0;

  G.addHittable({
    enemy: e, radius: def.size[0],
    enabled: () => e.started && e.ai.state !== 'asleep',
    pos: () => model.position.clone().setY(model.position.y + 1.0),
    onHit: (o) => e.hurt(o),
  });
  // a hit: the hammer twice as hard on her drooping cap; every hit fills the stun gauge
  e.hurt = ({ damage = 1, kind: by = 'hammer' }) => {
    if (!e.started || e.ai.state === 'asleep') return false;
    const dazed = isDazed(e.ai);
    let dmg = damage;
    if (by === 'hammer') { if (dazed) dmg *= def.hammerBonus; stunIn += dazed ? def.stun.dazedHammer : def.stun.hammer; }
    else if (by === 'water') { stunIn += def.stun.water; e.wetUntil = G.time + ITEMS.waterGun.wet; }
    else stunIn += def.stun.hammer * 0.5;
    e.hp = damageHp(e.hp, dmg);
    flash = 0.2;
    if (by !== 'water') sfx.bonk();
    G.discover?.('mushroomQueen');
    G.emit('enemyHit', { enemy: e, damage: dmg, by, dazed });
    return true;
  };
  e.bind = () => {
    if (!e.started || e.ai.state === 'asleep') return false;
    stunIn += def.stun.vine;
    flash = 0.2;
    G.emit('bossTangled', { enemy: e });
    return true;
  };

  // What her telegraphs cover now (null: nothing), like the animals' hazard()
  e.hazard = () => {
    const d = doingOf(e.ai);
    const left = (e.ai.step?.dur ?? 0) - e.ai.t;
    const out = [];
    if (d === 'puff' || d === 'spray') for (const h of aim.headings) out.push({ kind: 'spray', shape: 'cone', x: model.position.x, z: model.position.z, heading: h, r: def.spray.reach, arc: def.spray.arc, hitAt: G.time + (d === 'puff' ? left : 0) });
    if (d === 'call' || d === 'sprout') for (const p of aim.spots) out.push({ kind: 'sprout', shape: 'circle', x: p.x, z: p.z, r: def.summon.radius, hitAt: G.time + (d === 'call' ? left : 0) });
    if (d === 'seep') for (const p of aim.spots) out.push({ kind: 'poison', shape: 'circle', x: p.x, z: p.z, r: def.cloud.radius, hitAt: G.time + left + 0.45, poison: true });
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
  const inArena = (p, margin = 1.5) => {
    const d = Math.hypot(p.x - center.x, p.z - center.z), R = ARENA - margin;
    if (d > R) { p.x = center.x + ((p.x - center.x) / d) * R; p.z = center.z + ((p.z - center.z) / d) * R; }
    return p;
  };
  // spots round the hero for circles or zones: the first on the hero, the
  // rest spread round, never on her (a gap to stand in near her) nor on top
  // of each other
  function spotsAround(n, r, gap) {
    const pp = G.player.position;
    const out = [inArena({ x: pp.x, z: pp.z }, r * 0.6)];
    for (let k = 0; out.length < n && k < 40; k++) {
      const a = rand() * Math.PI * 2, d = r * 2.1 + rand() * 4;
      const p = inArena({ x: pp.x + Math.cos(a) * d, z: pp.z + Math.sin(a) * d }, r * 0.6);
      if (out.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < r * 2 + gap)) continue;
      if (Math.hypot(p.x - model.position.x, p.z - model.position.z) < r + 2.6) continue;
      out.push(p);
    }
    // the first one too: keep it off her
    const f = out[0], dq = Math.hypot(f.x - model.position.x, f.z - model.position.z);
    if (dq < r + 2.6) { const k = (r + 2.6) / Math.max(0.1, dq); f.x = model.position.x + (f.x - model.position.x) * k; f.z = model.position.z + (f.z - model.position.z) * k; inArena(f, r * 0.6); }
    return out;
  }

  function onStep(step) {
    const name = step.name;
    if (name === 'puff') {
      const h0 = toHero(), n = step.n ?? 1, spread = THREE.MathUtils.degToRad(def.spray.spread);
      aim.headings = Array.from({ length: n }, (_, i) => h0 + (i - (n - 1) / 2) * spread);
      e.heading = h0;
      tele('spray');
      sfx.growl?.();
    }
    if (name === 'spray') {
      attack('spray');
      sfx.gust?.();
      spores.userData.fire(model.position, aim.headings, def.spray.reach);
      const pp = G.player.position;
      if (aim.headings.some((h) => inCone(model.position.x, model.position.z, h, pp.x, pp.z, def.spray.reach, def.spray.arc, HERO_RADIUS))) hurtHero('spray', model.position);
    }
    if (name === 'call') {
      aim.spots = spotsAround(step.n ?? 2, def.summon.radius, 1.5);
      tele('sprout');
      sfx.rumble?.();
    }
    if (name === 'sprout') {
      attack('sprout');
      sfx.stomp?.();
      G.cam?.shake(0.3);
      const pp = G.player.position;
      if (aim.spots.some((p) => Math.hypot(pp.x - p.x, pp.z - p.z) < def.summon.radius + HERO_RADIUS)) hurtHero('sprout', new THREE.Vector3(aim.spots[0].x, floor, aim.spots[0].z));
      for (const p of aim.spots) {
        e.summoned = e.summoned.filter((m) => !m.gone);
        while (e.summoned.length >= def.summon.max) e.summoned.shift().remove();
        e.summoned.push(createPoisonMushroom(G, { x: p.x, z: p.z, y: floor, life: def.summon.life, summoned: true }));
      }
    }
    if (name === 'seep') {
      aim.spots = spotsAround(step.n ?? 2, def.cloud.radius, 2.2);
      tele('poison');
      sfx.rumble?.();
    }
    if (name === 'cloud') {
      attack('poison');
      sfx.gust?.();
      for (const p of aim.spots) createPoisonCloud(G, { x: p.x, z: p.z, y: floor, r: def.cloud.radius, life: def.cloud.life, kind: 'queen' });
      G.emit('queenClouds', { spots: aim.spots.map((p) => ({ ...p })), at: G.time });
    }
    if (name === 'droop') { sfx.stun(); G.emit('queenDroop', { at: G.time }); }
    if (name === 'roar') {
      sfx.roar?.();
      G.cam?.shake(0.5);
      G.toast(e.ai.phase === 2 ? '🍄 여왕이 화가 났어요! 버섯을 불러요!' : '🍄 더 빨라졌어요! 포자와 독구름을 조심해요!', 3200);
    }
  }

  function onEvent(ev) {
    if (ev.type === 'step') onStep(ev.step);
    if (ev.type === 'phase') G.emit('bossPhase', { phase: ev.phase, at: G.time, hp: e.hp });
    if (ev.type === 'stunned') { sfx.stun(); G.toast('🍄 여왕이 넘어졌어요! 지금 망치로!', 2400); G.emit('bossStunned', { at: G.time }); }
    if (ev.type === 'asleep') {
      mover.setEnabled(false);
      sfx.stun();
      for (const m of e.summoned) m.remove();
      G.run.asleep = (G.run.asleep ?? 0) + 1;
      G.emit('enemyAsleep', e);
      G.emit('bossDefeated', e);
    }
    if (ev.type === 'step') G.emit('bossStep', { name: ev.step.name, pattern: ev.pattern ?? null, at: G.time, phase: e.ai.phase });
  }

  // the intro: a short look at her (GDD §5.1), her name card
  let intro = -1, introAnim = 0;
  e.beginIntro = () => {
    if (intro >= 0 || e.started) return;
    intro = 0;
    G.beginCutscene();
    G.pointer?.cancel();
    const look = model.position.clone().setY(model.position.y + 2.2);
    const to = look.clone().add(new THREE.Vector3(Math.sin(Math.PI / 4), 0.6, Math.cos(Math.PI / 4)).normalize().multiplyScalar(13));
    G.cam?.fly(to, look, 0.9);
    G.hud.card(`<h2>🍄 ${def.name}</h2><p>포자를 뿜고 나면 갓이 내려와요. 그때 망치로!<br>독구름은 물총으로 씻어요</p>`, 2800);
    sfx.roar?.();
  };
  const INTRO = 3.0;
  G.onUpdate((dt) => {
    if (intro < 0 || e.started) return;
    intro += dt;
    introAnim += dt;
    if (intro > 1.2 && intro - dt <= 1.2) { G.cam?.shake(0.4); sfx.stomp(); }
    rig.cap.rotation.z = Math.sin(introAnim * 6) * 0.08;
    rig.body.scale.y = 1 + Math.sin(introAnim * 8) * 0.04;
    if (intro >= INTRO) {
      e.started = true;
      G.cam?.release();
      G.cam?.snap(G.player.position);
      G.endCutscene();
      G.emit('bossStart', e);
    }
  });

  e.update = (dt) => {
    if (e.gone) return;
    const pp = G.player.position;
    if (!e.started && intro < 0 && G.mode === 'play') e.beginIntro();
    for (const ev of stepBoss(e.ai, { hp: e.hp, maxHp: e.maxHp, started: e.started, stun: stunIn }, dt, def, rand, queenSteps)) onEvent(ev);
    stunIn = 0;
    const d = doingOf(e.ai);
    const t = e.ai.t, dur = e.ai.step?.dur ?? 1;
    let dx = 0, dz = 0;
    e.speed = 0;
    // she drifts toward the hero between attacks, never right on top
    if (d === 'rest' || d === 'idle') {
      const dist = Math.hypot(pp.x - model.position.x, pp.z - model.position.z);
      if (dist > 5.5 && e.started) {
        e.heading = dampAngle(e.heading, toHero(), 3, dt);
        dx = Math.sin(e.heading) * def.glide * dt; dz = Math.cos(e.heading) * def.glide * dt;
        e.speed = def.glide;
      } else e.heading = dampAngle(e.heading, toHero(), 3, dt);
    } else if (d === 'puff' || d === 'call' || d === 'seep' || d === 'roar') e.heading = dampAngle(e.heading, toHero(), 4, dt);
    if (e.ai.state !== 'asleep') { mover.move(dx, dz, dt); model.position.copy(mover.feet); }
    model.rotation.y = e.heading;
    draw(d, t, dur);
    pose(d, t, dur, dt);
    flash = Math.max(0, flash - dt);
  };

  function draw(d, t, dur) {
    const live = !G.fainted;
    const k = Math.min(1, t / dur);
    cones.forEach((c, i) => {
      c.visible = live && (d === 'puff' || d === 'spray') && i < aim.headings.length;
      if (!c.visible) return;
      c.position.set(model.position.x, floor + 0.05, model.position.z);
      c.rotation.y = aim.headings[i];
      c.userData.fill.scale.setScalar(d === 'puff' ? Math.max(0.05, k) : 1);
      c.userData.edge.material.opacity = 0.75 + Math.sin(G.time * 30) * 0.2;
    });
    circles.forEach((c, i) => {
      c.visible = live && (d === 'call' || d === 'sprout') && i < aim.spots.length;
      if (!c.visible) return;
      c.position.set(aim.spots[i].x, floor + 0.05, aim.spots[i].z);
      c.scale.setScalar(def.summon.radius);
      c.userData.fill.scale.setScalar(d === 'call' ? Math.max(0.05, k) : 1);
    });
    zones.forEach((zn, i) => {
      zn.visible = live && d === 'seep' && i < aim.spots.length;
      if (!zn.visible) return;
      zn.position.set(aim.spots[i].x, floor + 0.05, aim.spots[i].z);
      zn.userData.set(def.cloud.radius, k);
    });
    spores.userData.step(1 / 60);
    stars.visible = live && e.dazed;
    stars.position.set(model.position.x, model.position.y + 4.2 + Math.sin(G.time * 6) * 0.1, model.position.z);
    zz.visible = e.ai.state === 'asleep';
    if (zz.visible) zz.position.set(model.position.x + 0.8, model.position.y + 3 + (G.time % 1.5) * 0.4, model.position.z);
  }

  function pose(d, t, dur, dt) {
    const asleep = e.ai.state === 'asleep';
    // the droop: her cap tips forward and low (the head within the hammer's reach)
    const droop = d === 'droop' || d === 'stunned' ? Math.min(1, t * 4) : 0;
    rig.cap.rotation.x = THREE.MathUtils.lerp(rig.cap.rotation.x, droop * 0.55 + (asleep ? 0.6 : 0), Math.min(1, dt * 8));
    rig.cap.position.y = THREE.MathUtils.lerp(rig.cap.position.y, rig.capY - droop * 0.9 - (asleep ? 0.6 : 0), Math.min(1, dt * 8));
    // puffing up before the spores, wobbling when she calls mushrooms
    const swell = d === 'puff' ? 1 + Math.min(1, t / dur) * 0.12 : d === 'spray' ? 1.12 - Math.min(1, t / dur) * 0.12 : 1;
    rig.cap.scale.setScalar(swell);
    rig.body.rotation.z = d === 'call' || d === 'seep' ? Math.sin(G.time * 14) * 0.06 : d === 'roar' ? Math.sin(G.time * 30) * 0.05 : Math.sin(G.time * 1.5) * 0.02;
    rig.body.scale.y = 1 + Math.sin(G.time * 2) * 0.015;
    for (const [i, arm] of rig.arms.entries()) arm.rotation.z = (i ? -1 : 1) * (d === 'call' || d === 'seep' ? 1.2 + Math.sin(G.time * 10) * 0.2 : 0.5 + Math.sin(G.time * 2 + i) * 0.1);
    rig.eyes.forEach((eye) => { eye.scale.y = d === 'droop' || d === 'stunned' || asleep ? 0.15 : 1; });
    if (asleep) model.rotation.z = Math.min(1, e.ai.t) * 0.5;
    const glow = Math.min(1, flash * 4);
    rig.capMat.emissiveIntensity = 0.45 + glow * 1.2;
  }

  // the plate up top: name, hp, the stun gauge, a hint
  G.onUpdate(() => {
    // (only while the hero is at its fight: a woken boss far away, after a
    // teleport, never keeps its plate up)
    const show = (e.started || intro >= 0) && !(e.ai.state === 'asleep' && e.ai.t > 2.5) && G.mode !== 'title' && Math.hypot(G.player.position.x - e.pos.x, G.player.position.z - e.pos.z) < 40;
    if (show) G.hud.bossPlate({ name: `🍄 ${def.name}`, hp: e.hp, maxHp: e.maxHp, stun: e.ai.stun, phase: e.ai.phase, hint: e.hint(), dazed: e.dazed });
    else if (e.started || intro >= 0) G.hud.bossPlate(null);
  });

  e.index = G.enemies.length;
  G.enemies.push(e);
  return e;
}

// the queen: a stout stem with a sweet face, little arms, a frilled collar,
// a huge glowing purple cap with spots and a gold crown with a green gem
export function createQueenModel() {
  const g = new THREE.Group();
  g.name = 'mushroomQueen';
  const m = (c, e = 0, extra = {}) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: e, flatShading: true, roughness: 0.7, ...extra });
  const body = new THREE.Group();
  g.add(body);
  const stemMat = m('#f2e4f0', 0.18);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.1, 2.4, 12, 3), stemMat);
  stem.position.y = 1.2;
  body.add(stem);
  // a frilled collar (the ring of a mushroom), like a royal ruff
  const ruff = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.16, 6, 18), m('#ffd6f0', 0.25));
  ruff.rotation.x = Math.PI / 2;
  ruff.position.y = 1.85;
  body.add(ruff);
  // face
  const eyes = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(s * 0.32, 1.35, 0.8);
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), m('#ffffff', 0.25));
    white.scale.z = 0.6;
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), m('#2a1438', 0.1));
    pupil.position.z = 0.08;
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), m('#ffffff', 1));
    shine.position.set(s * -0.03, 0.05, 0.16);
    eye.add(white, pupil, shine);
    body.add(eye);
    eyes.push(eye);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), m('#ff9ad0', 0.4));
    cheek.position.set(s * 0.52, 1.12, 0.72);
    cheek.scale.z = 0.4;
    body.add(cheek);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 5, 10, Math.PI), m('#8a2a5a', 0.3));
  mouth.position.set(0, 1.08, 0.86);
  mouth.rotation.z = Math.PI;
  body.add(mouth);
  // little arms
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.95, 1.4, 0.1);
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.6, 4, 8), stemMat);
    a.position.y = -0.4;
    arm.add(a);
    body.add(arm);
    arms.push(arm);
  }
  // the cap: a big dome, glowing gills under it, bright spots on top
  const capY = 2.45;
  const cap = new THREE.Group();
  cap.position.y = capY;
  const capMat = m('#a24cf0', 0.45);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.2, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
  dome.scale.y = 0.6;
  cap.add(dome);
  const gills = new THREE.Mesh(new THREE.CircleGeometry(2.15, 24).rotateX(Math.PI / 2), m('#e08cff', 0.9, { side: THREE.DoubleSide }));
  gills.position.y = 0.01;
  cap.add(gills);
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39996, rho = 0.4 + (i % 5) * 0.35;
    const spot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 + (i % 3) * 0.06, 0), m('#c8ff6a', 0.9));
    spot.position.set(Math.cos(a) * rho, Math.sqrt(Math.max(0, 1 - (rho / 2.2) ** 2)) * 2.2 * 0.6 - 0.02, Math.sin(a) * rho);
    spot.scale.y = 0.45;
    cap.add(spot);
  }
  // the crown
  const gold = m('#ffcf4a', 0.6, { metalness: 0.4, roughness: 0.35 });
  const crown = new THREE.Group();
  crown.position.y = 1.32;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.25, 12, 1, true), gold);
  band.material.side = THREE.DoubleSide;
  crown.add(band);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 4), gold);
    spike.position.set(Math.sin(a) * 0.5, 0.26, Math.cos(a) * 0.5);
    crown.add(spike);
  }
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), m('#6aff9a', 1.3));
  gem.position.set(0, 0.05, 0.55);
  gem.scale.y = 1.4;
  crown.add(gem);
  cap.add(crown);
  body.add(cap);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  addOutline(g, { thickness: 0.035, minSize: 0.15 });
  g.userData.rig = { body, cap, capY, capMat, arms, eyes };
  return g;
}

// where poison will seep: a red edge (like every telegraph) round a green
// fill that grows as the warning runs out
function zoneMark() {
  const g = new THREE.Group();
  const matOf = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const edge = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2), matOf('#ff2a2a', 0.85));
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.92, 48).rotateX(-Math.PI / 2), matOf('#1f3a10', 0.4));
  inner.position.y = 0.005;
  const fill = new THREE.Mesh(new THREE.CircleGeometry(0.92, 48).rotateX(-Math.PI / 2), matOf('#7dff4a', 0.55));
  fill.position.y = 0.01;
  g.add(edge, inner, fill);
  for (const o of [edge, inner, fill]) o.renderOrder = 5;
  g.userData.set = (r, k) => { g.scale.setScalar(r); fill.scale.setScalar(Math.max(0.05, k)); edge.material.opacity = 0.7 + Math.sin(performance.now() / 33) * 0.2; };
  g.visible = false;
  g.name = 'seepMark';
  return g;
}

// the spores: little green-yellow puffs flying out along the cones
function sporeBurst() {
  const g = new THREE.Group();
  g.name = 'queenSpores';
  const mat = new THREE.MeshBasicMaterial({ color: '#c8ff6a', transparent: true, opacity: 0.8, depthWrite: false, fog: false });
  const bits = Array.from({ length: 36 }, () => { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), mat); b.visible = false; g.add(b); return b; });
  let t = 1, from = new THREE.Vector3(), heads = [], reach = 9;
  g.userData.fire = (at, headings, r) => { t = 0; from = at.clone(); heads = headings; reach = r; };
  g.userData.step = (dt) => {
    t += dt;
    const live = t < 0.7;
    bits.forEach((b, i) => {
      b.visible = live && heads.length > 0;
      if (!b.visible) return;
      const h = heads[i % heads.length] + ((i * 7) % 9 - 4) * 0.08;
      const d = 1.5 + Math.min(1, t / 0.6 + (i % 4) * 0.08) * (reach - 1.5);
      b.position.set(from.x + Math.sin(h) * d, from.y + 0.6 + (i % 3) * 0.4, from.z + Math.cos(h) * d);
      b.scale.setScalar(1 + t * 2);
    });
    mat.opacity = Math.max(0, 0.8 * (1 - t / 0.7));
  };
  return g;
}
