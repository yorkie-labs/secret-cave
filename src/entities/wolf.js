import * as THREE from 'three';
import { instance, clipsOf } from '../world/models.js';
import { createEnemy } from './enemy.js';

// The wolf (GDD §3.2): the moss cave's chaser. Polyfork's rigged low-poly wolf
// (`wolf-base`, Idle/Walk/Run clips); the bite, the stagger and sleep are
// posed on top of the clips by hand. Weak to the vine (M3).
const SCALE = 1.25; // bigger than life: it stands taller than the chibi hero
const COAT = '#b9b3c6'; // × the model's own colours: a darker, crystal-grey coat
const GLOW = new THREE.Color('#140f1c'), WHITE = new THREE.Color('#ffffff');
const WRAP = { y: 0.74, r: 0.31, len: 0.85 };

export function createWolfModel() {
  const model = new THREE.Group();
  model.name = 'wolf';
  const body = new THREE.Group(); // tips over onto its side to sleep
  const wolf = instance('wolf');
  wolf.scale.setScalar(SCALE);
  body.add(wolf);
  model.add(body);
  // the cave is dark: a faint glow keeps the coat readable, like the hero's fur
  wolf.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.material = o.material.clone();
    o.material.color.set(COAT);
    o.material.emissive = GLOW.clone();
  });
  const bone = (n) => wolf.getObjectByName(n);
  model.userData.rig = { body, wolf, neck: bone('Neck'), head: bone('Head'), jaw: bone('Jaw'), tail: bone('Tail'), hips: bone('Hips') };
  return model;
}

export function createWolfAnimator(model) {
  const { body, wolf, neck, head, jaw, tail } = model.userData.rig;
  const mixer = new THREE.AnimationMixer(wolf);
  const clips = clipsOf('wolf');
  const actions = Object.fromEntries(Object.entries(clips).map(([k, c]) => [k, mixer.clipAction(c)]));
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
    if (s === 'asleep') {
      // curl down onto the side and breathe slowly
      sleep = Math.min(1, sleep + dt * 2.5);
      mixer.timeScale = Math.max(0, 1 - sleep);
    } else if (s === 'bound') {
      // tied up: the clip all but stops, the body strains against the vine
      sleep = 0;
      mixer.timeScale = 0.1;
    } else {
      sleep = 0;
      mixer.timeScale = 1;
      if (e.speed > 3) play('Run', e.speed / 6);
      else if (e.speed > 0.2) play('Walk', e.speed / 1.4);
      else play('Idle');
    }
    mixer.update(dt);

    // poses on top of the clip
    const k = s === 'windup' ? Math.min(1, e.t / e.def.windup) : 0;
    if (neck) neck.rotation.x += 0.35 * k; // head down, ready to spring
    if (jaw) jaw.rotation.x += s === 'windup' ? 0.12 * k : s === 'attack' ? (e.t < 0.12 ? 0.3 : 0) : 0;
    if (head) head.rotation.z += s === 'stagger' ? Math.sin(t * 30) * 0.25 : 0;
    if (tail) tail.rotation.y += s === 'windup' ? Math.sin(t * 25) * 0.3 : 0;
    body.position.y = -0.08 * k; // a crouch
    body.rotation.x = s === 'attack' ? -0.15 : 0;
    body.position.x = s === 'stagger' ? Math.sin(t * 40) * 0.05 : s === 'bound' ? Math.sin(t * 9) * 0.03 : 0;
    // asleep: lying on its side
    body.rotation.z = sleep * (Math.PI / 2) * 0.92;
    if (s === 'bound') { body.rotation.z = Math.sin(t * 9) * 0.05; if (head) head.rotation.y += Math.sin(t * 6) * 0.3; }
    if (sleep > 0) body.position.y = sleep * 0.2 + Math.sin(t * 2) * 0.01;
    // a hit flashes it bright for a moment
    const glow = Math.min(1, flash * 4);
    wolf.traverse((o) => { if (o.isMesh) o.material.emissive.copy(GLOW).lerp(WHITE, glow * 0.6); });
  };
}

export function createWolf(G, at) {
  const model = createWolfModel();
  // the vine round its middle (model space, measured on wolf-base × SCALE)
  return createEnemy(G, 'wolf', at, { model, animate: createWolfAnimator(model), wrap: WRAP });
}
