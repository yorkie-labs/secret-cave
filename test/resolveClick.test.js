import { describe, it, expect } from 'vitest';
import { createWorld } from '../src/world/world.js';
import { buildNavGrid } from '../src/world/navGrid.js';
import { TEST_WORLD } from '../src/world/worlds/test.js';
import { resolveClick, clickWorld } from '../src/systems/resolveClick.js';

// What a click means (tasks/20261105-review-fixes-todo.md): the walkable
// ground the cursor is on, never a wall top in front of the lens, the level
// behind a back wall or the ground hidden behind a short prop's tall
// collider. A small world of rock with hollows carved in it, looked at the
// way the game's lens does (from +x +z, 40° down).
const DEF = {
  id: 'clicks',
  bounds: [-70, -70, 70, 70],
  base: { level: 0, walkable: false, material: 'rock' },
  terraces: [
    // the hollow the hero walks in
    { id: 'floor', level: -20, cliff: 2, outline: [[-30, -30], [30, -30], [30, 30], [-30, 30]] },
    // an upper ledge up-screen (north), its lip over the floor
    { id: 'ledge', level: -12, cliff: 2, outline: [[-30, -52], [30, -52], [30, -24], [-30, -24]] },
    // a deeper hollow behind the west wall (the old pick fell into it)
    { id: 'pit', level: -40, cliff: 2, outline: [[-62, -20], [-37, -20], [-37, 20], [-62, 20]] },
  ],
  islands: [{ id: 'rock1', at: [12, -12], r: 4, y: -15 }],
};
const world = createWorld(DEF);
const nav = buildNavGrid(world);
const cw = clickWorld(world, nav);

const YAW = Math.PI / 4, PITCH = (40 * Math.PI) / 180;
// the lens over the hero as the game puts it (`lift`: raised over rock)
function lensOver(hero, dist = 30, lift = 0) {
  const cp = Math.cos(PITCH);
  return { x: hero.x + Math.sin(YAW) * cp * dist, y: hero.y + 0.6 + Math.sin(PITCH) * dist + lift, z: hero.z + Math.cos(YAW) * cp * dist };
}
// the ray from the lens through a world point (where the cursor is)
function rayThrough(cam, p) {
  const dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - cam.z, l = Math.hypot(dx, dy, dz);
  return { origin: cam, direction: { x: dx / l, y: dy / l, z: dz / l } };
}
// an upright cylinder prop: the ray's first hit on it (the Rapier cast's stand-in)
function cylinder({ x, z, r, base, height, top = base + height }) {
  return (ray) => (maxT) => {
    const o = ray.origin, d = ray.direction;
    const ox = o.x - x, oz = o.z - z, a = d.x * d.x + d.z * d.z, b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    for (const t of [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)]) {
      const y = o.y + d.y * t;
      if (t > 0 && t < maxT && y >= base && y <= base + height) return { t, x: o.x + d.x * t, y, z: o.z + d.z * t, top, base };
    }
    // (the cap)
    const tc = (base + height - o.y) / d.y, px = o.x + d.x * tc - x, pz = o.z + d.z * tc - z;
    if (tc > 0 && tc < maxT && px * px + pz * pz <= r * r) return { t: tc, x: x + px, y: base + height, z: z + pz, top, base };
    return null;
  };
}
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

describe('a click on the ground (resolveClick)', () => {
  const hero = { x: 0, y: -20, z: 0 };
  const cam = lensOver(hero);

  it('lands on the open ground under the cursor', () => {
    for (const p of [{ x: -10, z: 5 }, { x: 8, z: -6 }, { x: 18, z: 18 }, { x: -20, z: -20 }]) {
      const r = resolveClick(rayThrough(cam, { ...p, y: -20 }), cw, hero);
      expect(r.kind).toBe('ground');
      expect(flat(r, p)).toBeLessThan(0.3);
      expect(r.y).toBeCloseTo(-20, 1);
    }
  });

  it('looks over a short prop whose collider is tall to the ground behind it', () => {
    const prop = { x: -8, z: -8, r: 1.5, base: -20, height: 30, top: -18 }; // 2 m drawn, a 30 m column
    const p = { x: -12, y: -20, z: -12 };
    const ray = rayThrough(cam, p);
    const r = resolveClick(ray, cw, hero, { solid: cylinder(prop)(ray) });
    expect(r.kind).toBe('ground');
    expect(flat(r, p)).toBeLessThan(0.3);
  });

  it('a click on the prop itself means its foot on our side', () => {
    const prop = { x: -8, z: -8, r: 1.5, base: -20, height: 2 };
    const ray = rayThrough(cam, { x: -8 + 1.1, y: -19, z: -8 + 1.1 }); // its side, under its top
    const r = resolveClick(ray, cw, hero, { solid: cylinder(prop)(ray) });
    expect(r.kind).toBe('prop');
    expect(r.y).toBeCloseTo(-20, 1);
    expect(flat(r, { x: -8, z: -8 })).toBeGreaterThan(1.5); // in front of it, not in it
    expect(flat(r, { x: -8, z: -8 })).toBeLessThan(3.5);
    expect(r.x + r.z).toBeGreaterThan(-16); // on the lens's side
  });

  it('looks through a rock top in front of the lens to the ground behind it', () => {
    // the hero at the lens-side corner of the hollow: the lens is lifted over
    // the 20 m rock there, whose top lies between it and the ground
    const h2 = { x: 24, y: -20, z: 24 };
    const c2 = lensOver(h2, 30, 6);
    expect(world.heightAt(c2.x, c2.z)).toBeGreaterThan(-1); // (the lens is over rock)
    for (const p of [{ x: 25, z: 25 }, { x: 27, z: 22 }, { x: 20, z: 26 }]) {
      const ray = rayThrough(c2, { ...p, y: -20 });
      const r = resolveClick(ray, cw, h2);
      expect(r.kind).toBe('ground');
      expect(flat(r, p)).toBeLessThan(0.3);
    }
  });

  it('a click on the foot of a back wall means that foot, not the level behind it', () => {
    for (const y of [-19.5, -15, -8, -2]) {
      // a point on the west wall's face (its cliff runs x -30 … -28)
      const xf = [-28.2, -28.8, -29.4, -29.9][[-19.5, -15, -8, -2].indexOf(y)];
      const r = resolveClick(rayThrough(cam, { x: xf, y, z: 0 }), cw, hero);
      expect(r.walk).toBe(true);
      expect(Math.abs(r.y + 20)).toBeLessThan(0.8); // (the floor, or the wall's foot just over it)
      expect(r.x).toBeGreaterThan(-29.5);
      expect(r.x).toBeLessThan(-22);
    }
  });

  it('a click just past an upper ledge\'s lip means the ledge', () => {
    for (const x of [-10, 0, 10]) {
      const p = { x, y: -12, z: -27 };
      const r = resolveClick(rayThrough(cam, p), cw, hero);
      expect(r.kind).toBe('ground');
      expect(r.walk).toBe(true);
      expect(r.y).toBeCloseTo(-12, 0);
      expect(flat(r, p)).toBeLessThan(0.6);
    }
  });

  it('a floating rock\'s deck is the click, and the floor beside it too', () => {
    const top = resolveClick(rayThrough(cam, { x: 12, y: -15, z: -12 }), cw, hero);
    expect(top.kind).toBe('deck');
    expect(top.y).toBeCloseTo(-15, 2);
    expect(flat(top, { x: 12, z: -12 })).toBeLessThan(0.3);
    const beside = resolveClick(rayThrough(cam, { x: 4, y: -20, z: -12 }), cw, hero);
    expect(beside.kind).toBe('ground');
    expect(flat(beside, { x: 4, z: -12 })).toBeLessThan(0.3);
  });

  it('ground cut away by the camera is looked through', () => {
    const p = { x: -5, y: -20, z: -5 };
    const ray = rayThrough(cam, p);
    // (a pretend cut-away: everything over -19 m between x, z 0 … 5)
    const isCut = (q) => q.y > -19 && q.x > -1 && q.x < 6;
    const r = resolveClick(ray, cw, hero, { isCut });
    expect(flat(r, p)).toBeLessThan(0.3);
  });

  it('rock past the hero with no ground on our side stays rock (walk: false)', () => {
    // from the ledge's far side: north of it there is only rock
    const h3 = { x: 0, y: -12, z: -40 };
    const c3 = lensOver(h3);
    const r = resolveClick(rayThrough(c3, { x: 0, y: 0, z: -70 }), cw, h3, { back: 3 });
    expect(r.walk).toBe(false);
    expect(r.kind).toBe('rock');
  });
});

describe('a click on the test world (?world=test)', () => {
  const tw = createWorld(TEST_WORLD);
  const tn = buildNavGrid(tw);
  const tcw = clickWorld(tw, tn);
  it('the viaduct\'s deck, not the chasm under it', () => {
    const hero = { x: 50, y: tw.heightAt(50, 8), z: 8 };
    const cam = lensOver(hero);
    const d = tw.deckAt(50, -15);
    const r = resolveClick(rayThrough(cam, { x: 50, y: d.y, z: -15 }), tcw, hero);
    expect(r.kind).toBe('deck');
    expect(r.y).toBeCloseTo(d.y, 1);
    expect(flat(r, { x: 50, z: -15 })).toBeLessThan(0.4);
  });
  it('the basin under the plateau\'s cliff from the plateau: the basin, walkable', () => {
    const hero = { x: 2, y: -10, z: 30 };
    const cam = lensOver(hero);
    const p = { x: -50, y: tw.heightAt(-50, 0), z: 0 };
    const r = resolveClick(rayThrough(cam, p), tcw, hero);
    expect(r.walk).toBe(true);
    expect(flat(r, p)).toBeLessThan(0.5);
  });
  it('is cheap (a march, not a raycast over the meshes)', () => {
    const hero = { x: 22, y: -10, z: 40 };
    const cam = lensOver(hero, 45);
    const t0 = performance.now();
    let n = 0;
    for (let gx = -20; gx <= 20; gx += 2) for (let gz = -20; gz <= 20; gz += 2) {
      if (resolveClick(rayThrough(cam, { x: hero.x + gx, y: hero.y, z: hero.z + gz }), tcw, hero)) n++;
    }
    const ms = (performance.now() - t0) / 441;
    expect(n).toBeGreaterThan(300);
    expect(ms).toBeLessThan(1); // (in the browser ~0.05 ms)
  });
});
