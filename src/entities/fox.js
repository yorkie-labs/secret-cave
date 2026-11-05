import * as THREE from 'three';
import { instance, clipsOf } from '../world/models.js';
import { createEnemy, textSprite } from './enemy.js';
import { newCloak, stepCloak, senseRange, canHide } from './foxAI.js';
import { sfx } from '../audio/sound.js';

// M6a: the fox (GDD §3.2 기습형), the mushroom cave's ambusher. Polyfork's
// rigged low-poly fox (`fox-base`, Idle/Walk/Run clips) with poses on top,
// like the wolf. It waits hidden in a giant mushroom's shade: all but
// invisible, a faint shimmer and a few sparkles (foxAI.js has the rules).
// Up close it springs (❗, then the red cone like any bite), and after its
// bite it slinks back to the shade to hide again. Water shows it up: it
// cannot hide for a while and fights in the open; the hammer does the rest.
const SCALE = 1.7;
const COAT = '#ffd9c4'; // × the model's own colours: a little paler in the cave light
const GLOW = new THREE.Color('#1c1018'), WHITE = new THREE.Color('#ffffff');
const WRAP = { y: 0.55, r: 0.27, len: 0.75 };

export function createFoxModel() {
  const model = new THREE.Group();
  model.name = 'fox';
  const body = new THREE.Group();
  const fox = instance('fox');
  fox.scale.setScalar(SCALE);
  body.add(fox);
  model.add(body);
  fox.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.material = o.material.clone();
    o.material.color.multiply(new THREE.Color(COAT));
    o.material.emissive = GLOW.clone();
  });
  const bone = (n) => fox.getObjectByName(n);
  model.userData.rig = { body, fox, neck: bone('Neck'), head: bone('Head'), jaw: bone('Jaw'), tail: bone('Tail'), earL: bone('LeftEar'), earR: bone('RightEar') };
  return model;
}

export function createFoxAnimator(model) {
  const { body, fox, neck, head, jaw, tail, earL, earR } = model.userData.rig;
  const mixer = new THREE.AnimationMixer(fox);
  const actions = Object.fromEntries(Object.entries(clipsOf('fox')).map(([k, c]) => [k, mixer.clipAction(c)]));
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
    if (s === 'asleep') { sleep = Math.min(1, sleep + dt * 2.5); mixer.timeScale = Math.max(0, 1 - sleep); }
    else if (s === 'bound') { sleep = 0; mixer.timeScale = 0.1; }
    else {
      sleep = 0; mixer.timeScale = 1;
      if (e.speed > 3) play('Run', e.speed / 6);
      else if (e.speed > 0.2) play('Walk', e.speed / 1.3);
      else play('Idle');
    }
    mixer.update(dt);
    const k = s === 'windup' ? Math.min(1, e.t / e.def.windup) : 0;
    // hidden: low to the ground, ears flat
    const low = e.cloak?.hidden ? 1 : 0;
    if (neck) neck.rotation.x += 0.4 * k + 0.25 * low;
    if (earL) earL.rotation.x -= 0.6 * low + 0.5 * k;
    if (earR) earR.rotation.x -= 0.6 * low + 0.5 * k;
    if (jaw) jaw.rotation.x += s === 'windup' ? 0.15 * k : s === 'attack' ? (e.t < 0.12 ? 0.35 : 0) : 0;
    if (head) head.rotation.z += s === 'stagger' ? Math.sin(t * 30) * 0.25 : 0;
    if (tail) tail.rotation.y += s === 'windup' ? Math.sin(t * 25) * 0.4 : Math.sin(t * 3) * 0.15;
    body.position.y = -0.1 * k - 0.12 * low;
    body.rotation.x = s === 'attack' ? -0.18 : 0;
    body.position.x = s === 'stagger' ? Math.sin(t * 40) * 0.05 : s === 'bound' ? Math.sin(t * 9) * 0.03 : 0;
    body.rotation.z = sleep * (Math.PI / 2) * 0.92;
    if (s === 'bound') body.rotation.z = Math.sin(t * 9) * 0.05;
    if (sleep > 0) body.position.y = sleep * 0.18 + Math.sin(t * 2) * 0.01;
    const glow = Math.min(1, flash * 4);
    fox.traverse((o) => { if (o.isMesh) o.material.emissive.copy(GLOW).lerp(WHITE, glow * 0.6); });
  };
}

export function createFox(G, at) {
  const def = { hide: null };
  const model = createFoxModel();
  const cloak = newCloak();
  // the shimmer: a few sparkles where it hides
  const sparkle = textSprite('✨', 0.55, '#fff6c0');
  G.scene.add(sparkle);
  const shown = textSprite('🦊❗', 0.9, '#ffb36a');
  G.scene.add(shown);
  let opacity = 0, shownT = 0;
  const setOpacity = (k) => {
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.material.transparent = k < 0.999;
      o.material.opacity = k;
      o.material.depthWrite = k >= 0.999;
    });
  };
  const e = createEnemy(G, 'fox', at, {
    model, animate: createFoxAnimator(model), wrap: WRAP,
    detect: () => senseRange(cloak, e.def),
    onEvent(ev, en, from) {
      const r = stepCloak(cloak, { now: G.time, ev, from }, en.def);
      if (r === 'ambush' || r === 'turn') en.returning = false;
      if (r === 'ambush') { sfx.growl?.(); G.emit('foxAmbush', { enemy: en }); }
      if (r === 'slink') {
        // back to the shade (its spot), calm for a moment on the way
        en.ai.state = 'idle'; en.ai.t = 0;
        en.returning = true; en.calm = 2.2;
        G.emit('foxSlink', { enemy: en });
      }
    },
    onHurt(by, en) {
      if (by === 'water') {
        stepCloak(cloak, { now: G.time, water: true }, en.def);
        en.returning = false;
        shownT = 1.2;
        G.discover?.('fox');
        G.emit('foxRevealed', { enemy: en });
      } else if (cloak.hidden) { cloak.hidden = false; G.emit('foxAmbush', { enemy: en }); }
    },
    step(dt, en) {
      if (cloak.slinking && !en.returning) {
        stepCloak(cloak, { now: G.time, arrived: true }, en.def);
        G.emit('foxHidden', { enemy: en });
      }
      const want = en.state === 'asleep' ? opacity : cloak.hidden ? en.def.hide.cloak : 1;
      opacity += (want - opacity) * Math.min(1, dt / en.def.hide.fade * 3);
      if (en.state !== 'asleep') setOpacity(opacity + (cloak.hidden ? Math.sin(G.time * 5 + en.index) * 0.05 : 0));
      sparkle.visible = !G.fainted && cloak.hidden && en.state !== 'asleep' && Math.sin(G.time * 2.3 + en.index) > 0.2;
      if (sparkle.visible) sparkle.position.set(en.pos.x + Math.sin(G.time * 1.7) * 0.4, en.pos.y + 0.6 + Math.sin(G.time * 3) * 0.15, en.pos.z);
      shownT = Math.max(0, shownT - dt);
      shown.visible = shownT > 0;
      if (shown.visible) { shown.position.set(en.pos.x, en.pos.y + 1.7 + (1.2 - shownT) * 0.4, en.pos.z); shown.material.opacity = Math.min(1, shownT * 2); }
    },
  });
  e.cloak = cloak;
  opacity = e.def.hide.cloak;
  setOpacity(opacity);
  void def;
  const base = e.hint;
  e.hint = () => (e.state === 'asleep' ? base() : cloak.hidden ? '버섯 그늘에 숨어 있어요… 물총으로 찾아요!'
    : !canHide(cloak, G.time) ? '정체가 드러났어요! 지금 망치로!' : base());
  const reset = e.reset;
  e.reset = () => { reset(); Object.assign(cloak, newCloak()); opacity = e.def.hide.cloak; setOpacity(opacity); };
  return e;
}
