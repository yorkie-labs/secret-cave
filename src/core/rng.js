// Seeded randomness (GDD §10.5: the same seed, the same cave). Pure.

// mulberry32: a small, fast generator; `rng(seed)()` gives 0 ≤ x < 1.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A seed of its own for the n-th thing made from `seed` (a chest, a room), so
// one thing's dice never depend on the order others were rolled in.
export const subSeed = (seed, n) => (Math.imul((seed ^ 0x9e3779b9) >>> 0, 2654435761) + Math.imul(n + 1, 0x85ebca6b)) >>> 0;

export const randomSeed = () => Math.floor(Math.random() * 2 ** 32) >>> 0;
