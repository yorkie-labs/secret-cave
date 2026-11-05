import * as THREE from 'three';
import { rng } from '../core/rng.js';
import { sfx } from '../audio/sound.js';

// The escape run (GDD §2.3 "무너지는 동굴 탈출 구간"): the cave shakes and
// rocks fall in the tunnel ahead of the hero. Every rock first paints a red
// circle on the floor where it will land (GDD §3.2, §8.5: always shown
// first), at most two at a time and never across the whole tunnel, so a
// child can always run round them; one that lands on the hero costs half a
// heart. `tunnel`: { x, z, dir: [dx, dz], length, width } in world metres:
// the crystal door's middle, the way the tunnel runs from it (an axis), how
// far the daylight is and how wide the floor is; the hero runs along `dir`.
// W4 (the big world's escape, world/heart.js): `floor(x, z)` gives the
// ground's height (the tunnel climbs), `from` (m along) where rocks may
// start, `hurry()` true once the soft clock ran out (rocks a little faster).
export const ROCKS_DEFAULT = {
  every: 0.85, // s between new rocks
  warn: 1.15, // s the red circle shows before the rock lands
  radius: 1.2, // m
  ahead: [3.5, 8], // m in front of the hero where a rock may come down
  max: 2, // at most this many circles at once
  damage: 0.5,
  quiet: 2.2, // m from the tunnel's end: no more rocks (the daylight is safe)
};
export const ROCKS = ROCKS_DEFAULT;

export function createEscape(G, tunnel, seed) {
  // (W4: the big world's longer run may ease the rocks: `tunnel.rocks`)
  const ROCKS = { ...ROCKS_DEFAULT, ...(tunnel.rocks ?? {}) };
  const [dx, dz] = tunnel.dir;
  const along = (p) => (p.x - tunnel.x) * dx + (p.z - tunnel.z) * dz;
  // (along, across) → world
  const world = (a, c) => ({ x: tunnel.x + dx * a - dz * c, z: tunnel.z + dz * a + dx * c });
  const rand = rng(seed);
  const floorY = tunnel.floor ?? (() => 0);
  const rocks = [];
  let timer = 1.2, shake = 0;
  const geo = new THREE.DodecahedronGeometry(0.75, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: '#6b6f6a', flatShading: true, roughness: 0.95 });
  const ringMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

  const esc = {
    rocks, // (for checks)
    // what is coming down now: like the animals' hazard()
    hazards: () => (esc.stopped ? [] : rocks.filter((r) => !r.landed).map((r) => ({ kind: 'rock', shape: 'circle', x: r.x, z: r.z, r: ROCKS.radius, hitAt: r.at }))),
    stopped: false,
    // W4: clear every rock (a faint on the way, the end)
    clear() { for (const r of rocks) { G.scene.remove(r.rock, r.mark); r.landed = true; r.t = 99; } rocks.length = 0; },
  };

  function drop() {
    const a = along(G.player.position) + ROCKS.ahead[0] + rand() * (ROCKS.ahead[1] - ROCKS.ahead[0]);
    if (a > tunnel.length - ROCKS.quiet - ROCKS.radius || a < (tunnel.from ?? 0)) return;
    // anywhere across, but not on top of another circle
    let x = 0, z = 0;
    const half = tunnel.width / 2 - ROCKS.radius - 0.3;
    for (let k = 0; k < 6; k++) {
      ({ x, z } = world(a, (rand() * 2 - 1) * half));
      if (rocks.every((r) => r.landed || Math.hypot(r.x - x, r.z - z) > ROCKS.radius * 2.4)) break;
    }
    const mark = new THREE.Group();
    const edge = new THREE.Mesh(new THREE.RingGeometry(ROCKS.radius * 0.9, ROCKS.radius, 32).rotateX(-Math.PI / 2), ringMat('#ff2a2a', 0.85));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(ROCKS.radius * 0.9, 32).rotateX(-Math.PI / 2), ringMat('#ff4a3a', 0.6));
    fill.position.y = 0.005;
    mark.add(edge, fill);
    for (const m of [edge, fill]) m.renderOrder = 5;
    const y = floorY(x, z);
    mark.position.set(x, y + 0.05, z);
    const rock = new THREE.Mesh(geo, rockMat);
    rock.position.set(x, y + 9, z);
    rock.castShadow = true;
    rock.visible = false;
    G.scene.add(mark, rock);
    const r = { x, z, y, at: G.time + ROCKS.warn, mark, fill, rock, landed: false, t: 0 };
    rocks.push(r);
    G.emit('escapeRock', { x, z, at: G.time, hitAt: r.at });
  }

  function land(r) {
    r.landed = true;
    r.mark.visible = false;
    const pp = G.player.position;
    const hit = Math.hypot(pp.x - r.x, pp.z - r.z) < ROCKS.radius + 0.3 && Math.abs(pp.y - (r.y ?? pp.y)) < 3;
    const hurt = hit && G.hurtPlayer(r.rock.position, ROCKS.damage);
    G.emit('escapeRockLanded', { x: r.x, z: r.z, inside: hit, hurt: !!hurt, at: G.time });
    sfx.rockFall?.();
    G.cam?.shake(0.25);
  }

  G.onUpdate((dt) => {
    if (G.mode !== 'play' || esc.stopped) return;
    timer -= dt;
    if (timer <= 0 && rocks.filter((r) => !r.landed).length < ROCKS.max) { timer = ROCKS.every * (tunnel.hurry?.() ? 0.75 : 1); drop(); }
    // the cave shakes now and then
    shake -= dt;
    if (shake <= 0) { shake = 1.6 + rand() * 1.2; G.cam?.shake(0.3); sfx.quake?.(); }
    for (const r of rocks) {
      r.t += dt;
      if (!r.landed) {
        const k = Math.min(1, r.t / ROCKS.warn);
        r.fill.scale.setScalar(Math.max(0.05, k));
        r.mark.children[0].material.opacity = 0.7 + Math.sin(G.time * 30) * 0.2;
        // the rock is seen falling for the last half second
        const fall = ROCKS.warn - r.t;
        r.rock.visible = fall < 0.5;
        r.rock.position.y = (r.y ?? 0) + 0.6 + Math.max(0, fall) * 16;
        r.rock.rotation.x += dt * 4;
        if (G.time >= r.at) land(r);
      } else if (r.t < ROCKS.warn + 1.0) {
        // it shatters into the floor
        const u = (r.t - ROCKS.warn) / 1.0;
        r.rock.scale.setScalar(Math.max(0.01, 1 - u));
        r.rock.position.y = (r.y ?? 0) + 0.5 - u * 0.4;
      } else if (r.rock.parent) {
        G.scene.remove(r.rock, r.mark);
        r.mark.children.forEach((m) => { m.geometry.dispose(); m.material.dispose(); });
      }
    }
  });
  return esc;
}
