import * as THREE from 'three';
import { BOSSES } from '../../data/bosses.js';
import { ITEMS } from '../../data/items.js';
import { textSprite } from '../enemy.js';
import { createBearModel, createBearAnimator } from '../bear.js';
import { newBossAI, stepBoss, doingOf, isDazed } from './chiefAI.js';
import { iceBearSteps } from './iceBearAI.js';
import { discMark, coneMark } from './rabbitChief.js';
import { inCone, damageHp } from '../../combat/hits.js';
import { dampAngle } from '../../player/movement.js';
import { rng, subSeed } from '../../core/rng.js';
import { softGlowTexture } from '../../world/glow.js';
import { sfx } from '../../audio/sound.js';

// W3: the Ice Bear (GDD §3.3), the Ice Lake's boss, on its sunken rink of
// bare ice. Polyfork's bear-base made white (its vertex colours turned to
// snow and pale blue, the darkest parts kept dark: eyes, nose, claws), three
// times as big, with spikes of ice along its back, glowing blue eyes and a
// frosty breath. The pure scheduler (chiefAI.js stepBoss with iceBearAI.js)
// picks the steps; this body draws every attack first (the red circle where
// its fists come down, shadows where ice will fall, the cone of its
// blizzard), hurts only inside what it drew, and leaves its fists stuck in
// the ice after a pound (💫: the hammer hits twice as hard). The plate up top
// shows its hp, the stun gauge and a hint.
const SCALE = 3.0;
const HERO_RADIUS = 0.3;
const KNOCK = 8; // the hero's knock decays at 8/s (player.js)
const hintOf = {
  intro: '얼음 곰이 나타났어요!', idle: null, rest: null,
  raise: '주먹이 내려와요! 빨간 원 밖으로!', pound: '쿵!', gap: '한 번 더 와요!',
  stuck: '주먹이 얼음에 박혔어요! 지금 망치로!', stunned: '넘어졌어요! 지금 망치로!',
  call: '얼음이 떨어져요! 그림자 밖으로!', fall: '얼음이 떨어져요!',
  inhale: '눈보라! 빨간 부채꼴 밖으로!', breath: '눈보라! 옆으로 피해요!',
  roar: '화가 났어요! 새 기술이 와요!', asleep: '쿨쿨… 잠들었어요',
};

// the bear's brown coat to snow (vertex colours are linear): the darkest
// parts (eyes, nose, claws) stay dark navy, the rest from pale ice blue in
// the shade to white
export function whiten(mesh) {
  const col = mesh.geometry.attributes.color;
  if (!col) return;
  mesh.geometry = mesh.geometry.clone();
  const c = mesh.geometry.attributes.color;
  for (let i = 0; i < c.count; i++) {
    const r = c.getX(i), g = c.getY(i), b = c.getZ(i);
    const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
    if (lum < 0.007) { c.setXYZ(i, 0.02, 0.03, 0.06); continue; }
    const t = Math.min(1, Math.sqrt((lum - 0.007) / 0.2));
    c.setXYZ(i, 0.55 + 0.45 * t, 0.7 + 0.3 * t, 0.86 + 0.14 * t);
  }
}

export function createIceBear(G, { x, z, heading = 0, center: at = { x: 0, z: 0 }, arena: ARENA = 15, floor = 0 }) {
  const def = BOSSES.iceBear;
  const model = createBearModel({ scale: SCALE, recolour: whiten, coat: '#ffffff' });
  model.name = 'iceBear';
  const animate = createBearAnimator(model, { rear: 0.6 });
  const { rig } = model.userData;
  const flair = addFrost(rig);
  const home = new THREE.Vector3(x, floor, z);
  const center = new THREE.Vector3(at.x, floor, at.z);
  model.position.copy(home);
  model.rotation.y = heading;
  G.scene.add(model);
  G.look.shadows(model);
  const mover = G.physics.createMover({ x, y: floor, z, radius: 1.7, height: 2.6 });
  G.addLight({ pos: () => model.position.clone().setY(floor + 4.5), color: '#9fdcff', intensity: 8, distance: 14 });

  // the telegraphs: the fists' circle, five shadows, the blizzard's cone
  const fistMark = discMark();
  const shadows = [0, 1, 2, 3, 4].map(() => shadowMark());
  const cone = coneMark(def.blizzard.reach, def.blizzard.arc);
  const stars = textSprite('💫', 2.0);
  const zz = textSprite('Zz', 1.5, '#d9ccff');
  G.scene.add(fistMark, ...shadows, cone, stars, zz);
  // the falling chunks of ice, the cracks where the fists went in, the blizzard
  const iceMat = new THREE.MeshStandardMaterial({ color: '#cdeeff', emissive: '#4aa4e8', emissiveIntensity: 0.5, flatShading: true, roughness: 0.15, transparent: true, opacity: 0.95 });
  const chunks = shadows.map(() => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), iceMat); m.scale.set(1.1, 1.5, 1.0); m.visible = false; m.castShadow = true; G.scene.add(m); return m; });
  const crack = crackRing();
  G.scene.add(crack);
  const snow = blizzardStreaks();
  G.scene.add(snow);

  const rand = rng(subSeed(G.run.seed, 9300));
  const e = {
    kind: 'iceBear', isBoss: true, def, name: def.name, model, mover, home,
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
    marks: { fistMark, shadows, cone }, // (for checks)
  };
  // what this pattern aims at
  const aim = { fist: new THREE.Vector3(), spots: [], heading: 0, hit: false };
  let stunIn = 0, flash = 0;

  G.addHittable({
    enemy: e, radius: def.size[0],
    enabled: () => e.started && e.ai.state !== 'asleep',
    pos: () => model.position.clone().setY(model.position.y + 1.2),
    onHit: (o) => e.hurt(o),
  });
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
    G.discover?.('iceBear');
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

  // What its telegraphs cover now (null: nothing), like the animals' hazard()
  e.hazard = () => {
    const d = doingOf(e.ai);
    const left = (e.ai.step?.dur ?? 0) - e.ai.t;
    const out = [];
    if (d === 'raise' || d === 'pound') out.push({ kind: 'fist', shape: 'circle', x: aim.fist.x, z: aim.fist.z, r: def.fist.radius, hitAt: G.time + (d === 'raise' ? left : 0) });
    if (d === 'call' || d === 'fall') for (const p of aim.spots) out.push({ kind: 'chunk', shape: 'circle', x: p.x, z: p.z, r: def.chunks.radius, hitAt: G.time + (d === 'call' ? left : 0) });
    if (d === 'inhale' || d === 'breath') out.push({ kind: 'blizzard', shape: 'cone', x: model.position.x, z: model.position.z, heading: aim.heading, r: def.blizzard.reach, arc: def.blizzard.arc, hitAt: G.time + (d === 'inhale' ? left : 0) });
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
  // shadows round the hero: the first on the hero, the rest spread round,
  // never on the bear (a place to stand by its side) nor on each other
  function spotsAround(n, r) {
    const pp = G.player.position;
    const out = [inArena({ x: pp.x, z: pp.z }, r)];
    for (let k = 0; out.length < n && k < 60; k++) {
      const a = rand() * Math.PI * 2, d = r * 2.2 + rand() * 5;
      const p = inArena({ x: pp.x + Math.cos(a) * d, z: pp.z + Math.sin(a) * d }, r);
      if (out.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < r * 2 + 1.2)) continue;
      if (Math.hypot(p.x - model.position.x, p.z - model.position.z) < r + def.size[0] + 1.5) continue;
      out.push(p);
    }
    const f = out[0], dq = Math.hypot(f.x - model.position.x, f.z - model.position.z), keep = r + def.size[0] + 1.5;
    if (dq < keep) { const k = keep / Math.max(0.1, dq); f.x = model.position.x + (f.x - model.position.x) * k; f.z = model.position.z + (f.z - model.position.z) * k; inArena(f, r); }
    return out;
  }

  function onStep(step) {
    const name = step.name;
    if (name === 'raise') {
      // the fists come down in front of it, toward the hero (within its reach)
      const h = toHero(), pp = G.player.position;
      const d = Math.min(def.fist.reach, Math.max(2.2, Math.hypot(pp.x - model.position.x, pp.z - model.position.z)));
      aim.fist.set(model.position.x + Math.sin(h) * d, floor, model.position.z + Math.cos(h) * d);
      inArena(aim.fist, 1);
      e.heading = h;
      fistMark.position.set(aim.fist.x, floor + 0.05, aim.fist.z);
      fistMark.scale.setScalar(def.fist.radius);
      tele('fist');
      sfx.growl?.();
    }
    if (name === 'pound') {
      attack('fist');
      const pp = G.player.position;
      if (Math.hypot(pp.x - aim.fist.x, pp.z - aim.fist.z) < def.fist.radius + HERO_RADIUS) hurtHero('fist', aim.fist);
      G.cam?.shake(0.8);
      sfx.slam?.();
      crack.userData.at(aim.fist, floor);
    }
    if (name === 'stuck') { sfx.stun(); G.emit('iceBearStuck', { at: G.time }); }
    if (name === 'call') {
      aim.spots = spotsAround(step.n ?? 3, def.chunks.radius);
      tele('chunk');
      sfx.roar?.();
      G.cam?.shake(0.25);
    }
    if (name === 'fall') {
      attack('chunk');
      sfx.stomp?.();
      G.cam?.shake(0.45);
      const pp = G.player.position;
      const hit = aim.spots.find((p) => Math.hypot(pp.x - p.x, pp.z - p.z) < def.chunks.radius + HERO_RADIUS);
      if (hit) hurtHero('chunk', new THREE.Vector3(hit.x, floor, hit.z));
    }
    if (name === 'inhale') { aim.heading = toHero(); e.heading = aim.heading; tele('blizzard'); sfx.flap?.(); }
    if (name === 'breath') {
      attack('blizzard');
      sfx.gust?.();
      aim.hit = false;
      if (heroInCone()) { aim.hit = true; hurtHero('blizzard', model.position); pushHero(1); }
    }
    if (name === 'roar') {
      sfx.roar?.();
      G.cam?.shake(0.5);
      G.toast(e.ai.phase === 2 ? '🐻‍❄️ 얼음 곰이 화가 났어요! 눈보라를 조심해요!' : '🐻‍❄️ 더 빨라졌어요! 주먹이 두 번 와요!', 3200);
    }
  }
  function heroInCone() {
    const pp = G.player.position;
    return inCone(model.position.x, model.position.z, aim.heading, pp.x, pp.z, def.blizzard.reach, def.blizzard.arc, HERO_RADIUS);
  }
  // the blizzard shoves the hero away along the cone (a steady push while in it)
  function pushHero(k) {
    const pp = G.player.position;
    const away = new THREE.Vector2(pp.x - model.position.x, pp.z - model.position.z).normalize();
    const kn = G.player.state.knock;
    if (k >= 1) kn.copy(away.multiplyScalar(def.blizzard.push * KNOCK * 0.5));
    else kn.addScaledVector(away, k);
  }

  function onEvent(ev) {
    if (ev.type === 'step') onStep(ev.step);
    if (ev.type === 'phase') G.emit('bossPhase', { phase: ev.phase, at: G.time, hp: e.hp });
    if (ev.type === 'stunned') { sfx.stun(); G.toast('🐻‍❄️ 얼음 곰이 넘어졌어요! 지금 망치로!', 2400); G.emit('bossStunned', { at: G.time }); }
    if (ev.type === 'asleep') {
      mover.setEnabled(false);
      sfx.stun();
      G.run.asleep = (G.run.asleep ?? 0) + 1;
      G.emit('enemyAsleep', e);
      G.emit('bossDefeated', e);
    }
    if (ev.type === 'step') G.emit('bossStep', { name: ev.step.name, pattern: ev.pattern ?? null, at: G.time, phase: e.ai.phase });
  }

  // the intro: a short look at it (GDD §5.1), its name card
  let intro = -1, introAnim = 0;
  e.beginIntro = () => {
    if (intro >= 0 || e.started) return;
    intro = 0;
    G.beginCutscene();
    G.pointer?.cancel();
    const look = model.position.clone().setY(floor + 3);
    const to = look.clone().add(new THREE.Vector3(Math.sin(Math.PI / 4), 0.6, Math.cos(Math.PI / 4)).normalize().multiplyScalar(16));
    G.cam?.fly(to, look, 0.9);
    G.hud.card(`<h2>🐻‍❄️ ${def.name}</h2><p>주먹이 얼음에 박히면 망치로!<br>떨어지는 얼음은 그림자를 보고 피해요</p>`, 2800);
    sfx.roar?.();
  };
  const INTRO = 3.0;
  const fake = { state: 'idle', t: 0, def: { windup: 1 }, speed: 0 };
  G.onUpdate((dt) => {
    if (intro < 0 || e.started) return;
    intro += dt;
    introAnim += dt;
    if (intro > 1.2 && intro - dt <= 1.2) { G.cam?.shake(0.5); sfx.stomp(); }
    // up on its hind legs, roaring
    fake.state = 'windup'; fake.t = Math.min(1, introAnim / 1.1); fake.speed = 0;
    animate(dt, fake, { k: Math.min(1, introAnim / 1.1) });
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
    for (const ev of stepBoss(e.ai, { hp: e.hp, maxHp: e.maxHp, started: e.started, stun: stunIn }, dt, def, rand, iceBearSteps)) onEvent(ev);
    stunIn = 0;
    const d = doingOf(e.ai);
    const t = e.ai.t, dur = e.ai.step?.dur ?? 1;
    let dx = 0, dz = 0;
    e.speed = 0;
    // it lumbers toward the hero between attacks, never right on top
    if (d === 'rest' || d === 'idle') {
      const dist = Math.hypot(pp.x - model.position.x, pp.z - model.position.z);
      e.heading = dampAngle(e.heading, toHero(), 3, dt);
      if (dist > 5.5 && e.started) { dx = Math.sin(e.heading) * def.glide * dt; dz = Math.cos(e.heading) * def.glide * dt; e.speed = def.glide; }
    } else if (d === 'raise' || d === 'roar' || d === 'gap') e.heading = dampAngle(e.heading, d === 'raise' ? Math.atan2(aim.fist.x - model.position.x, aim.fist.z - model.position.z) : toHero(), 6, dt);
    else if (d === 'call') e.heading = dampAngle(e.heading, toHero(), 2, dt);
    if (d === 'breath' && heroInCone()) pushHero(30 * dt);
    if (e.ai.state !== 'asleep') { mover.move(dx, dz, dt); model.position.copy(mover.feet); }
    model.rotation.y = e.heading;
    draw(d, t, dur, dt);
    pose(d, t, dur, dt);
    flash = Math.max(0, flash - dt);
  };

  function draw(d, t, dur, dt) {
    const live = !G.fainted;
    const k = Math.min(1, t / dur);
    fistMark.visible = live && (d === 'raise' || (d === 'pound' && t < 0.15));
    if (fistMark.visible) {
      fistMark.userData.fill.scale.setScalar(d === 'raise' ? Math.max(0.05, k) : 1);
      fistMark.userData.edge.material.opacity = 0.75 + Math.sin(G.time * 30) * 0.2;
    }
    const n = aim.spots.length;
    shadows.forEach((s, i) => {
      s.visible = live && (d === 'call' || (d === 'fall' && t < 0.2)) && i < n;
      if (!s.visible) return;
      s.position.set(aim.spots[i].x, floor + 0.05, aim.spots[i].z);
      s.userData.set(def.chunks.radius, d === 'call' ? k : 1);
    });
    // the chunks: seen falling in the last moments of the warning, then lying shattered
    const drop = def.chunks.drop;
    chunks.forEach((c, i) => {
      const p = aim.spots[i];
      const falling = p && d === 'call' && dur - t < drop;
      const landed = p && d === 'fall';
      c.visible = live && !!(falling || landed);
      if (!c.visible) return;
      const u = falling ? 1 - (dur - t) / drop : 1;
      c.position.set(p.x, floor + 0.7 + (1 - u * u) * 14, p.z);
      c.rotation.set(i + t * 3, i * 2 + t, 0);
      c.scale.set(1.1, 1.5, 1.0).multiplyScalar(landed ? Math.max(0.05, 1 - t / dur) : 1);
    });
    cone.visible = live && (d === 'inhale' || d === 'breath');
    if (cone.visible) {
      cone.position.set(model.position.x, floor + 0.05, model.position.z);
      cone.rotation.y = aim.heading;
      cone.userData.fill.scale.setScalar(d === 'inhale' ? Math.max(0.05, k) : 1);
      cone.userData.edge.material.opacity = 0.75 + Math.sin(G.time * 30) * 0.2;
    }
    snow.visible = live && d === 'breath';
    if (snow.visible) snow.userData.step(model.position, floor, aim.heading, t, def.blizzard.reach);
    crack.userData.step(dt);
    stars.visible = live && e.dazed;
    stars.position.set(model.position.x, model.position.y + 5.2 + Math.sin(G.time * 6) * 0.1, model.position.z);
    zz.visible = e.ai.state === 'asleep';
    if (zz.visible) zz.position.set(model.position.x + 1, model.position.y + 3 + (G.time % 1.5) * 0.4, model.position.z);
  }

  function pose(d, t, dur, dt) {
    const asleep = e.ai.state === 'asleep';
    let p = 'idle', k = 0;
    if (d === 'raise') { p = 'windup'; k = Math.min(1, t / dur); }
    else if (d === 'pound') { p = 'attack'; }
    else if (d === 'stuck' || d === 'stunned') p = 'dizzy';
    else if (d === 'roar' || d === 'call') { p = 'windup'; k = 0.45 + Math.sin(G.time * 18) * 0.05; }
    else if (d === 'inhale') { p = 'windup'; k = 0.3 * Math.min(1, t / dur); }
    else if (asleep) p = 'asleep';
    fake.state = p; fake.t = p === 'attack' ? t : t; fake.speed = e.speed; fake.def.windup = dur;
    animate(dt, fake, { flash, k: p === 'windup' ? k : null });
    // stuck: bent over, its fists in the ice; the blizzard: jaws wide, head low
    if (d === 'stuck') { rig.body.rotation.x = 0.28; rig.body.position.y = -0.25; }
    if (d === 'breath' || d === 'inhale') { if (rig.jaw) rig.jaw.rotation.x += d === 'breath' ? 0.5 : 0.2 * Math.min(1, t / dur); if (rig.neck) rig.neck.rotation.x += d === 'breath' ? 0.25 : -0.2; }
    if (d === 'call' && rig.neck) rig.neck.rotation.x -= 0.5;
    // the frosty eyes and breath
    flair.eyes.forEach((m) => { m.material.opacity = asleep ? 0 : 0.95; });
    flair.breath(dt, d === 'breath' ? 2 : asleep ? 0 : 0.6);
  }

  // the plate up top: name, hp, the stun gauge, a hint
  G.onUpdate(() => {
    // (only while the hero is at its fight: a woken boss far away, after a
    // teleport, never keeps its plate up)
    const show = (e.started || intro >= 0) && !(e.ai.state === 'asleep' && e.ai.t > 2.5) && G.mode !== 'title' && Math.hypot(G.player.position.x - e.pos.x, G.player.position.z - e.pos.z) < 40;
    if (show) G.hud.bossPlate({ name: `🐻‍❄️ ${def.name}`, hp: e.hp, maxHp: e.maxHp, stun: e.ai.stun, phase: e.ai.phase, hint: e.hint(), dazed: e.dazed });
    else if (e.started || intro >= 0) G.hud.bossPlate(null);
  });

  e.index = G.enemies.length;
  G.enemies.push(e);
  return e;
}

// Frost on the Ice Bear: spikes of ice along its back (on the spine and the
// chest bones, sized against the model's scale), two glowing blue eyes, and
// breath puffs at its mouth. Returns { eyes, breath(dt, strength) }.
export function addFrost(rig) {
  const s = 1 / rig.scale; // bone space is the model's own (×scale outside)
  const ice = new THREE.MeshStandardMaterial({ color: '#d6f2ff', emissive: '#59b6ff', emissiveIntensity: 0.7, flatShading: true, roughness: 0.15, transparent: true, opacity: 0.92 });
  const spikes = [[rig.chest, [[0, 0.32, 0, 0.5, 0], [0.1, 0.28, -0.12, 0.38, 0.25], [-0.1, 0.28, -0.12, 0.38, -0.25]]], [rig.spine, [[0, 0.3, 0, 0.42, 0], [0.09, 0.26, 0.1, 0.32, 0.3], [-0.09, 0.26, 0.1, 0.32, -0.3]]]];
  for (const [bone, list] of spikes) {
    if (!bone) continue;
    for (const [x, y, z, h, lean] of list) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.07, h, 5), ice);
      m.position.set(x, y + h / 2 - 0.05, z);
      m.rotation.z = lean;
      m.castShadow = true;
      bone.add(m);
    }
  }
  void s;
  const eyeMat = () => new THREE.MeshBasicMaterial({ color: '#8fe6ff', transparent: true, opacity: 0.95 });
  const eyes = [];
  if (rig.head) for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), eyeMat());
    m.position.set(sx * 0.085, 0.1, 0.17);
    rig.head.add(m);
    eyes.push(m);
  }
  // breath: soft white puffs drifting out of its mouth
  const puffMat = new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#e8f7ff', transparent: true, opacity: 0.5, depthWrite: false });
  const puffs = Array.from({ length: 5 }, (_, i) => { const p = new THREE.Sprite(puffMat.clone()); p.userData.k = i / 5; p.raycast = () => {}; rig.head?.add(p); return p; });
  let t = 0;
  const breath = (dt, strength) => {
    t += dt * (0.6 + strength * 0.5);
    for (const p of puffs) {
      const u = (t * 0.7 + p.userData.k) % 1;
      p.position.set(Math.sin(p.userData.k * 9) * 0.04, 0.02 + u * 0.06, 0.28 + u * 0.35 * (1 + strength));
      p.scale.setScalar((0.08 + u * 0.18) * (0.6 + strength * 0.5));
      p.material.opacity = strength > 0 ? 0.55 * Math.sin(u * Math.PI) : 0;
    }
  };
  return { eyes, breath };
}

// where ice will fall: a dark shadow growing on the ice under a red edge
function shadowMark() {
  const g = new THREE.Group();
  const matOf = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const edge = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2), matOf('#ff2a2a', 0.85));
  const shade = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), matOf('#0b1a2e', 0.5));
  shade.position.y = 0.005;
  g.add(edge, shade);
  for (const o of [edge, shade]) o.renderOrder = 5;
  g.userData.set = (r, k) => { g.scale.setScalar(r); shade.scale.setScalar(Math.max(0.1, k)); shade.material.opacity = 0.35 + k * 0.4; edge.material.opacity = 0.7 + Math.sin(performance.now() / 33) * 0.2; };
  g.visible = false;
  g.name = 'iceShadow';
  return g;
}

// white cracks spreading round where the fists went into the ice, fading
function crackRing() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3;
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + (k % 3) * 0.2;
    ctx.beginPath(); ctx.moveTo(64, 64);
    let x = 64, y = 64;
    for (let s = 0; s < 4; s++) { x += Math.cos(a + (s % 2 ? 0.3 : -0.25)) * 14; y += Math.sin(a + (s % 2 ? 0.3 : -0.25)) * 14; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3 }));
  m.renderOrder = 4;
  m.visible = false;
  m.name = 'iceCrack';
  let t = 9;
  m.userData.at = (p, y) => { m.position.set(p.x, y + 0.04, p.z); m.rotation.y = Math.random() * 6; t = 0; };
  m.userData.step = (dt) => { t += dt; m.visible = t < 5; if (m.visible) { m.scale.setScalar(4 + Math.min(1, t * 6) * 4); m.material.opacity = Math.min(1, 5 - t); } };
  return m;
}

// the blizzard: snow streaking out along the cone, low over the ice
function blizzardStreaks() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: '#f4fbff', transparent: true, opacity: 0.8, depthWrite: false, fog: false });
  const bits = Array.from({ length: 30 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.1), mat);
    m.userData = { a: ((i % 7) / 6 - 0.5), y: 0.4 + (i % 4) * 0.55, off: i / 30 };
    g.add(m);
    return m;
  });
  g.userData.step = (at, floor, heading, t, reach) => {
    g.position.set(at.x, floor, at.z);
    g.rotation.y = heading;
    for (const b of bits) {
      const u = (t * 1.5 + b.userData.off) % 1;
      const ang = b.userData.a * 0.95;
      const r = 2 + u * (reach - 2);
      b.position.set(Math.sin(ang) * r, b.userData.y, Math.cos(ang) * r);
      b.rotation.y = ang;
    }
  };
  g.visible = false;
  g.name = 'blizzard';
  return g;
}
