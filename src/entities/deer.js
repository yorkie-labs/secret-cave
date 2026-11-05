import * as THREE from 'three';
import { instance, clipsOf } from '../world/models.js';
import { createEnemy } from './enemy.js';

// W3: the deer (GDD §3.2 돌진형), the Ice Lake's charger. Polyfork's rigged
// low-poly deer (`deer-base`, Idle/Walk/Run clips, the same bones as the
// wolf), its coat a little paler in the cold. It keeps its distance, lowers
// its antlers to aim a long red lane, charges down it, and stands blowing at
// the end (the opening). A raised shield stops it: its antlers stick fast for
// two seconds, head down and shaking (enemy.js `def.stuck`).
const SCALE = 1.05;
const COAT = '#f3ece4'; // × the model's own colours: frost-pale
const GLOW = new THREE.Color('#1a1410'), WHITE = new THREE.Color('#ffffff');
const WRAP = { y: 1.05, r: 0.36, len: 0.95 };

export function createDeerModel() {
  const model = new THREE.Group();
  model.name = 'deer';
  const body = new THREE.Group();
  const deer = instance('deer');
  deer.scale.setScalar(SCALE);
  body.add(deer);
  model.add(body);
  deer.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.material = o.material.clone();
    o.material.color.multiply(new THREE.Color(COAT));
    o.material.emissive = GLOW.clone();
  });
  const bone = (n) => deer.getObjectByName(n);
  model.userData.rig = { body, deer, neck: bone('Neck'), head: bone('Head'), tail: bone('Tail'), earL: bone('LeftEar'), earR: bone('RightEar'), chest: bone('Chest') };
  return model;
}

export function createDeerAnimator(model) {
  const { body, deer, neck, head, tail, earL, earR } = model.userData.rig;
  const mixer = new THREE.AnimationMixer(deer);
  const actions = Object.fromEntries(Object.entries(clipsOf('deer')).map(([k, c]) => [k, mixer.clipAction(c)]));
  let current = null;
  const play = (name, timeScale = 1) => {
    const a = actions[name];
    if (!a) return;
    a.timeScale = timeScale;
    if (current === a) return;
    a.reset().fadeIn(0.2).play();
    current?.fadeOut(0.2);
    current = a;
  };
  play('Idle');
  let sleep = 0, t = 0;
  return (dt, e, { flash = 0 } = {}) => {
    t += dt;
    const s = e.state;
    const stuck = s === 'stagger' && e.ai?.stunFor > 0;
    if (s === 'asleep') { sleep = Math.min(1, sleep + dt * 2.5); mixer.timeScale = Math.max(0, 1 - sleep); }
    else if (s === 'bound' || stuck) { sleep = 0; mixer.timeScale = 0.1; }
    else {
      sleep = 0; mixer.timeScale = 1;
      if (s === 'attack') play('Run', 2.2);
      else if (e.speed > 3) play('Run', e.speed / 6);
      else if (e.speed > 0.2) play('Walk', e.speed / 1.3);
      else play('Idle');
    }
    mixer.update(dt);
    // the windup: head down, antlers forward, a paw scraping the snow
    const k = s === 'windup' ? Math.min(1, e.t / e.def.windup) : 0;
    const down = Math.max(k, s === 'attack' ? 1 : 0, stuck ? 1 : 0);
    if (neck) neck.rotation.x += 0.75 * down;
    if (head) head.rotation.x += 0.35 * down + (stuck ? Math.sin(t * 22) * 0.12 : 0);
    if (head && stuck) head.rotation.z += Math.sin(t * 17) * 0.18;
    if (earL) earL.rotation.x -= 0.5 * down;
    if (earR) earR.rotation.x -= 0.5 * down;
    if (tail) tail.rotation.x += s === 'windup' ? Math.sin(t * 24) * 0.4 : Math.sin(t * 3) * 0.1;
    body.position.y = s === 'windup' ? -0.06 * k + Math.abs(Math.sin(t * 9)) * 0.03 * k : 0;
    body.rotation.x = s === 'attack' ? 0.12 : stuck ? 0.18 : 0;
    body.position.x = stuck ? Math.sin(t * 30) * 0.05 : s === 'bound' ? Math.sin(t * 9) * 0.03 : 0;
    body.rotation.z = sleep * (Math.PI / 2) * 0.92;
    if (s === 'bound') body.rotation.z = Math.sin(t * 9) * 0.05;
    if (sleep > 0) body.position.y = sleep * 0.3 + Math.sin(t * 2) * 0.01;
    const glow = Math.min(1, flash * 4);
    deer.traverse((o) => { if (o.isMesh) o.material.emissive.copy(GLOW).lerp(WHITE, glow * 0.6); });
  };
}

export function createDeer(G, at) {
  const model = createDeerModel();
  return createEnemy(G, 'deer', at, { model, animate: createDeerAnimator(model), wrap: WRAP });
}
