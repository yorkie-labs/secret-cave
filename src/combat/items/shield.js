import * as THREE from 'three';
import { ITEMS } from '../../data/items.js';
import { newShield, raiseShield, lowerShield, stepShield, shieldBlocks } from '../loadout.js';
import { sfx } from '../../audio/sound.js';
import { textSprite } from '../../entities/enemy.js';

// The shield (GDD §6.3): up while 3 is held, `hold` s at most, then
// `cooldown` s (from release or timeout). It covers the front `arc` degrees:
// a bite from there does nothing but clang and throw sparks, and bounces the
// animal back. The hero walks slowly behind it (data: `slow`) and keeps
// facing the cursor (on a touch screen, the nearest animal).
export function createShieldItem(G) {
  const def = ITEMS.shield;
  const sh = newShield();
  const sparks = [];
  const sparkGeo = new THREE.TetrahedronGeometry(1, 0);
  const sparkMat = new THREE.MeshBasicMaterial({ color: '#fff3a0', transparent: true, depthWrite: false, fog: false });
  const flashMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, fog: false });
  const flashGeo = new THREE.RingGeometry(0.15, 0.5, 20);

  const owned = () => G.run.owned.includes('shield');
  const setUp = (v) => { G.player.state.shield = v; };

  function raise() {
    if (!owned()) { G.toast('방패는 아직 없어요. 보물 상자를 찾아봐요!'); return false; }
    if (sh.cooldown > 0 || G.fainted) return false;
    const a = G.player.state.action?.name;
    if (a && a !== 'hurt') return false; // mid-swing, mid-roll: not now
    if (!raiseShield(sh)) return false;
    setUp(true);
    G.pointer?.cancel(); // stop walking a long way off: plant the feet
    sfx.shieldUp();
    G.emit('shieldUp');
    return true;
  }
  function lower() {
    if (!lowerShield(sh, def)) return false;
    setUp(false);
    G.emit('shieldDown');
    return true;
  }

  // Does it cover an attack from `from` right now?
  const blocks = (from) => shieldBlocks(sh, G.player.position.x, G.player.position.z, G.player.state.heading, from.x, from.z, def);

  // A blocked attack: clang, a burst of sparks off the shield's face.
  function block(from) {
    if (G.shield) G.shield.lastBlock = G.time; // (W5: shield + hammer: a counter right after)
    sfx.clang();
    G.cam?.shake(0.12);
    const f = G.player.facing;
    const at = G.player.position.clone().addScaledVector(f, 0.5).setY(G.player.position.y + 0.55);
    const flash = new THREE.Mesh(flashGeo, flashMat.clone());
    flash.position.copy(at);
    flash.lookAt(at.clone().sub(f));
    flash.renderOrder = 8;
    G.scene.add(flash);
    // a star and a word that face the camera, so it reads from above
    const star = textSprite('✸', 1.6, '#fff6b0');
    const word = textSprite('챙!', 0.9, '#ffe14d');
    star.visible = word.visible = true;
    star.position.copy(at);
    word.position.copy(at).setY(at.y + 0.9);
    G.scene.add(star, word);
    const bits = [];
    for (let i = 0; i < 20; i++) {
      const b = new THREE.Mesh(sparkGeo, sparkMat.clone());
      b.scale.setScalar(0.07 + Math.random() * 0.06);
      b.position.copy(at);
      const a = (Math.random() - 0.5) * 2.4 + Math.atan2(f.x, f.z), s = 2.5 + Math.random() * 3;
      b.userData.v = new THREE.Vector3(Math.sin(a) * s, 1.5 + Math.random() * 3, Math.cos(a) * s);
      b.renderOrder = 8;
      G.scene.add(b);
      bits.push(b);
    }
    const light = G.addLight({ pos: at.clone(), color: '#fff0a0', intensity: 14, distance: 6 });
    sparks.push({ flash, bits, light, star, word, t: 0 });
    G.emit('shieldBlock', { from: from.clone() });
  }

  G.onUpdate((dt) => {
    if (G.ticking()) {
      if (stepShield(sh, dt, def) === 'timeout') { setUp(false); G.emit('shieldDown'); }
      if (sh.up) {
        if (G.touch) {
          const pp = G.player.position;
          const near = G.enemies.filter((e) => !e.gone && e.state !== 'asleep' && e.pos.distanceTo(pp) < 8)
            .sort((a, b) => a.pos.distanceTo(pp) - b.pos.distanceTo(pp))[0];
          if (near) G.player.state.heading = Math.atan2(near.pos.x - pp.x, near.pos.z - pp.z);
        } else G.emit('faceCursor');
      }
    }
    for (const s of sparks) {
      s.t += dt;
      const k = Math.min(1, s.t / 0.4), kw = Math.min(1, s.t / 0.8);
      s.flash.scale.setScalar(0.6 + k * 1.4);
      s.flash.material.opacity = 0.9 * (1 - k);
      s.star.scale.setScalar(1.6 * (0.5 + k));
      s.star.material.opacity = 1 - k;
      s.word.position.y += dt * 0.8;
      s.word.material.opacity = 1 - kw * kw;
      for (const b of s.bits) {
        b.userData.v.y -= 14 * dt;
        b.position.addScaledVector(b.userData.v, dt);
        b.material.opacity = 1 - k;
        b.rotation.x += dt * 20;
      }
      s.light.intensity = 14 * (1 - k);
      if (kw >= 1) {
        s.light.on = false;
        G.scene.remove(s.star, s.word); s.star.material.dispose(); s.word.material.dispose();
        G.lightSources = G.lightSources.filter((l) => l !== s.light);
        G.scene.remove(s.flash); s.flash.material.dispose();
        for (const b of s.bits) { G.scene.remove(b); b.material.dispose(); }
        s.done = true;
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].done) sparks.splice(i, 1);
  });

  return {
    raise, lower, blocks, block, lastBlock: null,
    get up() { return sh.up; },
    get state() { return sh; },
    get cooldown() { return sh.cooldown / def.cooldown; }, // 0..1 still to wait
    get holdLeft() { return sh.up ? Math.max(0, 1 - sh.t / def.hold) : 0; },
    reset() { sh.up = false; sh.t = 0; sh.cooldown = 0; setUp(false); },
  };
}
