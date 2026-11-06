// Perf pass (tasks/20261107-perf-todo.md): the quality levels, how a page
// picks one (address, menu, the adaptive step down's own, phones), the
// adaptive step down (pure), and which meshes stop casting shadows.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ADAPT, LEVELS, PRESETS, chooseQuality, createAdaptive, lowerLevel, median, msaaFor, pixelRatioFor, savedValue } from '../src/render/quality.js';
import { castsForNothing, trimCasters, MIN_CASTER } from '../src/render/casters.js';

describe('the levels', () => {
  it('are high, medium, low, each cheaper than the one above', () => {
    expect(LEVELS).toEqual(['high', 'medium', 'low']);
    const cost = (p) => p.pixelRatio ** 2 * (p.ao ? 2 : 1) * (p.bloom ? 1.2 : 1);
    expect(cost(PRESETS.high)).toBeGreaterThan(cost(PRESETS.medium));
    expect(cost(PRESETS.medium)).toBeGreaterThan(cost(PRESETS.low));
  });
  it('high keeps the whole cozy look (AO, bloom, a 2048 shadow map) at most 1.5 px per css px', () => {
    expect(PRESETS.high).toMatchObject({ ao: true, bloom: true, shadowMap: 2048, shadows: true, pixelRatio: 1.5 });
    expect(PRESETS.medium).toMatchObject({ ao: false, bloom: true, shadowMap: 1024, pixelRatio: 1.25 });
    expect(PRESETS.low).toMatchObject({ ao: false, bloom: false, shadowMap: 1024, pixelRatio: 1 });
  });
  it('caps the pixel ratio by the level, never above the screen', () => {
    expect(pixelRatioFor('high', 2)).toBe(1.5);
    expect(pixelRatioFor('high', 3)).toBe(1.5);
    expect(pixelRatioFor('high', 1)).toBe(1);
    expect(pixelRatioFor('medium', 2)).toBe(1.25);
    expect(pixelRatioFor('low', 2)).toBe(1);
    expect(pixelRatioFor('high', 1.25)).toBe(1.25);
  });
  it("MSAA 'auto' is 4 samples on a 1× screen and 2 on a denser one", () => {
    expect(msaaFor('auto', 1)).toBe(4);
    expect(msaaFor('auto', 1.5)).toBe(2);
    expect(msaaFor('auto', 1.25)).toBe(2);
    expect(msaaFor(0, 2)).toBe(0);
    expect(msaaFor(PRESETS.high.msaa, pixelRatioFor('high', 1))).toBe(4); // (a 1× screen's high is as before)
  });
  it('steps down one at a time and stops at low', () => {
    expect(lowerLevel('high')).toBe('medium');
    expect(lowerLevel('medium')).toBe('low');
    expect(lowerLevel('low')).toBe('low');
  });
});

describe('choosing a level', () => {
  it('?q= in the address wins, and counts as chosen', () => {
    expect(chooseQuality({ search: '?q=low', saved: 'high' })).toEqual({ level: 'low', chosen: true });
    expect(chooseQuality({ search: '?start=heart&q=medium&seed=4' })).toEqual({ level: 'medium', chosen: true });
    expect(chooseQuality({ search: '?q=high', touch: true, shortSide: 390 })).toEqual({ level: 'high', chosen: true });
    expect(chooseQuality({ search: '?q=potato' })).toEqual({ level: 'high', chosen: false });
  });
  it("the menu's pick is kept and counts as chosen (release's 'high' / 'low' too)", () => {
    for (const l of LEVELS) expect(chooseQuality({ saved: savedValue(l, true) })).toEqual({ level: l, chosen: true });
    expect(chooseQuality({ saved: 'low', touch: false })).toEqual({ level: 'low', chosen: true });
    expect(chooseQuality({ saved: 'high', touch: true, shortSide: 390 })).toEqual({ level: 'high', chosen: true });
  });
  it("the adaptive step down's level is where the next visit starts, but not chosen", () => {
    expect(savedValue('medium', false)).not.toBe('medium');
    expect(chooseQuality({ saved: savedValue('medium', false) })).toEqual({ level: 'medium', chosen: false });
    expect(chooseQuality({ saved: savedValue('low', false) })).toEqual({ level: 'low', chosen: false });
    expect(chooseQuality({ saved: 'auto:potato' })).toEqual({ level: 'high', chosen: false });
  });
  it('phones and small tablets start low; desktops and big tablets high', () => {
    expect(chooseQuality({ touch: true, shortSide: 390 })).toEqual({ level: 'low', chosen: false });
    expect(chooseQuality({ touch: true, shortSide: 820 })).toEqual({ level: 'low', chosen: false });
    expect(chooseQuality({ touch: true, shortSide: 1024 })).toEqual({ level: 'high', chosen: false });
    expect(chooseQuality({ touch: false, shortSide: 390 })).toEqual({ level: 'high', chosen: false });
    expect(chooseQuality()).toEqual({ level: 'high', chosen: false });
  });
});

describe('the adaptive step down', () => {
  const run = (a, ms, seconds, active = true) => { const out = []; for (let t = 0; t < seconds * 1000; t += ms) { const r = a.frame(ms, active); if (r) out.push([r, a.level]); } return out; };
  it('leaves a machine at 60 fps alone, for good', () => {
    const a = createAdaptive('high');
    expect(run(a, 16.7, 20)).toEqual([]);
    expect(a.done).toBe(true);
    expect(run(a, 40, 20)).toEqual([]); // (a later slow patch does not step it down)
  });
  it('waits out the warm-up, then steps down once the median frame is over 20 ms', () => {
    const a = createAdaptive('high');
    expect(run(a, 30, ADAPT.warmup)).toEqual([]);
    expect(run(a, 30, ADAPT.window + 0.2)).toEqual([['down', 'medium']]);
    expect(a.last).toBe(30);
  });
  it('then measures again at the new level: high → medium → low on a slow machine, never below', () => {
    const a = createAdaptive('high');
    expect(run(a, 30, 60)).toEqual([['down', 'medium'], ['down', 'low']]);
    expect(a.done).toBe(true);
  });
  it('stops at medium when medium runs well', () => {
    const a = createAdaptive('high');
    run(a, 30, ADAPT.warmup + ADAPT.window + 0.2);
    expect(a.level).toBe('medium');
    expect(run(a, 15, 30)).toEqual([]);
    expect(a.done).toBe(true);
    expect(a.level).toBe('medium');
  });
  it('never steps up', () => {
    const a = createAdaptive('medium');
    expect(run(a, 5, 60)).toEqual([]);
    expect(a.level).toBe('medium');
  });
  it('counts play only: the title, menus, loading, a hidden tab are not samples', () => {
    const a = createAdaptive('high');
    expect(run(a, 50, 60, false)).toEqual([]);
    expect(a.played).toBe(0);
    expect(a.done).toBe(false);
  });
  it('a hitch or a tab coming back (a frame over 250 ms) is not a sample', () => {
    const a = createAdaptive('high');
    for (let i = 0; i < 200; i++) expect(a.frame(1000, true)).toBe(null);
    expect(a.played).toBe(0);
  });
  it('a few slow frames among good ones do not step down (the median)', () => {
    const a = createAdaptive('high');
    const out = [];
    for (let i = 0; i < 2000; i++) { const r = a.frame(i % 4 === 0 ? 60 : 16.7, true); if (r) out.push(r); }
    expect(out).toEqual([]);
    expect(a.done).toBe(true);
  });
  it('does nothing once stopped (the player picked a level) or already low', () => {
    const a = createAdaptive('high'); a.stop();
    expect(run(a, 40, 60)).toEqual([]);
    expect(createAdaptive('low').done).toBe(true);
  });
  it('median', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('shadow casters (render/casters.js)', () => {
  it('outline hulls, silhouette copies and parts under MIN_CASTER stop casting; the rest keep it', () => {
    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshStandardMaterial());
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03), body.material);
    const hull = new THREE.Mesh(body.geometry, new THREE.MeshBasicMaterial()); hull.userData.isOutline = true;
    const ghost = new THREE.Mesh(body.geometry, new THREE.MeshBasicMaterial()); ghost.userData.isSilhouette = true;
    const scaled = new THREE.Mesh(new THREE.SphereGeometry(0.05), body.material); scaled.scale.setScalar(4); // (0.2 m in the world)
    body.add(hull, ghost); root.add(body, eye, scaled);
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    trimCasters(root);
    expect(body.castShadow).toBe(true);
    expect(scaled.castShadow).toBe(true);
    expect(eye.castShadow).toBe(false);
    expect(eye.receiveShadow).toBe(true);
    expect(hull.castShadow).toBe(false);
    expect(ghost.castShadow).toBe(false);
    expect(castsForNothing(new THREE.Mesh(new THREE.SphereGeometry(MIN_CASTER * 1.2)))).toBe(false);
  });
  it('a small part of a big (scaled-up) model keeps its shadow', () => {
    const root = new THREE.Group(); root.scale.setScalar(5);
    const part = new THREE.Mesh(new THREE.SphereGeometry(0.03)); part.castShadow = true;
    root.add(part);
    trimCasters(root);
    expect(part.castShadow).toBe(true);
  });
});
