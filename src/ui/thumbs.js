import * as THREE from 'three';
import { createWolfModel } from '../entities/wolf.js';
import { createRabbitModel } from '../entities/rabbit.js';
import { createFoxModel } from '../entities/fox.js';
import { createMoleModel } from '../entities/mole.js';
import { createDeerModel } from '../entities/deer.js';
import { createBearModel } from '../entities/bear.js';
import { addCrown } from '../entities/bosses/rabbitChief.js';
import { createQueenModel } from '../entities/bosses/mushroomQueen.js';
import { whiten, addFrost } from '../entities/bosses/iceBear.js';
import { buildKing } from '../entities/bosses/crystalKing.js';
import { createHammer, createShield, createHerb, createVineCoil, createWaterGun, createMaltese } from '../entities/maltese.js';
import { createMaskModel } from '../combat/items/mask.js';
import { lootModel } from '../entities/chest.js';
import { createNecklaceModel } from '../entities/necklace.js';

// W5: little pictures for the codex book (GDD §8.4): each entry's own model
// (the Polyfork animals, the procedural bosses and items) drawn once into a
// small offscreen renderer and kept as an image. Seen entries show it in
// colour; unseen ones the same picture as a dark silhouette (style.css). A
// model that cannot be made (not loaded in this mode) falls back to its icon.
const SIZE = 160;
const MAKERS = {
  wolf: () => createWolfModel(),
  rabbit: () => createRabbitModel(),
  hare: () => createRabbitModel({ key: 'hare' }),
  fox: () => createFoxModel(),
  mole: () => { const m = createMoleModel(); return m; },
  deer: () => createDeerModel(),
  bear: () => createBearModel(),
  rabbitChief: () => { const m = createRabbitModel({ scale: 1.6, coat: '#d9cde8' }); addCrown(m.userData.rig); return m; },
  mushroomQueen: () => createQueenModel(),
  iceBear: () => { const m = createBearModel({ recolour: whiten, coat: '#ffffff' }); addFrost(m.userData.rig); return m; },
  crystalKing: () => buildKing().model,
  hammer: () => { const h = createHammer(); h.rotation.z = -0.5; return h; },
  waterGun: () => { const g = createWaterGun(); g.rotation.y = -1.2; return g; },
  vine: () => createVineCoil(),
  mask: () => createMaskModel(),
  shield: () => { const s = createShield(); s.rotation.set(Math.PI / 2, 0, 0); return s; },
  herb: () => createHerb(),
  armor: () => { const g = lootModel('armor'); g.remove(g.userData.ring); return g; },
  necklace: () => createNecklaceModel(),
  purpleShard: () => shardModel(),
  maltese: () => createMaltese(),
};
const cache = new Map();
let renderer = null, scene = null, camera = null;

function setup() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff6e8', '#4a4060', 2.2));
  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  key.position.set(2, 3, 4);
  scene.add(key);
  camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
}

// A picture of `id` (a data URL), or null when there is no model for it.
export function thumbOf(id) {
  if (cache.has(id)) return cache.get(id);
  const make = MAKERS[id];
  let url = null;
  if (make) {
    try {
      if (!renderer) setup();
      const obj = make();
      obj.updateMatrixWorld(true);
      // fit it: centred, the camera a little above and to the right
      const box = new THREE.Box3().setFromObject(obj);
      const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
      const r = Math.max(s.x, s.y, s.z) * 0.62 || 1;
      const dir = new THREE.Vector3(0.55, 0.38, 1).normalize();
      camera.position.copy(c).addScaledVector(dir, r / Math.tan((camera.fov * Math.PI) / 360));
      camera.near = r * 0.05; camera.far = r * 20;
      camera.lookAt(c);
      camera.updateProjectionMatrix();
      scene.add(obj);
      renderer.render(scene, camera);
      url = renderer.domElement.toDataURL('image/png');
      scene.remove(obj);
    } catch (err) {
      console.warn('codex picture', id, err.message);
      url = null;
    }
  }
  cache.set(id, url);
  return url;
}
// done drawing (the codex closed): let the GL context go; the pictures stay
export function releaseThumbs() {
  if (!renderer) return;
  renderer.dispose();
  renderer.forceContextLoss?.();
  renderer = null;
}

// the purple shard after the ending (also world/secrets.js)
export function shardModel() {
  const g = new THREE.Group();
  g.name = 'purpleShard';
  const mat = new THREE.MeshStandardMaterial({ color: '#c99bff', emissive: '#8a3cff', emissiveIntensity: 1.2, flatShading: true, roughness: 0.15, transparent: true, opacity: 0.95 });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), mat);
  core.scale.set(0.7, 1.5, 0.7);
  g.add(core);
  for (const [x, y, s] of [[0.22, -0.18, 0.4], [-0.2, -0.22, 0.32]]) {
    const b = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), mat);
    b.position.set(x, y, 0.05); b.scale.set(0.6 * s / 0.4, 1.3 * s / 0.4, 0.6 * s / 0.4);
    b.rotation.z = x > 0 ? -0.4 : 0.4;
    g.add(b);
  }
  return g;
}
