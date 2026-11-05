import * as THREE from 'three';
import { ITEMS } from '../../data/items.js';
import { newMask, wearMask, dropMask, stepMask, detectScale, ambushDamage } from '../loadout.js';
import { sfx } from '../../audio/sound.js';
import { maskKeptByVine } from '../combos.js';

// M6a, the mask (GDD §6.3, rules in combat/loadout.js): right click puts on
// an animal mask (a little fox face with ears over the Maltese's face) for
// five seconds. The animals notice the hero from a third as far (enemy.js
// and mole.js read `scale`); the first hammer hit from behind it is twice as
// strong (hammer.js asks `ambush`), and any attack takes it off.
export function createMaskItem(G) {
  const base = ITEMS.mask;
  // W5: the star altar's rabbit mask: + seconds (run.maskBonus), a new face
  const defOf = () => (G.run.maskBonus ? { ...base, duration: base.duration + G.run.maskBonus } : base);
  let def = defOf();
  const m = newMask();
  const faces = { fox: createMaskModel(), rabbit: createMaskModel('rabbit') };
  let face = faces.fox;
  for (const f of Object.values(faces)) { f.visible = false; G.player.model.userData.rig.head.add(f); }
  const puff = [];

  function smoke() {
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: '#f3e8ff', transparent: true, opacity: 0.8, depthWrite: false }));
      const a = (i / 8) * Math.PI * 2;
      p.position.copy(G.player.position).add(new THREE.Vector3(Math.cos(a) * 0.3, 0.6, Math.sin(a) * 0.3));
      p.userData.v = new THREE.Vector3(Math.cos(a) * 1.2, 0.8, Math.sin(a) * 1.2);
      G.scene.add(p);
      puff.push({ p, t: 0 });
    }
  }

  function use() {
    def = defOf();
    if (!wearMask(m)) return false;
    face = G.run.maskBonus ? faces.rabbit : faces.fox;
    face.visible = true;
    smoke();
    sfx.whoosh?.();
    G.toast(G.run.maskBonus ? '🐰 토끼 탈! 동물인 척 (조금 더 오래, 공격하면 풀려요)' : '🎭 동물인 척! 가까이 가도 잘 몰라요 (공격하면 풀려요)', 2400);
    G.discover?.('mask');
    G.emit('maskOn');
    return true;
  }
  // an attack, or time up: off it comes
  function off(reason) {
    if (!dropMask(m, def)) return false;
    face.visible = false;
    smoke();
    G.emit('maskOff', { reason });
    return true;
  }
  G.on('waterShot', () => off('attack'));
  // W5: mask + vine (GDD §6.6): the vine thrown in disguise keeps it on
  G.on('vineThrown', () => { if (m.active && maskKeptByVine(G.run.owned)) G.itemCombo?.('maskVine'); else off('attack'); });
  G.on('hurt', () => off('hurt'));

  G.onUpdate((dt) => {
    if (G.ticking() && stepMask(m, dt, def) === 'off') { face.visible = false; smoke(); G.emit('maskOff', { reason: 'time' }); G.toast('🎭 탈이 풀렸어요', 1400); }
    for (const s of puff) {
      s.t += dt;
      s.p.position.addScaledVector(s.p.userData.v, dt);
      s.p.scale.setScalar(1 + s.t * 3);
      s.p.material.opacity = 0.8 * (1 - s.t / 0.6);
      if (s.t > 0.6) { G.scene.remove(s.p); s.p.material.dispose(); s.done = true; }
    }
    for (let i = puff.length - 1; i >= 0; i--) if (puff[i].done) puff.splice(i, 1);
  });

  return {
    id: 'mask', use, auto: false,
    get active() { return m.active; },
    get scale() { return detectScale(m, def); }, // × the animals' detect range
    get ready() { return !m.active && m.cooldown <= 0; },
    get cooldown() { return m.active ? 1 - m.t / def.duration : m.cooldown / def.cooldown; },
    get left() { return m.active ? def.duration - m.t : 0; },
    // the hammer from behind the mask: × ambush, and the mask comes off
    ambush(damage) { if (!m.active) return damage; const d = ambushDamage(damage, m, def); off('attack'); return d; },
    off,
    state: m,
    reset() { Object.assign(m, newMask()); for (const f of Object.values(faces)) f.visible = false; },
  };
}

// a little fox mask: an orange face with white cheeks, two pointy ears, eye
// holes and a black nose, worn over the Maltese's face (head space).
// W5 'rabbit': the star altar's rabbit mask: white, long pink-lined ears
export function createMaskModel(kind = 'fox') {
  if (kind === 'rabbit') return rabbitMask();
  const g = new THREE.Group();
  g.name = 'maskFace';
  const m = (c, e = 0.35) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: e, flatShading: true, roughness: 0.7 });
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), m('#ff8a3a'));
  face.rotation.x = Math.PI / 2;
  face.scale.set(1.15, 0.9, 0.55);
  g.add(face);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.2, 4), m('#ff8a3a'));
    ear.position.set(s * 0.15, 0.2, -0.02);
    ear.rotation.z = -s * 0.35;
    g.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 4), m('#2a1a12', 0.1));
    inner.position.set(s * 0.15, 0.19, 0.02);
    inner.rotation.z = -s * 0.35;
    g.add(inner);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), m('#fff4e6', 0.4));
    cheek.position.set(s * 0.1, -0.08, 0.09);
    cheek.scale.z = 0.5;
    g.add(cheek);
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.035, 10), new THREE.MeshBasicMaterial({ color: '#1a0c08' }));
    eye.position.set(s * 0.085, 0.04, 0.115);
    eye.scale.y = 0.6;
    g.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), m('#1a1010', 0.1));
  nose.position.set(0, -0.06, 0.13);
  g.add(nose);
  g.position.set(0, 0.0, 0.17);
  return g;
}

function rabbitMask() {
  const g = new THREE.Group();
  g.name = 'maskRabbit';
  const m = (c, e = 0.35) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: e, flatShading: true, roughness: 0.7 });
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), m('#f4f0ff', 0.4));
  face.rotation.x = Math.PI / 2;
  face.scale.set(1.1, 0.95, 0.55);
  g.add(face);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.26, 3, 6), m('#f4f0ff', 0.4));
    ear.position.set(s * 0.08, 0.3, -0.03);
    ear.rotation.z = -s * 0.18;
    g.add(ear);
    const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.2, 3, 6), m('#ff9ec4', 0.3));
    inner.position.set(s * 0.08, 0.3, 0.012);
    inner.rotation.z = -s * 0.18;
    g.add(inner);
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.035, 10), new THREE.MeshBasicMaterial({ color: '#1a0c08' }));
    eye.position.set(s * 0.085, 0.04, 0.115);
    eye.scale.y = 0.7;
    g.add(eye);
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.03, 10), new THREE.MeshBasicMaterial({ color: '#ffb3cf' }));
    cheek.position.set(s * 0.12, -0.04, 0.105);
    g.add(cheek);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), m('#ff7aa8', 0.3));
  nose.position.set(0, -0.04, 0.13);
  g.add(nose);
  g.position.set(0, 0.0, 0.17);
  return g;
}
