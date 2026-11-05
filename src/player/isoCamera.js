import * as THREE from 'three';
import { modelsVersion } from '../world/models.js';

// Diablo-style camera: a fixed three-quarter view from above that follows
// the hero. The wheel zooms; pillars, rocks and pieces of cave wall between
// the lens and the hero fade out so the hero is never lost behind them, and
// the cave ceiling and upper walls stay hidden (GDD §5.1).
//
// Diablo's look comes from a low-ish, far-away, narrow lens: ARPG cameras sit
// about 30-35° above the horizon (Diablo 4 is often quoted as "30/60") and use
// a narrow field of view from far back, so the world reads almost flat, like
// classic isometric art. A steep angle with a wide lens instead looks down on
// the top of the hero's head.
// The open cave map (user: "카메라도 가깝고 지형이 너무 가까워"): the lens
// sits further back and a little higher, so a cavern reads as a big space
// (GDD §5.1): 30 m out at 40°, zoom 18–45 m.
export const ISO_YAW = Math.PI / 4;
export const ISO_FOV = 38;
export const ISO_PITCH = THREE.MathUtils.degToRad(40);
const PITCH = ISO_PITCH;
export const DIST_MIN = 18, DIST_MAX = 45;
const DIST_START = 30; // GDD §5.1
const DIST_PHONE = 23;
const NEVER_FADE = new Set(['sky']);
const LENS_CLEAR = 4; // m the lens keeps over a height world's ground
// W7: rather than rise straight up over rock on its side (whose top then
// filled the screen, and a click near the hero landed on it), the lens first
// swings up round the hero, looking more steeply down (up to TILT_MAX), then
// comes in closer (down to DOLLY_MIN m); only what is left is lifted
export const TILT_MAX = THREE.MathUtils.degToRad(72), TILT_SIGHT = THREE.MathUtils.degToRad(56), TILT_STEP = THREE.MathUtils.degToRad(4);
const DOLLY_MIN = 12, LIFT_OK = 1.5;

export function createIsoCamera(G) {
  const camera = G.camera;
  const rig = { yaw: ISO_YAW, pitch: PITCH, distance: DIST_START };
  const focus = new THREE.Vector3();
  const offset = new THREE.Vector3();
  let shake = 0, override = null, fadeTimer = 0, lift = 0, dolly = 0, tilt = 0, tiltBy = 0, inBy = 0, snapNext = true;
  const aim = new THREE.Vector3(), head = new THREE.Vector3();
  const faded = new Set();

  G.renderer.domElement.addEventListener('wheel', (e) => {
    rig.distance = THREE.MathUtils.clamp(rig.distance + THREE.MathUtils.clamp(e.deltaY * 0.03, -3, 3), DIST_MIN, DIST_MAX); // small steps for trackpads
  }, { passive: true });

  // (one see-through twin per material and opacity, made once: no new
  // material, no new shader program every time something fades)
  const fadedMats = new WeakMap();
  function fadedOf(m, opacity) {
    let byOpacity = fadedMats.get(m);
    if (!byOpacity) fadedMats.set(m, (byOpacity = new Map()));
    let f = byOpacity.get(opacity);
    if (!f) {
      f = m.clone();
      f.transparent = true;
      f.depthWrite = false;
      f.opacity = opacity;
      byOpacity.set(opacity, f);
    }
    return f;
  }
  function setFaded(obj, on) {
    const opacity = obj.userData.fadeTo ?? 0.28; // (a giant mushroom's cap: fainter)
    obj.traverse((o) => {
      if (!o.isMesh || o.userData.isOutline) return;
      if (on) {
        if (!o.userData.solidMaterial) {
          o.userData.solidMaterial = o.material;
          o.material = Array.isArray(o.material) ? o.material.map((m) => fadedOf(m, opacity)) : fadedOf(o.material, opacity);
        }
      } else if (o.userData.solidMaterial) {
        o.material = o.userData.solidMaterial;
        delete o.userData.solidMaterial;
      }
    });
  }

  // An object fades only if it really stands between the lens and the hero:
  // a line of sight (to the head or to the hips) hits its box well before
  // reaching the hero, and the hero is not standing on or inside it (a floor,
  // a ledge). Cave wall pieces count too, with the rock top behind them.
  const ray = new THREE.Ray(), localRay = new THREE.Ray(), hitPoint = new THREE.Vector3(), localFeet = new THREE.Vector3(), hips = new THREE.Vector3(), foot = new THREE.Vector3();
  const sights = [{ dist: 0, dir: new THREE.Vector3() }, { dist: 0, dir: new THREE.Vector3() }];
  // what may fade: the scene's own children that are big enough, checked
  // once each (the list is made again only when the scene changes)
  let candidates = [], seenCount = -1, seenFirst = null, seenModels = -1;
  function fadeCandidates() {
    const kids = G.scene.children;
    // (release: models streaming in after the title fill their placeholders:
    // looked at again whenever one lands)
    if (kids.length === seenCount && kids[kids.length - 1] === seenFirst && modelsVersion() === seenModels) return candidates;
    seenCount = kids.length; seenFirst = kids[kids.length - 1]; seenModels = modelsVersion();
    const enemyModels = new Set(G.enemies.map((e) => e.model));
    candidates = [];
    for (const obj of kids) {
      if (NEVER_FADE.has(obj.name) || obj === G.player.model || obj.isLight || obj.userData.noFade) continue;
      if (G.groundMeshes?.includes(obj)) continue; // what we walk on never fades
      if (enemyModels.has(obj)) continue; // monsters move (and have silhouettes)
      if (obj.userData.pendingModel) continue; // (not here yet: measured when it lands)
      // the box in the object's own frame (turned with it), so a long rock
      // lying at an angle is not taken for the whole square around it
      if (!obj.userData.fadeBox) {
        obj.updateMatrixWorld(true);
        const inv = obj.matrixWorld.clone().invert();
        const b = new THREE.Box3();
        obj.traverse((m) => {
          if (!m.isMesh || m.userData.isOutline || m.userData.isSilhouette) return;
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          b.union(m.geometry.boundingBox.clone().applyMatrix4(inv.clone().multiply(m.matrixWorld)));
        });
        if (b.isEmpty() || b.getSize(new THREE.Vector3()).length() < 1.2) { obj.userData.noFade = true; continue; }
        obj.userData.fadeBox = b;
        obj.userData.fadeInv = inv;
      }
      candidates.push(obj);
    }
    return candidates;
  }
  function updateFades(head) {
    const feet = G.player.position;
    hips.copy(feet).setY(feet.y + 0.4);
    for (const [i, p] of [head, hips].entries()) {
      sights[i].dir.subVectors(p, camera.position);
      sights[i].dist = sights[i].dir.length();
      sights[i].dir.normalize();
    }
    const now = new Set();
    for (const obj of fadeCandidates()) {
      if (!obj.visible || obj.userData.noFade) continue;
      const b = obj.userData.fadeBox, inv = obj.userData.fadeInv;
      // W7: standing on ground the cut-away has opened: it goes with it
      if (G.terrain) {
        foot.set((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2).applyMatrix4(obj.matrixWorld);
        foot.y += 0.15;
        if (G.terrain.isCut(foot)) { now.add(obj); continue; }
      }
      localFeet.copy(feet).applyMatrix4(inv);
      // standing on it or in it: not an obstacle to the view of the hero
      if (localFeet.x > b.min.x && localFeet.x < b.max.x && localFeet.z > b.min.z && localFeet.z < b.max.z && b.max.y < localFeet.y + 0.4) continue;
      if (b.max.y <= localFeet.y + 0.5) continue;
      for (const { dist, dir } of sights) {
        ray.set(camera.position, dir);
        localRay.copy(ray).applyMatrix4(inv);
        if (!localRay.intersectBox(b, hitPoint)) continue;
        hitPoint.applyMatrix4(obj.matrixWorld);
        if (camera.position.distanceTo(hitPoint) < dist - 0.8) { now.add(obj); break; }
      }
    }
    for (const o of faded) if (!now.has(o)) { setFaded(o, false); faded.delete(o); }
    for (const o of now) if (!faded.has(o)) { setFaded(o, true); faded.add(o); }
  }

  function update(target, dt) {
    if (override) {
      override.t += dt;
      const k = Math.min(1, override.t / override.duration), e = k * k * (3 - 2 * k);
      camera.position.lerpVectors(override.from, override.to, e);
      camera.lookAt(override.lookFrom.clone().lerp(override.lookAt, e));
      return;
    }
    if (camera.fov !== ISO_FOV) { camera.fov = ISO_FOV; camera.updateProjectionMatrix(); }
    // phones: the lens backs off by 1/sqrt(aspect), which gives an upright and
    // a lying-down phone the same scale (the screen spans the same metres, just
    // turned); an upright window or tablet backs off a little too. Desktop
    // (landscape, mouse) keeps the tuned distance.
    // a phone starts a little closer (the hero must read on a small screen)
    if (G.touch && !rig.phone) { rig.phone = true; rig.distance = DIST_PHONE; }
    const a = camera.aspect;
    const narrow = a < 1 ? Math.min(1.5, 1 / Math.sqrt(a)) : G.touch ? Math.max(0.6, 1 / Math.sqrt(a)) : 1;
    let dist = rig.distance * narrow;
    focus.lerp(aim.set(target.x, target.y + 0.6, target.z), 1 - Math.exp(-10 * dt));
    if (focus.distanceTo(target) > 30) { focus.set(target.x, target.y + 0.6, target.z); snapNext = true; } // after a teleport
    // W0: in a height world the lens never sinks into the rock (at the foot
    // of a tall cliff on its side it would). W7: it tilts up first, then
    // comes in, and rises over the ground only for what is left, smoothly
    if (G.terrain) {
      const at = (p, d) => {
        const cp = Math.cos(p);
        return G.terrain.clearAbove(focus.x + Math.sin(rig.yaw) * cp * d, focus.z + Math.cos(rig.yaw) * cp * d) + LENS_CLEAR - (focus.y + Math.sin(p) * d);
      };
      // (and it tilts a little, up to TILT_SIGHT, while rock stands over its
      // line of sight to the hero's feet: a ridge between them is looked
      // over rather than into; the cut-away opens the rest)
      const hidden = (p, d) => G.terrain.blocksSight(focus.x + Math.sin(rig.yaw) * Math.cos(p) * d, focus.y + Math.sin(p) * d, focus.z + Math.cos(rig.yaw) * Math.cos(p) * d, target);
      let p = rig.pitch, d = dist;
      while (p < TILT_MAX && (at(p, d) > LIFT_OK || (p < TILT_SIGHT && hidden(p, d)))) p = Math.min(TILT_MAX, p + TILT_STEP);
      while (d > DOLLY_MIN && at(p, d) > LIFT_OK) d = Math.max(DOLLY_MIN, d - 1.5);
      // (how much it tilts and comes in, smoothed: quick into it, slow out;
      // the wheel's zoom still answers at once)
      const k = (up) => 1 - Math.exp(-(up ? 5 : 1.5) * dt);
      const tiltTo = p - rig.pitch, inTo = dist - d;
      tiltBy += (tiltTo - tiltBy) * k(tiltTo > tiltBy);
      inBy += (inTo - inBy) * k(inTo > inBy);
      if (snapNext) { tiltBy = tiltTo; inBy = inTo; snapNext = false; } // (the first frame, a teleport)
      tilt = rig.pitch + tiltBy;
      dist = Math.max(DOLLY_MIN, dist - inBy);
      dolly = dist;
      const cp = Math.cos(tilt);
      offset.set(Math.sin(rig.yaw) * cp, Math.sin(tilt), Math.cos(rig.yaw) * cp);
      camera.position.copy(focus).addScaledVector(offset, dist);
      const want = Math.max(0, at(tilt, dist));
      lift += (want - lift) * (1 - Math.exp(-4 * dt));
      if (want > lift + 2) lift = want - 2; // never more than 2 m into it
      camera.position.y += lift;
    } else {
      const cp = Math.cos(rig.pitch);
      offset.set(Math.sin(rig.yaw) * cp, Math.sin(rig.pitch), Math.cos(rig.yaw) * cp);
      camera.position.copy(focus).addScaledVector(offset, dist);
    }
    if (shake > 0) {
      shake = Math.max(0, shake - dt);
      camera.position.x += (Math.random() - 0.5) * shake * 0.6;
      camera.position.y += (Math.random() - 0.5) * shake * 0.6;
    }
    camera.lookAt(focus);
    G.terrain?.update(target); // W0: cut a hole in the ground between the lens and the hero
    fadeTimer -= dt;
    if (fadeTimer <= 0) { fadeTimer = 0.15; updateFades(head.copy(focus).setY(focus.y + 0.3)); }
  }

  return {
    rig, update,
    get yaw() { return rig.yaw; },
    shake(amount = 0.4) { shake = Math.max(shake, amount); },
    fly(to, lookAt, duration = 2) {
      const lookFrom = new THREE.Vector3();
      camera.getWorldDirection(lookFrom).multiplyScalar(10).add(camera.position);
      override = { from: camera.position.clone(), to: to.clone(), lookFrom, lookAt: lookAt.clone(), t: 0, duration };
      return new Promise((r) => setTimeout(r, duration * 1000));
    },
    release() { override = null; },
    snap(target) { focus.set(target.x, target.y + 0.6, target.z); snapNext = true; },
    get faded() { return faded; },
    get dolly() { return dolly; }, get lift() { return lift; }, get tilt() { return THREE.MathUtils.radToDeg(tilt); },
    clearFades() { for (const o of faded) setFaded(o, false); faded.clear(); },
  };
}
