import { describe, it, expect } from 'vitest';
import { newState, markSeen, addStars, unlock, load, save, clearSave, SAVE_KEY, SANDBOX_KEY, useSandbox, saveKey } from '../src/core/state.js';
import { safeStorage, memoryStorage } from '../src/core/storage.js';
import { newRun, resetRun } from '../src/core/run.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

describe('persistent save (GDD §10.5: only what lasts between runs)', () => {
  it('starts empty', () => {
    const s = newState();
    expect(s.stars).toBe(0);
    expect(s.necklace).toBe(false);
    expect(s.seen).toEqual({});
  });
  it('the codex remembers each thing once', () => {
    const s = newState();
    expect(markSeen(s, 'wolf')).toBe(true);
    expect(markSeen(s, 'wolf')).toBe(false);
    expect(s.seen.wolf).toBe(true);
  });
  it('unlocks cost stars, once', () => {
    const s = newState();
    expect(unlock(s, 'vine', 3)).toBe(false);
    addStars(s, 4);
    expect(unlock(s, 'vine', 3)).toBe(true);
    expect(s.stars).toBe(1);
    expect(unlock(s, 'vine', 1)).toBe(false);
  });
  it('saves, loads and clears', () => {
    const store = memory();
    const s = newState();
    s.necklace = true; markSeen(s, 'rabbit');
    save(s, store);
    const l = load(store);
    expect(l.necklace).toBe(true);
    expect(l.seen.rabbit).toBe(true);
    expect(l.unlocks).toEqual({});
    clearSave(store);
    expect(load(store)).toBeNull();
  });
  it('ignores a broken or foreign save', () => {
    const store = memory();
    store.setItem(SAVE_KEY, '{oops');
    expect(load(store)).toBeNull();
    store.setItem(SAVE_KEY, JSON.stringify({ version: 99 }));
    expect(load(store)).toBeNull();
  });
  it('keeps the codex and the run count across runs; an old save gains wins (M4, GDD §8.2)', () => {
    const store = memory();
    const old = newState();
    delete old.wins;
    old.seen.wolf = true; old.runs = 3;
    save(old, store);
    const l = load(store);
    expect(l.wins).toBe(0);
    expect(l.runs).toBe(3);
    expect(markSeen(l, 'wolf')).toBe(false); // seen before: not new this run
    expect(markSeen(l, 'herb')).toBe(true);
  });
  it('starts each run with an empty "새로 발견한 것" list and no rooms', () => {
    const r = newRun(5);
    r.found.push('wolf'); r.rooms = 3; r.time = 40;
    resetRun(r, 6);
    expect(r).toMatchObject({ found: [], rooms: 0, time: 0, seed: 6 });
  });
});

describe('blocked storage (release: Safari "block all cookies", in-app browsers)', () => {
  const denied = () => { throw new DOMException('denied', 'SecurityError'); };
  it('falls back to memory when even reading localStorage throws', () => {
    const r = safeStorage(denied);
    expect(r.persistent).toBe(false);
    r.storage.setItem('a', 1);
    expect(r.storage.getItem('a')).toBe('1');
  });
  it('falls back when the store is there but writes throw (full, read-only)', () => {
    const ro = { getItem: () => null, setItem: denied, removeItem: () => {} };
    expect(safeStorage(() => ro).persistent).toBe(false);
    expect(safeStorage(() => memoryStorage()).persistent).toBe(true);
    expect(safeStorage(() => undefined).persistent).toBe(false);
  });
  it('save/load/clearSave never throw, whatever the store does', () => {
    const broken = { getItem: denied, setItem: denied, removeItem: denied };
    expect(() => save(newState(), broken)).not.toThrow();
    expect(load(broken)).toBeNull();
    expect(() => clearSave(broken)).not.toThrow();
    // the default store (node: no localStorage → memory) works too
    const s = newState(); s.stars = 4;
    save(s);
    expect(load().stars).toBe(4);
    clearSave();
    expect(load()).toBeNull();
  });
});

describe('the sandbox save slot (release: debug links never touch the real save)', () => {
  it('saves and loads under its own key, and leaves the real save alone', () => {
    const store = memoryStorage();
    const real = newState(); real.stars = 2;
    save(real, store);
    useSandbox(true);
    try {
      expect(saveKey()).toBe(SANDBOX_KEY);
      expect(load(store)).toBeNull(); // the sandbox starts empty
      const test = newState(); test.stars = 99;
      save(test, store);
      clearSave(store);
      expect(JSON.parse(store.getItem(SAVE_KEY)).stars).toBe(2);
    } finally { useSandbox(false); }
    expect(saveKey()).toBe(SAVE_KEY);
    expect(load(store).stars).toBe(2);
  });
});
