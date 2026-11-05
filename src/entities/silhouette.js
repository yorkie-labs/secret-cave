import * as THREE from 'three';

// See-through silhouettes (Diablo III/IV style): when a wall, ridge or tree is
// in front of the hero (or a monster that is after the hero), the hidden part is
// drawn as a flat coloured shape on top, so nobody is ever lost behind scenery.
//
// How: a copy of each part, drawn with depthFunc GREATER (only where something
// nearer already filled the depth buffer) and without writing depth. Draw order
// keeps it from showing through the character's own body: scenery (0), then
// the silhouette (1), then the character itself (2).
const cache = new Map();
function material(color) {
  if (!cache.has(color)) {
    cache.set(color, new THREE.MeshBasicMaterial({ color, depthFunc: THREE.GreaterDepth, depthWrite: false, fog: false }));
  }
  return cache.get(color);
}

export function addSilhouette(root, color = '#7fe3ff') {
  const parts = [];
  root.traverse((o) => {
    if (o.isMesh && o.userData.isOutline) o.renderOrder = 2; // outlines go with the body
    if (!o.isMesh || o.userData.isOutline || o.userData.isSilhouette) return;
    if (o.material?.transparent) return;
    o.renderOrder = 2;
    parts.push(o);
  });
  const ghosts = parts.map((m) => {
    const g = new THREE.Mesh(m.geometry, material(color));
    g.userData.isSilhouette = true;
    g.renderOrder = 1;
    g.castShadow = g.receiveShadow = false;
    g.raycast = () => {};
    m.add(g);
    return g;
  });
  return {
    set visible(v) { for (const g of ghosts) g.visible = v; },
  };
}
