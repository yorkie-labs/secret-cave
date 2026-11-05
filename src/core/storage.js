// Safe storage. Some browsers block localStorage outright (Safari "block all
// cookies", some in-app browsers, sandboxed frames): even *reading*
// `localStorage` throws there. The game must still boot and play, so every
// read and write goes through here: the real localStorage when it works, an
// in-memory stand-in (lost on reload) when it does not. `persistent` says
// which one it got, so the title can say that progress won't be kept.

/** An in-memory Storage look-alike (getItem/setItem/removeItem/clear). */
export function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
    get length() { return m.size; },
  };
}

/**
 * `get()` returns the browser's Storage (default: localStorage). It is
 * tried once, in a try: the getter itself, then a write and a remove (a
 * full or read-only store throws there). Any failure: memory instead.
 */
export function safeStorage(get = () => globalThis.localStorage) {
  try {
    const s = get();
    if (!s) throw new Error('no storage');
    const probe = '__secret-cave-probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return { storage: s, persistent: true };
  } catch {
    return { storage: memoryStorage(), persistent: false };
  }
}

const local = safeStorage();
/** The game's storage: localStorage, or memory when the browser blocks it. */
export const storage = local.storage;
/** false: the browser blocks storage; nothing survives a reload. */
export const persistent = local.persistent;
/** sessionStorage, the same way (the restart's one-shot autostart flag). */
export const session = safeStorage(() => globalThis.sessionStorage).storage;
