import * as THREE from 'three';
import { BOSSES } from '../../data/bosses.js';
import { ITEMS } from '../../data/items.js';
import { textSprite } from '../enemy.js';
import { instance, whenReady } from '../../world/models.js';
import { newBossAI, stepBoss, doingOf, isDazed } from './chiefAI.js';
import { crystalKingSteps } from './crystalKingAI.js';
import { coneMark } from './rabbitChief.js';
import { damageHp } from '../../combat/hits.js';
import { dampAngle } from '../../player/movement.js';
import { rng, subSeed } from '../../core/rng.js';
import { softGlowTexture } from '../../world/glow.js';
import { sfx } from '../../audio/sound.js';

// W4: the Crystal King (GDD §3.3), the last boss, on the heart's platform
// deep in the Crystal Heart. Procedural: a body of faceted violet crystal
// floating over the floor, a bright crystal in his chest (bare when he is
// tired), a crystal head with glowing eyes and Polyfork's crown, two big
// crystal fists floating at his sides and shards circling him. The pure
// scheduler (chiefAI.js stepBoss with crystalKingAI.js) picks the steps;
// this body draws every attack first (the laser's wedge and the line where
// the beam starts, the spikes' circles, the rings where animals will rise),
// hurts only inside what it drew, and after a laser or the spikes slumps to
// the floor, tired (💫: the hammer ×2, the water gun ×3 on his bare chest).
// Phase 2 on he calls crystal-tinted animals (`summon(kind, at)`, given by
// the expedition). The plate up top shows hp, the stun gauge and a hint.
const HERO_RADIUS = 0.3;
const HOVER = 0.9; // m his body floats over the floor
const hintOf = {
  intro: '크리스탈 킹이 나타났어요!', idle: null, rest: null,
  aim: '레이저! 빨간 부채꼴 밖으로!', sweep: '레이저가 지나가요!',
  tired: '지쳤어요! 가슴의 수정을 망치로!', stunned: '넘어졌어요! 지금 망치로!',
  call: '바닥에서 수정 가시가 솟아요! 원 밖으로!', erupt: '수정 가시!',
  raise: '동물들을 부르고 있어요!', roar: '화가 났어요! 더 빨라져요!', asleep: '쿨쿨… 잠들었어요',
};

export function createCrystalKing(G, { x, z, heading = 0, center: at = { x: 0, z: 0 }, arena: ARENA = 13, floor = 0, summon = null }) {
  const def = BOSSES.crystalKing;
  const { model, rig } = buildKing();
  model.name = 'crystalKing';
  rig.body.scale.setScalar(1.25); // (bigger than every boss before him)
  const home = new THREE.Vector3(x, floor, z);
  const center = new THREE.Vector3(at.x, floor, at.z);
  model.position.copy(home);
  model.rotation.y = heading;
  G.scene.add(model);
  G.look.shadows(model);
  const mover = G.physics.createMover({ x, y: floor, z, radius: 1.5, height: 3.2 });
  const glowSrc = G.addLight({ pos: () => model.position.clone().setY(floor + 3), color: '#b07bff', intensity: 12, distance: 18 });

  // the telegraphs: the laser's wedge (one per phase: its arc grows) and its
  // beam line, five spike circles, three summoning rings
  const wedges = def.laser.arc.map((a) => coneMark(def.laser.reach, a));
  const beamLine = lineMark(def.laser.reach);
  const arrows = def.laser.arc.map((a) => sweepArrow(a)); // (W5: which way the beam will sweep)
  const circles = [0, 1, 2, 3, 4].map(() => spikeMark());
  const rings = [0, 1, 2].map(() => summonMark());
  const stars = textSprite('💫', 2.2);
  const zz = textSprite('Zz', 1.6, '#d9ccff');
  G.scene.add(...wedges, beamLine, ...arrows, ...circles, ...rings, stars, zz);
  // the beam itself and the spikes that burst up
  const beam = laserBeam(def.laser.reach);
  G.scene.add(beam);
  const spikes = circles.map(() => spikeBurst());
  for (const s of spikes) G.scene.add(s);

  const rand = rng(subSeed(G.run.seed, 9400));
  const e = {
    kind: 'crystalKing', isBoss: true, def, name: def.name, model, mover, home,
    size: def.size, hp: def.hp, maxHp: def.hp,
    ai: newBossAI(), heading, speed: 0,
    knock: new THREE.Vector2(), gone: false, wetUntil: -Infinity,
    started: false, summons: [],
    get doing() { return doingOf(e.ai); },
    get state() { return e.ai.state === 'asleep' ? 'asleep' : doingOf(e.ai); },
    get phase() { return e.ai.phase; },
    get stun() { return e.ai.stun; },
    get dazed() { return isDazed(e.ai); },
    get tired() { return !!e.ai.step?.tired; },
    get pos() { return model.position; },
    get active() { return !e.gone && e.started && e.ai.state !== 'asleep'; },
    hint: () => hintOf[doingOf(e.ai)] ?? def.hint,
    marks: { wedges, beamLine, circles, rings }, // (for checks)
  };
  // what this pattern aims at
  const aim = { from: 0, to: 0, arc: 70, spots: [], rises: [], hit: false };
  let stunIn = 0, flash = 0;

  // his chest is the target (it sits a little forward and up)
  G.addHittable({
    enemy: e, radius: def.size[0],
    enabled: () => e.started && e.ai.state !== 'asleep',
    pos: () => model.position.clone().setY(model.position.y + 1.4),
    onHit: (o) => e.hurt(o),
  });
  e.hurt = ({ damage = 1, kind: by = 'hammer' }) => {
    if (!e.started || e.ai.state === 'asleep') return false;
    const dazed = isDazed(e.ai), tired = e.tired;
    let dmg = damage;
    if (by === 'hammer') { if (dazed) dmg *= def.hammerBonus; stunIn += dazed ? def.stun.dazedHammer : def.stun.hammer; }
    else if (by === 'water') { if (tired) dmg *= def.itemBonus; stunIn += def.stun.water; e.wetUntil = G.time + ITEMS.waterGun.wet; }
    else stunIn += def.stun.hammer * 0.5;
    e.hp = damageHp(e.hp, dmg);
    flash = 0.2;
    if (by !== 'water') sfx.bonk();
    G.discover?.('crystalKing');
    G.emit('enemyHit', { enemy: e, damage: dmg, by, dazed, tired });
    return true;
  };
  e.bind = () => {
    if (!e.started || e.ai.state === 'asleep') return false;
    stunIn += def.stun.vine * (e.tired ? 1.6 : 1);
    flash = 0.2;
    G.emit('bossTangled', { enemy: e });
    return true;
  };

  // What its telegraphs cover now (null: nothing), like the animals' hazard()
  e.hazard = () => {
    const d = doingOf(e.ai);
    const left = (e.ai.step?.dur ?? 0) - e.ai.t;
    const out = [];
    if (d === 'aim' || d === 'sweep') out.push({ kind: 'laser', shape: 'cone', x: model.position.x, z: model.position.z, heading: (aim.from + aim.to) / 2, r: def.laser.reach, arc: aim.arc, hitAt: G.time + (d === 'aim' ? left : 0) });
    if ((d === 'call' || d === 'erupt') && e.ai.pattern === 'spikes') for (const p of aim.spots) out.push({ kind: 'spike', shape: 'circle', x: p.x, z: p.z, r: def.spikes.radius, hitAt: G.time + (d === 'call' ? left : 0) });
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
  // spike circles round the hero: the first on the hero, the rest round,
  // never under him (a place to stand by his side) nor on each other
  function spotsAround(n, r) {
    const pp = G.player.position;
    const out = [inArena({ x: pp.x, z: pp.z }, r)];
    for (let k = 0; out.length < n && k < 80; k++) {
      const a = rand() * Math.PI * 2, d = r * 2.2 + rand() * 6;
      const p = inArena({ x: pp.x + Math.cos(a) * d, z: pp.z + Math.sin(a) * d }, r);
      if (out.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < r * 2 + 1.4)) continue;
      if (Math.hypot(p.x - model.position.x, p.z - model.position.z) < r + def.size[0] + 1.5) continue;
      out.push(p);
    }
    const f = out[0], dq = Math.hypot(f.x - model.position.x, f.z - model.position.z), keep = r + def.size[0] + 1.5;
    if (dq < keep) { const k = keep / Math.max(0.1, dq); f.x = model.position.x + (f.x - model.position.x) * k; f.z = model.position.z + (f.z - model.position.z) * k; inArena(f, r); }
    return out;
  }
  // where animals rise: on the far side of the platform from the hero, apart
  function risesAround(n) {
    const out = [];
    const away = toHero() + Math.PI;
    for (let k = 0; out.length < n && k < 40; k++) {
      const a = away + (rand() - 0.5) * 2.4, d = ARENA * (0.45 + rand() * 0.35);
      const p = inArena({ x: center.x + Math.sin(a) * d, z: center.z + Math.cos(a) * d }, 2);
      if (out.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 3)) continue;
      if (Math.hypot(p.x - G.player.position.x, p.z - G.player.position.z) < 5) continue;
      out.push(p);
    }
    return out;
  }
  const awakeSummons = () => e.summons.filter((s) => !s.gone && s.state !== 'asleep');

  function onStep(step) {
    const name = step.name;
    if (name === 'aim') {
      // the beam will sweep across the hero, from one side of it to the other
      const h = toHero();
      aim.arc = step.arc ?? def.laser.arc[0];
      const half = THREE.MathUtils.degToRad(aim.arc) / 2;
      const dirn = rand() < 0.5 ? 1 : -1;
      aim.from = h - half * dirn; aim.to = h + half * dirn;
      aim.dirn = dirn;
      e.heading = aim.from;
      aim.hit = false;
      tele('laser');
      sfx.power?.();
    }
    if (name === 'sweep') { attack('laser'); sfx.dash?.(); sfx.gust?.(); G.cam?.shake(0.3); }
    if (name === 'tired') { sfx.stun(); G.emit('kingTired', { at: G.time, after: e.ai.pattern }); }
    if (name === 'call' && !step.summon) {
      aim.spots = spotsAround(step.n ?? 3, def.spikes.radius);
      tele('spike');
      sfx.growl?.();
      G.cam?.shake(0.2);
    }
    if (name === 'erupt') {
      attack('spike');
      sfx.slam?.();
      G.cam?.shake(0.45);
      const pp = G.player.position;
      const hit = aim.spots.find((p) => Math.hypot(pp.x - p.x, pp.z - p.z) < def.spikes.radius + HERO_RADIUS);
      if (hit) hurtHero('spike', new THREE.Vector3(hit.x, floor, hit.z));
      aim.spots.forEach((p, i) => spikes[i].userData.burst(p, floor));
    }
    if (name === 'raise') {
      const room = Math.max(0, def.summon.max - awakeSummons().length);
      aim.rises = risesAround(Math.min(step.n ?? 2, room));
      G.emit('bossTelegraph', { kind: 'summon', at: G.time, phase: e.ai.phase, harmless: true });
      sfx.roar?.();
    }
    if (name === 'call' && step.summon) {
      for (const [i, p] of aim.rises.entries()) {
        const kind = def.summon.kinds[(i + e.summons.length) % def.summon.kinds.length];
        const a = summon?.(kind, { x: p.x, z: p.z, heading: Math.atan2(G.player.position.x - p.x, G.player.position.z - p.z) });
        if (a) e.summons.push(a);
      }
      if (aim.rises.length) { G.emit('kingSummoned', { n: aim.rises.length, at: G.time }); sfx.ting?.(); }
      aim.rises = [];
    }
    if (name === 'roar') {
      sfx.roar?.();
      G.cam?.shake(0.6);
      G.toast(e.ai.phase === 2 ? '💎 크리스탈 킹이 동물들을 불러요! 조심해요!' : '💎 크리스탈 킹이 화가 났어요! 더 빨라져요!', 3200);
    }
  }
  // the beam's heading now (during the sweep)
  const beamAt = (k) => aim.from + (aim.to - aim.from) * k;
  function heroInBeam(a) {
    const pp = G.player.position, p = model.position;
    const dx = pp.x - p.x, dz = pp.z - p.z;
    const along = dx * Math.sin(a) + dz * Math.cos(a), side = Math.abs(dx * Math.cos(a) - dz * Math.sin(a));
    return along > 0 && along < def.laser.reach && side < def.laser.width / 2 + HERO_RADIUS;
  }

  function onEvent(ev) {
    if (ev.type === 'step') onStep(ev.step);
    if (ev.type === 'phase') G.emit('bossPhase', { phase: ev.phase, at: G.time, hp: e.hp });
    if (ev.type === 'stunned') { sfx.stun(); G.toast('💎 크리스탈 킹이 넘어졌어요! 지금 망치로!', 2400); G.emit('bossStunned', { at: G.time }); }
    if (ev.type === 'asleep') {
      mover.setEnabled(false);
      sfx.stun();
      G.run.asleep = (G.run.asleep ?? 0) + 1;
      G.emit('enemyAsleep', e);
      G.emit('bossDefeated', e);
    }
    if (ev.type === 'step') G.emit('bossStep', { name: ev.step.name, pattern: ev.pattern ?? null, at: G.time, phase: e.ai.phase });
  }

  // the intro: a short look at him (GDD §5.1), his name card
  let intro = -1;
  e.beginIntro = () => {
    if (intro >= 0 || e.started) return;
    intro = 0;
    G.beginCutscene();
    G.pointer?.cancel();
    const look = model.position.clone().setY(floor + 3.2);
    const to = look.clone().add(new THREE.Vector3(Math.sin(Math.PI / 4), 0.55, Math.cos(Math.PI / 4)).normalize().multiplyScalar(17));
    G.cam?.fly(to, look, 0.9);
    G.hud.card(`<h2>💎 ${def.name}</h2><p>수정의 심장을 지키는 왕<br>큰 공격 뒤에 지쳐서 주저앉으면 가슴의 수정을 망치로!</p>`, 3000);
    sfx.roar?.();
  };
  const INTRO = 3.2;
  G.onUpdate((dt) => {
    if (intro < 0 || e.started) return;
    intro += dt;
    if (intro > 1.3 && intro - dt <= 1.3) { G.cam?.shake(0.6); sfx.stomp?.(); }
    pose('intro', intro, INTRO, dt);
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
    for (const ev of stepBoss(e.ai, { hp: e.hp, maxHp: e.maxHp, started: e.started, stun: stunIn }, dt, def, rand, crystalKingSteps)) onEvent(ev);
    stunIn = 0;
    const d = doingOf(e.ai);
    const t = e.ai.t, dur = e.ai.step?.dur ?? 1;
    let dx = 0, dz = 0;
    e.speed = 0;
    // he floats toward the hero between attacks, never right on top
    if (d === 'rest' || d === 'idle') {
      const dist = Math.hypot(pp.x - model.position.x, pp.z - model.position.z);
      e.heading = dampAngle(e.heading, toHero(), 3, dt);
      if (dist > 6 && e.started) { dx = Math.sin(e.heading) * def.glide * dt; dz = Math.cos(e.heading) * def.glide * dt; e.speed = def.glide; }
    } else if (d === 'aim') e.heading = dampAngle(e.heading, aim.from, 8, dt);
    else if (d === 'sweep') {
      const a = beamAt(Math.min(1, t / dur));
      e.heading = a;
      if (!aim.hit && heroInBeam(a)) { aim.hit = true; hurtHero('laser', model.position); }
    } else if (d === 'call' || d === 'raise' || d === 'roar') e.heading = dampAngle(e.heading, toHero(), 2.5, dt);
    if (e.ai.state !== 'asleep') { mover.move(dx, dz, dt); model.position.copy(mover.feet); }
    model.rotation.y = e.heading;
    draw(d, t, dur);
    pose(d, t, dur, dt);
    flash = Math.max(0, flash - dt);
    glowSrc.intensity = e.ai.state === 'asleep' ? 3 : e.tired ? 20 : 12;
  };

  function draw(d, t, dur) {
    const live = !G.fainted;
    const k = Math.min(1, t / dur);
    const w = wedges[def.laser.arc.indexOf(aim.arc)] ?? wedges[0];
    for (const m of wedges) m.visible = false;
    w.visible = live && (d === 'aim' || d === 'sweep');
    if (w.visible) {
      w.position.set(model.position.x, floor + 0.05, model.position.z);
      w.rotation.y = (aim.from + aim.to) / 2;
      w.userData.fill.scale.setScalar(d === 'aim' ? Math.max(0.05, k) : 1);
      w.userData.edge.material.opacity = 0.75 + Math.sin(G.time * 30) * 0.2;
    }
    const arrow = arrows[def.laser.arc.indexOf(aim.arc)] ?? arrows[0];
    for (const m of arrows) m.visible = false;
    arrow.visible = live && d === 'aim';
    if (arrow.visible) { arrow.position.set(model.position.x, floor + 0.09, model.position.z); arrow.rotation.y = (aim.from + aim.to) / 2; arrow.userData.set(aim.dirn ?? 1, k); }
    beamLine.visible = live && d === 'aim';
    if (beamLine.visible) { beamLine.position.set(model.position.x, floor + 0.07, model.position.z); beamLine.rotation.y = aim.from; beamLine.userData.set(k); }
    beam.visible = live && d === 'sweep';
    if (beam.visible) { beam.position.set(model.position.x, floor + 1.7, model.position.z); beam.rotation.y = e.heading; beam.userData.step(t); }
    const n = aim.spots.length;
    circles.forEach((c, i) => {
      c.visible = live && (d === 'call' || (d === 'erupt' && t < 0.15)) && i < n && e.ai.pattern === 'spikes';
      if (!c.visible) return;
      c.position.set(aim.spots[i].x, floor + 0.05, aim.spots[i].z);
      c.userData.set(def.spikes.radius, d === 'call' ? k : 1);
    });
    for (const s of spikes) s.userData.step();
    rings.forEach((r, i) => {
      r.visible = live && d === 'raise' && i < aim.rises.length;
      if (!r.visible) return;
      r.position.set(aim.rises[i].x, floor + 0.06, aim.rises[i].z);
      r.userData.set(k);
    });
    stars.visible = live && e.dazed;
    stars.position.set(model.position.x, model.position.y + (e.tired ? 3.6 : 5.6) + Math.sin(G.time * 6) * 0.1, model.position.z);
    zz.visible = e.ai.state === 'asleep';
    if (zz.visible) zz.position.set(model.position.x + 1, model.position.y + 2.4 + (G.time % 1.5) * 0.4, model.position.z);
  }

  // the body: hovering, fists at his sides; aiming, fists up and chest
  // blazing; tired, slumped on the floor with his chest bare; asleep, lying
  // still, the crystal dim
  let sink = 0, slump = 0, lift = 0, dim = 0;
  function pose(d, t, dur, dt) {
    const asleep = e.ai.state === 'asleep';
    const k = Math.min(1, t / Math.max(0.01, dur));
    const tired = d === 'tired' || d === 'stunned';
    sink += ((tired ? 1 : asleep ? 1.2 : 0) - sink) * Math.min(1, dt * 5);
    slump += ((tired ? 1 : asleep ? 1.5 : 0) - slump) * Math.min(1, dt * 5);
    lift += (((d === 'aim' || d === 'raise' || d === 'intro') ? 1 : d === 'sweep' ? 0.8 : 0) - lift) * Math.min(1, dt * 6);
    dim += ((asleep ? 1 : 0) - dim) * Math.min(1, dt * 1.5);
    const bob = asleep ? 0 : Math.sin(G.time * 1.8) * 0.15;
    rig.body.position.y = HOVER * (1 - sink) + bob;
    rig.body.rotation.x = slump * 0.45;
    rig.body.rotation.z = asleep ? dim * 1.2 : 0;
    // the fists: hanging at his sides, raised when he aims or calls, on the
    // floor when he is tired; during the sweep they point along the beam
    for (const [i, f] of rig.fists.entries()) {
      const side = i ? 1 : -1;
      const base = f.userData.base;
      f.position.set(side * (1.7 + lift * 0.4), base.y + lift * 1.6 - sink * 1.3 + Math.sin(G.time * 2.2 + i) * 0.12, base.z + (d === 'sweep' ? 0.9 : 0));
      f.rotation.set(G.time * 0.6 * side, G.time * 0.8, lift * 0.6 * side);
    }
    // shards circle him (faster when angry)
    const spin = e.ai.phase === 3 ? 1.6 : 1;
    rig.shards.forEach((s, i) => {
      const a = G.time * 0.9 * spin + (i / rig.shards.length) * Math.PI * 2;
      s.position.set(Math.cos(a) * 2.4, 2.2 + Math.sin(G.time * 1.3 + i) * 0.4 - sink * 1.2, Math.sin(a) * 2.4);
      s.rotation.y = a;
    });
    // the chest crystal: bright when he aims (charging) and blazing when bare (tired)
    const chest = rig.chestMat;
    chest.emissiveIntensity = asleep ? 0.2 : tired ? 2.6 + Math.sin(G.time * 10) * 0.6 : d === 'aim' ? 1.2 + k * 2 : 1.0;
    rig.chest.scale.setScalar(tired ? 1.35 : 1);
    rig.chestGlow.material.opacity = asleep ? 0.05 : tired ? 0.9 : d === 'aim' ? 0.4 + k * 0.5 : 0.35;
    rig.bodyMat.emissiveIntensity = (asleep ? 0.12 : 0.55) + flash * 3;
    rig.eyes.forEach((m) => { m.material.opacity = asleep ? 0 : tired ? 0.45 : 1; });
    void dt;
  }

  // the plate up top: name, hp, the stun gauge, a hint
  G.onUpdate(() => {
    // (only while the hero is at its fight: a woken boss far away, after a
    // teleport, never keeps its plate up)
    const show = (e.started || intro >= 0) && !(e.ai.state === 'asleep' && e.ai.t > 2.5) && G.mode !== 'title' && Math.hypot(G.player.position.x - e.pos.x, G.player.position.z - e.pos.z) < 40;
    if (show) G.hud.bossPlate({ name: `💎 ${def.name}`, hp: e.hp, maxHp: e.maxHp, stun: e.ai.stun, phase: e.ai.phase, hint: e.hint(), dazed: e.dazed });
    else if (e.started || intro >= 0) G.hud.bossPlate(null);
  });

  e.index = G.enemies.length;
  G.enemies.push(e);
  return e;
}

// --- his body: faceted crystal, parts named on `rig`
// (W5: the codex draws him too, ui/thumbs.js)
export function buildKing() {
  const model = new THREE.Group();
  const body = new THREE.Group();
  model.add(body);
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#8a5ad8', emissive: '#4a1aa0', emissiveIntensity: 0.55, flatShading: true, roughness: 0.18, metalness: 0.15 });
  const paleMat = new THREE.MeshStandardMaterial({ color: '#d9c2ff', emissive: '#7a4ae0', emissiveIntensity: 0.5, flatShading: true, roughness: 0.2 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#3e2470', emissive: '#22104a', emissiveIntensity: 0.4, flatShading: true, roughness: 0.3 });
  const mesh = (g, m, x, y, z, s = [1, 1, 1]) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.scale.set(...s); o.castShadow = true; return o; };
  // a skirt of crystal points down to the floor, a broad faceted torso
  const skirt = mesh(new THREE.ConeGeometry(1.25, 1.6, 7).rotateX(Math.PI), darkMat, 0, 0.75, 0);
  const torso = mesh(new THREE.IcosahedronGeometry(1, 0), bodyMat, 0, 2.05, 0, [1.25, 1.35, 0.95]);
  const shoulders = [-1, 1].map((s) => mesh(new THREE.OctahedronGeometry(0.62, 0), paleMat, s * 1.15, 2.75, 0, [1, 1.5, 1]));
  shoulders.forEach((m, i) => { m.rotation.z = (i ? -1 : 1) * 0.5; });
  // the chest crystal (his weak point) and its glow
  const chestMat = new THREE.MeshStandardMaterial({ color: '#ffe6ff', emissive: '#ff6af0', emissiveIntensity: 1, flatShading: true, roughness: 0.1 });
  const chest = mesh(new THREE.OctahedronGeometry(0.42, 0), chestMat, 0, 2.15, 0.82, [0.9, 1.3, 0.7]);
  const chestGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#ff8af6', transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
  chestGlow.scale.setScalar(2.6); chestGlow.position.set(0, 2.15, 0.95); chestGlow.raycast = () => {};
  // the head: a long crystal, two eyes, Polyfork's crown
  const head = mesh(new THREE.OctahedronGeometry(0.62, 0), paleMat, 0, 3.55, 0.05, [0.95, 1.3, 0.85]);
  const eyeMat = () => new THREE.MeshBasicMaterial({ color: '#fff4ff', transparent: true, opacity: 1 });
  const eyes = [-1, 1].map((s) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), eyeMat()); m.position.set(s * 0.2, 3.62, 0.5); return m; });
  const eyeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#e0b8ff', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  eyeGlow.scale.set(1.4, 0.7, 1); eyeGlow.position.set(0, 3.62, 0.6); eyeGlow.raycast = () => {};
  let crown;
  try {
    crown = instance('crown');
    crown.scale.setScalar(5.2);
    whenReady(crown, () => crown.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); if (o.material.emissive) { o.material.emissive.set('#a8740c'); o.material.emissiveIntensity = 0.45; } } }));
  } catch {
    crown = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.4, 8, 1, true), new THREE.MeshStandardMaterial({ color: '#ffcf4a', emissive: '#a8740c', emissiveIntensity: 0.6, side: THREE.DoubleSide }));
  }
  crown.position.set(0, 4.18, 0.05);
  body.add(skirt, torso, ...shoulders, chest, chestGlow, head, ...eyes, eyeGlow, crown);
  // floating fists
  const fists = [-1, 1].map((s) => {
    const f = new THREE.Group();
    f.add(mesh(new THREE.OctahedronGeometry(0.7, 0), bodyMat, 0, 0, 0, [1, 1.25, 1]));
    f.add(mesh(new THREE.TetrahedronGeometry(0.4, 0), paleMat, 0, 0.6, 0.2));
    f.userData.base = new THREE.Vector3(s * 1.7, 1.7, 0.4);
    f.position.copy(f.userData.base);
    body.add(f);
    return f;
  });
  // shards circling him
  const shards = Array.from({ length: 6 }, (_, i) => { const m = mesh(new THREE.OctahedronGeometry(0.22, 0), i % 2 ? paleMat : chestMat, 0, 2, 0, [1, 2, 1]); body.add(m); return m; });
  model.traverse((o) => { o.raycast = o.isSprite ? () => {} : o.raycast; });
  return { model, rig: { body, fists, shards, chest, chestMat, chestGlow, bodyMat, eyes } };
}

// the line where the beam starts: bright, flickering, filling outward
function lineMark(reach) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: '#ffd0ff', transparent: true, opacity: 0.9, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 });
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), mat); // (W5: wider, it reads from the far camera)
  strip.renderOrder = 6;
  g.add(strip);
  g.userData.set = (k) => { strip.scale.set(1, 1, Math.max(0.05, k) * reach); mat.opacity = 0.6 + Math.sin(performance.now() / 30) * 0.3; };
  g.visible = false;
  g.name = 'laserLine';
  return g;
}
// W5: which way the beam will sweep: a bright arc across the wedge with an
// arrowhead at the end it sweeps to (kids read "it comes from there")
function sweepArrow(arc) {
  const a = THREE.MathUtils.degToRad(arc), R = 5.2;
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: '#fff27a', transparent: true, opacity: 0.9, depthWrite: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 });
  const band = new THREE.Mesh(new THREE.RingGeometry(R - 0.22, R + 0.22, 32, 1, Math.PI / 2 - a / 2, a).rotateX(-Math.PI / 2).rotateY(Math.PI), mat);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.5, 3).rotateX(Math.PI / 2), mat);
  band.renderOrder = head.renderOrder = 6;
  g.add(band, head);
  // dirn: +1 sweeps toward +heading; k: how far the warning has run (it pulses faster)
  g.userData.set = (dirn, k) => {
    const end = dirn * a / 2;
    head.position.set(Math.sin(end) * R, 0, Math.cos(end) * R);
    head.rotation.y = end + dirn * Math.PI / 2;
    mat.opacity = 0.65 + Math.sin(performance.now() / (60 - k * 30)) * 0.3;
  };
  g.visible = false;
  g.name = 'laserSweep';
  return g;
}
// the beam: a glowing bar from his chest out along his heading
function laserBeam(reach) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, reach, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, reach / 2), new THREE.MeshBasicMaterial({ color: '#fff0ff', transparent: true, opacity: 0.95, depthWrite: false, fog: false }));
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, reach, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, reach / 2), new THREE.MeshBasicMaterial({ color: '#d266ff', transparent: true, opacity: 0.45, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  core.raycast = glow.raycast = () => {};
  g.add(core, glow);
  g.userData.step = (t) => { glow.material.opacity = 0.35 + Math.sin(t * 40) * 0.12; g.scale.set(1, 1 + Math.sin(t * 50) * 0.08, 1); };
  g.visible = false;
  g.name = 'laserBeam';
  return g;
}
// where spikes will burst: a purple disc under a red edge (scale = radius)
function spikeMark() {
  const g = new THREE.Group();
  const matOf = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const edge = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 36).rotateX(-Math.PI / 2), matOf('#ff2a2a', 0.85));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2), matOf('#b04cff', 0.5));
  fill.position.y = 0.005;
  g.add(edge, fill);
  for (const o of [edge, fill]) o.renderOrder = 5;
  g.userData.set = (r, k) => { g.scale.setScalar(r); fill.scale.setScalar(Math.max(0.1, k)); fill.material.opacity = 0.35 + k * 0.4; edge.material.opacity = 0.7 + Math.sin(performance.now() / 33) * 0.2; };
  g.visible = false;
  g.name = 'spikeMark';
  return g;
}
// crystal spikes bursting out of the floor, then sinking back
let spikeGeo = null, spikeMat = null;
export function spikeBurst() {
  spikeGeo ??= new THREE.ConeGeometry(0.28, 1.9, 5).translate(0, 0.95, 0);
  spikeMat ??= new THREE.MeshStandardMaterial({ color: '#e2c8ff', emissive: '#9a4cff', emissiveIntensity: 1.0, flatShading: true, roughness: 0.15 });
  const g = new THREE.Group();
  const list = [[0, 0, 1.2, 0], [0.55, 0.2, 0.9, 0.35], [-0.5, 0.3, 0.85, -0.3], [0.15, -0.6, 0.8, 0.25], [-0.3, -0.45, 0.7, -0.4], [0.7, -0.35, 0.6, 0.5]];
  for (const [x, z, s, lean] of list) { const m = new THREE.Mesh(spikeGeo, spikeMat); m.position.set(x, 0, z); m.scale.setScalar(s); m.rotation.set(lean * 0.6, x * 3, lean); m.castShadow = true; g.add(m); }
  g.visible = false;
  g.name = 'crystalSpikes';
  let t = 9;
  g.userData.burst = (p, y) => { g.position.set(p.x, y, p.z); g.rotation.y = Math.random() * 6; t = 0; };
  g.userData.step = () => {
    t += 1 / 60;
    g.visible = t < 1.4;
    if (!g.visible) return;
    const up = t < 0.12 ? t / 0.12 : t > 0.9 ? Math.max(0, 1 - (t - 0.9) / 0.5) : 1;
    g.scale.set(1, Math.max(0.01, up), 1);
  };
  return g;
}
// a ring where an animal will rise (purple, harmless)
function summonMark() {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#c08aff', transparent: true, opacity: 0.8, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  m.renderOrder = 5;
  m.visible = false;
  m.name = 'summonRing';
  m.userData.set = (k) => { m.scale.setScalar(0.6 + k * 0.8); m.rotation.y = k * 4; m.material.opacity = 0.5 + k * 0.4; };
  return m;
}
