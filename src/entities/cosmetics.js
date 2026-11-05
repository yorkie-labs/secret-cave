import * as THREE from 'three';
import { addOutline } from './outline.js';

// W5: the Maltese's cosmetics from the star altar (GDD §8.3 몰티즈 꾸미기,
// data/unlocks.js `wear`): no power, just for fun. Built from primitives in
// the hero's flat-shaded style and hung on its rig (entities/maltese.js):
//   head  탐험가 모자 (an explorer's hat) or 꽃 왕관 (a ring of flowers)
//   neck  빨간 목도리 (a red scarf with a tail)
//   feet  노란 장화 (yellow wellies on all four paws... well, two)
const mats = new Map();
const mat = (c, e = 0.25) => {
  const k = c + e;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: e, flatShading: true, roughness: 0.75 }));
  return mats.get(k);
};
const mesh = (geo, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, e } = {}) => {
  const m = new THREE.Mesh(geo, mat(color, e));
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  return m;
};

const MAKE = {
  hat() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.27, 0.28, 0.025, 14), '#b8955a', { y: 0 }));
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.15, 12), '#c9a96b', { y: 0.08 }));
    g.add(mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.04, 12), '#6e4526', { y: 0.03 }));
    g.add(mesh(new THREE.ConeGeometry(0.035, 0.12, 4), '#ff7eb3', { x: 0.15, y: 0.1, z: -0.04, rz: -0.6, e: 0.4 })); // a pink feather
    g.position.set(0, 0.31, -0.01);
    g.rotation.x = -0.12;
    return g;
  },
  crown() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.TorusGeometry(0.19, 0.022, 5, 18), '#5fd068', { rx: Math.PI / 2 }));
    const colors = ['#ffd34d', '#ff8ac2', '#ffffff', '#9fd8ff'];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const f = new THREE.Group();
      for (let p = 0; p < 5; p++) {
        const pa = (p / 5) * Math.PI * 2;
        f.add(mesh(new THREE.SphereGeometry(0.026, 6, 4), colors[i % colors.length], { x: Math.cos(pa) * 0.03, z: Math.sin(pa) * 0.03, e: 0.35 }));
      }
      f.add(mesh(new THREE.SphereGeometry(0.02, 6, 4), '#ffb020', { y: 0.01, e: 0.5 }));
      f.position.set(Math.cos(a) * 0.19, 0.015, Math.sin(a) * 0.19);
      g.add(f);
    }
    g.position.set(0, 0.2, 0);
    g.rotation.x = -0.18;
    return g;
  },
  scarf() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.TorusGeometry(0.15, 0.055, 6, 16), '#e8413c', { rx: Math.PI / 2 }));
    g.add(mesh(new THREE.BoxGeometry(0.085, 0.2, 0.045), '#e8413c', { x: 0.08, y: -0.09, z: 0.15, rz: 0.25 }));
    g.add(mesh(new THREE.BoxGeometry(0.088, 0.035, 0.047), '#ffffff', { x: 0.105, y: -0.18, z: 0.15, rz: 0.25 }));
    g.position.set(0, 0.02, 0.01);
    return g;
  },
  boots() {
    // one per paw: returned as a pair for the two feet
    const make = () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.068, 0.072, 0.1, 10), '#ffd34d', { y: 0.0 }));
      g.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.025, 10), '#c98a14', { y: -0.05 }));
      g.position.set(0, 0.0, 0.01);
      return g;
    };
    return [make(), make()];
  },
};
const SLOT_OF = { hat: 'head', crown: 'head', scarf: 'neck', boots: 'feet' };

// Put on what `wear` says ({ head, neck, feet }: unlock ids or null), taking
// off what it no longer does. Returns the parts on.
export function applyWear(model, wear = {}) {
  const rig = model.userData.rig;
  const on = (model.userData.wear ??= {});
  for (const slot of ['head', 'neck', 'feet']) {
    const want = wear[slot] ?? null;
    if (on[slot]?.id === want) continue;
    for (const o of on[slot]?.parts ?? []) o.parent?.remove(o);
    delete on[slot];
    if (!want || !MAKE[want] || SLOT_OF[want] !== slot) continue;
    const made = MAKE[want]();
    const parts = Array.isArray(made) ? made : [made];
    for (const p of parts) {
      addOutline(p, { thickness: 0.014, minSize: 0.04 });
      // drawn with the body, after the see-through silhouette (entities/silhouette.js):
      // else the head under a hat would show through it as a ghost
      p.traverse((o) => { if (o.isMesh) o.renderOrder = 2; });
    }
    if (slot === 'head') rig.head.add(parts[0]);
    else if (slot === 'neck') rig.neck.add(parts[0]);
    else ['L', 'R'].forEach((k, i) => (rig.legs[k].getObjectByName('foot') ?? rig.legs[k]).add(parts[i]));
    on[slot] = { id: want, parts };
  }
  // the pink bow hides under a hat (the flower crown keeps it)
  if (rig.bow) rig.bow.visible = on.head?.id !== 'hat';
  return on;
}
