import * as THREE from 'three';

// Cartoon outlines (GDD §10.1 "선명한 캐릭터 외곽선") by the inverted-hull
// trick: a slightly bigger, back-faced, dark copy of each part draws behind
// it. Used on the hero and the monsters only, so the world stays soft.
const outlineMat = new THREE.MeshBasicMaterial({ color: '#2a1a12', side: THREE.BackSide });

export function addOutline(root, { thickness = 0.025, minSize = 0.06 } = {}) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && !o.userData.isOutline) meshes.push(o); });
  for (const m of meshes) {
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    const r = m.geometry.boundingSphere.radius;
    if (r < minSize || m.material.transparent) continue;
    const hull = new THREE.Mesh(m.geometry, outlineMat);
    hull.userData.isOutline = true;
    hull.castShadow = false;
    hull.receiveShadow = false;
    const c = m.geometry.boundingSphere.center;
    const k = 1 + thickness / r;
    hull.position.copy(c).multiplyScalar(1 - k); // scale about the part's own centre
    hull.scale.setScalar(k);
    hull.raycast = () => {};
    m.add(hull);
  }
  return root;
}
