import * as THREE from 'three';
import { softGlowTexture } from '../world/glow.js';

// W4: an animal of the Crystal Heart, touched by the crystal's power (GDD
// §2.2: the deeper, the stronger): a violet glow along its coat (emissive on
// its own colours, so it still reads as a wolf, a fox, a deer…), two glowing
// purple eyes at its head and a few small crystal shards circling it. Works
// on any of the rigged animals (it finds the `Head` bone; failing that, a
// point over the model's front). Returns the animal.
const EYE = new THREE.Color('#d9a8ff');
const RIM = new THREE.Color('#7a3cff');
let shardGeo = null, shardMat = null, eyeMat = null;

export function crystalTint(G, e) {
  if (!e?.model || e.crystal) return e;
  e.crystal = true;
  e.model.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    o.material = o.material.clone();
    // (the eyes some models carry are MeshBasic: no emissive there)
    if (o.material.emissive) { o.material.emissive.copy(RIM); o.material.emissiveIntensity = 0.42; }
  });
  const head = e.model.getObjectByName('Head') ?? e.model.getObjectByName('head');
  eyeMat ??= new THREE.SpriteMaterial({ map: softGlowTexture(), color: EYE, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const eyes = new THREE.Group();
  eyes.name = 'crystalEyes';
  for (const side of [-1, 1]) {
    const s = new THREE.Sprite(eyeMat);
    s.scale.setScalar(0.32);
    s.position.set(side * 0.13, 0, 0);
    s.raycast = () => {};
    eyes.add(s);
  }
  G.scene.add(eyes);
  shardGeo ??= new THREE.OctahedronGeometry(0.12, 0);
  shardMat ??= new THREE.MeshStandardMaterial({ color: '#c9a2ff', emissive: '#8a4cff', emissiveIntensity: 1.1, flatShading: true, roughness: 0.2 });
  const ring = new THREE.Group();
  ring.name = 'crystalShards';
  const shards = [0, 1, 2].map((i) => { const m = new THREE.Mesh(shardGeo, shardMat); m.scale.set(1, 1.8, 1); m.userData.k = i / 3; m.raycast = () => {}; ring.add(m); return m; });
  G.scene.add(ring);
  const at = new THREE.Vector3(), fwd = new THREE.Vector3();
  G.onUpdate(() => {
    const asleep = e.state === 'asleep' || e.gone;
    const show = !!e.model.visible && !e.gone && !(e.state === 'asleep' && (e.sleepT ?? 0) > 2);
    eyes.visible = show && !asleep && !e.cloak?.hidden;
    ring.visible = show;
    if (!show) return;
    if (head) head.getWorldPosition(at); else at.copy(e.model.position).setY(e.model.position.y + 1);
    const h = e.heading ?? e.model.rotation.y;
    fwd.set(Math.sin(h), 0, Math.cos(h));
    eyes.position.copy(at).addScaledVector(fwd, 0.18).setY(at.y + 0.06);
    eyes.rotation.y = h;
    const t = G.time;
    const p = e.model.position;
    for (const s of shards) {
      const a = t * 1.6 + s.userData.k * Math.PI * 2;
      s.position.set(p.x + Math.cos(a) * 0.9, p.y + 1.2 + Math.sin(t * 2 + s.userData.k * 5) * 0.2, p.z + Math.sin(a) * 0.9);
      s.rotation.y = t * 3;
      s.material.opacity = asleep ? 0.3 : 1;
    }
  });
  return e;
}
