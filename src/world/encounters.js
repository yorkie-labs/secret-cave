// W1: what the world's hand-placed encounter spots hold this expedition
// (tasks/20261102-world-redesign-todo.md §2: the land and its landmarks are
// fixed; the packs, chests, herbs and shards are rolled from the
// expedition's seed). Pure: no three.js, so test/mainWorld.test.js checks it.
//
// A spot ({ id, at: [x, z], r, kinds: { kind: weight }, gentle }) holds one
// of these, rolled with its own sub-seed (one spot never depends on another):
//   wolves   2–3 wolves (a gentle spot on the first expedition: 1–2)
//   rabbits  2–3 rabbits
//   mixed    a wolf and 1–2 rabbits
//   foxes    1–2 foxes (W2, the Mushroom Forest: waiting in the giants' shade)
//   moles    1–2 mole monsters (W2: in the soft loam)
//   deer     1–2 deer (W3, the Ice Lake: room to charge)
//   bears    a bear
//   hares    2–3 snow hares
//   herd     a deer and 1–2 hares
//   crystalPack / crystalHerd / crystalBear  (W4) the Crystal Heart's mixes
//   chest    a treasure chest (and a couple of shards beside it)
//   herbs    1–2 herbs on the ground
//   shards   3–5 crystal shards in a little ring
//   empty    nothing this time (only if its weights say so)
import { rng, subSeed } from '../core/rng.js';

export const FILL = {
  wolves: { wolf: [2, 3] },
  rabbits: { rabbit: [2, 3] },
  mixed: { wolf: [1, 1], rabbit: [1, 2] },
  foxes: { fox: [1, 2] },
  moles: { mole: [1, 2] },
  // W3, the Ice Lake: deer, a bear (a brute: one at a time), snow hares, a
  // herd (a deer and a hare or two)
  deer: { deer: [1, 2] },
  bears: { bear: [1, 1] },
  hares: { hare: [2, 3] },
  herd: { deer: [1, 1], hare: [1, 2] },
  // W4, the Crystal Heart: every animal at once, crystal-tinted (a pack of a
  // wolf and a fox, a herd of a deer and hares, a bear with a wolf or not)
  crystalPack: { wolf: [1, 1], fox: [1, 1], rabbit: [0, 1] },
  crystalHerd: { deer: [1, 1], hare: [1, 2] },
  crystalBear: { bear: [1, 1], wolf: [0, 1] },
};
// GDD §8.5: a spot's region makes its animals tougher (× hp, × damage;
// expedition.js sets G.difficulty while it builds them)
export const REGION_DIFFICULTY = { 1: { hp: 1, damage: 1 }, 2: { hp: 1.25, damage: 1.15 }, 3: { hp: 1.5, damage: 1.3 }, 4: { hp: 1.8, damage: 1.5 } };
export const difficultyOfSpot = (spot) => REGION_DIFFICULTY[spot.region ?? 1] ?? REGION_DIFFICULTY[1];
const GENTLE = { wolf: [1, 2] }; // the first spot of the first expedition: a soft start

// The seed of expedition n (1, 2, …) of a save started from `base`.
export const expeditionSeed = (base, n) => (n <= 1 ? base >>> 0 : subSeed(base >>> 0, 9000 + n));

const pick = (rand, weights) => {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = rand() * total;
  for (const [k, w] of entries) if ((x -= w) < 0) return k;
  return entries.at(-1)?.[0] ?? 'empty';
};
const between = (rand, [lo, hi]) => lo + Math.floor(rand() * (hi - lo + 1));

// Points round a spot: the first in the middle, the rest on a ring, each
// moved to walkable ground by `place(x, z)` (null: dropped) when given.
function around(rand, spot, n, ring, place) {
  const out = [];
  const a0 = rand() * Math.PI * 2;
  for (let i = 0; i < n * 3 && out.length < n; i++) {
    const a = a0 + (i / Math.max(1, n)) * Math.PI * 2 + (rand() - 0.5) * 0.6;
    const d = out.length === 0 && n === 1 ? rand() * ring * 0.3 : ring * (0.55 + rand() * 0.45);
    let x = spot.at[0] + Math.cos(a) * d, z = spot.at[1] + Math.sin(a) * d;
    if (place) { const p = place(x, z); if (!p) continue; [x, z] = p; }
    if (out.some((q) => Math.hypot(q.x - x, q.z - z) < 1.4)) continue;
    out.push({ x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, heading: Math.round(rand() * 628) / 100 });
  }
  return out;
}

// Every spot's contents for one expedition. `expedition`: which one (the
// first is gentler); `place`: snaps a point to walkable ground (optional).
// `skip(spot)`: spots left empty this time (e.g. inside a beaten arena).
export function seedEncounters(spots, seed, { expedition = 1, place = null, skip = null } = {}) {
  return spots.map((spot, si) => {
    const rand = rng(subSeed(seed, 100 + si));
    const kind = skip?.(spot) ? 'empty' : pick(rand, spot.kinds ?? { empty: 1 });
    const out = { spot: spot.id, kind, enemies: [], chests: [], herbs: [], shards: [] };
    if (FILL[kind]) {
      const mix = spot.gentle && expedition <= 1 ? GENTLE : FILL[kind];
      const list = [];
      for (const [animal, range] of Object.entries(mix)) for (let n = between(rand, range); n > 0; n--) list.push(animal);
      around(rand, spot, list.length, spot.r * 0.7, place).forEach((p, i) => out.enemies.push({ kind: list[i], ...p }));
    } else if (kind === 'chest') {
      out.chests = around(rand, spot, 1, 2, place).map((p) => ({ ...p, index: expedition * 100 + si }));
      out.shards = around(rand, spot, 2, 2.6, place).map(({ x, z }) => ({ x, z }));
    } else if (kind === 'herbs') {
      out.herbs = around(rand, spot, between(rand, [1, 2]), spot.r * 0.5, place).map(({ x, z }) => ({ x, z }));
    } else if (kind === 'shards') {
      out.shards = around(rand, spot, between(rand, [3, 5]), Math.min(3, spot.r * 0.4), place).map(({ x, z }) => ({ x, z }));
    }
    return out;
  });
}

// What fainting costs (GDD §8.2, [call]): the hero wakes at the camp with
// half of this expedition's shards gone (the shards brought from the camp
// are safe). Returns { keep, lost }.
export function faintPenalty(carried, atStart) {
  const gained = Math.max(0, carried - Math.max(0, atStart));
  const lost = Math.floor(gained / 2);
  return { keep: carried - lost, lost };
}
