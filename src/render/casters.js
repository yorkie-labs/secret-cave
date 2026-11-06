// Perf pass (tasks/20261107-perf-todo.md): what draws into the shadow map.
// The stage's `look.shadows(root)` makes every mesh under `root` cast and
// receive. Two kinds of mesh there cast for nothing, each one a draw call
// in the shadow pass every frame:
// - the cartoon outline's hull (entities/outline.js) and the see-through
//   silhouette's copy (entities/silhouette.js): the same shape as the part
//   they belong to, a hair bigger — the shadow is already the part's (the
//   hero's 53 parts were drawn twice into the map)
// - tiny parts: the hero's eyes and pockets, a chest's studs, a herb's
//   leaves — under MIN_CASTER metres across they make no shadow a 2048 map
//   with soft edges can show (a texel is 3–5 cm at the usual zoom)
// Everything bigger keeps its shadow: characters, animals, rocks, landmarks,
// props that read.
import * as THREE from 'three';

export const MIN_CASTER = 0.08; // m: the radius below which a part casts nothing
const s = new THREE.Vector3();

/** Is this mesh one that should not cast (an outline / silhouette copy, or a part smaller than `min` m)? */
export function castsForNothing(o, min = MIN_CASTER) {
  if (o.userData.isOutline || o.userData.isSilhouette) return true;
  if (o.isSkinnedMesh || o.isInstancedMesh || !o.geometry) return false;
  if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
  o.getWorldScale(s);
  return o.geometry.boundingSphere.radius * Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z)) < min;
}

/** After `look.shadows(root)`: the meshes that cast for nothing stop casting (they still receive). */
export function trimCasters(root, min = MIN_CASTER) {
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (!o.isMesh || !o.castShadow) return;
    if (castsForNothing(o, min)) {
      o.castShadow = false;
      if (o.userData.isOutline || o.userData.isSilhouette) o.receiveShadow = false;
    }
  });
  return root;
}
