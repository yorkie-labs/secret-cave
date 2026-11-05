import * as THREE from 'three';
import { addOutline } from './outline.js';

// M6a: the bat merchant (GDD §7.2 Shop, §14 #11: Island's parrot Polly
// becomes a bat): a round purple bat in a little green waistcoat with a
// gold coin on it, hovering behind a stall with a lantern and its goods.
// Click it (or Space nearby) to open the shop (ui/shop.js).
const mats = new Map();
const mat = (hex, extra = {}) => {
  const k = hex + JSON.stringify(extra);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: hex, flatShading: true, roughness: 0.8, ...extra }));
  return mats.get(k);
};

export function createBatModel() {
  const g = new THREE.Group();
  g.name = 'bat';
  const fur = { emissive: '#2a1838', emissiveIntensity: 0.7 };
  const add = (geo, color, [x, y, z], extra, parent = g) => { const m = new THREE.Mesh(geo, mat(color, extra)); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const body = add(new THREE.IcosahedronGeometry(0.42, 1), '#6a4a8c', [0, 0, 0], fur);
  body.scale.set(1, 1.1, 0.9);
  add(new THREE.IcosahedronGeometry(0.3, 1), '#c9b0e0', [0, -0.05, 0.2], fur).scale.set(1, 1.1, 0.6);
  // the waistcoat and its coin
  add(new THREE.CylinderGeometry(0.4, 0.44, 0.38, 10, 1, true, 0.6, Math.PI * 2 - 1.2), '#3f8a5a', [0, -0.12, 0], { side: THREE.DoubleSide, emissive: '#143a22', emissiveIntensity: 0.6 });
  add(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 10), '#ffcf4a', [0.14, -0.05, 0.38], { emissive: '#a8740c', emissiveIntensity: 0.8 }).rotation.x = Math.PI / 2;
  // ears, eyes, a little smile with two fangs
  for (const s of [-1, 1]) {
    const ear = add(new THREE.ConeGeometry(0.13, 0.36, 5), '#6a4a8c', [s * 0.22, 0.5, 0], fur);
    ear.rotation.z = -s * 0.3;
    add(new THREE.ConeGeometry(0.07, 0.24, 5), '#f0a0c8', [s * 0.22, 0.48, 0.05], { emissive: '#803060', emissiveIntensity: 0.4 }).rotation.z = -s * 0.3;
    add(new THREE.SphereGeometry(0.075, 10, 8), '#ffffff', [s * 0.14, 0.15, 0.34], { emissive: '#ffffff', emissiveIntensity: 0.3 });
    add(new THREE.SphereGeometry(0.04, 8, 6), '#1a0f22', [s * 0.14, 0.15, 0.4]);
    add(new THREE.ConeGeometry(0.025, 0.06, 4), '#ffffff', [s * 0.05, -0.02, 0.4]).rotation.x = Math.PI;
  }
  // wings: two fans of membrane on pivots (they flap)
  const wings = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.35, 0.1, -0.05);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(s * 0.9, 0.35); shape.lineTo(s * 0.75, 0.05); shape.lineTo(s * 0.95, -0.2); shape.lineTo(s * 0.6, -0.15); shape.lineTo(s * 0.55, -0.42); shape.lineTo(s * 0.2, -0.3); shape.closePath();
    const wing = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat('#4a3266', { side: THREE.DoubleSide, emissive: '#1e1030', emissiveIntensity: 0.6 }));
    pivot.add(wing);
    g.add(pivot);
    wings.push(pivot);
  }
  addOutline(g, { thickness: 0.02, minSize: 0.1 });
  g.userData.wings = wings;
  return g;
}

// the stall: a little table with a lantern and the goods on it
function createStall() {
  const g = new THREE.Group();
  g.name = 'stall';
  const wood = mat('#8a5a32', { emissive: '#2a1408', emissiveIntensity: 0.6 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.8), wood);
  top.position.y = 0.8;
  g.add(top);
  for (const [x, z] of [[-0.8, -0.3], [0.8, -0.3], [-0.8, 0.3], [0.8, 0.3]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), wood);
    leg.position.set(x, 0.4, z);
    g.add(leg);
  }
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.3, 0.84), mat('#7a3fb0', { emissive: '#3a1a60', emissiveIntensity: 0.5 }));
  cloth.position.y = 0.7;
  g.add(cloth);
  // goods: a herb, a mask, a red potion
  const herb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), mat('#5fd068', { emissive: '#1f6a24', emissiveIntensity: 0.6 }));
  herb.position.set(-0.55, 0.92, 0.1);
  const mask = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#ff8a3a', { emissive: '#ff8a3a', emissiveIntensity: 0.35 }));
  mask.position.set(0, 0.88, 0.1);
  mask.rotation.x = -0.8;
  const potion = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), mat('#ff4a6a', { emissive: '#c02040', emissiveIntensity: 0.7 }));
  potion.position.set(0.5, 0.96, 0.1);
  g.add(herb, mask, potion);
  // a lantern on a pole
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), wood);
  pole.position.set(0.95, 1.6, -0.3);
  const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), mat('#ffd27a', { emissive: '#ffb040', emissiveIntensity: 1.6 }));
  lamp.position.set(0.95, 2.35, -0.3);
  g.add(pole, lamp);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// the merchant at `at` ({ x, z }), facing `toward`; G.shop opens the panel
export function createMerchant(G, at, toward) {
  const root = new THREE.Group();
  root.name = 'merchant';
  const stall = createStall();
  const bat = createBatModel();
  bat.position.set(0, 1.55, -0.55);
  root.add(stall, bat);
  const y = at.y ?? 0; // W1: the camp's ground height
  root.position.set(at.x, y, at.z);
  root.rotation.y = Math.atan2(toward.x - at.x, toward.z - at.z);
  G.scene.add(root);
  G.look.shadows(root);
  G.physics.addCuboid(at.x, y + 0.5, at.z, 1.0, 0.5, 1.0);
  G.addLight({ pos: new THREE.Vector3(at.x, y + 2.6, at.z), color: '#ffd27a', intensity: 9, distance: 12 });
  const front = new THREE.Vector3(at.x + Math.sin(root.rotation.y) * 1.6, y, at.z + Math.cos(root.rotation.y) * 1.6);
  const m = { root, bat, pos: new THREE.Vector3(at.x, y, at.z), front, visits: 0 };
  G.addInteractable({
    pos: new THREE.Vector3(at.x, y, at.z), radius: 2.6, label: '🦇 박쥐 상인 (가게)', obj: root,
    action: () => { m.visits++; G.shop?.open(m); },
  });
  G.onUpdate(() => {
    const t = G.time;
    bat.position.y = 1.55 + Math.sin(t * 2.2) * 0.08;
    const [l, r] = bat.userData.wings;
    const f = Math.sin(t * 9) * 0.5;
    l.rotation.y = f; r.rotation.y = -f;
    // it turns its head toward the hero when close
    const pp = G.player.position;
    if (Math.hypot(pp.x - at.x, pp.z - at.z) < 8) bat.rotation.y = THREE.MathUtils.lerp(bat.rotation.y, Math.atan2(pp.x - at.x, pp.z - at.z) - root.rotation.y, 0.08);
  });
  return m;
}
