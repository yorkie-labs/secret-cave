import * as THREE from 'three';
import { instance, whenReady } from './models.js';
import { createPuddle, createVent, createPoisonMushroom, createBounce, addSpores } from '../entities/mushrooms.js';
import { createSpring } from '../entities/spring.js';

// W2: the Mushroom Forest's fixtures (region 2, worlds/main.js): its poison
// (mud and tar pools to walk round, fumarole vents that puff on a beat,
// poison mushrooms that puff when the hero comes close), its bounce
// mushrooms (the walking grid's jump links, world/navGrid.js), spores
// drifting while the hero is in the forest, and its resting spring. They
// stay for the whole game (the expedition re-arms the spring); the poison
// system itself is entities/mushrooms.js createPoison.
export const FOREST_MODELS = ['mudPool', 'tarPit', 'fumarole'];

export function createForest(G, def) {
  const H = def.hazards ?? {};
  // (release: the forest's models may still be on their way: shadows once they land)
  const model = (key) => { const m = instance(key); whenReady(m, () => G.look.shadows(m)); return m; };
  const pools = [
    ...(H.mud ?? []).map((p) => createPuddle(G, { x: p.at[0], z: p.at[1], r: p.r, look: 'mud', model: model('mudPool') })),
    ...(H.tar ?? []).map((p) => createPuddle(G, { x: p.at[0], z: p.at[1], r: p.r, look: 'tar', model: model('tarPit') })),
  ];
  const vents = (H.vents ?? []).map(([x, z], i) => createVent(G, { x, z, model: model('fumarole'), phase: i * 0.37 }));
  const shrooms = (H.poison ?? []).map(([x, z]) => createPoisonMushroom(G, { x, z, big: 1.4 }));
  // click-to-move walks round the pools (systems/nav.js)
  // (W3: on top of what was there: the ice's little cost)
  const before = G.navCost;
  G.navCost = pools.length ? (x, z) => (pools.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 0.6) ? 8 : 0) + (before?.(x, z) ?? 0) : before ?? null;

  const bounces = (def.bounces ?? []).map((b) => createBounce(G, { x: b.pad[0], z: b.pad[1], to: { x: b.land[0], z: b.land[1] }, id: b.id }));

  // spores drift round the hero in the forest only
  const spores = addSpores(G, { mushrooms: { caps: ['#b45cff', '#ff8a3a', '#e65ad6'] } });
  G.onUpdate(() => { spores.visible = G.expedition?.area?.region === 2; });

  // the resting spring halfway down (two hearts and a herb, once an expedition)
  const spring = def.rest ? createSpring(G, { x: def.rest[0], z: def.rest[1], y: G.groundAt(...def.rest) }) : null;
  if (spring) G.addLight({ pos: new THREE.Vector3(def.rest[0], G.groundAt(...def.rest) + 3, def.rest[1]), color: '#b98cff', intensity: 6, distance: 12 });

  // (hidden with the ground under them when that is not drawn: world/build.js)
  for (const f of [...pools, ...vents, ...shrooms]) for (const o of f.parts ?? []) G.worldProps?.push({ obj: o, x: f.x, z: f.z });
  for (const b of bounces) { G.worldProps?.push({ obj: b.pad, x: b.x, z: b.z }, { obj: b.arc, x: b.x, z: b.z }); }
  return { pools, vents, shrooms, bounces, spring, spores };
}
