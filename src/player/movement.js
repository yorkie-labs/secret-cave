// Pure movement maths for the player, kept apart from three.js and Rapier.
import { ITEMS } from '../data/items.js';

export const WALK_SPEED = 4; // m/s (GDD §3.1)
export const RUN_SPEED = 6; // a click far away runs; the wolf (5.5) can be outrun
export const ROLL_SPEED = 7.0;
export const TURN_RATE = 14;
export const FALL_DEPTH = 3; // metres under the floor before we put the player back

// The hero's one-shot actions (seconds). The roll is 0.4 s, invulnerable all
// the way (GDD §3.1); a faint holds its last pose until the room resets.
export const ACTIONS = {
  swing: { duration: 0.45, cooldown: 0.1 },
  shoot: { duration: 0.4, cooldown: 0.1 },
  throw: { duration: 0.45, cooldown: 0.1 }, // the vine leaves the paw at `release`
  eat: { duration: ITEMS.herb.useTime, cooldown: 0.2 }, // a herb heals when it is eaten up
  roll: { duration: 0.4, cooldown: 0.25 },
  bark: { duration: 0.6, cooldown: 0.8 },
  sniff: { duration: 1.2, cooldown: 0.5 },
  hurt: { duration: 0.35, cooldown: 0 },
  faint: { duration: 1.2, cooldown: 0 },
  pickup: { duration: 0.5, cooldown: 0 },
  interact: { duration: 0.45, cooldown: 0 },
  victory: { duration: 1.4, cooldown: 0 },
};
// actions the hero stands still for
const STILL = new Set(['sniff', 'bark', 'interact', 'pickup', 'victory', 'faint', 'eat']);
export const THROW_RELEASE = 0.15; // s into the throw

// Input axes (forward/right in -1..1) turned into a world-space XZ direction,
// relative to where the camera looks. Camera yaw 0 looks toward -Z.
export function moveDirection({ forward = 0, right = 0 }, cameraYaw) {
  const len = Math.hypot(forward, right);
  if (len < 1e-6) return { x: 0, z: 0 };
  const f = forward / Math.max(1, len), r = right / Math.max(1, len);
  const sin = Math.sin(cameraYaw), cos = Math.cos(cameraYaw);
  return { x: -sin * f + cos * r, z: -cos * f - sin * r };
}

// Yaw that turns a +Z-facing model toward the direction (x, z).
export const headingOf = (x, z) => Math.atan2(x, z);

export function dampAngle(current, target, rate, dt) {
  let d = target - current;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return current + d * (1 - Math.exp(-rate * dt));
}

// Gravity in the air, a small press into the ground while standing (so
// snap-to-ground holds on slopes). No jumping in the cave (GDD §4.1: 3 is
// the shield; high places are reached by ramps and vines).
export function verticalVelocity(vy, { grounded, gravity, dt }) {
  if (grounded && vy <= 0) return -1;
  return vy - gravity * dt;
}

// Fallen through a gap in the world: put the player back on safe ground.
export const shouldRespawn = (y, floorY) => y < floorY - FALL_DEPTH;

// W3, the Ice Lake: on slippery ground (`slip` 0..1, world/world.js SLIP)
// the hero keeps a velocity of their own. It turns toward what the input
// asks only so fast (`grip` per second on bare ice) and, with nothing asked,
// slides on and slows over a couple of metres (`stop`); a roll's speed
// carries on further (`rollStop`). Off the ice the input applies at once,
// as before. Pure: returns the new velocity { x, z } (m/s).
export const ICE = { grip: 3.2, stop: 2.2, rollStop: 1.1, firm: 30 };
const mix = (a, b, t) => a + (b - a) * t;
export function slideVelocity(vel, want, slip, dt, { rolled = false } = {}) {
  if (!(slip > 0)) return { x: want.x, z: want.z };
  const moving = want.x !== 0 || want.z !== 0;
  const k = mix(ICE.firm, moving ? ICE.grip : rolled ? ICE.rollStop : ICE.stop, Math.min(1, slip));
  const a = 1 - Math.exp(-k * dt);
  return { x: vel.x + (want.x - vel.x) * a, z: vel.z + (want.z - vel.z) * a };
}
// how far the hero slides on, from `speed` m/s with nothing asked (the
// pointer lets go that much early, so a click on the ice stops near it)
export const slideDistance = (speed, slip, rolled = false) => (slip > 0 ? speed / mix(ICE.firm, rolled ? ICE.rollStop : ICE.stop, Math.min(1, slip)) : 0);

// Speed for this frame from the input and what the player is doing.
// Behind a raised shield the hero only walks, at `ITEMS.shield.slow` of it.
export function groundSpeed({ moving, run, action, shield = false }) {
  if (!moving) return 0;
  if (STILL.has(action)) return 0;
  if (shield) return WALK_SPEED * ITEMS.shield.slow;
  const base = run ? RUN_SPEED : WALK_SPEED;
  return action === 'swing' || action === 'shoot' || action === 'throw' ? base * 0.3 : base;
}
