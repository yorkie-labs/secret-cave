import { describe, it, expect } from 'vitest';
import {
  moveDirection, headingOf, dampAngle, verticalVelocity, shouldRespawn, groundSpeed, WALK_SPEED, RUN_SPEED, ROLL_SPEED, ACTIONS,
} from '../src/player/movement.js';

const close = (a, b) => { expect(a.x).toBeCloseTo(b.x); expect(a.z).toBeCloseTo(b.z); };

describe('moveDirection', () => {
  it('walks away from a camera that sits behind the player on +Z', () => {
    close(moveDirection({ forward: 1 }, 0), { x: 0, z: -1 });
    close(moveDirection({ right: 1 }, 0), { x: 1, z: 0 });
  });
  it('turns with the camera', () => {
    close(moveDirection({ forward: 1 }, Math.PI / 2), { x: -1, z: 0 });
  });
  it('does not speed up on diagonals', () => {
    const d = moveDirection({ forward: 1, right: 1 }, 0.7);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1);
  });
  it('is zero with no input', () => {
    expect(moveDirection({}, 1)).toEqual({ x: 0, z: 0 });
  });
});

describe('heading and turning', () => {
  it('faces a +Z model along its direction of travel', () => {
    expect(headingOf(0, 1)).toBeCloseTo(0);
    expect(headingOf(1, 0)).toBeCloseTo(Math.PI / 2);
  });
  it('turns the short way across the +-PI seam', () => {
    const a = dampAngle(Math.PI - 0.1, -Math.PI + 0.1, 10, 0.016);
    expect(a).toBeGreaterThan(Math.PI - 0.1);
  });
});

describe('verticalVelocity', () => {
  const base = { gravity: 9.81, dt: 1 / 60 };
  it('falls under gravity in the air', () => {
    expect(verticalVelocity(2, { ...base, grounded: false })).toBeCloseTo(2 - 9.81 / 60);
  });
  it('presses gently into the ground while standing', () => {
    expect(verticalVelocity(-7, { ...base, grounded: true })).toBe(-1);
  });
});

describe('groundSpeed', () => {
  it('walks, runs, and slows down while swinging', () => {
    expect(groundSpeed({ moving: false, run: true })).toBe(0);
    expect(groundSpeed({ moving: true, run: false })).toBe(WALK_SPEED);
    expect(groundSpeed({ moving: true, run: true })).toBe(RUN_SPEED);
    expect(groundSpeed({ moving: true, run: true, action: 'swing' })).toBeCloseTo(RUN_SPEED * 0.3);
    expect(groundSpeed({ moving: true, run: true, action: 'sniff' })).toBe(0);
  });
});

describe('shouldRespawn', () => {
  it('only once the player has fallen well under the floor', () => {
    expect(shouldRespawn(-1, 0)).toBe(false);
    expect(shouldRespawn(-3.5, 0)).toBe(true);
  });
});

describe('ACTIONS', () => {
  it('rolls for 0.4 s (GDD §3.1), far enough to dodge', () => {
    expect(ACTIONS.roll.duration).toBe(0.4);
    expect(ROLL_SPEED * ACTIONS.roll.duration).toBeGreaterThan(2.5);
  });
  it('stands still to faint, pick up, cheer; slows down to shoot', () => {
    for (const a of ['faint', 'pickup', 'victory']) expect(groundSpeed({ moving: true, action: a })).toBe(0);
    expect(groundSpeed({ moving: true, action: 'shoot' })).toBeCloseTo(WALK_SPEED * 0.3);
  });
});
