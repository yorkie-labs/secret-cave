// K1 (tasks/20261105-cozy-look-todo.md): where the cave's key light shines
// from, and the shadow box that follows the hero. Pure maths (no Three), so
// the tests can pin it. Ported from wild-island's shadowbox.ts (C2 review).
//
// The box is sized from what the view really shows (its four corner rays
// meet the ground) and its centre is snapped to the shadow map's texel grid
// in the light's own frame: moving it by less than a texel makes every
// shadow edge crawl while the hero walks.

/**
 * Where the key light shines from (unit): ~50° up, on the camera's
 * front-left (the lens looks from +x +z, isoCamera ISO_YAW = 45°): 35° round
 * from the lens toward the screen's left. The sides that face the viewer —
 * cliff fronts, the Maltese's face, props — are lit, and shadows fall up the
 * screen and to the right, away from the viewer (never over the hero's ring
 * or a telegraph in front of it).
 */
export const TO_KEY = (() => {
  const yaw = Math.PI / 4 - (35 * Math.PI) / 180, el = (50 * Math.PI) / 180;
  return { x: Math.sin(yaw) * Math.cos(el), y: Math.sin(el), z: Math.cos(yaw) * Math.cos(el) };
})();

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a) => { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** The light frame of a directional light shining from `toLight` (unit right, up, back), as a shadow camera's lookAt builds it. */
export function lightFrame(toLight) {
  const back = norm(toLight);
  const right = norm(cross({ x: 0, y: 1, z: 0 }, back));
  return { right, up: cross(back, right), back };
}

/**
 * `center` moved (by at most half a texel each way) onto the texel grid
 * across the light (`texel` along its right axis, `texelUp` along its up
 * axis); along the light it stays.
 */
export function snapToTexel(center, toLight, texel, texelUp = texel) {
  const { right, up, back } = lightFrame(toLight);
  const a = Math.round(dot(center, right) / texel) * texel;
  const b = Math.round(dot(center, up) / texelUp) * texelUp;
  const c = dot(center, back);
  return {
    x: right.x * a + up.x * b + back.x * c,
    y: right.y * a + up.y * b + back.y * c,
    z: right.z * a + up.z * b + back.z * c,
  };
}

/**
 * Where the view's four corner rays meet the ground, relative to the focus
 * (`view`: the lens's distance, pitch and yaw round the focus, vertical FOV
 * in degrees, aspect): on the focus's own level and `drop` metres below it
 * (the ground on screen lies between those; lower ground is seen further
 * away), 4 or 8 points.
 */
export function viewGroundCorners(view, drop = 0) {
  const { cam, rays } = viewRays(view);
  const out = [];
  for (const level of drop > 0 ? [0, -drop] : [0]) {
    for (const d of rays) {
      const t = (level - cam.y) / Math.min(d.y, -0.05); // (a ray at the horizon: a far but finite point)
      out.push({ x: cam.x + d.x * t, y: level, z: cam.z + d.z * t });
    }
  }
  return out;
}

/** The lens (relative to the focus) and its four corner rays (not unit), bottom-left, bottom-right, top-left, top-right. */
export function viewRays({ dist, pitch, yaw, fovDeg, aspect }) {
  const off = { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
  const cam = { x: off.x * dist, y: off.y * dist, z: off.z * dist };
  const fwd = { x: -off.x, y: -off.y, z: -off.z };
  const right = norm(cross(fwd, { x: 0, y: 1, z: 0 }));
  const up = cross(right, fwd);
  const ty = Math.tan(((fovDeg * Math.PI) / 180) / 2), tx = ty * aspect;
  const rays = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => ({
    x: fwd.x + right.x * sx * tx + up.x * sy * ty,
    y: fwd.y + right.y * sx * tx + up.y * sy * ty,
    z: fwd.z + right.z * sx * tx + up.z * sy * ty,
  }));
  return { cam, rays };
}

/**
 * How far below the focus the ground on screen goes (m, ≥ 0): each corner
 * ray is marched (1 m steps, up to `reach` m) over `heightAt(x, z)` (world
 * metres; `focus` is where the view looks, in the world) until it meets the
 * ground. A cave has pits: the far corners of a view from a lip see ground
 * 20 m down, further away than the focus's own level would say.
 */
export function viewDrop(view, focus, heightAt, { reach = 160, max = 24 } = {}) {
  const { cam, rays } = viewRays(view);
  let drop = 0;
  for (const r of rays) {
    const l = Math.hypot(r.x, r.y, r.z);
    let hit = null;
    for (let t = 1; t <= reach; t += 1) {
      const x = focus.x + cam.x + (r.x / l) * t, y = focus.y + cam.y + (r.y / l) * t, z = focus.z + cam.z + (r.z / l) * t;
      const g = heightAt(x, z);
      if (Number.isFinite(g) && y <= g) { hit = g; break; }
      if (focus.y - y > max) break; // (deeper than we make room for)
    }
    drop = Math.max(drop, hit === null ? max : Math.min(max, focus.y - hit));
  }
  return drop;
}

/** Shadow box sides are whole multiples of this (m), so a smooth zoom or tilt changes the texel size only now and then. */
export const STEP = 2;

/**
 * The shadow box round the feet, in the light's frame (m: `left`/`right`
 * along its right axis, `bottom`/`top` along its up axis, as a directional
 * light's shadow camera takes them): just big enough, seen along the light,
 * to hold every ground corner of the view (relative to the feet) plus a
 * margin, each side rounded out to STEP. Not a square round the hero: at
 * the 40° pitch the top of the screen lies three times further off than the
 * bottom, and the key shines from near the lens, so a centred square wasted
 * half its texels (and drew the shadows of things behind the lens). A
 * shadow and its caster share light-frame coordinates, so every caster of a
 * shadow on screen is inside too.
 */
export function shadowBounds(corners, toLight, margin = 1.5, min = 8) {
  const { right, up } = lightFrame(toLight);
  let l = -min, r = min, b = -min, t = min;
  for (const c of corners) {
    const u = dot(c, right), v = dot(c, up);
    l = Math.min(l, u); r = Math.max(r, u); b = Math.min(b, v); t = Math.max(t, v);
  }
  const out = (x, s) => s * Math.ceil((s * x + margin) / STEP) * STEP;
  return { left: out(l, -1), right: out(r, 1), bottom: out(b, -1), top: out(t, 1) };
}
