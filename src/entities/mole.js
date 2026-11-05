import * as THREE from 'three';
import { ENEMIES } from '../data/enemies.js';
import { ITEMS } from '../data/items.js';
import { newMoleAI, stepMole, underground, exposed } from './moleAI.js';
import { textSprite, dropShard } from './enemy.js';
import { addOutline } from './outline.js';
import { damageHp } from '../combat/hits.js';
import { sfx } from '../audio/sound.js';

// M6a: the mole monster (GDD §3.2 특수형). Its brain is moleAI.js; this is
// the body. Underground it is a mound of earth that runs at the hero; it
// stops, a red circle shows where it will burst out (the mound rushes there
// and shakes), it pops up (a heart if it catches the hero inside the
// circle), stays up a moment blinking (the hammer's chance) and digs down
// again. Water into the mound floods it out: up and stunned (💫, wet), the
// hammer's chance again. It lives in G.enemies like any animal; the hammer
// only finds it while it is up (its hittable is off underground).
const DEEP = -1.1; // m: where its body waits under the floor
const SLEEP_FADE_AT = 3.5, SLEEP_FADE = 1.5;

const mats = new Map();
const mat = (hex, extra = {}) => {
  const k = hex + JSON.stringify(extra);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: hex, flatShading: true, roughness: 0.9, ...extra }));
  return mats.get(k);
};

// the mole: a round dark body, a pale belly, a pink star nose, beady eyes,
// big shovel claws and a purple crystal on its head (the cave's power)
export function createMoleModel() {
  const g = new THREE.Group();
  g.name = 'moleBody';
  const fur = { emissive: '#1a1020', emissiveIntensity: 0.6 };
  const add = (geo, color, p, extra) => { const m = new THREE.Mesh(geo, mat(color, extra)); m.position.set(...p); m.castShadow = true; g.add(m); return m; };
  const body = add(new THREE.IcosahedronGeometry(0.48, 1), '#5a4458', [0, 0.45, 0], fur);
  body.scale.set(1, 0.92, 1.1);
  add(new THREE.IcosahedronGeometry(0.34, 1), '#c9a9b9', [0, 0.38, 0.22], fur).scale.set(1, 1, 0.7);
  add(new THREE.IcosahedronGeometry(0.11, 1), '#ff8fb0', [0, 0.52, 0.52], { emissive: '#a03a60', emissiveIntensity: 0.6 });
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(0.045, 8, 6), '#120a10', [s * 0.15, 0.66, 0.42], { roughness: 0.3 });
    const claw = add(new THREE.BoxGeometry(0.2, 0.06, 0.18), '#efe2cf', [s * 0.42, 0.3, 0.3], { emissive: '#4a3a30', emissiveIntensity: 0.4 });
    claw.rotation.set(0.3, s * 0.5, s * 0.4);
  }
  const gem = add(new THREE.OctahedronGeometry(0.12, 0), '#c49bff', [0, 0.92, -0.05], { emissive: '#9b5cff', emissiveIntensity: 1.3 });
  gem.scale.y = 1.6;
  addOutline(g, { thickness: 0.02, minSize: 0.08 });
  return g;
}

// the mound: a lumpy heap of earth with a dark hole in its top
function createMound() {
  const g = new THREE.Group();
  g.name = 'moleMound';
  const earth = mat('#6b4a36', { emissive: '#21140c', emissiveIntensity: 0.6 });
  const heap = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), earth);
  heap.scale.set(1, 0.5, 1);
  heap.castShadow = true;
  g.add(heap);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const lump = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + (i % 3) * 0.04, 0), earth);
    lump.position.set(Math.cos(a) * 0.7, 0.06, Math.sin(a) * 0.7);
    g.add(lump);
  }
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.24, 12).rotateX(-Math.PI / 2), mat('#140c08'));
  hole.position.y = 0.375;
  g.add(hole);
  return g;
}

export function createMole(G, { x, z, heading = 0 }) {
  const def = ENEMIES.mole;
  const diff = G.difficulty ?? { hp: 1, damage: 1 };
  const model = new THREE.Group(); // at the mound / hole (pos), what the pointer finds
  model.name = 'mole';
  const mound = createMound();
  const body = createMoleModel();
  body.position.y = DEEP;
  model.add(mound, body);
  // W2: on the ground where it is (the big world's levels; the old caves' floor is 0)
  const gy = (px, pz, near) => G.groundAt?.(px, pz, near) ?? 0;
  const home = new THREE.Vector3(x, gy(x, z), z);
  model.position.copy(home);
  model.rotation.y = heading;
  G.scene.add(model);
  G.look.shadows(model);
  // the hole it leaves while it is up
  const hole = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.72, 16).rotateX(-Math.PI / 2), mat('#3a281c'));
  hole.position.y = 0.03;
  model.add(hole);

  const alert = textSprite('❗', 1.0);
  const zz = textSprite('Zz', 0.8, '#d9ccff');
  const dazed = textSprite('💫', 0.8);
  const wet = textSprite('💧', 0.5);
  G.scene.add(alert, zz, dazed, wet);
  const mark = circleMark(def.pop.radius);
  G.scene.add(mark);
  const target = new THREE.Vector3();
  const from = new THREE.Vector3();

  const e = {
    kind: 'mole', def, name: def.name, model, home,
    size: def.size, hp: def.hp * diff.hp, maxHp: def.hp * diff.hp, damage: def.damage * diff.damage,
    ai: newMoleAI(), heading, speed: 0,
    knock: new THREE.Vector2(), gone: false, dropped: false, wetUntil: -Infinity,
    calm: 1.5, dormant: false, leash: null, returning: false, zone: null,
    boundUntil: -Infinity,
    get state() { return e.ai.state; },
    get t() { return e.ai.t; },
    get pos() { return model.position; },
    get underground() { return underground(e.ai.state); },
    get exposed() { return exposed(e.ai.state); },
    get dazed() { return e.ai.state === 'flooded'; },
    get bound() { return G.time < e.boundUntil && exposed(e.ai.state); },
    get active() { return !e.gone && e.ai.state !== 'idle' && e.ai.state !== 'asleep'; },
    mark, // (for checks)
    hint: () => (e.ai.state === 'asleep' ? '쿨쿨… 잠들었어요' : e.ai.state === 'flooded' ? '물에 잠겨 어지러워해요! 지금 망치로!'
      : exposed(e.ai.state) ? '튀어나왔어요! 지금 망치로!' : def.hint),
  };
  let water = false, flash = 0, popHit = false;

  // a hit: water on the mound floods it out; the hammer only while it is up
  e.hurt = ({ damage = 1, kind: by = 'hammer' }) => {
    if (e.ai.state === 'asleep' || e.gone) return false;
    G.discover?.('mole');
    if (by === 'water') {
      e.wetUntil = G.time + ITEMS.waterGun.wet;
      if (underground(e.ai.state)) { water = true; G.emit('moleFlooded', { enemy: e }); sfx.splash?.(); return true; }
    } else if (!exposed(e.ai.state)) return false;
    e.hp = damageHp(e.hp, damage);
    flash = 0.18;
    if (by !== 'water') sfx.bonk();
    G.emit('enemyHit', { enemy: e, damage, by });
    return true;
  };
  // the vine holds it up out of its hole for a while (nothing underground)
  e.bind = (secs) => {
    if (!exposed(e.ai.state) || e.ai.state === 'asleep') return false;
    e.boundUntil = G.time + secs;
    G.emit('enemyBound', { enemy: e, secs });
    return true;
  };
  e.untargetable = (by) => by === 'vine' && underground(e.ai.state);

  G.addHittable({
    enemy: e, radius: def.size[0],
    enabled: () => !e.gone && exposed(e.ai.state),
    pos: () => model.position.clone().setY(model.position.y + 0.5),
    onHit: (o) => e.hurt(o),
  });

  // What its telegraph covers now (the bot and the checks read it)
  e.hazard = () => (e.ai.state === 'windup'
    ? { kind: 'mole', shape: 'circle', x: target.x, z: target.z, r: def.pop.radius, hitAt: G.time + Math.max(0, def.windup - e.ai.t) }
    : null);

  e.doze = (dt) => { if (!e.gone && model.visible) mound.scale.y = 1 + Math.sin(G.time * 2 + x) * 0.04; void dt; };

  e.reset = () => {
    model.position.copy(home); model.visible = true;
    Object.assign(e, { hp: e.maxHp, ai: newMoleAI(), gone: false, dropped: false, wetUntil: -Infinity, calm: 1.5, returning: false, boundUntil: -Infinity });
    body.position.y = DEEP; mound.visible = true; hole.visible = false;
    setOpacity(1);
    mark.visible = alert.visible = zz.visible = dazed.visible = wet.visible = false;
  };

  const tmp = new THREE.Vector3();
  e.update = (dt) => {
    if (e.gone) return;
    const pp = G.player.position;
    const dist = Math.hypot(pp.x - model.position.x, pp.z - model.position.z);
    const scale = G.mask?.scale ?? 1;
    e.calm = Math.max(0, e.calm - dt);
    // held up by the vine: the clock stands still
    const held = e.bound;
    const before = e.ai.state;
    const ev = held && !water && e.hp > 0 ? null : stepMole(e.ai, { dist, sees: e.calm <= 0, hp: e.hp, water, detect: def.detect * scale }, held ? 0 : dt, def);
    water = false;
    if (ev) onEvent(ev, before);
    const s = e.ai.state;
    // moving underground: toward the hero (inside its cavern), home when idle
    let goal = null, speed = 0;
    if (s === 'travel') { goal = pp; speed = def.speed; }
    else if (s === 'idle' && Math.hypot(home.x - model.position.x, home.z - model.position.z) > 0.6) { goal = home; speed = def.speed; }
    else if (s === 'windup' && e.ai.t < 0.45) {
      // the rush to where it will burst out
      const u = Math.min(1, e.ai.t / 0.45);
      const mx = THREE.MathUtils.lerp(from.x, target.x, u), mz = THREE.MathUtils.lerp(from.z, target.z, u);
      model.position.set(mx, gy(mx, mz, model.position.y), mz);
    }
    if (goal) {
      tmp.set(goal.x - model.position.x, 0, goal.z - model.position.z);
      const d = tmp.length();
      if (d > 0.3) {
        tmp.multiplyScalar(Math.min(d, speed * dt) / d).add(model.position);
        if (e.leash && Math.hypot(tmp.x - e.leash.x, tmp.z - e.leash.z) > e.leash.r) tmp.copy(model.position);
        const reach = G.nav?.lineReach(model.position, tmp);
        if (reach) model.position.set(reach.x, G.world ? reach.y : 0, reach.z);
        e.heading = Math.atan2(goal.x - model.position.x, goal.z - model.position.z);
      }
      e.speed = speed;
    } else e.speed = 0;
    model.rotation.y = e.heading;
    // the pop: inside the circle as it bursts out
    if (s === 'attack' && !popHit && e.ai.t > 0.05) {
      popHit = true;
      const inside = Math.hypot(pp.x - target.x, pp.z - target.z) < def.pop.radius + 0.3;
      const hurt = inside && G.hurtPlayer(target, e.damage);
      G.emit('enemyBite', { enemy: e, inside, hurt: !!hurt, blocked: false });
    }
    draw(s, dt);
    if (s === 'asleep') sleepStep();
  };

  function onEvent(ev, before) {
    if (ev === 'alert') { sfx.growl?.(); G.discover?.('mole'); }
    if (ev === 'windup') {
      target.set(G.player.position.x, G.world ? G.player.position.y : 0, G.player.position.z);
      // keep the circle on open floor in its cavern
      const r = G.nav?.lineReach(model.position, target);
      if (r && Math.hypot(r.x - target.x, r.z - target.z) > 0.1) target.set(r.x, G.world ? r.y : 0, r.z);
      from.copy(model.position);
      sfx.rumble?.();
      G.emit('enemyWindup', { enemy: e, hazard: e.hazard() });
    }
    if (ev === 'pop') { popHit = false; model.position.copy(target); sfx.stomp?.(); G.cam?.shake(0.25); }
    if (ev === 'flooded') { G.toast('💦 두더지가 물에 잠겨 튀어나왔어요! 지금 망치로!', 2200); sfx.stun(); G.emit('enemyStunned', { enemy: e, secs: def.flooded }); }
    if (ev === 'asleep') {
      sfx.stun();
      G.run.asleep = (G.run.asleep ?? 0) + 1;
      G.emit('enemyAsleep', e);
    }
    void before;
  }

  let bodyY = DEEP;
  function draw(s, dt) {
    const up = s === 'attack' || s === 'surface' || s === 'flooded' || s === 'asleep';
    const want = s === 'dig' ? DEEP : up ? 0 : DEEP;
    bodyY += (want - bodyY) * Math.min(1, dt * (s === 'attack' ? 22 : s === 'dig' ? 5 : 10));
    body.position.y = bodyY;
    body.position.x = s === 'flooded' || held() ? Math.sin(G.time * 30) * 0.03 : 0;
    body.rotation.z = s === 'asleep' ? Math.min(1, e.ai.t * 2) * 1.3 : s === 'flooded' ? Math.sin(G.time * 8) * 0.2 : 0;
    mound.visible = underground(s);
    mound.scale.setScalar(s === 'windup' ? 1.1 + Math.sin(G.time * 40) * 0.08 : s === 'travel' ? 0.85 + Math.sin(G.time * 18) * 0.06 : 1);
    mound.position.x = s === 'windup' ? Math.sin(G.time * 45) * 0.06 : 0;
    hole.visible = up && s !== 'asleep';
    // blink while it is up and open
    const blink = (s === 'surface' && e.ai.t > def.surface - 0.5) ? (Math.floor(G.time * 12) % 2 === 0) : true;
    body.visible = bodyY > DEEP + 0.05 && blink;
    flash = Math.max(0, flash - dt);
    body.traverse((o) => { if (o.isMesh && !o.userData.isOutline && o.material.emissive) o.material.emissiveIntensity = flash > 0 ? 2.2 : o.material.userData.base; });
    alert.visible = !G.fainted && s === 'alert';
    const my = model.position.y;
    alert.position.set(model.position.x, my + 1.4, model.position.z);
    mark.visible = !G.fainted && s === 'windup';
    if (mark.visible) {
      mark.position.set(target.x, target.y + 0.05, target.z);
      mark.userData.fill.scale.setScalar(Math.max(0.05, Math.min(1, e.ai.t / def.windup)));
      mark.userData.edge.material.opacity = 0.75 + Math.sin(e.ai.t * 30) * 0.2;
    }
    dazed.visible = !G.fainted && s === 'flooded';
    if (dazed.visible) dazed.position.set(model.position.x, my + 1.35 + Math.sin(G.time * 8) * 0.06, model.position.z);
    wet.visible = !G.fainted && s !== 'asleep' && G.time < e.wetUntil;
    if (wet.visible) wet.position.set(model.position.x + 0.3, my + 1.2, model.position.z);
  }
  const held = () => e.bound;

  function sleepStep() {
    const t = e.ai.t;
    zz.visible = t < SLEEP_FADE_AT + SLEEP_FADE;
    zz.position.set(model.position.x + 0.2, model.position.y + 1.1 + (t % 1.5) * 0.25, model.position.z);
    zz.material.opacity = Math.min(1, 1.5 - (t % 1.5)) * (t > SLEEP_FADE_AT ? Math.max(0, 1 - (t - SLEEP_FADE_AT) / SLEEP_FADE) : 1);
    if (!e.dropped && t > 0.6) {
      e.dropped = true;
      const pp = G.player.position, away = tmp.set(model.position.x - pp.x, 0, model.position.z - pp.z);
      if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
      const at = model.position.clone().addScaledVector(away.normalize(), 1.0);
      dropShard(G, G.nav?.lineReach(model.position, at) ?? at);
    }
    if (t > SLEEP_FADE_AT) setOpacity(Math.max(0, 1 - (t - SLEEP_FADE_AT) / SLEEP_FADE));
    if (t > SLEEP_FADE_AT + SLEEP_FADE) { e.gone = true; model.visible = false; zz.visible = false; }
  }
  // its own materials, so one mole fades alone
  model.traverse((o) => { if (o.isMesh && !o.userData.isOutline) { o.material = o.material.clone(); o.material.userData.base = o.material.emissiveIntensity ?? 0; } });
  function setOpacity(k) {
    model.traverse((o) => {
      if (!o.isMesh || o.userData.isOutline) return;
      o.material.transparent = k < 1; o.material.opacity = k; o.material.depthWrite = k >= 1;
    });
  }

  G.addEnemy(e);
  return e;
}

// the red circle where it will burst out, filling from the middle
function circleMark(r) {
  const g = new THREE.Group();
  const matOf = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const edge = new THREE.Mesh(new THREE.RingGeometry(r * 0.9, r, 40).rotateX(-Math.PI / 2), matOf('#ff2a2a', 0.85));
  const inner = new THREE.Mesh(new THREE.CircleGeometry(r * 0.9, 40).rotateX(-Math.PI / 2), matOf('#5a0000', 0.5));
  inner.position.y = 0.005;
  const fill = new THREE.Mesh(new THREE.CircleGeometry(r * 0.9, 40).rotateX(-Math.PI / 2), matOf('#ff4a3a', 0.8));
  fill.position.y = 0.01;
  g.add(edge, inner, fill);
  for (const m of [edge, inner, fill]) m.renderOrder = 5;
  g.userData = { edge, fill };
  g.visible = false;
  g.name = 'moleMark';
  return g;
}
