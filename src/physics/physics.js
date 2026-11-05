import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export const GRAVITY = 9.81;
const STEP = 1 / 60;
const MAX_STEPS = 4;

// Gathers an object's mesh triangles in WORLD space (skinned meshes skipped:
// their bind pose is not where they draw).
function worldTriangles(root) {
  root.updateMatrixWorld(true);
  const vertices = [];
  const indices = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    const pos = o.geometry.attributes.position;
    const base = vertices.length / 3;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      vertices.push(v.x, v.y, v.z);
    }
    const index = o.geometry.index;
    if (index) for (let i = 0; i < index.count; i++) indices.push(base + index.getX(i));
    else for (let i = 0; i < pos.count; i++) indices.push(base + i);
  });
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

// Vertices in the root's own frame, for a convex hull that rides on its body.
function localPoints(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const out = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    const m = inv.clone().multiply(o.matrixWorld);
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      out.push(v.x, v.y, v.z);
    }
  });
  return new Float32Array(out);
}

export async function createPhysics() {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  const dynamics = []; // { object, body, home }
  let acc = 0;
  // While a room is being built, every body (and walker) made goes on this
  // list too, so the room can be torn down later (core/game.js scopes).
  let collector = null;
  const track = (body) => { if (body) collector?.push(body); return body; };

  // A fixed collider that follows the model's own triangles.
  function addStatic(object, { friction = 0.8 } = {}) {
    const { vertices, indices } = worldTriangles(object);
    if (!indices.length) return null;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(friction), body);
    return track(body);
  }

  // A pushable prop: convex hull, real mass, falls and tumbles.
  function addDynamic(object, { mass = 10, friction = 0.7, restitution = 0.15 } = {}) {
    const hull = RAPIER.ColliderDesc.convexHull(localPoints(object));
    if (!hull) return addStatic(object);
    const p = object.position, q = object.quaternion;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(p.x, p.y, p.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setLinearDamping(0.4)
      .setAngularDamping(0.8)
      .setCanSleep(true));
    world.createCollider(hull.setMass(mass).setFriction(friction).setRestitution(restitution), body);
    dynamics.push({ object, body, home: { p: p.clone(), q: q.clone() } });
    return track(body);
  }

  // A fixed upright capsule standing on the ground at (x, y, z).
  function addCapsule(x, y, z, { radius = 0.3, height = 1.6 } = {}) {
    const half = Math.max(0.01, height / 2 - radius);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y + height / 2, z));
    world.createCollider(RAPIER.ColliderDesc.capsule(half, radius), body);
    return track(body);
  }

  // What a click may see of a fixed prop (systems/pointer.js): its foot, the
  // top of what is drawn of it (`top`: a click over it means what lies
  // behind) and the object that is drawn (faded by the camera: see-through).
  const extents = new Map(); // collider handle -> { base, top, obj }
  // A fixed upright cylinder standing on the ground (a pond's edge, a prop).
  // `top`: the drawn top when lower than the collider's; `obj`: the model.
  function addCylinder(x, y, z, { radius = 1, height = 1, top, obj = null } = {}) {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y + height / 2, z));
    const c = world.createCollider(RAPIER.ColliderDesc.cylinder(height / 2, radius), body);
    extents.set(c.handle, { base: y, top: Math.min(y + height, top ?? Infinity), obj });
    return track(body);
  }

  // A fixed box around the object's bounds (cheaper than its triangles).
  function addBox(object, { pad = 0 } = {}) {
    object.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(object);
    const c = b.getCenter(new THREE.Vector3()), h = b.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(c.x, c.y, c.z));
    const col = world.createCollider(RAPIER.ColliderDesc.cuboid(h.x + pad, h.y + pad, h.z + pad), body);
    extents.set(col.handle, { base: b.min.y, top: b.max.y, obj: object });
    return track(body);
  }

  // A plain fixed cuboid: invisible walls, gates, cave rooms.
  function addCuboid(x, y, z, hx, hy, hz, ry = 0) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation(q));
    const c = world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz), body);
    extents.set(c.handle, { base: y - hy, top: y + hy, obj: null });
    return track(body);
  }

  // Takes a body (and its colliders) out of the world; a walker's character
  // controller goes with it. Returns the collider handles that were removed.
  // (A body object is marked once removed: Rapier reuses a freed handle, so
  // a second remove of the same object must not reach the body now there.)
  function remove(body) {
    if (!body || body.removed || !world.bodies.contains(body.handle)) return [];
    body.removed = true;
    const i = dynamics.findIndex((d) => d.body === body);
    if (i >= 0) dynamics.splice(i, 1);
    const handles = [];
    for (let k = 0; k < body.numColliders(); k++) handles.push(body.collider(k).handle);
    for (const h of handles) { moverHandles.delete(h); heroHandles.delete(h); extents.delete(h); }
    if (body.userData?.controller) world.removeCharacterController(body.userData.controller);
    world.removeRigidBody(body);
    return handles;
  }
  // collect(list): bodies made from now on are also pushed onto `list`;
  // collect(null) stops.
  function collect(list) { collector = list; }

  // A walking body for monsters: a kinematic capsule with its own character
  // controller, so it climbs, slides and is blocked like the player.
  // Monsters and the hero never shove each other: each one's movement ignores
  // the other's body (touching a monster hurts, by distance, in game code).
  const moverHandles = new Set();
  const heroHandles = new Set();
  const notHero = (c) => !heroHandles.has(c.handle);

  function createMover({ x, y, z, radius = 0.4, height = 1.2, climb = 40 }) {
    const half = Math.max(0.01, height / 2 - radius);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + height / 2, z));
    const collider = world.createCollider(RAPIER.ColliderDesc.capsule(half, radius), body);
    moverHandles.add(collider.handle);
    const ctl = world.createCharacterController(0.05);
    body.userData = { controller: ctl };
    track(body);
    ctl.enableSnapToGround(0.5);
    ctl.enableAutostep(0.35, 0.2, true);
    ctl.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(climb));
    ctl.setApplyImpulsesToDynamicBodies(true);
    let vy = 0, grounded = false;
    return {
      body, collider, height,
      move(dx, dz, dt) {
        vy = grounded ? -1 : vy - GRAVITY * dt;
        ctl.computeColliderMovement(collider, { x: dx, y: vy * dt, z: dz }, undefined, undefined, notHero);
        const m = ctl.computedMovement();
        grounded = ctl.computedGrounded();
        const t = body.translation();
        body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
        return m;
      },
      teleport(p) {
        const t = { x: p.x, y: p.y + height / 2 + 0.05, z: p.z };
        body.setTranslation(t, true); body.setNextKinematicTranslation(t); vy = 0;
      },
      get feet() { const t = body.translation(); return new THREE.Vector3(t.x, t.y - height / 2, t.z); },
      get grounded() { return grounded; },
      setEnabled(on) { collider.setEnabled(on); },
    };
  }

  // Fixed-rate stepping; returns the interpolation-free state after the step.
  function step(dt, beforeStep) {
    acc = Math.min(acc + dt, STEP * MAX_STEPS);
    while (acc >= STEP) {
      beforeStep?.(STEP);
      world.step();
      acc -= STEP;
    }
    for (const d of dynamics) {
      const t = d.body.translation(), r = d.body.rotation();
      d.object.position.set(t.x, t.y, t.z);
      d.object.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  // Props knocked into the sea float back to where they started.
  function recoverDynamics(belowY) {
    for (const d of dynamics) {
      if (d.body.translation().y >= belowY) continue;
      d.body.setTranslation(d.home.p, true);
      d.body.setRotation(d.home.q, true);
      d.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      d.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  // Wireframe of every collider, for the P debug toggle.
  const debugLines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.6 }),
  );
  debugLines.renderOrder = 999;
  debugLines.frustumCulled = false;
  debugLines.visible = false;
  function updateDebug() {
    if (!debugLines.visible) return;
    const { vertices, colors } = world.debugRender();
    const g = debugLines.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  }

  return {
    RAPIER, world, STEP, moverHandles, heroHandles,
    addStatic, addDynamic, addCapsule, addCylinder, addBox, addCuboid, remove, collect, createMover, step, recoverDynamics,
    extentOf: (handle) => extents.get(handle) ?? null,
    debugLines, updateDebug,
    get dynamicCount() { return dynamics.length; },
  };
}
