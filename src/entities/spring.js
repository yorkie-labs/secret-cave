import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { sfx } from '../audio/sound.js';
import { refillArmor } from '../combat/loadout.js';

// a spring's gift (GDD §7.3): 2 hearts and a herb, once per spring
const REST = { heal: 2, herbs: 1 };

// The glowing spring of a rest room (GDD §7.2 "모닥불 대신 빛나는 샘",
// §7.3): a ring of mossy stones round softly shining water with bubbles of
// light rising from it. Drinking from it (click, or Space nearby) heals two
// hearts and gives a herb, once; then it dims.
// W1: `y` (the ground's height there); the camp's spring is `endless` and
// heals every heart (`full`), a herb at most once an expedition (`herbOnce`).
export function createSpring(G, { x, z, y = 0, full = false, endless = false }) {
  const g = new THREE.Group();
  g.name = 'spring';
  g.position.set(x, y, z);
  const stone = new THREE.MeshStandardMaterial({ color: '#6c7a6a', flatShading: true, roughness: 0.95 });
  const moss = new THREE.MeshStandardMaterial({ color: '#6f9a4e', flatShading: true, roughness: 1 });
  const R = 1.1;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32 + (i % 3) * 0.05, 0), i % 4 === 0 ? moss : stone);
    s.position.set(Math.cos(a) * R, 0.18, Math.sin(a) * R);
    s.scale.y = 0.7;
    s.rotation.set(i, i * 0.5, 0);
    s.castShadow = true;
    g.add(s);
  }
  const water = new THREE.MeshStandardMaterial({ color: '#5fd8ff', emissive: '#2fb8ff', emissiveIntensity: 1.6, transparent: true, opacity: 0.85, roughness: 0.2 });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(R - 0.1, 24).rotateX(-Math.PI / 2), water);
  pool.position.y = 0.22;
  g.add(pool);
  const bubbleMat = new THREE.MeshBasicMaterial({ color: '#c8f4ff', transparent: true, opacity: 0.8, depthWrite: false, fog: false });
  const bubbles = Array.from({ length: 8 }, (_, i) => {
    const b = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), bubbleMat.clone());
    b.userData = { a: i * 2.4, r: 0.2 + (i % 3) * 0.25, t: i * 0.4 };
    g.add(b);
    return b;
  });
  G.scene.add(g);
  G.look.shadows(g);
  G.physics.addCapsule(x, y - 0.5, z, { radius: 0.85, height: 1.0 }); // a low round rim: walked round, not through
  const light = G.addLight({ pos: new THREE.Vector3(x, y + 1.4, z), color: '#7fdcff', intensity: 9, distance: 10 });

  const spring = { model: g, used: false, pos: g.position, herbGiven: false };
  spring.drink = () => {
    if (spring.used) { G.toast('샘물은 한 번만 마실 수 있어요'); return false; }
    if (!endless) spring.used = true;
    const run = G.run;
    const before = run.hearts;
    run.hearts = full ? run.maxHearts : Math.min(run.maxHearts, run.hearts + REST.heal);
    const blue = refillArmor(run); // W3: the armour's blue hearts fill again
    let herb = false;
    if (run.herbs < ITEMS.herb.max && !(endless && spring.herbGiven)) { run.herbs = Math.min(ITEMS.herb.max, run.herbs + REST.herbs); herb = true; spring.herbGiven = true; }
    sfx.heal();
    G.hud.healed();
    G.toast(`💧 시원해요! 하트 +${run.hearts - before}${blue > 0 ? ` · 💙 +${blue}` : ''}${herb ? ` · 약초 +1 (${run.herbs}/${ITEMS.herb.max})` : ' · 약초 주머니는 가득 찼어요'}`, 3200);
    G.refresh();
    G.emit('springUsed', { healed: run.hearts - before, herb });
    return true;
  };
  G.addInteractable({
    pos: g.position.clone(), radius: 2.4, name: '빛나는 샘', kind: 'spring', spring,
    label: () => (spring.used ? '빛나는 샘 (다 마셨어요)' : '💧 빛나는 샘 마시기'),
    enabled: () => !spring.used,
    action: () => spring.drink(),
  });

  G.onUpdate((dt) => {
    const k = spring.used ? 0.35 : 1;
    water.emissiveIntensity += ((1.6 * k + Math.sin(G.time * 2) * 0.2 * k) - water.emissiveIntensity) * Math.min(1, dt * 3);
    light.intensity = 9 * k;
    for (const b of bubbles) {
      const u = b.userData;
      u.t += dt * (spring.used ? 0.3 : 1);
      const h = (u.t % 2) / 2;
      b.visible = !spring.used || h < 0.3;
      b.position.set(Math.cos(u.a) * u.r, 0.25 + h * 1.6, Math.sin(u.a) * u.r);
      b.material.opacity = 0.8 * (1 - h);
    }
  });
  return spring;
}
