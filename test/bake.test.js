// Perf pass (tasks/20261107-perf-todo.md, test after scary-island's):
// baking a model (src/world/models.js `bake`): one mesh per material, the
// parts' transforms baked in: the same triangles in the same places, far
// fewer objects; rigged models untouched; materials (and their names) kept.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bake } from '../src/world/models.js';

function triangles(root) {
  root.updateMatrixWorld(true);
  const out = [], v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, p = g.attributes.position;
    for (let i = 0; i < p.count; i++) out.push(v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).toArray().map((x) => (Math.round(x * 1e3) / 1e3 || 0).toFixed(3)).join(',')); // (to the mm, no -0)
  });
  return out.sort();
}

describe('baking a model', () => {
  const rock = new THREE.MeshStandardMaterial({ name: 'rock' }), fern = new THREE.MeshStandardMaterial({ name: 'fern' });
  const model = () => {
    const root = new THREE.Group();
    root.name = 'mossBoulder';
    root.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), rock));
    for (let i = 0; i < 6; i++) {
      const node = new THREE.Group();
      node.position.set(Math.cos(i), 1, Math.sin(i));
      node.rotation.set(0.3 * i, i, 0);
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 5), fern);
      frond.scale.set(1, 1 + i * 0.1, 1);
      node.add(frond);
      root.add(node);
    }
    return root;
  };
  it('keeps every triangle where it was, as one mesh per material', () => {
    const src = model();
    const want = triangles(src);
    const baked = bake(src);
    expect(baked.name).toBe('mossBoulder');
    const meshes = [];
    baked.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes).toHaveLength(2);
    expect(new Set(meshes.map((m) => m.material))).toEqual(new Set([rock, fern]));
    expect(triangles(baked)).toEqual(want);
    expect(meshes.every((m) => m.matrixAutoUpdate === false)).toBe(true); // (they sit at the model's origin)
  });
  it('keeps the shadow flags and a part with several materials apart', () => {
    const src = model();
    const multi = new THREE.Mesh(new THREE.BoxGeometry(), [rock, fern]);
    multi.geometry.clearGroups();
    multi.geometry.addGroup(0, 18, 0); multi.geometry.addGroup(18, 18, 1);
    multi.position.set(0, 3, 0);
    src.add(multi);
    src.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const want = triangles(src);
    const baked = bake(src);
    const meshes = [];
    baked.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes).toHaveLength(3);
    expect(meshes.every((m) => m.castShadow)).toBe(true);
    expect(meshes.some((m) => Array.isArray(m.material))).toBe(true);
    expect(triangles(baked)).toEqual(want);
  });
  it('keeps the triangles of a copy placed, turned and scaled in the world', () => {
    const a = model(), b = bake(model()).clone(true);
    for (const o of [a, b]) { o.position.set(5, 2, -3); o.rotation.y = 1.2; o.scale.setScalar(1.5); }
    expect(triangles(b)).toEqual(triangles(a));
  });
  it('leaves a rigged model as it is (its bones move the parts)', () => {
    const geo = new THREE.BoxGeometry();
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(geo.attributes.position.count * 4).fill(0), 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(geo.attributes.position.count * 4).fill(0.25), 4));
    const bone = new THREE.Bone();
    const skinned = new THREE.SkinnedMesh(geo, rock);
    skinned.add(bone);
    skinned.bind(new THREE.Skeleton([bone]));
    const root = new THREE.Group();
    root.add(skinned);
    expect(bake(root)).toBe(root);
  });
});
