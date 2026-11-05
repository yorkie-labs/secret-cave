import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createMaltese, createMalteseAnimator } from '../src/entities/maltese.js';
import { ACTIONS } from '../src/player/movement.js';

describe('the Maltese', () => {
  const m = createMaltese();
  const rig = m.userData.rig;
  it('has the rig the controller and animator drive', () => {
    for (const k of ['body', 'hips', 'torso', 'neck', 'head', 'hand', 'hammer', 'gun', 'tail']) expect(rig[k]).toBeTruthy();
    expect(Object.keys(rig.legs)).toEqual(['L', 'R']);
    expect(Object.keys(rig.arms)).toEqual(['L', 'R']);
    expect(rig.ears).toHaveLength(2);
    expect(rig.eyes).toHaveLength(2);
  });
  it('is chibi: about a metre tall, the head as wide as the body is tall', () => {
    m.updateMatrixWorld(true);
    const all = new THREE.Box3().setFromObject(m);
    const head = new THREE.Box3().setFromObject(rig.head);
    expect(all.max.y).toBeGreaterThan(1.0);
    expect(all.max.y).toBeLessThan(1.35);
    expect(all.min.y).toBeGreaterThan(-0.05);
    expect(head.max.y - head.min.y).toBeGreaterThan(all.max.y * 0.4); // big head, small body
  });
  it('plays every action without leaving the ground or the gun out', () => {
    const animate = createMalteseAnimator(m);
    for (const name of Object.keys(ACTIONS)) {
      const action = { name, t: 0, duration: ACTIONS[name].duration };
      for (let t = 0; t <= action.duration; t += 0.05) {
        action.t = t;
        animate(0.05, { speed: 0, action });
        m.updateMatrixWorld(true);
        expect(new THREE.Box3().setFromObject(rig.head).min.y, `${name} at ${t.toFixed(2)} s`).toBeGreaterThan(-0.02);
      }
      if (name === 'shoot') expect(rig.gun.visible).toBe(true);
    }
    animate(0.05, { speed: 4 });
    expect(rig.gun.visible).toBe(false);
  });
});
