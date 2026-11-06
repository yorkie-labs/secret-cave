import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MODELS, FIRST_REGION, regionOf, LOAD, loadModels, prefetch, whenLoaded, instance, whenReady, modelStatus, isLoaded, hasFailed, _setIo, _reset } from '../src/world/models.js';
import { createWorld } from '../src/world/world.js';
import { buildNavGrid } from '../src/world/navGrid.js';
import { scatterPoints, RULES } from '../src/world/scatter.js';
import { MAIN_WORLD } from '../src/world/worlds/main.js';
import { FOREST_MODELS } from '../src/world/forest.js';
import { HEART_MODELS } from '../src/world/heart.js';
import { INTRO_MODELS } from '../src/ui/introModels.js';
import * as THREE from 'three';

// Release: the first load streams. The title waits only for region 1's
// models (the entrance, Moss Valley, the camp); the rest come after it.
describe('the load order (FIRST_REGION)', () => {
  const world = createWorld(MAIN_WORLD);
  const regionAt = (x, z) => world.areaAt(x, z)?.region ?? null;
  const later = (key, r) => typeof regionOf(key) === 'number' && r !== null && regionOf(key) > Math.max(1, r);

  it('names only catalog models', () => {
    for (const k of Object.keys(FIRST_REGION)) expect(MODELS[k], k).toBeTruthy();
  });
  it('no landmark or bridge waits for a later region than the one it stands in', () => {
    const bad = [];
    for (const l of MAIN_WORLD.landmarks ?? []) if (later(l.model, regionAt(l.x, l.z))) bad.push(`${l.model} @ region ${regionAt(l.x, l.z)}`);
    for (const b of world.bridges) if (b.model && MODELS[b.model] && later(b.model, regionAt((b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2))) bad.push(`bridge ${b.model}`);
    expect(bad).toEqual([]);
  });
  it('no scatter in a region uses a later region\'s model', () => {
    const nav = buildNavGrid(world);
    const pts = scatterPoints(world, nav, MAIN_WORLD);
    expect(pts.length).toBeGreaterThan(1000);
    const bad = new Set();
    for (const p of pts) { const key = RULES[p.rule].key; if (MODELS[key] && later(key, regionAt(p.x, p.z))) bad.add(`${key} @ region ${regionAt(p.x, p.z)}`); }
    expect([...bad]).toEqual([]);
  });
  it('puts the forest, ice, heart and intro models after the first ones', () => {
    for (const k of FOREST_MODELS) expect(regionOf(k)).toBe(2);
    for (const k of HEART_MODELS) expect(regionOf(k), k).toBe(k === 'ashlar' ? 3 : 4); // (ashlar: the crystal path by the lake's crystal door)
    for (const k of ['wolf', 'rabbit', 'glyphStone', 'altar', 'torch', 'headframe', 'mineCart', 'bonnet']) expect(regionOf(k), k).toBe(1);
    for (const k of INTRO_MODELS.filter((k) => k.startsWith('intro'))) expect(regionOf(k)).toBe('intro');
  });
});

// A fake network: each id answers when the test says so (or never).
function fakeNet() {
  const calls = [];
  const pending = new Map();
  const fetch = (url, { signal }) => new Promise((resolve, reject) => {
    const id = url.split('/').pop().replace('.glb', '');
    calls.push(id);
    signal.addEventListener('abort', () => reject(new Error('aborted')));
    pending.set(id, { resolve, reject });
  });
  const answer = (id, ok = true) => {
    const p = pending.get(id);
    pending.delete(id);
    if (ok) p.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
    else p.resolve({ ok: false, status: 503 });
  };
  const parse = async () => { const scene = new THREE.Group(); scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())); return { scene, animations: [] }; };
  return { calls, pending, fetch, answer, parse };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const id = (k) => MODELS[k].id;

describe('the loader (release: a few at a time, retried, never failing the boot)', () => {
  let net; const keep = { ...LOAD };
  beforeEach(() => {
    _reset();
    net = fakeNet();
    _setIo({ fetch: net.fetch, parse: net.parse, wait: async () => {} });
    Object.assign(LOAD, { concurrency: 2, stallMs: 50, retries: 2, backoff: [0] });
  });
  afterEach(() => { Object.assign(LOAD, keep); _reset(); });

  it('asks for a few at a time, the most urgent first', async () => {
    prefetch(['iceFall', 'iceChunk'], 3);
    const first = loadModels(['wolf', 'rabbit', 'fox'], { priority: 1 });
    await tick();
    // (the background two were asked first and took both slots)
    expect(net.calls).toEqual([id('iceFall'), id('iceChunk')]);
    net.answer(id('iceFall')); await tick(); await tick();
    expect(net.calls.slice(2)).toEqual([id('wolf')]); // the urgent ones jump the rest of the queue
    net.answer(id('iceChunk')); net.answer(id('wolf')); await tick(); await tick();
    net.answer(id('rabbit')); await tick(); await tick();
    net.answer(id('fox'));
    await first;
    expect(isLoaded('wolf') && isLoaded('fox')).toBe(true);
    expect(modelStatus().pending).toBe(0);
  });
  it('drops a stalled download and tries again; resolves even when one never comes', async () => {
    let n = 0;
    const p = loadModels(['wolf', 'crown'], { onProgress: (d) => { n = d; } });
    await tick();
    net.answer(id('wolf'));
    // crown: never answered → stalls (50 ms) → retried twice → given up
    await p;
    expect(isLoaded('wolf')).toBe(true);
    expect(hasFailed('crown')).toBe(true);
    expect(net.calls.filter((c) => c === id('crown')).length).toBe(3);
    expect(n).toBe(2);
    expect(modelStatus().failed).toEqual(['crown']);
  });
  it('retries an HTTP error', async () => {
    const p = loadModels(['torch']);
    await tick(); net.answer(id('torch'), false);
    await tick(); await tick(); await tick();
    net.answer(id('torch'));
    await p;
    expect(isLoaded('torch')).toBe(true);
  });
  it('a model asked for early is a placeholder that fills itself, and whenReady waits for it', async () => {
    prefetch(['iceAxe'], 3);
    const obj = instance('iceAxe');
    let dressed = 0;
    whenReady(obj, (o) => { dressed = o.children.length; });
    expect(obj.children.length).toBe(0);
    expect(dressed).toBe(0);
    let later = false;
    whenLoaded(['iceAxe'], () => { later = true; });
    await tick(); net.answer(id('iceAxe')); await tick(); await tick();
    expect(obj.children.length).toBe(1);
    expect(dressed).toBe(1);
    expect(later).toBe(true);
    // loaded now: straight away
    let now = false; whenLoaded(['iceAxe'], () => { now = true; });
    expect(now).toBe(true);
    expect(instance('iceAxe').userData.pendingModel).toBeUndefined();
  });
  it('a model that never came: a prop is left out, an animal gets a stand-in with its bones', async () => {
    const p = loadModels(['iceAxe', 'deer']);
    await p; // (never answered: both stall out)
    const prop = instance('iceAxe');
    expect(prop.children.length).toBe(0);
    const deer = instance('deer');
    for (const b of ['Neck', 'Head', 'Jaw', 'Tail', 'Hips']) expect(deer.getObjectByName(b), b).toBeTruthy();
  });
});
