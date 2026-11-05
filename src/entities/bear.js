import * as THREE from 'three';
import { instance, clipsOf } from '../world/models.js';
import { createEnemy } from './enemy.js';

// W3: the bear (GDD §3.2 강한 적), the Ice Lake's brute. Polyfork's rigged
// low-poly bear (`bear-base`, Idle/Walk/Run clips, the wolf's bones). It
// lumbers after the hero, rears up on its hind legs (a red circle in front of
// it) and slams its paws down. Water in its face makes it stagger, head
// shaking (enemy.js `def.face`): then the hammer. The Ice Bear boss
// (bosses/iceBear.js) is the same model, white and much bigger.
const SCALE = 1.3;
const COAT = '#d8ccc0'; // × the model's own colours: a frosted brown
const GLOW = new THREE.Color('#140f0c'), WHITE = new THREE.Color('#ffffff');
const WRAP = { y: 0.95, r: 0.48, len: 1.5 };

export function createBearModel({ scale = SCALE, recolour = null, coat = COAT } = {}) {
  const model = new THREE.Group();
  model.name = 'bear';
  const body = new THREE.Group();
  const bear = instance('bear');
  bear.scale.setScalar(scale);
  body.add(bear);
  model.add(body);
  bear.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    if (recolour) recolour(o);
    o.material = o.material.clone();
    o.material.color.multiply(new THREE.Color(coat));
    o.material.emissive = GLOW.clone();
  });
  const bone = (n) => bear.getObjectByName(n);
  model.userData.rig = {
    body, bear, scale, neck: bone('Neck'), head: bone('Head'), jaw: bone('Jaw'), chest: bone('Chest'), spine: bone('Spine'),
    armL: bone('LeftFrontUpLeg'), armR: bone('RightFrontUpLeg'), earL: bone('LeftEar'), earR: bone('RightEar'),
  };
  return model;
}

// The bear's moves by AI state; `pose` overrides the state (the boss's steps).
export function createBearAnimator(model, { rear = 0.55 } = {}) {
  const { body, bear, neck, head, jaw, armL, armR } = model.userData.rig;
  const mixer = new THREE.AnimationMixer(bear);
  const actions = Object.fromEntries(Object.entries(clipsOf('bear')).map(([k, c]) => [k, mixer.clipAction(c)]));
  let current = null;
  const play = (name, timeScale = 1) => {
    const a = actions[name];
    if (!a) return;
    a.timeScale = timeScale;
    if (current === a) return;
    a.reset().fadeIn(0.25).play();
    current?.fadeOut(0.25);
    current = a;
  };
  play('Idle');
  let sleep = 0, t = 0;
  return (dt, e, { flash = 0, pose = null, k: kOver = null } = {}) => {
    t += dt;
    const s = pose ?? e.state;
    const reeling = s === 'stagger' || s === 'dizzy';
    if (s === 'asleep') { sleep = Math.min(1, sleep + dt * 2); mixer.timeScale = Math.max(0, 1 - sleep); }
    else if (s === 'bound') { sleep = 0; mixer.timeScale = 0.1; }
    else {
      sleep = 0; mixer.timeScale = 1;
      if (e.speed > 3.5) play('Run', e.speed / 6);
      else if (e.speed > 0.2) play('Walk', e.speed / 1.2);
      else play('Idle');
    }
    mixer.update(dt);
    // the windup: up on its hind legs, paws raised; the slam: down hard
    const k = kOver ?? (s === 'windup' ? Math.min(1, e.t / (e.def?.windup ?? 1)) : 0);
    const up = s === 'windup' ? k : s === 'attack' ? Math.max(0, 1 - e.t / 0.12) : 0;
    body.rotation.x = -rear * up * up + (s === 'attack' && e.t > 0.1 ? 0.12 : 0);
    body.position.y = 0.35 * up * (model.userData.rig.scale / 1.3);
    if (armL) armL.rotation.x -= 1.1 * up;
    if (armR) armR.rotation.x -= 1.1 * up;
    if (neck) neck.rotation.x -= 0.3 * up;
    if (jaw) jaw.rotation.x += s === 'windup' ? 0.25 * k : 0;
    if (head && reeling) { head.rotation.z += Math.sin(t * 16) * 0.3; head.rotation.y += Math.sin(t * 9) * 0.25; }
    body.position.x = reeling ? Math.sin(t * 11) * 0.08 : s === 'bound' ? Math.sin(t * 9) * 0.03 : 0;
    if (reeling) body.rotation.z = Math.sin(t * 7) * 0.08;
    else body.rotation.z = sleep * (Math.PI / 2) * 0.9;
    if (s === 'bound') body.rotation.z = Math.sin(t * 9) * 0.05;
    if (sleep > 0) body.position.y = sleep * 0.35 + Math.sin(t * 2) * 0.01;
    const glow = Math.min(1, flash * 4);
    bear.traverse((o) => { if (o.isMesh && o.material.emissive) o.material.emissive.copy(GLOW).lerp(WHITE, glow * 0.6); }); // (the Ice Bear's frost: its own glow)
  };
}

export function createBear(G, at) {
  const model = createBearModel();
  return createEnemy(G, 'bear', at, { model, animate: createBearAnimator(model), wrap: WRAP });
}
