// What a click on the screen means in a height world (world/world.js): the
// spot of walkable ground the cursor is on, the way the player sees it.
// Pure (no three.js, no Rapier): the ray, the world and the props come in as
// plain numbers and functions, so tests run it on real worlds.
//
// The camera ray is marched over the drawn ground (`world.height`, the
// terrain mesh's own triangles), the decks (bridges, floating rocks) and the
// water. At every surface the ray comes down onto:
// - cut away by the camera (`isCut`): looked through, as the eye does
// - walkable (`world.walk`): that is the click
// - rock (a cliff face, a rock top, the outer wall, a chasm floor, water)
//   nearer the lens than the hero and above its feet: looked through too
//   (it stands between the lens and the hero: the cut-away's job, not a
//   place the player means)
// - any other rock: the player pointed at a wall or a rock top past the
//   hero, and means its foot on our side: the ray's ground track is walked
//   back toward the lens to the first walkable spot no higher than the hit
//   (Scary Island's rule). Nothing there: the rock itself, `walk: false`.
// A prop (`solid`: the first solid thing the ray meets, with the top of what
// is drawn of it) in front of that ground means the prop's foot on our side,
// but only where the prop is really drawn (under its `top`).
//
// ray:   { origin: {x,y,z}, direction: {x,y,z} } (direction of unit length)
// world: { height(x, z), deck(x, z) → y | NaN, water(x, z) → level | NaN,
//          walk(x, z, y) → bool }   (see `clickWorld` below)
// hero:  {x, y, z} (its feet)
// opts:  { isCut(p) → bool, solid(maxT) → { t, x, y, z, top, base } | null,
//          maxT (m along the ray), back (m the foot is looked for) }
// → { x, y, z, t, kind: 'ground' | 'deck' | 'foot' | 'prop' | 'rock', walk }
//   or null (the ray meets nothing: the sky over the abyss)

const LENS_SIDE = 0.5; // m nearer the lens than the hero for rock to be looked through
const OVER_FEET = 0.3; // m over the hero's feet for rock to be looked through
const FOOT_UP = 0.5; // m over the hit a foot may stand
const MIN_STEP = 0.15, MAX_STEP = 1.2; // m along the ray

export function resolveClick(ray, world, hero, { isCut = null, solid = null, maxT = 320, back = 14 } = {}) {
  const o = ray.origin, d = ray.direction;
  // depth: how far from the lens along the ray's own ground track
  const gl = Math.hypot(d.x, d.z) || 1, gx = d.x / gl, gz = d.z / gl;
  const depth = (x, z) => (x - o.x) * gx + (z - o.z) * gz;
  const heroDepth = depth(hero.x, hero.z);
  const at = (t) => ({ x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t, t });

  // the first surface met from above that the eye stops at
  let found = null;
  let t = 0, prev = at(0), prevDeck = world.deck(prev.x, prev.z);
  let inside = prev.y < world.height(prev.x, prev.z); // (a lens in the rock: only surfaces met from above count)
  while (t < maxT && !found) {
    // (steps as long as half the height over what lies under the ray)
    let gap = prev.y - world.height(prev.x, prev.z);
    if (!Number.isNaN(prevDeck) && prev.y >= prevDeck) gap = Math.min(gap, prev.y - prevDeck);
    const step = Math.min(MAX_STEP, Math.max(MIN_STEP, gap * 0.5));
    t += step;
    const p = at(t), h = world.height(p.x, p.z), dk = world.deck(p.x, p.z);
    if (!Number.isNaN(dk) && prev.y >= dk && p.y <= dk && dk >= h - 0.05) {
      // a deck (a bridge, a floating rock) crossed from above
      found = { ...at(t - step * ((dk - p.y) / ((prev.y - p.y) || 1))), y: dk, kind: 'deck', walk: true };
    } else if (p.y < h && !inside) {
      inside = true;
      found = surface(t - step, t);
    } else if (p.y >= h) inside = false; // out of the rock again (a back face: never a click)
    prev = p; prevDeck = dk;
  }
  // the ground crossed between ta (over it) and tb (under it): what the eye
  // makes of it, or null when the eye looks through it
  function surface(ta, tb) {
    for (let k = 0; k < 8; k++) {
      const m = (ta + tb) / 2, q = at(m);
      if (q.y > world.height(q.x, q.z)) ta = m; else tb = m;
    }
    const q = at(tb);
    q.y = world.height(q.x, q.z);
    // water over it: its surface is what the eye meets
    const wy = world.water(q.x, q.z);
    if (!Number.isNaN(wy) && wy > q.y + 0.1) {
      const w = { ...at((wy - o.y) / d.y), y: wy, kind: 'water', walk: false };
      return isCut?.(w) || lookThrough(w) ? null : w;
    }
    if (isCut?.(q)) return null; // cut away by the camera: what lies beyond
    const s = { ...q, kind: 'ground', walk: world.walk(q.x, q.z, q.y) };
    return s.walk || !lookThrough(s) ? s : null;
  }
  function lookThrough(s) { return depth(s.x, s.z) < heroDepth - LENS_SIDE && s.y > hero.y + OVER_FEET; }

  // a prop drawn in front of that ground: its foot on our side
  const s = solid?.(found ? found.t - 0.5 : maxT);
  if (s && s.y <= s.top + 0.05) {
    const f = footOf(s, s.base ?? s.y, 0.8);
    if (f) return { ...f, t: s.t, kind: 'prop', walk: true };
  }
  if (!found) return null;
  if (found.walk) return found;
  // rock (or water) past the hero: the foot of it on our side
  const f = footOf(found, found.y, 0);
  return f ? { ...f, t: found.t, kind: 'foot', walk: true } : { ...found, kind: 'rock', walk: false };

  // walk back toward the lens along the ray's ground track from `p`
  // (`skip` m first) to the first walkable spot no higher than `top` + FOOT_UP
  function footOf(p, top, skip) {
    for (let s = skip; s <= back; s += 0.5) {
      const x = p.x - gx * s, z = p.z - gz * s;
      const dk = world.deck(x, z);
      if (!Number.isNaN(dk) && dk <= top + FOOT_UP) return { x, y: dk, z };
      const y = world.height(x, z);
      if (y <= top + FOOT_UP && world.walk(x, z, y)) return { x, y, z };
    }
    return null;
  }
}

// The `world` resolveClick asks, made from a height world (world/world.js)
// and its walkable grid (world/navGrid.js): the drawn ground, the decks, the
// water off the sampled grid, and "walkable" = a walkable node within a cell
// at about that height (so the lip of a ledge, a step back from its edge in
// the grid, still means that ledge).
export function clickWorld(world, nav) {
  const g = world.sample();
  const { W, D, x0, z0, cell } = g;
  const idx = (x, z) => {
    const i = Math.round((x - x0) / cell), j = Math.round((z - z0) / cell);
    return i < 0 || j < 0 || i >= W || j >= D ? -1 : j * W + i;
  };
  return {
    height: (x, z) => world.heightOnGrid(x, z),
    deck: (x, z) => world.deckAt(x, z)?.y ?? NaN,
    water: (x, z) => { const k = idx(x, z); return k < 0 ? NaN : g.water[k]; },
    walk(x, z, y) {
      const ci = nav.toI(x), cj = nav.toJ(z);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const n = nav.node(ci + di, cj + dj, 0);
        if (n >= 0 && nav.ok(n) && Math.abs(nav.y[n] - y) < 1.0) return true;
      }
      return false;
    },
  };
}
