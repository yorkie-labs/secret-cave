import * as THREE from 'three';
import { ITEMS } from '../../data/items.js';
import { bindTime } from '../loadout.js';
import { sfx } from '../../audio/sound.js';

// The vine (GDD §6.3): thrown toward the cursor, `range` m at most; the first
// animal it meets is bound for `bind` s (`bindWet` s if water hit it just
// before: GDD §6.6). Then `cooldown` s before the next throw, counted from
// the moment the vine leaves the paw (a throw cut short by a bite costs
// nothing). The vine is a string of leafy beads from the paw to its tip; it
// snaps back once it lands or misses.
const BEADS = 14;
const RETRACT = 0.25; // s to pull back in

export function createVine(G) {
  const def = ITEMS.vine;
  const { RAPIER, world } = G.physics;
  const flags = RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS;
  const solid = (c) => !G.physics.heroHandles.has(c.handle);
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  const beadGeo = new THREE.IcosahedronGeometry(1, 0);
  const vineMat = new THREE.MeshStandardMaterial({ color: '#4fae4a', emissive: '#2d8a30', emissiveIntensity: 0.8, flatShading: true, roughness: 0.8 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#7be06a', emissive: '#3fb43a', emissiveIntensity: 0.9, flatShading: true, roughness: 0.8 });
  let cd = 0, pending = false;
  const throws = [];

  // Right click with the vine selected. Returns whether a throw started.
  function use() {
    if (cd > 0 || pending) return false;
    if (!G.player.act('throw')) return false;
    pending = true;
    return true;
  }

  // the paw lets go (player.js, THROW_RELEASE s into the throw)
  G.on('throwRelease', () => {
    if (!pending) return;
    pending = false;
    cd = def.cooldown;
    sfx.whip();
    const f = G.player.facing.clone();
    const hand = () => G.player.position.clone().addScaledVector(G.player.facing, 0.3).setY(G.player.position.y + 0.6);
    const tip = hand();
    const group = new THREE.Group();
    group.name = 'vineThrow';
    for (let i = 0; i < BEADS; i++) {
      const leaf = i % 3 === 1;
      const b = new THREE.Mesh(beadGeo, leaf ? leafMat : vineMat);
      const r = i === BEADS - 1 ? 0.12 : leaf ? 0.09 : 0.06;
      b.scale.set(r, leaf ? r * 0.5 : r, leaf ? r * 1.6 : r);
      group.add(b);
    }
    G.scene.add(group);
    throws.push({ group, hand, tip, dir: f, out: 0, back: -1, hit: null });
    G.emit('vineThrown', { dir: f.clone() });
  });
  // a bite mid-throw: the vine never left the paw
  G.on('hurt', () => { pending = false; });

  G.onUpdate((dt) => {
    if (G.ticking()) cd = Math.max(0, cd - dt);
    for (const v of throws) {
      if (v.back < 0) {
        const step = Math.min(def.speed * dt, def.range - v.out);
        // the first awake animal along this step?
        let target = null, tAt = Infinity;
        for (const e of G.enemies) {
          if (e.gone || e.state === 'asleep' || e.untargetable?.('vine')) continue;
          const ex = e.pos.x - v.tip.x, ez = e.pos.z - v.tip.z;
          const along = ex * v.dir.x + ez * v.dir.z;
          if (along < -0.3 || along > step + 0.3) continue;
          const side = Math.abs(ex * v.dir.z - ez * v.dir.x);
          if (side < e.size[0] + 0.2 && along < tAt) { target = e; tAt = along; }
        }
        ray.origin = { x: v.tip.x, y: v.tip.y, z: v.tip.z };
        ray.dir = { x: v.dir.x, y: 0, z: v.dir.z };
        const wall = world.castRay(ray, step + 0.1, true, flags, undefined, undefined, undefined, solid);
        const wallAt = wall ? (wall.timeOfImpact ?? wall.toi) : Infinity;
        if (target && tAt <= wallAt) {
          const secs = bindTime(target.wetUntil ?? -Infinity, G.time, def);
          v.tip.addScaledVector(v.dir, Math.max(0, tAt));
          if (target.bind(secs)) {
            sfx.bind();
            G.emit('vineBind', { enemy: target, secs, wet: secs === def.bindWet });
            if (secs === def.bindWet) G.itemCombo?.('wetBind'); // (W5: the combo shows)
          }
          v.hit = target;
          v.back = 0;
        } else if (wallAt <= step) {
          v.tip.addScaledVector(v.dir, wallAt);
          v.back = 0;
        } else {
          v.tip.addScaledVector(v.dir, step);
          v.out += step;
          if (v.out >= def.range - 1e-3) v.back = 0;
        }
      } else v.back += dt;
      // the beads from the paw to the tip: a little wave while flying, pulled
      // in from the tip as it retracts
      const from = v.hand();
      const k = v.back < 0 ? 1 : Math.max(0, 1 - v.back / RETRACT);
      const to = from.clone().lerp(v.tip, k);
      v.group.children.forEach((b, i) => {
        const u = (i + 1) / BEADS;
        b.position.lerpVectors(from, to, u);
        const wave = Math.sin(u * Math.PI * 3 + G.time * 18) * 0.08 * Math.sin(u * Math.PI);
        b.position.x += v.dir.z * wave; b.position.z -= v.dir.x * wave;
        b.position.y += Math.sin(u * Math.PI) * 0.15 * k;
        b.rotation.y = Math.atan2(v.dir.x, v.dir.z) + i;
      });
      if (v.back >= RETRACT) { G.scene.remove(v.group); v.done = true; }
    }
    for (let i = throws.length - 1; i >= 0; i--) if (throws[i].done) throws.splice(i, 1);
  });

  return {
    id: 'vine', use, auto: false,
    get ready() { return cd <= 0 && !pending; },
    get cooldown() { return cd / def.cooldown; },
    get throws() { return throws; },
    reset() {
      cd = 0; pending = false;
      for (const v of throws) G.scene.remove(v.group);
      throws.length = 0;
    },
  };
}
