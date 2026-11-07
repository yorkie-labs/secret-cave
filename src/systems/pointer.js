import * as THREE from 'three';
import { sfx } from '../audio/sound.js';
import { ITEMS } from '../data/items.js';
import { phrase } from '../ui/wording.js';
import { slideDistance } from '../player/movement.js';
import { resolveClick, clickWorld } from './resolveClick.js';

// Diablo-style mouse control (GDD §4.1). Left click: on the ground, walk
// there (hold to keep following the cursor); on an enemy or something
// breakable, walk up and swing the hammer (hold to keep swinging); on an item,
// door or chest, walk up and use it. Shift+left: hammer in place toward the
// cursor. Right click: the selected tool toward the cursor. 2: roll toward
// the cursor.
//
// An enemy tells the pointer about itself: `name` (its hover plate), `size`
// ([radius, height] for picking) and, if it likes, `hint()` (a line of advice
// under the name).
const DEFAULT_SIZE = [0.8, 0.8];

export function createPointer(G) {
  const dom = G.renderer.domElement;
  const ndc = new THREE.Vector2(9, 9);
  const raycaster = new THREE.Raycaster();
  let held = false, rightHeld = false, hover = null, order = null, shiftHeld = false, hoverTimer = 0;
  // W4: where the last order was going (a click on a floating rock's hop pad
  // means "hop from here": world/heart.js reads it after the walk ends)
  let lastGoal = null;
  const plate = document.getElementById('hover-plate');
  const tip = document.getElementById('hover-tip');
  let mouseX = 0, mouseY = 0;

  // a ring on the ground where the hero is heading
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.4, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd34d', transparent: true, opacity: 0, depthWrite: false }));
  marker.renderOrder = 4;
  G.scene.add(marker);
  // a ring under the hovered target
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.9, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff5d5d', transparent: true, opacity: 0.8, depthWrite: false }));
  halo.renderOrder = 4;
  halo.visible = false;
  G.scene.add(halo);

  const active = () => G.mode === 'play';

  dom.addEventListener('mousemove', (e) => {
    const r = dom.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    mouseX = e.clientX; mouseY = e.clientY;
  });
  dom.addEventListener('mousedown', (e) => {
    if (!active()) return;
    if (e.button === 0) { held = true; shiftHeld = e.shiftKey; leftClick(e.shiftKey); }
    if (e.button === 2) { rightHeld = true; rightClick(); }
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) held = false; if (e.button === 2) rightHeld = false; });
  addEventListener('blur', () => { held = false; rightHeld = false; });

  // --- picking
  const hitAt = new THREE.Vector3(), inv = new THREE.Matrix4(), localRay = new THREE.Ray();
  // a model's box in its own frame (made once, a little padded)
  function localBox(obj) {
    if (!obj.userData.pickBox) {
      obj.updateMatrixWorld(true);
      const toLocal = obj.matrixWorld.clone().invert(), b = new THREE.Box3();
      obj.traverse((m) => {
        if (!m.isMesh || m.userData.isOutline || m.userData.isSilhouette) return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        b.union(m.geometry.boundingBox.clone().applyMatrix4(toLocal.clone().multiply(m.matrixWorld)));
      });
      obj.userData.pickBox = b.expandByScalar(0.15);
    }
    return obj.userData.pickBox;
  }
  function pick() {
    raycaster.setFromCamera(ndc, G.camera);
    const ray = raycaster.ray;
    let best = null;
    const consider = (kind, pos, radius, data) => {
      const t = ray.origin.distanceTo(pos);
      if (ray.distanceToPoint(pos) < radius && (!best || t < best.t)) best = { kind, pos, t, ...data };
    };
    for (const e of G.enemies) {
      if (!e.model?.visible || e.state === 'asleep') continue;
      const [r, h] = e.size ?? DEFAULT_SIZE;
      consider('enemy', e.pos.clone().setY(e.pos.y + h * (e.model.scale?.x ?? 1)), r * (e.model.scale?.x ?? 1), { enemy: e, label: e.name });
    }
    for (const p of G.pickups) if (p.alive && !p.hidden) consider('pickup', p.model.position, 0.7, { pickup: p, label: '줍기' });
    for (const it of G.interactables) {
      if (!it.enabled()) continue;
      const label = typeof it.label === 'function' ? it.label() : it.label;
      // (a thing with a model: its drawn box, so a click on the ground beside
      // it, or over it, means that ground: the mine cart by the trestle)
      if (it.obj) {
        // (in its own frame: a cart lying at 45° is not the whole square round it)
        const b = localBox(it.obj);
        it.obj.updateMatrixWorld();
        inv.copy(it.obj.matrixWorld).invert();
        localRay.copy(ray).applyMatrix4(inv);
        if (localRay.intersectBox(b, hitAt)) {
          hitAt.applyMatrix4(it.obj.matrixWorld);
          const t = ray.origin.distanceTo(hitAt);
          if (!best || t < best.t) best = { kind: 'use', pos: b.getCenter(new THREE.Vector3()).applyMatrix4(it.obj.matrixWorld), t, it, label };
        }
        continue;
      }
      const ip = typeof it.pos === 'function' ? it.pos() : it.pos;
      consider('use', ip.clone().setY(ip.y + 0.8), 1.2, { it, label });
    }
    for (const h of G.hittables) {
      if (h.enabled && !h.enabled()) continue;
      const hp = typeof h.pos === 'function' ? h.pos() : h.pos;
      if (G.enemies.some((e) => e.pos.distanceTo(hp) < 2.2)) continue; // monsters are picked as monsters
      if (hp.distanceTo(G.player.position) > 40) continue;
      consider('hit', hp, h.radius + 0.2, { hit: h, label: '망치로 치기' });
    }
    if (best) return best;
    const g = groundPoint(ray);
    return g ? { kind: 'ground', pos: g } : null;
  }

  // A click means a spot of walkable ground, the one the player sees under
  // the cursor (systems/resolveClick.js: the ray marched over the height
  // world, rock in front of the lens looked through, a wall past the hero
  // meaning its foot on our side). A prop drawn in front of that ground means
  // its foot; a prop the camera has faded, or a ray over the top of what is
  // drawn of it, does not count. Missing everything: the plane at the hero's
  // height. The point says what it is (`kind`) and if it can be stood on
  // (`walk`).
  let cw = null;
  function groundPoint(ray) {
    if (!G.world || !G.navGrid) return planePoint(ray);
    cw ??= clickWorld(G.world, G.navGrid);
    const r = resolveClick(ray, cw, G.player.position, { isCut: G.terrain?.isCut, solid: solidAlong(ray) });
    if (!r) return planePoint(ray);
    return Object.assign(new THREE.Vector3(r.x, r.y, r.z), { kind: r.kind, walk: r.walk, t: r.t });
  }
  // the first solid prop along the ray within maxT m (Rapier), with what is
  // drawn of it (physics.js extentOf)
  const castFlags = () => G.physics.RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | G.physics.RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | G.physics.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS;
  const seen = (c) => {
    if (G.invisibleColliders?.has(c.handle) || G.terrain?.terrainHandles.has(c.handle)) return false;
    const obj = G.physics.extentOf(c.handle)?.obj;
    return !(obj && G.cam?.faded.has(obj)); // (faded to see the hero: see-through)
  };
  const propRay = new THREE.Raycaster();
  function solidAlong(ray) {
    return (maxT) => {
      const { RAPIER, world } = G.physics;
      const hit = world.castRay(new RAPIER.Ray(ray.origin, ray.direction), maxT, true, castFlags(), undefined, undefined, undefined, seen);
      if (!hit) return null;
      let t = hit.timeOfImpact ?? hit.toi;
      const ext = G.physics.extentOf(hit.collider.handle);
      // (a prop whose model is known: the ray must meet the model itself, not
      // just the upright cylinder round it: a click past a moss cushion's
      // rounded side means the ground there)
      if (ext?.obj) {
        propRay.set(ray.origin, ray.direction);
        propRay.far = maxT;
        const m = propRay.intersectObject(ext.obj, true)[0];
        if (!m) return null;
        t = m.distance;
      }
      const x = ray.origin.x + ray.direction.x * t, y = ray.origin.y + ray.direction.y * t, z = ray.origin.z + ray.direction.z * t;
      return { t, x, y, z, top: ext?.top ?? Infinity, base: ext?.base ?? G.groundAt?.(x, z, y) ?? y };
    };
  }

  // Where the cursor points on the flat plane through the hero's feet: Diablo's
  // "direction" for held movement and for aiming, steady over hills.
  const plane = new THREE.Plane();
  function planePoint(ray) {
    plane.set(new THREE.Vector3(0, 1, 0), -G.player.position.y);
    return ray.intersectPlane(plane, new THREE.Vector3());
  }

  function cursorGround() {
    raycaster.setFromCamera(ndc, G.camera);
    return groundPoint(raycaster.ray);
  }

  function cursorPoint() {
    raycaster.setFromCamera(ndc, G.camera);
    return planePoint(raycaster.ray);
  }

  // Turn a clicked spot into one the hero can actually stand on: the nearest
  // walkable cell, or else the last walkable spot on the way toward it.
  function walkableTarget(p) {
    const nav = G.nav;
    if (!nav || !p) return p;
    const from = G.player.position;
    // (a click on rock with no ground of ours under it, a chasm's far wall:
    // never the ground on some other level near it, only as far as we can go
    // straight toward it)
    const c = p.walk === false ? null : nav.nearestWalkable(p, 3);
    let closest = null;
    if (c) {
      const spot = nav.at(c);
      // reachable from here? if not (a pillar top, a ledge), go as far as we
      // can straight toward it rather than wandering off sideways…
      const res = nav.findPath(from, spot, { near: 0.6, jumps: true });
      if (res && !res.partial) return spot;
      closest = res?.points?.at(-1) ?? null;
    }
    const straight = nav.lineReach(from, p);
    if (straight && straight.distanceTo(from) > 0.6) return straight;
    // …and if even that is blocked right at our feet (pressed against a rock),
    // take the reachable spot nearest the click. A click never does nothing.
    if (closest && closest.distanceTo(from) > 0.6) return closest;
    return null;
  }

  function planTo(goal, near) {
    const res = G.nav?.findPath(G.player.position, goal, { near, jumps: true }); // (by bounce mushroom too: W2)
    return res?.points?.length ? res.points : [goal.clone()];
  }

  function faceToward(p) {
    if (!p) return;
    const pp = G.player.position;
    if (Math.hypot(p.x - pp.x, p.z - pp.z) > 0.05) G.player.state.heading = Math.atan2(p.x - pp.x, p.z - pp.z);
  }

  // a red cross where the hero cannot go (Diablo shows the same "no" feedback):
  // two crossed bars lying on the ground
  const nope = new THREE.Mesh(
    // (along the world's axes: the lens looks along the diagonal, so it reads as ×)
    (() => { const a = new THREE.PlaneGeometry(0.95, 0.2).rotateX(-Math.PI / 2), b = a.clone().rotateY(Math.PI / 2); return mergeTwo(a, b); })(),
    new THREE.MeshBasicMaterial({ color: '#ff4d4d', transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
  nope.renderOrder = 5;
  nope.visible = false;
  G.scene.add(nope);
  function blocked(p) {
    nope.position.set(p.x, p.y + 0.08, p.z);
    nope.material.opacity = 0.95;
    nope.scale.setScalar(1.3);
    nope.visible = true;
  }
  // a click on a place the hero cannot reach (another level, a closed piece,
  // a rock top): the cross where the cursor was and a word, now and then;
  // the hero still goes as near as it can
  let saidAt = -1e9, refused = 0;
  function cantGo(p) {
    blocked(p);
    refused++;
    const now = performance.now();
    if (now - saidAt > 4000) { saidAt = now; G.toast?.('저기는 못 가요', 1400); }
  }

  function showMarker(p) {
    marker.position.set(p.x, p.y + 0.05, p.z);
    marker.material.opacity = 0.9;
    marker.scale.setScalar(1.4);
  }

  // --- clicks
  function leftClick(shift) {
    const h = pick();
    if (!h) return;
    if (shift) { faceToward(cursorPoint()); swing(); order = null; return; }
    switch (h.kind) {
      case 'enemy': order = { type: 'attack', moving: true, target: () => h.enemy.pos, radius: (h.enemy.size ?? DEFAULT_SIZE)[0] * (h.enemy.model.scale?.x ?? 1) }; break;
      case 'hit': order = { type: 'attack', target: () => (typeof h.hit.pos === 'function' ? h.hit.pos() : h.hit.pos), radius: h.hit.radius }; break;
      case 'pickup': order = { type: 'move', point: h.pickup.model.position.clone(), exact: true }; showMarker(h.pickup.pos); break;
      case 'use': order = { type: 'use', it: h.it }; break;
      default: {
        const p = walkableTarget(h.pos);
        if (!p) { faceToward(h.pos); cantGo(h.pos); return; } // can't go: at least turn and say so
        // (more than 3 m from the click: say so where the cursor was)
        if (h.pos.walk === false || Math.hypot(p.x - h.pos.x, p.z - h.pos.z) > 3 || Math.abs(p.y - h.pos.y) > 3) cantGo(h.pos);
        order = { type: 'move', point: p };
        showMarker(p);
      }
    }
    if (order) plan(order);
  }

  // the hammer is always in paw (GDD §6.2)
  function swing() { return G.player.act('swing'); }

  // the touch hammer button: swing right here, turned toward the nearest thing
  // that can be hit (an enemy, a cracked rock) so small thumbs need no aim
  function hammerButton() {
    order = null;
    const pp = G.player.position;
    let best = null, bd = 2.6;
    for (const h of G.hittables) {
      if (h.enabled && !h.enabled()) continue;
      const hp = typeof h.pos === 'function' ? h.pos() : h.pos;
      const d = Math.hypot(hp.x - pp.x, hp.z - pp.z) - h.radius;
      if (d < bd && Math.abs(hp.y - pp.y) < 2.5) { best = hp; bd = d; }
    }
    if (best) faceToward(best);
    swing();
  }

  function rightClick() {
    const p = cursorPoint();
    faceToward(p);
    order = null;
    G.useTool();
  }

  // on a touch screen there is no hovering cursor: roll and use tools the way
  // the hero is already facing (or pushing the stick)
  let touchInput = false;
  addEventListener('pointerdown', (e) => { touchInput = e.pointerType === 'touch'; }, true);
  G.on('rollTowardCursor', () => { if (active()) { if (!touchInput) faceToward(cursorPoint()); order = null; G.player.act('roll'); } });
  G.on('faceCursor', () => { if (!touchInput) faceToward(cursorPoint()); });
  // a faint, a fall or a teleport ends whatever walk was going on
  for (const ev of ['faint', 'fell', 'teleported']) G.on(ev, () => { order = null; held = false; rightHeld = false; });

  // Work out (or refresh) the path an order follows.
  function plan(o) {
    const goal = o.type === 'move' ? o.point : o.type === 'attack' ? o.target() : (typeof o.it.pos === 'function' ? o.it.pos() : o.it.pos);
    const near = o.type === 'move' ? (o.exact ? 0.3 : 0.5) : o.type === 'attack' ? o.radius + 0.5 : Math.min(o.it.radius * 0.6, 1.4);
    o.path = planTo(goal, near);
    o.planned = performance.now();
    lastGoal = { x: goal.x, y: goal.y, z: goal.z, at: o.planned };
    o.lastPos = G.player.position.clone();
    o.stuck = 0;
  }

  // --- every physics step: turn the current order into a world-space move
  function moveInput(keys) {
    if (keys.forward || keys.right) { order = null; return keys; } // the touch stick takes over
    if (!order || G.mode !== 'play') return keys;
    // one click, one swing: an attack order lives on past its swing only while
    // the button stays down (W7 review: a quick click on an animal already in
    // reach swung twice, the button still down the step the first swing began)
    if (order.type === 'attack' && order.swung && !held) { order = null; return keys; }
    const pp = G.player.position;
    const now = performance.now();
    // held button: keep heading where the cursor points (on the hero's plane)
    if (order.type === 'move' && held && !order.exact && now - (order.followed ?? 0) > 250) {
      order.followed = now; // even when the cursor points somewhere unreachable
      const p = walkableTarget(cursorGround()); // (the ground under the cursor: a lower level is not the hero's plane)
      if (p) { order.point = p; plan(order); }
    }
    // chasing a monster that moves: refresh the path now and then
    if (order.type === 'attack' && order.moving && now - order.planned > 500) plan(order);
    // no progress for half a second: think again; after three tries, give up
    if (now - (order.checked ?? order.planned) > 500) {
      order.checked = now;
      if (pp.distanceTo(order.lastPos) < 0.2) {
        order.retries = (order.retries ?? 0) + 1;
        if (order.retries > 3) { blocked(pp); order = null; return { forward: 0, right: 0, run: false }; }
        plan(order);
      } else order.retries = 0;
      order.lastPos.copy(pp);
    }
    let goal, stopAt;
    // W3: on the ice the hero lets go early by the slide still to come
    const st = G.player.state;
    const slide = st.slip > 0 ? slideDistance(st.vel.length(), st.slip, st.rolled) * 0.85 : 0;
    if (order.type === 'move') { goal = order.point; stopAt = Math.max(order.exact ? 0.15 : 0.3, slide); }
    else if (order.type === 'attack') { goal = order.target(); stopAt = order.radius + ITEMS.hammer.range * 0.6; } // well inside the hammer's reach
    else if (order.type === 'use') { goal = typeof order.it.pos === 'function' ? order.it.pos() : order.it.pos; stopAt = Math.min(order.it.radius * 0.6, 1.4); }
    const dx = goal.x - pp.x, dz = goal.z - pp.z;
    const d = Math.hypot(dx, dz);
    if (d > stopAt) {
      // follow the path's waypoints; the last stretch goes straight at the goal
      const path = order.path ?? [];
      // (W2: a bounce pad is walked right onto; its mushroom throws the hero on)
      // (W3: on the ice a waypoint is passed a little wider, so a slide never circles it)
      while (path.length > 1 && Math.hypot(path[0].x - pp.x, path[0].z - pp.z) < (path[0].pad ? 0.15 : 0.45 + st.slip * 1.1)) path.shift();
      const wp = path.length > 1 ? path[0] : goal;
      const wx = wp.x - pp.x, wz = wp.z - pp.z, wd = Math.hypot(wx, wz) || 1;
      return { forward: 0, right: 0, run: d > 1.2, world: { x: wx / wd, z: wz / wd } };
    }
    // arrived
    if (order.type === 'move') order = null;
    else if (order.type === 'use') {
      faceToward(goal);
      const it = order.it;
      order = null;
      if (it.enabled()) { G.player.act('interact'); it.action(); }
    } else if (order.type === 'attack') {
      faceToward(goal);
      if (!G.player.state.action && swing()) order.swung = true;
    }
    return { forward: 0, right: 0, run: false };
  }

  // --- every frame: hover feedback
  function update(dt) {
    marker.material.opacity = Math.max(0, marker.material.opacity - dt * 1.5);
    marker.scale.multiplyScalar(1 - dt * 0.8);
    nope.material.opacity = Math.max(0, nope.material.opacity - dt * 1.1);
    nope.scale.setScalar(Math.max(1, nope.scale.x - dt * 1.5));
    nope.visible = nope.material.opacity > 0;
    if (!active()) { halo.visible = false; plate.classList.add('hidden'); tip.classList.add('hidden'); document.body.dataset.cursor = ''; return; }
    if (held && shiftHeld && !G.player.state.action) { faceToward(cursorPoint()); swing(); }
    const tool = G.tools?.[G.run.tool];
    if (rightHeld && tool?.auto && tool.ready) rightClick(); // hold the right button: keep shooting (not the vine)
    hoverTimer -= dt;
    if (hoverTimer <= 0) { hoverTimer = 0.1; hover = pick(); }
    const kind = hover?.kind;
    document.body.dataset.cursor = kind === 'enemy' || kind === 'hit' ? 'attack' : kind === 'use' || kind === 'pickup' ? 'use' : '';
    halo.visible = !!kind && kind !== 'ground'; // (undefined would still draw)
    if (halo.visible) {
      const p = kind === 'enemy' ? hover.enemy.pos : hover.pos;
      halo.position.set(p.x, (kind === 'enemy' ? p.y : (G.groundAt ? G.groundAt(p.x, p.z) : p.y - 0.8)) + 0.06, p.z);
      halo.material.color.set(kind === 'enemy' || kind === 'hit' ? '#ff5d5d' : '#ffd34d');
      halo.scale.setScalar(kind === 'enemy' ? Math.max(1, (hover.enemy.size ?? DEFAULT_SIZE)[0]) : 0.8);
    }
    if (kind === 'enemy' && !hover.enemy.isBoss) { plate.innerHTML = plateHtml(hover.enemy, hover.label); plate.classList.remove('hidden'); } else plate.classList.add('hidden');
    if ((kind === 'use' || kind === 'pickup' || kind === 'hit') && hover.label) {
      tip.textContent = hover.label;
      tip.style.left = `${mouseX + 16}px`; tip.style.top = `${mouseY + 12}px`;
      tip.classList.remove('hidden');
    } else tip.classList.add('hidden');
  }

  // The enemy plate (Diablo's health bar at the top): its name, its hp as
  // hammer hits (one bar each, partly full after a water shot) and a line on
  // how to beat it.
  function plateHtml(e, label) {
    const hint = e.hint?.();
    const bars = e.maxHp ? `<div class="gauge">${Array.from({ length: Math.ceil(e.maxHp) }, (_, i) => `<i><span style="width:${Math.round(Math.min(1, Math.max(0, e.hp - i)) * 100)}%"></span></i>`).join('')}</div>` : '';
    return `<b>${label ?? ''}</b>${bars}${hint ? `<small>${phrase(hint)}</small>` : ''}`;
  }

  // orders other parts of the UI can give (Alt labels are clickable)
  function goTo(point, exact = true) { order = { type: 'move', point: point.clone(), exact }; plan(order); showMarker(point); }
  function useIt(it) { order = { type: 'use', it }; plan(order); }

  return {
    goTo, useIt, moveInput, update, hammer: hammerButton, cancel: () => { order = null; held = false; }, get order() { return order; }, pick, cursorPoint,
    get lastGoal() { return lastGoal; }, clearGoal: () => { lastGoal = null; },
    get refused() { return refused; }, // (clicks answered with the red ×: checks)
  };
}

// two geometries as one (positions only: a flat cross)
function mergeTwo(a, b) {
  const pa = a.attributes.position.array, pb = b.attributes.position.array;
  const ia = a.index.array, ib = b.index.array, n = pa.length / 3;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...pa, ...pb], 3));
  g.setIndex([...ia, ...Array.from(ib, (i) => i + n)]);
  return g;
}
