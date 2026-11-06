import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createMaltese, createMalteseAnimator, MALTESE_COLORS } from '../src/entities/maltese.js';
import { applyWear } from '../src/entities/cosmetics.js';
import { ACTIONS } from '../src/player/movement.js';

const boxOf = (o) => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); };
// triangles of the model itself (not the outline hulls)
const trianglesOf = (root) => {
  let n = 0;
  root.traverse((o) => { if (o.isMesh && !o.userData.isOutline) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  return n;
};

describe('the Maltese', () => {
  const m = createMaltese();
  const rig = m.userData.rig;
  it('has the rig the controller, animator, intro and cosmetics drive', () => {
    for (const k of ['body', 'hips', 'torso', 'neck', 'head', 'hand', 'hammer', 'gun', 'shield', 'herb', 'vine', 'tail']) expect(rig[k], k).toBeTruthy();
    expect(Object.keys(rig.legs)).toEqual(['L', 'R']);
    expect(Object.keys(rig.arms)).toEqual(['L', 'R']);
    expect(rig.ears).toHaveLength(2);
    expect(rig.eyes).toHaveLength(2);
    for (const k of ['L', 'R']) expect(rig.legs[k].getObjectByName('foot'), `foot ${k}`).toBeTruthy();
  });
  it('is chibi: about a metre tall, the head as wide as the body is tall', () => {
    const all = boxOf(m);
    const head = boxOf(rig.head);
    expect(all.max.y).toBeGreaterThan(1.0);
    expect(all.max.y).toBeLessThan(1.35);
    expect(all.min.y).toBeGreaterThan(-0.05);
    expect(head.max.y - head.min.y).toBeGreaterThan(all.max.y * 0.4); // big head, small body
    expect(head.max.x - head.min.x).toBeGreaterThan(0.5); // (the long ears hang wide of the face)
  });
  it('is a puppy cut: short body coat, legs apart down to the floor, ears framing a round head', () => {
    const L = boxOf(rig.legs.L), R = boxOf(rig.legs.R);
    expect(L.min.y).toBeLessThan(0.05); // short sturdy legs, fluffy socks on the floor
    expect(R.min.x - L.max.x).toBeGreaterThan(0.02); // a gap between the two legs: no skirt
    const torso = new THREE.Box3();
    for (const o of rig.torso.children) if (o.isMesh) torso.union(boxOf(o));
    expect(torso.min.y).toBeGreaterThan(0.12); // the body's fur stops at the hips
    const head = boxOf(rig.head.children.find((o) => o.isMesh));
    for (const ear of rig.ears) {
      const e = boxOf(ear);
      expect(e.min.y).toBeLessThan(head.min.y + 0.12); // hanging down the side of the head…
      expect(e.min.y).toBeGreaterThan(head.min.y - 0.12); // …to about the jaw, not to the shoulders
    }
  });
  it('is neither boy nor girl: no bow, no top-knot', () => {
    expect(MALTESE_COLORS.bow).toBeUndefined();
    expect(rig.bow).toBeUndefined();
    expect(m.getObjectByName('topknot')).toBeUndefined();
  });
  it('keeps the triangle count of one hero modest', () => {
    expect(trianglesOf(m)).toBeLessThan(16000); // (the tufted model before 2026-11-06: ~20 k)
  });
  it('plays every action without leaving the ground or the gun out', () => {
    const animate = createMalteseAnimator(m);
    for (const name of Object.keys(ACTIONS)) {
      const action = { name, t: 0, duration: ACTIONS[name].duration };
      for (let t = 0; t <= action.duration; t += 0.05) {
        action.t = t;
        animate(0.05, { speed: 0, action });
        expect(boxOf(rig.head).min.y, `${name} at ${t.toFixed(2)} s`).toBeGreaterThan(-0.02);
      }
      if (name === 'shoot') expect(rig.gun.visible).toBe(true);
    }
    animate(0.05, { speed: 4 });
    expect(rig.gun.visible).toBe(false);
  });
  it('the ears sway and settle: springs move them while running, and stay finite', () => {
    const animate = createMalteseAnimator(m);
    for (let i = 0; i < 40; i++) animate(1 / 60, { speed: 0 });
    const still = rig.ears[0].rotation.x;
    let moved = 0;
    for (let i = 0; i < 30; i++) { animate(1 / 60, { speed: 5 }); moved = Math.max(moved, Math.abs(rig.ears[0].rotation.x - still)); }
    expect(moved).toBeGreaterThan(0.05);
    for (let i = 0; i < 240; i++) animate(1 / 60, { speed: 0 });
    for (const o of [...rig.ears, rig.tail]) expect(Number.isFinite(o.rotation.x) && Math.abs(o.rotation.x) < 0.2).toBe(true);
    // a pose held still (dt 0, the gallery and intro): the ears at rest, no stale lag
    animate(0, { speed: 0, action: { name: 'faint', t: 1.1, duration: ACTIONS.faint.duration } });
    expect(boxOf(rig.head).min.y).toBeGreaterThan(-0.02);
  });
  it('holds its props in the paws and wears the cosmetics on the rig', () => {
    expect(rig.hammer.parent).toBe(rig.hand);
    for (const p of [rig.gun, rig.shield, rig.herb, rig.vine]) expect(p.parent.name).toBe('handL');
    const dog = createMaltese();
    const r = dog.userData.rig;
    applyWear(dog, { head: 'hat', neck: 'scarf', feet: 'boots' });
    expect(r.legs.L.getObjectByName('foot').children.length).toBeGreaterThan(4); // the wellies on the paws
    // the hat sits on the head: its brim not floating far above the fur
    const headTop = boxOf(r.head.children.find((o) => o.isMesh)).max.y;
    const hat = boxOf(dog.userData.wear.head.parts[0]);
    expect(hat.min.y).toBeLessThan(headTop);
    expect(hat.min.y).toBeGreaterThan(headTop - 0.12);
    applyWear(dog, { head: 'crown' });
    expect(dog.userData.wear.feet).toBeUndefined();
  });
});
