import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { instance, whenLoaded, hasFailed } from './models.js';
import { distToSegment } from './world.js';
import { addCutaway, withFootCut } from './terrain.js';

// W1: the small things that make Moss Valley lush (docs/polyfork-survey.md
// §3c, area 1): moss mats, ferns, grass, flowers, mushrooms, roots, boulders,
// scree at the cliffs' feet, reeds and lilies round the pools, pebbles in the
// brooks, bones and crystals. Placed by a deterministic scatter on the
// world's 1 m grid (the same every time), never on a walking lane, a ramp, a
// gate, an encounter spot's middle or the camp's furniture. Drawn as
// InstancedMeshes, one per model part and 64 m chunk (the camera culls whole
// chunks), each instance tinted a little differently. Solid ones (boulders,
// stumps) get an upright cylinder, so paths go round them.
//
// A rule: { key, cell (m between tries), chance, s: [min, max] scale,
//   on: ground materials, foot (only at a cliff's foot) | water (only by a
//   pool) | brook (only in a brook), solid: collider radius × s, shadow,
//   tint: [hue jitter, light jitter], lane: extra metres kept off lanes,
//   far: drawn only within this many metres of the hero (the small clutter
//   near, the rocks further: the camera sees a lot of ground from 40°),
//   W2: caps (a giant mushroom's glowing cap and gills in that colour, the
//   instance a little tinted toward it), cut (dithered away when it stands
//   between the lens and the hero: a canopy), keep (the share still drawn at
//   `far`, see lodCount; lod: false draws all), hue (each one tinted that
//   colour: the forest's lilac moss) }
// W2: each batch (a rule's instances in one 64 m chunk) is thinned with
// distance (lodCount): all of it near the hero, fewer and fewer further out
// (its instances are in a random order, so the thinning is even), none past
// `far`. The far valley view at the widest zoom stays light.
export const RULES = [
  { key: 'grass', cell: 2.6, chance: 0.34, s: [2.2, 3.4], on: ['moss', 'meadow', 'camp'], tint: [0.04, 0.18], far: 62 },
  { key: 'grass', cell: 2.4, chance: 0.4, s: [2.4, 3.6], on: ['meadow'], tint: [0.05, 0.2], far: 62 },
  { key: 'clubMoss', cell: 8, chance: 0.3, s: [1.8, 2.8], on: ['moss', 'meadow'], tint: [0.03, 0.15], far: 45, keep: 0.15 },
  { key: 'fern', cell: 5.5, chance: 0.32, s: [1.7, 2.6], on: ['moss'], tint: [0.03, 0.15], lane: 0.5, far: 62 },
  { key: 'fernClump', cell: 8, chance: 0.28, s: [1.4, 2.2], on: ['moss', 'meadow'], tint: [0.03, 0.15], lane: 1, far: 75 },
  { key: 'flower', cell: 3.6, chance: 0.22, s: [2.6, 3.8], on: ['moss', 'camp'], tint: [0.1, 0.1], far: 62 },
  { key: 'flower', cell: 2.8, chance: 0.42, s: [2.6, 4], on: ['meadow'], tint: [0.12, 0.1], far: 62 },
  { key: 'mushrooms', cell: 6, chance: 0.32, s: [3, 4.6], on: ['moss'], foot: true, tint: [0.05, 0.15], far: 62 },
  { key: 'mushrooms', cell: 12, chance: 0.2, s: [3, 4], on: ['moss', 'meadow'], tint: [0.05, 0.15], far: 62 },
  { key: 'toadstool', cell: 9, chance: 0.18, s: [3, 4.4], on: ['moss', 'meadow'], tint: [0.04, 0.1], far: 62 },
  { key: 'roots', cell: 7, chance: 0.32, s: [1.6, 2.4], on: ['moss', 'meadow', 'ramp'], foot: true, tint: [0.02, 0.15], far: 90 },
  { key: 'scree', cell: 6, chance: 0.42, s: [1.6, 2.6], on: ['moss', 'meadow', 'camp', 'ramp', 'mine'], foot: true, tint: [0.02, 0.15], shade: 0.42, far: 90 },
  { key: 'pebbles', cell: 4, chance: 0.4, s: [1.8, 2.8], on: ['mine'], tint: [0.03, 0.15], shade: 0.8, far: 62 },
  { key: 'crystalCluster', cell: 12, chance: 0.3, s: [1.4, 2.4], on: ['mine'], tint: [0.06, 0.1], lane: 1, far: 115 },
  { key: 'bones', cell: 16, chance: 0.2, s: [1.6, 2.2], on: ['mine'], tint: [0.02, 0.08], far: 90 },
  { key: 'grass', cell: 4, chance: 0.25, s: [2, 3], on: ['mine', 'ramp'], tint: [0.06, 0.2], far: 62 },
  { key: 'boulders', cell: 11, chance: 0.4, s: [1.6, 2.6], on: ['moss', 'meadow', 'camp', 'ramp', 'mine'], foot: true, solid: 1.0, shadow: true, tint: [0.02, 0.18], shade: 0.72, lane: 1.5, far: 115 },
  { key: 'boulder', cell: 14, chance: 0.28, s: [1.4, 2.6], on: ['moss', 'meadow'], solid: 0.85, shadow: true, tint: [0.02, 0.18], lane: 2, far: 115 },
  { key: 'mossBoulder', cell: 15, chance: 0.3, s: [1.5, 2.5], on: ['moss', 'meadow'], solid: 0.85, shadow: true, tint: [0.03, 0.15], lane: 2, far: 115 },
  { key: 'outcrop', cell: 16, chance: 0.35, s: [1.8, 3.2], on: ['moss', 'meadow', 'camp'], foot: true, solid: 1.0, shadow: true, tint: [0.02, 0.15], lane: 2, far: 115 },
  { key: 'stump', cell: 18, chance: 0.22, s: [1.5, 2.2], on: ['moss'], solid: 0.45, shadow: true, tint: [0.03, 0.15], lane: 2, far: 115 },
  { key: 'log', cell: 26, chance: 0.22, s: [1.2, 1.6], on: ['moss', 'meadow'], shadow: true, tint: [0.03, 0.15], lane: 3, far: 115 },
  { key: 'bones', cell: 26, chance: 0.18, s: [1.6, 2.2], on: ['moss', 'meadow', 'ramp'], tint: [0.02, 0.08], far: 90 },
  { key: 'crystalCluster', cell: 18, chance: 0.24, s: [1.6, 3.2], on: ['moss', 'meadow'], foot: true, tint: [0.06, 0.1], lane: 1, far: 115 },
  { key: 'reeds', cell: 2.6, chance: 0.6, s: [1.4, 2], water: true, tint: [0.03, 0.12], far: 90 },
  { key: 'lilies', cell: 3.2, chance: 0.5, s: [1.3, 2], inWater: true, tint: [0.03, 0.12], far: 62 },
  { key: 'pebbles', cell: 2.2, chance: 0.6, s: [1.6, 2.4], brook: true, tint: [0.02, 0.1], far: 62 },
  // the pit far below the balcony: big glowing crystals (region 4, looks only)
  // (W2: faceted spires, not Polyfork's 1 m cluster blown up into a blob:
  // they read as crystals from the camp's balcony 70 m above)
  // (W4: the abyss under the Crystal Heart: they glow up out of the dark)
  { key: 'crystalSpire', cell: 16, chance: 0.42, s: [1.0, 2.1], on: ['crystal', 'abyss'], any: true, tint: [0.06, 0.12], far: 420, lod: false },
  { key: 'geode', cell: 30, chance: 0.25, s: [4, 6], on: ['crystal', 'abyss'], any: true, tint: [0.05, 0.15], shade: 0.45, far: 420, glow: '#6a3aa8', lod: false },
  // ---- W4: the Crystal Heart (docs/polyfork-survey.md §3c, area 4): the
  // ruined ledges paved with Dungeon & Crypt flagstones, fallen masonry and
  // ashlar, violet crystal clusters and glowing rune stones, bones; the
  // canyons' crystal grit with clusters, blue-sheen shards and scree; crystal
  // spires on the dark rock top round the pit (they break up its plain)
  { key: 'flagstone', cell: 3.2, chance: 0.55, s: [1.15, 1.45], on: ['ruin'], tint: [0.03, 0.14], shade: 0.95, far: 90, keep: 0.3 },
  { key: 'masonry', cell: 8, chance: 0.34, s: [2.4, 3.6], on: ['ruin'], solid: 0.25, shadow: true, cold: '#b2a8c8', tint: [0.03, 0.1], lane: 1.5, far: 115 },
  { key: 'ashlar', cell: 9, chance: 0.3, s: [2.6, 3.8], on: ['ruin', 'crystalPath'], tint: [0.03, 0.1], shade: 0.9, far: 90 },
  { key: 'crystalCluster', cell: 8, chance: 0.36, s: [1.6, 2.8], on: ['ruin', 'crystalPath', 'heartstone'], foot: true, tint: [0.05, 0.1], hue: '#c9a2ff', far: 115 },
  { key: 'crystalCluster', cell: 13, chance: 0.3, s: [1.4, 2.4], on: ['crystalPath', 'ruin'], tint: [0.05, 0.1], hue: '#b58cff', lane: 1.5, far: 115 },
  { key: 'runeStone', cell: 15, chance: 0.3, s: [1.4, 2.0], on: ['ruin', 'crystalPath'], tint: [0.04, 0.1], glow: '#9a5cff', lane: 1, far: 115 },
  { key: 'obsidian', cell: 10, chance: 0.3, s: [1.2, 2.2], on: ['crystalPath'], foot: true, cold: '#b9a2f0', tint: [0.03, 0.1], far: 90 },
  { key: 'scree', cell: 7, chance: 0.36, s: [1.6, 2.6], on: ['crystalPath', 'ruin'], foot: true, cold: '#a69cc4', tint: [0.02, 0.1], far: 90 },
  { key: 'bones', cell: 22, chance: 0.22, s: [1.6, 2.2], on: ['ruin', 'crystalPath'], tint: [0.02, 0.08], far: 90 },
  { key: 'crystalSpire', cell: 22, chance: 0.3, s: [0.4, 0.8], on: ['crystalTop'], any: true, tint: [0.06, 0.12], far: 230, keep: 0.5 },
  { key: 'crystalSpire', cell: 14, chance: 0.4, s: [0.3, 0.55], on: ['crystalPath'], foot: true, solid: 0.6, tint: [0.06, 0.12], lane: 2, far: 170, keep: 0.5 },
  // ---- W2: the Mushroom Forest (docs/polyfork-survey.md §3c, area 2): a
  // forest of giant glowing bonnets (7 m as built, 9–16 m here: the puppy is
  // tiny), violet and amber, their canopies cut away over the hero; under
  // them clusters of small glowing mushrooms, toadstools, shelf fungus,
  // fungus logs, cocoons, cobwebs at the cliffs' feet, puffballs, bones
  { key: 'bonnet', cell: 10, chance: 0.5, s: [1.1, 2.0], on: ['mushroom'], solid: 0.3, tint: [0.03, 0.1], lane: 3.5, far: 230, caps: '#b46bff', cut: true, keep: 0.55 },
  { key: 'bonnet', cell: 14, chance: 0.36, s: [0.9, 1.7], on: ['mushroom', 'loam'], solid: 0.3, tint: [0.03, 0.1], lane: 3.5, far: 230, caps: '#ff9a40', cut: true, keep: 0.55 },
  { key: 'mushrooms', cell: 5.5, chance: 0.3, s: [3.2, 5.2], on: ['mushroom', 'loam'], tint: [0.06, 0.15], shade: 0.8, far: 62, caps: '#a04cff' },
  { key: 'mushrooms', cell: 6, chance: 0.4, s: [3.5, 5.5], on: ['mushroom'], foot: true, tint: [0.06, 0.15], shade: 0.85, far: 62, caps: '#ff8a3a' },
  { key: 'toadstool', cell: 9, chance: 0.25, s: [3.4, 5], on: ['mushroom', 'loam'], tint: [0.08, 0.1], far: 62 },
  { key: 'shelfShrooms', cell: 9, chance: 0.32, s: [2.6, 4.2], on: ['mushroom'], foot: true, tint: [0.05, 0.12], far: 90 },
  { key: 'bracketLog', cell: 26, chance: 0.28, s: [1.1, 1.5], on: ['mushroom'], shadow: true, tint: [0.03, 0.12], lane: 3, far: 115 },
  { key: 'puffball', cell: 18, chance: 0.25, s: [0.32, 0.55], on: ['mushroom', 'loam'], solid: 0.9, shadow: true, tint: [0.03, 0.12], lane: 2, far: 140 },
  { key: 'cocoon', cell: 13, chance: 0.22, s: [1.6, 2.6], on: ['mushroom', 'loam'], tint: [0.03, 0.1], far: 62 },
  { key: 'cobweb', cell: 9, chance: 0.4, s: [2.2, 3.6], on: ['mushroom'], foot: true, tint: [0.02, 0.05], far: 62 },
  { key: 'scree', cell: 7, chance: 0.4, s: [1.6, 2.6], on: ['mushroom', 'loam'], foot: true, tint: [0.02, 0.12], shade: 0.4, far: 90 },
  { key: 'boulders', cell: 14, chance: 0.3, s: [1.6, 2.4], on: ['mushroom'], foot: true, solid: 1.0, shadow: true, tint: [0.02, 0.12], shade: 0.55, lane: 1.5, far: 115 },
  { key: 'bones', cell: 20, chance: 0.22, s: [1.6, 2.2], on: ['mushroom', 'loam'], tint: [0.02, 0.08], far: 90 },
  { key: 'pebbles', cell: 5, chance: 0.35, s: [1.8, 2.6], on: ['loam'], tint: [0.03, 0.15], shade: 0.7, far: 62 },
  { key: 'roots', cell: 8, chance: 0.3, s: [1.6, 2.4], on: ['loam', 'mushroom'], foot: true, tint: [0.02, 0.15], shade: 0.7, far: 90 },
  // lilac lichen mats and tufts, teal ferns: the forest floor's ground cover
  { key: 'grass', cell: 3.4, chance: 0.3, s: [2.2, 3.2], on: ['mushroom'], tint: [0.04, 0.15], hue: '#c8a2ff', far: 62 },
  { key: 'clubMoss', cell: 9, chance: 0.28, s: [1.8, 2.6], on: ['mushroom', 'loam'], tint: [0.03, 0.12], hue: '#b48cf0', far: 45, keep: 0.15 },
  { key: 'fern', cell: 8, chance: 0.22, s: [1.6, 2.4], on: ['mushroom'], tint: [0.03, 0.12], hue: '#86d8c8', lane: 0.5, far: 62 },
  { key: 'flower', cell: 3, chance: 0.3, s: [2.6, 3.6], on: ['camp'], tint: [0.12, 0.1], far: 62 },
  { key: 'fern', cell: 6, chance: 0.3, s: [1.6, 2.2], on: ['camp'], tint: [0.03, 0.15], lane: 0.5, far: 62 },
  // ---- W3: the Ice Lake (docs/polyfork-survey.md §3c, area 3): icicles
  // hanging under every lip (procedural), ice-blue crystal spires at the
  // cliffs' feet and out of the lake, blocks of ice, blue-sheen shards, frosted
  // rocks, scree and dead snags (`cold`: their colours turned to frost),
  // pale frozen tufts on the snow, chips of ice on the lake
  { key: 'icicles', cell: 3.2, chance: 0.6, s: [0.8, 1.5], on: ['iceTop', 'snow', 'iceRock'], lip: true, any: true, tint: [0.02, 0.12], far: 150, keep: 0.4 },
  { key: 'iceSpire', cell: 12, chance: 0.42, s: [0.32, 0.7], on: ['snow'], foot: true, solid: 0.7, tint: [0.04, 0.12], lane: 1.5, far: 170, keep: 0.5 },
  { key: 'iceSpire', cell: 18, chance: 0.34, s: [0.4, 0.95], on: ['ice'], solid: 0.7, tint: [0.04, 0.12], lane: 3, far: 170, keep: 0.5 },
  { key: 'mossCushion', cell: 22, chance: 0.3, s: [0.6, 1.1], on: ['ice'], solid: 1.6, shadow: true, cold: '#f6faff', tint: [0.02, 0.05], lane: 3, far: 150 },
  { key: 'crystalCluster', cell: 9, chance: 0.3, s: [1.4, 2.6], on: ['snow'], foot: true, tint: [0.04, 0.1], hue: '#a8e2ff', far: 90 },
  { key: 'iceChunk', cell: 9, chance: 0.28, s: [1.3, 2.8], on: ['snow'], solid: 0.38, shadow: true, cold: '#cdeeff', tint: [0.03, 0.12], lane: 1.5, far: 115 },
  { key: 'iceChunk', cell: 12, chance: 0.34, s: [1.2, 2.6], on: ['ice'], solid: 0.38, shadow: true, cold: '#cdeeff', tint: [0.03, 0.12], lane: 2.5, far: 115 },
  { key: 'obsidian', cell: 11, chance: 0.28, s: [1.2, 2.2], on: ['snow'], foot: true, cold: '#9fd2f6', tint: [0.03, 0.1], far: 90 },
  { key: 'boulders', cell: 13, chance: 0.32, s: [1.6, 2.6], on: ['snow'], foot: true, solid: 1.0, shadow: true, cold: '#dfeaf6', tint: [0.02, 0.1], lane: 1.5, far: 115 },
  { key: 'scree', cell: 7, chance: 0.4, s: [1.6, 2.6], on: ['snow'], foot: true, cold: '#e6eef8', tint: [0.02, 0.1], far: 90 },
  { key: 'deadSnag', cell: 21, chance: 0.28, s: [1.0, 1.7], on: ['snow'], solid: 0.35, shadow: true, cold: '#d2deea', tint: [0.02, 0.1], lane: 2.5, far: 140 },
  { key: 'snowLogs', cell: 28, chance: 0.22, s: [1.2, 1.6], on: ['snow'], solid: 0.8, shadow: true, tint: [0.02, 0.1], lane: 2.5, far: 115 },
  { key: 'grass', cell: 4.2, chance: 0.22, s: [1.8, 2.8], on: ['snow'], cold: '#eef6ff', tint: [0.02, 0.12], far: 62 },
  { key: 'bones', cell: 24, chance: 0.2, s: [1.6, 2.2], on: ['snow'], tint: [0.02, 0.08], far: 90 },
  { key: 'mossCushion', cell: 17, chance: 0.4, s: [0.7, 1.3], on: ['snow'], solid: 1.6, shadow: true, cold: '#f2f8ff', tint: [0.02, 0.06], lane: 2.5, far: 150 },
  { key: 'fernClump', cell: 7, chance: 0.3, s: [1.3, 2.0], on: ['snow'], cold: '#e4effa', tint: [0.02, 0.1], lane: 0.5, far: 75 },
  { key: 'boulder', cell: 15, chance: 0.3, s: [1.4, 2.4], on: ['snow'], solid: 0.85, shadow: true, cold: '#d8e6f4', tint: [0.02, 0.12], lane: 2, far: 115 },
];
// (procedural ones are not Polyfork models: nothing to load)
const PROCEDURAL = new Set(['crystalSpire', 'iceSpire', 'icicles']);
export const SCATTER_MODELS = [...new Set(RULES.map((r) => r.key))].filter((k) => !PROCEDURAL.has(k));
const CHUNK = 64;

function hash(a, b, c) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// A model as merged parts (one per material), in its own frame, ready to instance.
const protos = new Map();
// how tall a model is drawn at scale 1 (its parts' highest point)
const talls = new Map();
function tallOf(key) {
  if (!talls.has(key)) {
    let t = 0;
    for (const part of protoOf(key)) { part.geometry.computeBoundingBox(); t = Math.max(t, part.geometry.boundingBox.max.y); }
    talls.set(key, t || 3);
  }
  return talls.get(key);
}

function protoOf(key) {
  if (protos.has(key)) return protos.get(key);
  if (key === 'crystalSpire') { protos.set(key, crystalSpires()); return protos.get(key); }
  if (key === 'iceSpire') { protos.set(key, crystalSpires(ICE_SPIRE)); return protos.get(key); }
  if (key === 'icicles') { protos.set(key, icicleCluster()); return protos.get(key); }
  const root = instance(key);
  root.updateMatrixWorld(true);
  const byMat = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    else if (g.attributes.color.itemSize === 4) {
      const c = g.attributes.color, rgb = new Float32Array(c.count * 3);
      for (let i = 0; i < c.count; i++) { rgb[i * 3] = c.getX(i); rgb[i * 3 + 1] = c.getY(i); rgb[i * 3 + 2] = c.getZ(i); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
    }
    const m = o.material;
    if (!byMat.has(m)) byMat.set(m, []);
    byMat.get(m).push(g);
  });
  const parts = [...byMat].map(([m, gs]) => {
    const mat = m.clone();
    mat.vertexColors = true;
    return { geometry: mergeGeometries(gs, false), material: mat };
  });
  protos.set(key, parts);
  return parts;
}
// the same parts, glowing (the pit's crystals seen from far above)
const glowing = new Map();
function glowOf(key, color) {
  const k = key + color;
  // (fog-free: they shine through the haze far below the balcony)
  if (!glowing.has(k)) glowing.set(k, protoOf(key).map((p) => { const m = p.material.clone(); m.emissive = new THREE.Color(color); m.emissiveIntensity = 0.8; m.fog = false; return { geometry: p.geometry, material: m }; }));
  return glowing.get(k);
}

// W2: a cluster of crystal spires (about 3–8 m at s 1): hexagonal prisms
// with pointed tips, leaning out from one root, flat shaded, deep violet at
// the foot to pale lilac at the tips, glowing, with a bright rim where a
// facet turns away from the lens (so each spire's outline reads from far
// above); fog-free, like the pit's glow.
// W3 `look`: the Ice Lake's are ice-blue (ICE_SPIRE)
const ICE_SPIRE = { deep: '#2c6ea8', tip: '#f2fcff', emissive: '#2a7ac8', glow: 0.45, rim: [0.75, 0.95, 1.0], fog: true, key: 'ice-spire-rim' };
function crystalSpires(look = {}) {
  const geos = [];
  const deep = new THREE.Color(look.deep ?? '#3a1a7a'), tip = new THREE.Color(look.tip ?? '#e6d0ff');
  const spires = [[0, 0, 0, 7.5, 0.9], [1.3, 0.4, 0.35, 5, 0.65], [-1.1, 0.8, -0.3, 4.2, 0.6], [0.4, -1.3, 0.25, 3.4, 0.5], [-0.6, -0.9, -0.45, 2.6, 0.45]];
  for (const [x, z, lean, h, r] of spires) {
    const body = new THREE.CylinderGeometry(r * 0.82, r, h, 6, 1).translate(0, h / 2, 0);
    const cap = new THREE.ConeGeometry(r * 0.82, r * 1.9, 6, 1).translate(0, h + r * 0.95, 0);
    for (const g of [body, cap]) {
      const q = g.toNonIndexed();
      q.rotateZ(lean); q.rotateY(x * 1.7 + z); q.translate(x, -0.3, z);
      const pos = q.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) { c.copy(deep).lerp(tip, Math.min(1, Math.max(0, pos.getY(i) / (h + r * 1.9)) ** 0.8)); col.set([c.r, c.g, c.b], i * 3); }
      q.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      q.deleteAttribute('uv');
      geos.push(q);
    }
  }
  const geometry = mergeGeometries(geos, false);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.18, metalness: 0.1, emissive: look.emissive ?? '#5a28c8', emissiveIntensity: look.glow ?? 0.55, fog: !!look.fog });
  const rim = (look.rim ?? [0.95, 0.75, 1.0]).map((v) => v.toFixed(2)).join(', ');
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.2) * vec3(${rim}) * 1.6;`);
  };
  material.customProgramCacheKey = () => look.key ?? 'crystal-spire-rim';
  return [{ geometry, material }];
}

// W3: icicles hanging under a lip: a row of thin cones pointing down from
// the origin (0 to −3 m), along local x, white at the root to pale blue at
// the tips, a little glow so they read against the dark cliff
function icicleCluster() {
  const geos = [];
  const root = new THREE.Color('#f4fbff'), tipC = new THREE.Color('#7cc4f0');
  const list = [[-1.3, 0.1, 1.1, 0.13], [-0.85, -0.05, 2.1, 0.17], [-0.4, 0.12, 1.4, 0.12], [0, 0, 2.9, 0.22], [0.45, -0.1, 1.7, 0.15], [0.9, 0.08, 2.4, 0.18], [1.35, -0.04, 1.2, 0.12]];
  for (const [x, z, h, r] of list) {
    const g = new THREE.ConeGeometry(r, h, 5, 1).rotateX(Math.PI).translate(x, -h / 2 + 0.05, z).toNonIndexed();
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { c.copy(root).lerp(tipC, Math.min(1, -pos.getY(i) / 2.9)); col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    geos.push(g);
  }
  const geometry = mergeGeometries(geos, false);
  geometry.computeVertexNormals();
  return [{ geometry, material: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.15, emissive: '#3a8ad8', emissiveIntensity: 0.35 }) }];
}

// W3 `cold`: a model's colours turned to frost (grey, then lightened toward
// the tint): snowy rocks, frozen snags and tufts out of the valley's models
const frosted = new Map();
function coldOf(key, tint) {
  const k = key + tint;
  if (frosted.has(k)) return frosted.get(k);
  const t = new THREE.Color(tint);
  const out = protoOf(key).map((p) => {
    const geometry = p.geometry.clone();
    const c = geometry.attributes.color;
    for (let i = 0; i < c.count; i++) {
      const v = c.getX(i) * 0.3 + c.getY(i) * 0.55 + c.getZ(i) * 0.15;
      const l = 0.45 + Math.min(1, v * 1.4) * 0.55; // lighter: snow-dusted
      c.setXYZ(i, l * t.r, l * t.g, l * t.b);
    }
    const material = p.material.clone();
    if (material.color) material.color.set('#ffffff');
    return { geometry, material };
  });
  frosted.set(k, out);
  return out;
}

// W2: a giant mushroom's parts with its glowing cap and gills in `color`
// (Polyfork's bonnet names them cap-glow / gill-glow; a model without such
// parts glows a little all over); `cut`: dithered away over the hero
const capped = new Map();
function capsOf(key, color, cut, uniforms) {
  const k = `${key}${color}${cut ? 'cut' : ''}`;
  if (capped.has(k)) return capped.get(k);
  const parts = protoOf(key);
  const named = parts.some((p) => /glow/.test(p.material.name));
  const out = parts.map((p) => {
    let m = p.material.clone();
    if (!named || /glow/.test(m.name)) { m.emissive = new THREE.Color(color); m.emissiveIntensity = named ? (/gill/.test(m.name) ? 1.4 : 0.9) : 0.35; }
    if (cut && uniforms && (!named || /glow/.test(m.name))) m = addCutaway(m, uniforms); // (the cap, not the stem)
    return { geometry: p.geometry, material: m };
  });
  capped.set(k, out);
  return out;
}

// W2: how many of a batch's `n` instances to draw at `d` m from the hero: all
// of them within half of `far`, then fewer (down to `keep` of them at
// `far`), none past it. Pure (test/region2.test.js).
export const LOD_NEAR = 0.5;
export function lodCount(n, d, far, keep = 0.25) {
  if (!(d < far)) return 0;
  const near = far * LOD_NEAR;
  if (d <= near) return n;
  const k = (d - near) / (far - near); // 0 → 1
  return Math.max(1, Math.ceil(n * (1 - (1 - keep) * k)));
}
// the small clutter (grass, flowers, ferns: `far` ≤ 90 m) thins sooner when
// the lens is pulled back (its tufts are specks from up there): × its `far`
export const ZOOM_REF = 30; // m: the lens's distance where nothing changes
export const zoomFar = (far, camDist) => (far <= 90 ? Math.min(1, Math.max(0.55, ZOOM_REF / Math.max(1, camDist))) : 1);
// …and is drawn sparser (× its count): from up there a screen holds twice
// the ground, so the same tufts per screen take half the share
export const zoomDensity = (far, camDist) => (far <= 90 ? Math.min(1, Math.max(0.5, ZOOM_REF / Math.max(1, camDist))) : 1);
// how far from (x, z) to the nearest point of a batch's box [x0, z0, x1, z1]
export const boxDist = (x, z, b) => Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - z, 0, z - b[3]));

// Where a rule may put something: { ok(x, z) }, built over the sampled grid.
export function scatterPoints(world, nav, def, rules = RULES) {
  const g = world.sample();
  const { W, D, x0, z0 } = g;
  const idOf = (x, z) => {
    const i = Math.round(x - x0), j = Math.round(z - z0);
    if (i < 1 || j < 1 || i >= W - 1 || j >= D - 1) return null;
    return j * W + i;
  };
  const matOf = (k) => {
    const id = g.ids[g.region[k]];
    if (id === 'wall') return 'wall';
    const r = world.ramps.find((q) => q.id === id);
    if (r) return r.material ?? 'ramp';
    return world.terraces.find((t) => t.id === id)?.material ?? world.def.base.material;
  };
  const lanes = def.lanes ?? [];
  const nearLane = (x, z, pad, list = lanes) => list.some((l) => {
    for (let i = 0; i < l.pts.length - 1; i++) if (distToSegment(x, z, ...l.pts[i], ...l.pts[i + 1]) < l.width / 2 + pad) return true;
    return false;
  });
  // W6: and nothing solid on a ramp (a ramp's own `pts`: the lanes are
  // hand-drawn and a squeezed or re-laid ramp can leave its lane)
  const ramps = world.ramps.map((r) => ({ pts: r.pts, width: r.width }));
  const brookD = (x, z) => {
    let d = Infinity;
    for (const b of def.brooks ?? []) for (let i = 0; i < b.pts.length - 1; i++) d = Math.min(d, distToSegment(x, z, ...b.pts[i], ...b.pts[i + 1]) - b.width / 2);
    return d;
  };
  const keepOut = [
    ...(def.spots ?? []).map((s) => ({ x: s.at[0], z: s.at[1], r: Math.min(5, s.r * 0.5) })),
    ...(def.gates ?? []).map((gt) => ({ x: gt.at[0], z: gt.at[1], r: 7 })),
    // W5: the secret pockets: their chests, old letters and floors
    ...(def.secrets ?? []).flatMap((q) => [q.at, q.chest, q.glyph].map(([x, z]) => ({ x, z, r: 3.5 }))),
    ...Object.entries(def.camp ?? {}).filter(([k]) => k !== 'lanterns' && k !== 'merchantFaces').map(([, p]) => ({ x: p[0], z: p[1], r: 5 })),
    ...(def.bridges ?? []).flatMap((b) => [{ x: b.a[0], z: b.a[1], r: 6 }, { x: b.b[0], z: b.b[1], r: 6 }]),
    { x: def.spawn[0], z: def.spawn[1], r: 6 },
    // W2: the forest's pads and landings, poison, spring, chest and lift
    ...(def.bounces ?? []).flatMap((q) => [{ x: q.pad[0], z: q.pad[1], r: 3 }, { x: q.land[0], z: q.land[1], r: 3 }]),
    ...[...(def.hazards?.mud ?? []), ...(def.hazards?.tar ?? [])].map((h) => ({ x: h.at[0], z: h.at[1], r: h.r + 1.2 })),
    ...[...(def.hazards?.vents ?? []), ...(def.hazards?.poison ?? [])].map(([x, z]) => ({ x, z, r: 3 })),
    ...[def.rest, def.maskChest, def.lift?.ring, def.lift?.camp, def.starts?.mushroom].filter(Boolean).map(([x, z]) => ({ x, z, r: 4 })),
    ...(def.queen ? [{ x: def.queen.at[0], z: def.queen.at[1], r: def.queen.r + 2 }] : []),
    // W3: the Ice Bear's rink (its fight needs the whole floor), the rope
    // lift's ends, the nook's spring, the grotto's chest, the ice start
    ...(def.iceBear ? [{ x: def.iceBear.at[0], z: def.iceBear.at[1], r: def.iceBear.r + 3 }] : []),
    ...[def.lift3?.lake, def.lift3?.camp, def.rest3, def.armorChest, def.starts?.ice].filter(Boolean).map(([x, z]) => ({ x, z, r: 4.5 })),
    // W4: the king's platform (his fight needs the floor), the hops' pads and
    // landings, the crystal lift, the sunlight, the old letters
    ...(def.king ? [{ x: def.king.at[0], z: def.king.at[1], r: def.king.r + 3 }] : []),
    ...(def.hops ?? []).flatMap((q) => [{ x: q.pad[0], z: q.pad[1], r: 2.5 }, { x: q.land[0], z: q.land[1], r: 2.5 }]),
    ...[def.lift4?.heart, def.lift4?.camp, def.escape?.sun, def.ruins?.glyph?.at, def.starts?.heart].filter(Boolean).map(([x, z]) => ({ x, z, r: 4.5 })),
  ];
  const arena = def.arena;
  const H = (x, z) => { const k = idOf(x, z); return k === null ? NaN : g.h[k]; };
  // at a cliff's foot: ground at least 3 m higher within 5 m
  const foot = (x, z, h) => {
    for (let a = 0; a < 8; a++) { const d = 4.5; if (H(x + Math.cos(a * 0.785) * d, z + Math.sin(a * 0.785) * d) > h + 3) return true; }
    return false;
  };
  const out = [];
  rules.forEach((rule, ri) => {
    const n = Math.ceil((world.bounds[2] - world.bounds[0]) / rule.cell);
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      if (hash(a, b, ri * 7 + 1) > rule.chance) continue;
      const x = world.bounds[0] + (a + hash(a, b, ri * 7 + 2)) * rule.cell, z = world.bounds[1] + (b + hash(a, b, ri * 7 + 3)) * rule.cell;
      const k = idOf(x, z);
      if (k === null) continue;
      const h = g.h[k];
      const wet = !Number.isNaN(g.water[k]);
      if (rule.inWater) {
        if (!wet) continue;
        out.push({ rule: ri, x, z, y: g.water[k] + 0.02, s: rule.s[0] + hash(a, b, ri * 7 + 4) * (rule.s[1] - rule.s[0]), ry: hash(a, b, ri * 7 + 5) * 6.28, t: hash(a, b, ri * 7 + 6) });
        continue;
      }
      if (wet || !Number.isNaN(g.deck[k])) continue;
      const walk = nav.ok(k * 2);
      // W3 `lip`: icicles at a cliff's lip (the ground 3 m one way at least 5 m
      // lower), hung out over the drop and turned along the edge
      if (rule.lip) {
        if (!rule.on.includes(matOf(k))) continue;
        let drop = 0, way = 0;
        for (let q = 0; q < 8; q++) { const a = q * 0.785, hh = H(x + Math.cos(a) * 3, z + Math.sin(a) * 3); if (h - hh > drop) { drop = h - hh; way = a; } }
        if (drop < 5 || keepOut.some((o) => Math.hypot(o.x - x, o.z - z) < o.r)) continue;
        // (on a flat top, not a ledge in the face, and over open air where it hangs)
        const hx = x + Math.cos(way) * 1.3, hz = z + Math.sin(way) * 1.3;
        if (Math.abs(H(x - Math.cos(way), z - Math.sin(way)) - h) > 0.8 || !(H(hx, hz) < h - 1) || !(world.heightAt(hx, hz) < h - 1)) continue;
        out.push({ rule: ri, x: hx, z: hz, y: h, s: rule.s[0] + hash(a, b, ri * 7 + 4) * (rule.s[1] - rule.s[0]), ry: Math.PI / 2 - way, t: hash(a, b, ri * 7 + 6) });
        continue;
      }
      if (rule.any) { if (!g.open[k] || !rule.on.includes(matOf(k))) continue; } else if (!walk) continue;
      if (rule.on && !rule.on.includes(matOf(k))) continue;
      if (rule.water) { let near = false; for (let q = 0; q < 8 && !near; q++) { const kk = idOf(x + Math.cos(q * 0.785) * 2.5, z + Math.sin(q * 0.785) * 2.5); near = kk !== null && !Number.isNaN(g.water[kk]); } if (!near) continue; }
      const bd = brookD(x, z);
      if (rule.brook) { if (bd > 0.3) continue; } else if (bd < 1.2) continue;
      if (rule.foot && !foot(x, z, h)) continue;
      if (!rule.any && !rule.brook && !rule.water && nearLane(x, z, (rule.lane ?? 0) + (rule.solid ? 1.5 : 0))) continue;
      if (rule.solid && nearLane(x, z, 2, ramps)) continue;
      if (keepOut.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + (rule.solid ? 2 : 0))) continue;
      if (rule.solid && arena && Math.hypot(arena.at[0] - x, arena.at[1] - z) < arena.r + 2) continue;
      // (a fox's spot keeps its giants: it waits in their shade)
      if (rule.solid && (def.spots ?? []).some((s) => Math.hypot(s.at[0] - x, s.at[1] - z) < (s.kinds?.foxes && rule.cut ? 4.5 : s.r))) continue;
      out.push({ rule: ri, x, z, y: h, s: rule.s[0] + hash(a, b, ri * 7 + 4) * (rule.s[1] - rule.s[0]), ry: hash(a, b, ri * 7 + 5) * 6.28, t: hash(a, b, ri * 7 + 6) });
    }
  });
  // solid ones never on top of each other
  const kept = [], solids = [];
  for (const p of out) {
    const r = rules[p.rule].solid;
    if (r) {
      if (solids.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < (q.r + r * p.s) * 1.1)) continue;
      solids.push({ x: p.x, z: p.z, r: r * p.s });
    }
    kept.push(p);
  }
  return kept;
}

export function buildScatter(G, world, nav, def, rules = RULES) {
  const t0 = performance.now();
  const pts = scatterPoints(world, nav, def, rules);
  const group = new THREE.Group();
  group.name = 'scatter';
  group.userData.noFade = true;
  // chunk → rule → points
  const cells = new Map();
  for (const p of pts) {
    const key = `${Math.floor((p.x - world.bounds[0]) / CHUNK)},${Math.floor((p.z - world.bounds[1]) / CHUNK)}`;
    if (!cells.has(key)) cells.set(key, new Map());
    const byRule = cells.get(key);
    if (!byRule.has(p.rule)) byRule.set(p.rule, []);
    byRule.get(p.rule).push(p);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color(), hsl = {};
  const counts = {};
  let meshes = 0, solid = 0;
  const capTint = new THREE.Color();
  // (release: a batch whose model is still on its way is made when it lands;
  // models stream in after the title, world/models.js)
  const batch = (rule, ri, list) => {
    if (hasFailed(rule.key)) return; // (never came: left out, colliders too)
    // (in a random order: drawing the first k of them thins the batch evenly)
    list.sort((a, b) => hash(a.x * 10, a.z * 10, 77) - hash(b.x * 10, b.z * 10, 77));
    if (rule.caps) capTint.set('#ffffff').lerp(new THREE.Color(rule.caps), 0.45);
    else if (rule.hue) capTint.set(rule.hue);
    const box = list.reduce((b, p) => [Math.min(b[0], p.x), Math.min(b[1], p.z), Math.max(b[2], p.x), Math.max(b[3], p.z)], [Infinity, Infinity, -Infinity, -Infinity]);
    for (const part of rule.glow ? glowOf(rule.key, rule.glow) : rule.caps ? capsOf(rule.key, rule.caps, rule.cut, G.terrain?.uniforms) : rule.cold ? coldOf(rule.key, rule.cold) : protoOf(rule.key)) {
      // (W7: it goes with its ground when the cut-away opens that)
      const im = new THREE.InstancedMesh(part.geometry, withFootCut(part.material, G.terrain?.uniforms), list.length);
      list.forEach((p, i) => {
        q.setFromAxisAngle(up, p.ry);
        m4.compose(new THREE.Vector3(p.x, p.y - 0.05, p.z), q, new THREE.Vector3(p.s, p.s * (0.9 + p.t * 0.2), p.s));
        im.setMatrixAt(i, m4);
        const [dh, dl] = rule.tint ?? [0, 0];
        col.setRGB(1, 1, 1).getHSL(hsl);
        col.setHSL(0, 0, 1);
        // a light/dark and warm/cool wobble per instance
        const l = (rule.shade ?? 1) * (1 + (p.t - 0.5) * 2 * dl), w = (hash(p.x * 10, p.z * 10, ri) - 0.5) * 2 * dh;
        col.setRGB(l * (1 + w), l, l * (1 - w));
        if (rule.caps || rule.hue) col.multiply(capTint);
        im.setColorAt(i, col);
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = !!rule.shadow;
      im.receiveShadow = true;
      im.raycast = () => {}; // clicks go to the ground under them
      im.name = `scatter-${rule.key}`;
      im.userData.far = rule.far ?? 160;
      im.userData.at = list.reduce((c, p) => [c[0] + p.x / list.length, c[1] + p.z / list.length], [0, 0]);
      im.userData.box = box;
      im.userData.n = list.length;
      im.userData.keep = rule.lod === false ? 1 : rule.keep ?? (im.userData.far <= 62 ? 0.15 : 0.25);
      group.add(im);
      meshes++;
    }
    // as tall as the model is drawn (a click over a low boulder means the
    // ground behind it); a giant mushroom's stem: low, so a click past it
    // still means the ground beyond
    if (rule.solid) {
      const tall = rule.cut ? 0 : tallOf(rule.key);
      for (const p of list) {
        const h = rule.cut ? 1.4 : Math.min(3, Math.max(0.8, tall * p.s * (0.9 + p.t * 0.2)));
        G.physics.addCylinder(p.x, p.y, p.z, { radius: rule.solid * p.s, height: h });
        solid++;
      }
    }
  };
  for (const byRule of cells.values()) {
    for (const [ri, list] of byRule) {
      const rule = rules[ri];
      counts[rule.key] = (counts[rule.key] ?? 0) + list.length;
      if (PROCEDURAL.has(rule.key)) batch(rule, ri, list);
      else whenLoaded([rule.key], () => batch(rule, ri, list));
    }
  }
  G.scene.add(group);
  // each chunk's clutter shows only near the hero, thinner further out (a
  // few times a second; W2: lodCount from the nearest edge of the batch)
  let t = 0;
  const cull = () => {
    const p = G.player?.position;
    if (!p) return;
    const cam = G.cam?.rig?.distance ?? ZOOM_REF;
    for (const im of group.children) {
      const u = im.userData;
      // (W2: never over a chunk whose ground is not drawn)
      const k = G.terrain?.builtAt && !G.terrain.builtAt(u.at[0], u.at[1]) ? 0 : Math.ceil(lodCount(u.n, boxDist(p.x, p.z, u.box), u.far * zoomFar(u.far, cam), u.keep) * zoomDensity(u.far, cam));
      im.count = k;
      im.visible = k > 0;
    }
  };
  G.onUpdate((dt) => { t -= dt; if (t <= 0) { t = 0.25; cull(); } });
  const ms = Math.round(performance.now() - t0);
  return { group, counts, instances: pts.length, get meshes() { return meshes; }, get solid() { return solid; }, cull, ms };
}

// One model many times (the mine's rails along their runs): `list` of
// { x, y, z, ry, s }, as InstancedMeshes in `parent`.
// (the list it returns fills when the model has come)
export function instanceMany(G, key, list, { parent = G.scene, shadow = false } = {}) {
  const out = [];
  whenLoaded([key], () => out.push(...manyNow(G, key, list, { parent, shadow })));
  return out;
}
function manyNow(G, key, list, { parent, shadow }) {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const out = [];
  for (const part of protoOf(key)) {
    const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
    list.forEach((p, i) => {
      q.setFromAxisAngle(up, p.ry ?? 0);
      im.setMatrixAt(i, m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3().setScalar(p.s ?? 1)));
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = shadow; im.receiveShadow = true;
    im.raycast = () => {};
    im.name = `many-${key}`;
    im.userData.noFade = true;
    parent.add(im);
    out.push(im);
  }
  return out;
}
