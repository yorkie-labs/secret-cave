import * as THREE from 'three';

// Where the hero can walk, and how to get there, the way Diablo's click-to-move
// works: a click only ever means a spot on walkable ground, and the hero finds
// a way around pillars, rocks and walls instead of walking into them.
//
// The height world (world/world.js) has its walkable grid worked out up front
// (world/navGrid.js: levels, ramps, bridges, connected pieces); this answers
// from it. Only props standing on the ground (a rock pillar, a mushroom) are
// found by Rapier, lazily, cell by cell.

export const CELL = 1;

export function createNav(G) {
  return createGridNav(G, G.navGrid);
}

function createGridNav(G, grid) {
  const { RAPIER, world } = G.physics;
  const flags = RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS;
  const ball = new RAPIER.Ball(0.3);
  const rot = { x: 0, y: 0, z: 0, w: 1 };
  const props = new Uint8Array(grid.y.length); // 0 not looked at, 1 clear, 2 a prop
  G.on('navChanged', () => props.fill(0));
  const solid = (c) => !G.invisibleColliders?.has(c.handle) && !G.terrain?.terrainHandles.has(c.handle);
  const blocked = (n) => {
    if (!props[n]) {
      const p = grid.posOf(n);
      // (W1: a shut gate's ground counts as a prop, so paths go round it)
      props[n] = G.gateShut?.(p.x, p.z) || world.intersectionWithShape({ x: p.x, y: p.y + 0.7, z: p.z }, rot, ball, flags, undefined, undefined, undefined, solid) ? 2 : 1;
    }
    return props[n] === 2;
  };
  const costAt = (n) => { if (!G.navCost) return 0; const p = grid.posOf(n); return G.navCost(p.x, p.z) ?? 0; };
  const V = (p) => new THREE.Vector3(p.x, p.y, p.z);
  const toIx = (v) => Math.round(v / CELL);
  const asCell = (n) => { const p = grid.posOf(n); return { ix: toIx(p.x), iz: toIx(p.z), n }; };

  // the top walkable surface on world cell (ix, iz) (the old API's shape)
  function cell(ix, iz) {
    const i = grid.toI(ix * CELL), j = grid.toJ(iz * CELL);
    for (let l = 1; l >= 0; l--) { const n = grid.node(i, j, l); if (n >= 0 && grid.ok(n) && !blocked(n)) return { y: grid.y[n] }; }
    return null;
  }
  function nearestWalkable(p, maxR = 4) {
    const n = grid.nearest(p, maxR, -1, blocked);
    return n < 0 ? null : asCell(n);
  }
  const at = (c) => V(grid.posOf(c.n ?? grid.nearest({ x: c.ix * CELL, z: c.iz * CELL }, 1)));
  // W2: `jumps` (the hero's clicks): the way may go by bounce mushroom
  // (W4: and by the stepping stones' hops, those `G.jumpOpen(id)` allows)
  function findPath(from, to, { near = 0.5, jumps = false } = {}) {
    const res = grid.findPath(from, to, { near, blocked, costAt, jumps, jumpOk: jumps && G.jumpOpen ? G.jumpOpen : null });
    if (!res) return null;
    const pts = res.points.map((p) => Object.assign(V(p), p.jump ? { jump: p.jump } : {}));
    // the point before a jump is the pad: its very middle (the walker steps on it)
    for (let i = 1; i < pts.length; i++) {
      const pad = pts[i].jump && [...(G.world?.def.bounces ?? []), ...(G.world?.def.hops ?? [])].find((b) => b.id === pts[i].jump)?.pad;
      if (pad) { pts[i - 1].x = pad[0]; pts[i - 1].z = pad[1]; pts[i - 1].pad = true; }
    }
    pts.shift(); // we are already standing on the first cell
    return { points: pts, partial: res.partial, visited: res.visited };
  }
  function lineReach(from, to) {
    const p = grid.lineReach(from, to, { blocked });
    return p ? V(p) : null;
  }
  return { cell, sample: cell, nearestWalkable, findPath, lineReach, at, toIx, grid, get cacheSize() { return props.length; } };
}
