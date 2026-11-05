import * as THREE from 'three';
import { instance, clipsOf } from '../world/models.js';
import { createEnemy } from './enemy.js';

// The rabbit (GDD §3.2): the moss cave's hopper. Polyfork's rigged low-poly
// rabbit (`rabbit-base`, Idle/Walk/Run clips, ear bones); the crouch before a
// jump-dash, the leap, the dazed landing and sleep are posed on top by hand.
// Weak to the hammer right after it lands (enemy.js, data/enemies.js).
// The Giant Rabbit Chief (entities/bosses/rabbitChief.js) is the same model,
// much bigger.
const SCALE = 2.4; // the model is a real-size bunny (0.37 m): cave rabbits are big
const COAT = '#f4eefa'; // × the model's colours: a pale, crystal-touched coat
const GLOW = new THREE.Color('#2a2238'), WHITE = new THREE.Color('#ffffff');
const WRAP = { y: 0.48, r: 0.3, len: 0.68 };

// W3 `key`: 'hare' (Polyfork's mountain hare, the Ice Lake's snow hares)
export function createRabbitModel({ scale = SCALE, coat = COAT, key = 'rabbit' } = {}) {
  const model = new THREE.Group();
  model.name = key;
  const body = new THREE.Group(); // leaps, squashes, tips over to sleep
  const rabbit = instance(key);
  rabbit.scale.setScalar(scale);
  body.add(rabbit);
  model.add(body);
  rabbit.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.material = o.material.clone();
    o.material.color.multiply(new THREE.Color(coat));
    o.material.emissive = GLOW.clone();
  });
  const bone = (n) => rabbit.getObjectByName(n);
  model.userData.rig = {
    body, rabbit, scale,
    neck: bone('Neck'), head: bone('Head'), jaw: bone('Jaw'), tail: bone('Tail'), hips: bone('Hips'),
    earL: bone('LeftEar'), earR: bone('RightEar'),
  };
  return model;
}

// The rabbit's moves by AI state. `e`: { state, t, def, speed }; `leap`: the
// height of a jump-dash at its top (m).
export function createRabbitAnimator(model, { leap = 0.7 } = {}) {
  const { body, rabbit, neck, head, earL, earR, tail } = model.userData.rig;
  const mixer = new THREE.AnimationMixer(rabbit);
  const clips = clipsOf(model.name === 'hare' ? 'hare' : 'rabbit');
  const actions = Object.fromEntries(Object.entries(clips).map(([k, c]) => [k, mixer.clipAction(c)]));
  let current = null;
  const play = (name, timeScale = 1) => {
    const a = actions[name];
    if (!a) return;
    a.timeScale = timeScale;
    if (current === a) return;
    a.reset().fadeIn(0.15).play();
    current?.fadeOut(0.15);
    current = a;
  };
  play('Idle');
  let sleep = 0, t = 0;

  return (dt, e, { flash = 0, pose = null } = {}) => {
    t += dt;
    const s = pose ?? e.state;
    if (s === 'asleep') { sleep = Math.min(1, sleep + dt * 2.5); mixer.timeScale = Math.max(0, 1 - sleep); }
    else if (s === 'bound') { sleep = 0; mixer.timeScale = 0.1; }
    else {
      sleep = 0;
      mixer.timeScale = 1;
      if (s === 'attack') play('Run', 1.8);
      else if (e.speed > 2.5) play('Run', e.speed / 5);
      else if (e.speed > 0.2) play('Walk', e.speed / 1.2);
      else play('Idle');
    }
    mixer.update(dt);

    const dur = e.def?.windup ?? 0.9;
    const k = s === 'windup' ? Math.min(1, e.t / dur) : 0;
    // ears: flat back while aiming, up and twitching when dazed
    const ear = s === 'windup' ? -0.9 * k : s === 'recover' || s === 'stagger' ? Math.sin(t * 14) * 0.35 : 0;
    if (earL) earL.rotation.x += ear;
    if (earR) earR.rotation.x += ear;
    if (neck) neck.rotation.x += 0.25 * k;
    if (head) head.rotation.z += s === 'stagger' || s === 'recover' ? Math.sin(t * 9) * 0.22 : 0;
    if (tail) tail.rotation.x += s === 'windup' ? Math.sin(t * 30) * 0.3 : 0;
    // the crouch, the leap (an arc over the dash), the squash on landing
    let y = -0.12 * k, pitch = 0, sx = 1;
    if (s === 'attack') {
      const u = Math.min(1, e.t / (e.def?.attack ?? 0.45));
      y = Math.sin(u * Math.PI) * leap;
      pitch = -0.35 * Math.cos(u * Math.PI);
    }
    if (s === 'recover') { const u = Math.min(1, e.t / 0.18); sx = 1 + 0.18 * (1 - u); y = -0.05 * (1 - u); }
    body.position.y = y;
    body.rotation.x = pitch;
    body.scale.set(sx, 2 - sx, sx);
    body.position.x = s === 'stagger' ? Math.sin(t * 40) * 0.04 : s === 'bound' ? Math.sin(t * 9) * 0.03 : 0;
    body.rotation.z = sleep * (Math.PI / 2) * 0.92;
    if (s === 'bound') body.rotation.z = Math.sin(t * 9) * 0.05;
    if (sleep > 0) body.position.y = sleep * 0.15 + Math.sin(t * 2) * 0.01;
    const glow = Math.min(1, flash * 4);
    rabbit.traverse((o) => { if (o.isMesh) o.material.emissive.copy(GLOW).lerp(WHITE, glow * 0.6); });
  };
}

export function createRabbit(G, at) {
  const model = createRabbitModel();
  return createEnemy(G, 'rabbit', at, { model, animate: createRabbitAnimator(model), wrap: WRAP });
}

// W3: a snow hare of the Ice Lake: the rabbit's ways in a white winter coat
// (mountain-hare-base is 0.53 m as built, the rabbit 0.37: the same size here)
export function createHare(G, at) {
  const model = createRabbitModel({ key: 'hare', scale: SCALE * 0.37 / 0.53 * 1.05, coat: '#ffffff' });
  return createEnemy(G, 'hare', at, { model, animate: createRabbitAnimator(model), wrap: { y: 0.5, r: 0.3, len: 0.7 } });
}
