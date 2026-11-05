import * as THREE from 'three';
import { GRAVITY } from '../physics/physics.js';
import { createMaltese, createMalteseAnimator } from '../entities/maltese.js';
import { sfx } from '../audio/sound.js';
import { ITEMS } from '../data/items.js';
import {
  TURN_RATE, ROLL_SPEED, ACTIONS, THROW_RELEASE,
  moveDirection, headingOf, dampAngle, verticalVelocity, shouldRespawn, groundSpeed, slideVelocity,
} from './movement.js';

const RADIUS = 0.24;
const HEIGHT = 1.0;
const SKIN = 0.04;
const INVULNERABLE_AFTER_HIT = 0.7; // GDD §12: 0.7 s of blinking after a hit
// P review: at the 30 m camera the little dog is small; the model (only the
// looks: the capsule, the hammer's reach and every hitbox stay the same) is a
// little bigger in play than in the gallery
export const HERO_SCALE = 1.12;

export { ACTIONS };

// The hero under a kinematic capsule driven by Rapier's character controller.
export function createPlayer(G, spawn) {
  const { RAPIER, world } = G.physics;
  const model = createMaltese();
  const animate = createMalteseAnimator(model);
  const rig = model.userData.rig;
  model.scale.setScalar(HERO_SCALE);
  G.scene.add(model);

  const half = HEIGHT / 2 - RADIUS;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(spawn.x, spawn.y + HEIGHT / 2 + SKIN, spawn.z));
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(half, RADIUS), body);
  G.physics.heroHandles.add(collider.handle);
  const notMonster = (c) => !G.physics.moverHandles.has(c.handle);

  const controller = world.createCharacterController(SKIN);
  controller.enableAutostep(0.3, 0.12, true);
  controller.enableSnapToGround(0.35);
  controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(46));
  controller.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(40));
  controller.setApplyImpulsesToDynamicBodies(true);
  controller.setCharacterMass(25);

  const s = {
    vy: 0, grounded: true, speed: 0, heading: spawn.heading ?? Math.PI,
    action: null, cooldown: 0, swingWait: 0,
    knock: new THREE.Vector2(), invulnerable: 0, frozen: false,
    vel: new THREE.Vector2(), slip: 0, rolled: false, // W3: the slide on ice (movement.js slideVelocity)
    shield: false, // the shield is up (combat/items/shield.js keeps this)
    stepTimer: 0, wasGrounded: true,
  };
  const safe = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
  let safeTimer = 0;
  const forward = new THREE.Vector3();

  // behind a raised shield the paws are busy: no swinging, shooting, throwing
  // or eating; a roll drops the shield first
  const SHIELD_BUSY = new Set(['swing', 'shoot', 'throw', 'eat']);
  function act(name) {
    if (s.frozen) return false;
    if (s.shield && SHIELD_BUSY.has(name)) return false;
    if (s.shield && name === 'roll') G.shield?.lower();
    if (s.action && s.action.name !== 'hurt' && name !== 'hurt') return false;
    if (s.cooldown > 0 && name !== 'hurt') return false;
    if (name === 'roll' && !s.grounded) return false;
    if (name === 'swing' && s.swingWait > 0) return false; // the hammer: once a second (data/items.js)
    if (name === 'swing') s.swingWait = 1 / ITEMS.hammer.rate;
    s.action = { name, t: 0, duration: ACTIONS[name].duration, fired: false };
    if (name === 'roll') { sfx.roll(); s.invulnerable = Math.max(s.invulnerable, ACTIONS.roll.duration); } // i-frames all through the roll (GDD §3.1)
    if (name === 'swing') sfx.swing();
    if (name === 'bark') { sfx.bark(); G.emit('noise', { pos: model.position.clone(), radius: 16, kind: 'bark' }); }
    if (name === 'sniff') { sfx.sniff(); G.emit('sniff', { pos: model.position.clone() }); }
    return true;
  }

  function hurt(from, amount = 1) {
    if (s.invulnerable > 0 || !G.ticking() || G.run.hearts <= 0) return false;
    s.invulnerable = INVULNERABLE_AFTER_HIT;
    const away = new THREE.Vector2(model.position.x - from.x, model.position.z - from.z);
    if (away.lengthSq() < 1e-4) away.set(0, 1);
    s.knock.copy(away.normalize().multiplyScalar(3.5)); // a gentle bump, not a shove
    s.vy = 3;
    s.action = null;
    act('hurt');
    sfx.hurt();
    G.emit('hurt', { amount });
    return true;
  }

  // out of hearts: topple over and lie there until the run starts again
  G.on('faint', () => { s.action = null; s.cooldown = 0; act('faint'); });

  function fixedUpdate(input, cameraYaw, dt) {
    if (s.frozen || s.flight) return;
    const a = s.action?.name;
    const dir = input.world ?? moveDirection(input, cameraYaw);
    const moving = dir.x !== 0 || dir.z !== 0;
    let vx = 0, vz = 0;

    // W3: on the ice the hero slides (the ground under the feet, world.js SLIP)
    const here = body.translation();
    s.slip = s.grounded && G.slipAt ? G.slipAt(here.x, here.z) : 0;
    if (a === 'roll') {
      vx = Math.sin(s.heading) * ROLL_SPEED;
      vz = Math.cos(s.heading) * ROLL_SPEED;
      s.speed = 0;
      s.vel.set(vx, vz);
      s.rolled = true;
    } else {
      const speed = groundSpeed({ moving, run: input.run, action: a, shield: s.shield });
      s.speed = speed;
      // behind the shield the hero keeps facing the cursor and steps sideways
      if (moving && speed > 0 && !s.shield) s.heading = dampAngle(s.heading, headingOf(dir.x, dir.z), TURN_RATE, dt);
      const v = slideVelocity({ x: s.vel.x, z: s.vel.y }, { x: dir.x * speed, z: dir.z * speed }, s.slip, dt, { rolled: s.rolled });
      s.vel.set(v.x, v.z);
      if (speed > 0 || s.vel.lengthSq() < 0.05) s.rolled = false;
      vx = v.x; vz = v.z;
    }
    vx += s.knock.x; vz += s.knock.y;
    s.knock.multiplyScalar(Math.exp(-8 * dt));

    s.vy = verticalVelocity(s.vy, { grounded: s.grounded, gravity: GRAVITY, dt });

    const desired = { x: vx * dt, y: s.vy * dt, z: vz * dt };
    controller.computeColliderMovement(collider, desired, undefined, undefined, notMonster);
    const m = controller.computedMovement();
    s.wasGrounded = s.grounded;
    s.grounded = controller.computedGrounded();
    if (s.grounded && !s.wasGrounded && s.vy < -3) sfx.land();
    if (s.grounded && s.vy < 0) s.vy = -1;
    if (!s.grounded && s.vy > 0 && m.y < desired.y - 1e-4) s.vy = 0; // bumped a ceiling

    const t = body.translation();
    body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });

    const feetY = t.y - HEIGHT / 2 - SKIN;
    safeTimer += dt;
    // (a height world gives the floor under each spot: world/build.js)
    const floorY = typeof G.floorY === 'function' ? G.floorY(t.x, t.z, feetY) : G.floorY ?? 0;
    if (s.grounded && feetY > floorY - 0.3 && safeTimer > 0.5) {
      safe.set(t.x, feetY, t.z);
      safeTimer = 0;
    }
    if (shouldRespawn(feetY, floorY)) {
      sfx.land();
      teleport(safe, s.heading);
      G.emit('fell');
    }
  }

  function teleport(at, heading) {
    // stand ON whatever is there: a spawn inside the ground falls forever
    if (G.groundAt) at = { x: at.x, y: Math.max(at.y, G.groundAt(at.x, at.z) + 0.05), z: at.z };
    const p = { x: at.x, y: at.y + HEIGHT / 2 + 0.3, z: at.z };
    body.setTranslation(p, true);
    body.setNextKinematicTranslation(p);
    model.position.set(at.x, at.y + 0.26, at.z);
    s.vy = 0; s.knock.set(0, 0); s.vel.set(0, 0);
    if (heading !== undefined) s.heading = heading;
    safe.set(at.x, at.y, at.z);
    G.emit('teleported');
  }

  // M6a: a bounce mushroom throws the hero along a fixed arc to `to` (`time`
  // s, `height` m up): no steering, nothing hurts on the way, and it lands
  // exactly on the mark. W2: from the ground where the hero stands to `to.y`
  // (up or down a level: the top of the arc `height` over the higher end)
  function launch(to, { time = 1, height = 4 } = {}) {
    if (s.flight) return false;
    s.action = null; s.shield = false;
    const from = model.position.clone(), end = to.clone();
    if (!G.world) { from.y = 0; end.y = 0; }
    s.flight = { from, to: end, t: 0, time, height: height + Math.abs(end.y - from.y) / 2 };
    s.heading = Math.atan2(to.x - model.position.x, to.z - model.position.z);
    s.invulnerable = Math.max(s.invulnerable, time + 0.2);
    G.emit('launched', { to });
    return true;
  }

  function update(dt) {
    s.cooldown = Math.max(0, s.cooldown - dt);
    s.swingWait = Math.max(0, s.swingWait - dt);
    s.invulnerable = Math.max(0, s.invulnerable - dt);
    if (s.action) {
      s.action.t += dt;
      if (s.action.name === 'swing' && !s.action.fired && s.action.t > 0.24) {
        s.action.fired = true;
        G.hammerHit();
      }
      if (s.action.name === 'throw' && !s.action.fired && s.action.t > THROW_RELEASE) {
        s.action.fired = true;
        G.emit('throwRelease');
      }
      if (s.action.t >= s.action.duration && !(s.action.name === 'faint' && G.fainted)) {
        const done = s.action.name;
        s.cooldown = ACTIONS[done].cooldown;
        s.action = null;
        if (done === 'eat') G.emit('ate'); // eaten up (a bite midway spoils nothing: the herb stays)
      }
    }
    if (s.flight) {
      const f = s.flight;
      f.t += dt;
      const u = Math.min(1, f.t / f.time);
      model.position.lerpVectors(f.from, f.to, u);
      model.position.y += 4 * f.height * u * (1 - u);
      if (u >= 1) { s.flight = null; teleport(f.to, s.heading); sfx.land(); G.emit('bounced', { at: f.to.clone() }); }
    } else if (!s.frozen) {
      const t = body.translation();
      model.position.set(t.x, t.y - HEIGHT / 2 - SKIN, t.z);
    }
    model.rotation.y = s.heading;
    // blink while invulnerable after a hit
    model.visible = s.invulnerable <= 0 || s.action?.name === 'roll' || Math.floor(s.invulnerable * 12) % 2 === 0;

    if (s.grounded && s.speed > 0.5) {
      s.stepTimer -= dt * s.speed;
      if (s.stepTimer <= 0) { sfx.step(); s.stepTimer = 1.1; }
    }
    animate(dt, s.flight ? { speed: 0, grounded: false, vy: s.flight.t < s.flight.time / 2 ? 4 : -4, action: null, shield: false } : { speed: s.speed, grounded: s.grounded, vy: s.vy, action: s.action, shield: s.shield });
  }

  return {
    model, body, collider, state: s, height: HEIGHT,
    fixedUpdate, update, act, hurt, teleport, launch,
    get position() { return model.position; },
    get facing() { return forward.set(Math.sin(s.heading), 0, Math.cos(s.heading)); },
    get safe() { return safe; },
  };
}
