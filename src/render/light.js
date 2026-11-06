// K1 (tasks/20261105-cozy-look-todo.md): the cave's light, on top of the
// Polyfork stage's rig (vendor/polyfork/stage.mjs, `night`): a "magic cave
// light" rather than daylight.
// - the key shines from the camera's front-left, high (shadowbox.js TO_KEY),
//   so what faces the viewer (cliff fronts, the Maltese's face, props) is
//   lit and the shadows fall up the screen, away from the viewer
// - soft shadows (PCFSoft, `shadow.intensity` < 1: the fill shows through,
//   so a shadow reads soft blue, not black) in a box that follows the hero,
//   sized from the view's ground corners and snapped to the texel grid
// - the hemisphere: a cool lavender-blue sky over a warm ground, so the
//   sides and undersides are warm-dark and the shadows cool
// The areas keep their own haze (worlds/main.js `areas[].fog`) and the
// crystals, mushrooms and the hero's glow their colour pools.
import * as THREE from 'three';
import { TO_KEY, shadowBounds, snapToTexel, viewDrop, viewGroundCorners } from './shadowbox.js';
import { PRESETS } from './quality.js';

/** The rig's colours and strengths (×, on stage's night rig and main.js's cave multipliers). */
export const CAVE_RIG = {
  hemiSky: '#6f84cc', // cool lavender blue: what the shadows are lit by
  hemiGround: '#5a4640', // warm earth: sides and undersides not black
  key: '#ffe0c2', // warm: highlights warm, shadows cool
  shadow: 0.58, // how dark a shadow is (1 = only the fill)
};
const KEY_DIST = 120; // m from the box centre to the light
const MAX_DROP = 24; // m below the focus the box makes room for (a cave has pits)

/**
 * Takes the stage's key light over: its direction, colour and shadow box.
 * `update(feet, view, heightAt)` each frame after `look.update()`: `feet`
 * the hero's feet, `view` the lens ({ dist, pitch, yaw, fovDeg, aspect },
 * shadowbox.js), `heightAt(x, z)` the ground's height (for the pits below
 * a lip; null: the focus's own level only).
 */
export function caveLight(look, { quality = 'high' } = {}) {
  const { key, hemi } = look;
  // new hues, the same exposure: the sky's and the key's brightness stay
  // what the stage's night rig (and main.js's multipliers) made them, so
  // every palette tuned under them keeps its level
  const lum = (c) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
  const sky0 = lum(hemi.color), key0 = lum(key.color);
  hemi.color.set(CAVE_RIG.hemiSky);
  hemi.groundColor.set(CAVE_RIG.hemiGround);
  key.color.set(CAVE_RIG.key);
  hemi.color.multiplyScalar(sky0 / lum(hemi.color));
  key.color.multiplyScalar(key0 / lum(key.color));
  let mapSize = 0;
  // the shadow map's texels a side (render/quality.js `shadowMap`)
  const setMapSize = (size) => {
    if (size === mapSize) return;
    mapSize = size;
    key.shadow.mapSize.set(mapSize, mapSize);
    key.shadow.map?.dispose(); key.shadow.map = null; // (made again at the new size)
    out.mapSize = mapSize;
    Object.assign(box, { left: 0, right: 0, bottom: 0, top: 0 }); // (the bias is set again for the new texels)
  };
  const setQuality = (q) => setMapSize((PRESETS[q] ?? PRESETS.high).shadowMap);
  // the ?perf=1 overlay's switch: no shadow map drawn at all (the key still lights)
  const setShadows = (on) => { key.castShadow = !!on; };
  key.shadow.intensity = CAVE_RIG.shadow;
  key.shadow.bias = 0;
  key.shadow.radius = 3;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = KEY_DIST * 2 + 40;
  const toKey = new THREE.Vector3(TO_KEY.x, TO_KEY.y, TO_KEY.z);
  const center = new THREE.Vector3();
  const box = { left: 0, right: 0, bottom: 0, top: 0 };
  let last = null, lastDrop = 0.6;
  const out = {
    box, toKey, mapSize, setQuality, setMapSize, setShadows,
    update(feet, view, heightAt = null) {
      const focus = { x: feet.x, y: feet.y + 0.6, z: feet.z };
      // (the drop is measured from the focus, 0.6 m over the feet: the feet's
      // own level at least. Perf pass, after scary-island: the search marches
      // the view's corner rays over the ground, hundreds of lookups, so it
      // runs again only once the lens has moved a metre, zoomed or turned)
      const moved = !last || Math.hypot(focus.x - last.x, focus.y - last.y, focus.z - last.z) > 1 || heightAt !== last.heightAt
        || Math.abs(view.dist - last.dist) > 0.5 || Math.abs(view.pitch - last.pitch) > 0.01 || Math.abs(view.yaw - last.yaw) > 0.01 || view.aspect !== last.aspect;
      if (moved) {
        last = { ...focus, dist: view.dist, pitch: view.pitch, yaw: view.yaw, aspect: view.aspect, heightAt };
        lastDrop = Math.max(0.6, heightAt ? viewDrop(view, focus, heightAt, { max: MAX_DROP }) : 0);
      }
      const drop = lastDrop;
      // the view's ground corners, from the feet (the box's centre)
      const need = shadowBounds(viewGroundCorners(view, drop).map((c) => ({ x: c.x, y: c.y + 0.6, z: c.z })), TO_KEY);
      // each side grows at once and shrinks only when well inside (a lip
      // walked along does not flip the texel size back and forth)
      let changed = false;
      for (const [k, s] of [['left', -1], ['right', 1], ['bottom', -1], ['top', 1]]) {
        if (s * need[k] > s * box[k] || s * need[k] < s * box[k] - 4) { box[k] = need[k]; changed = true; }
      }
      if (changed) {
        Object.assign(key.shadow.camera, box);
        key.shadow.camera.updateProjectionMatrix();
        key.shadow.normalBias = (Math.max(box.right - box.left, box.top - box.bottom) / mapSize) * 1.5;
      }
      const s = snapToTexel(feet, TO_KEY, (box.right - box.left) / mapSize, (box.top - box.bottom) / mapSize);
      center.set(s.x, s.y, s.z);
      key.target.position.copy(center);
      key.position.copy(center).addScaledVector(toKey, KEY_DIST);
      key.target.updateMatrixWorld();
    },
  };
  setQuality(quality);
  return out;
}
