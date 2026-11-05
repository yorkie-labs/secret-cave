import * as THREE from 'three';
import { ITEMS } from '../../data/items.js';
import { refillTank, spendWater } from '../hits.js';
import { sfx } from '../../audio/sound.js';
import { gradeOf, waterStats, streamHeadings } from '../grades.js';

// The water gun (GDD §6.3): a blob of water flies toward the cursor, `range`
// m at most, and pushes back (and lightly hurts) the first animal it meets.
// Each shot takes 1/8 of the tank (the right orb), which fills again in about
// ten seconds; an empty tank only splutters.
const DROPS = 9; // droplets per shot, strung out behind the head: a stream

export function createWaterGun(G) {
  const def = ITEMS.waterGun;
  const { RAPIER, world } = G.physics;
  const shots = [], splashes = [];
  let wait = 0, sinceShot = Infinity;
  const dropGeo = new THREE.IcosahedronGeometry(1, 1);
  const dropMat = new THREE.MeshStandardMaterial({ color: '#9fe6ff', emissive: '#3fb4ff', emissiveIntensity: 0.9, transparent: true, opacity: 0.85, roughness: 0.15, depthWrite: false });
  const bombMat = new THREE.MeshStandardMaterial({ color: '#c9f2ff', emissive: '#59c8ff', emissiveIntensity: 1.3, transparent: true, opacity: 0.9, roughness: 0.1, depthWrite: false });
  const ringMat = new THREE.MeshBasicMaterial({ color: '#bff0ff', transparent: true, opacity: 0.8, depthWrite: false, fog: false });
  const ringGeo = new THREE.RingGeometry(0.75, 1, 32).rotateX(-Math.PI / 2);
  const flags = RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS;

  // Shoot along the hero's facing. Returns whether water came out.
  function fire() {
    if (wait > 0) return false;
    const spent = spendWater(G.run.water, def.water / (G.run.tank ?? 1)); // (W5: the star altar's big tank)
    if (!spent.ok) {
      wait = 1 / def.rate;
      sfx.empty();
      G.hud.waterEmpty();
      G.emit('waterEmpty');
      return false;
    }
    G.run.water = spent.water;
    wait = 1 / def.rate;
    sinceShot = 0;
    G.hud.water(G.run.water);
    G.player.act('shoot');
    sfx.squirt();
    const f0 = G.player.facing.clone();
    // W5 (GDD §6.5): rare and legend shoot two streams; legend's burst as bombs
    const stats = waterStats(gradeOf(G.run, 'waterGun'));
    for (const a of streamHeadings(Math.atan2(f0.x, f0.z), stats)) {
      const f = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const from = G.player.position.clone().addScaledVector(f, 0.45).setY(G.player.position.y + 0.55);
      const group = new THREE.Group();
      for (let i = 0; i < DROPS; i++) {
        const d = new THREE.Mesh(dropGeo, stats.bomb ? bombMat : dropMat);
        const r = (i === 0 ? 0.2 : 0.15 - i * 0.012) * (stats.bomb && i === 0 ? 1.5 : 1);
        d.scale.set(r, r, r * (i === 0 ? 1.6 : 2.0)); // stretched along the flight
        d.userData.lag = i * 0.26; // metres behind the head
        group.add(d);
      }
      group.position.copy(from);
      group.rotation.y = a;
      G.scene.add(group);
      shots.push({ group, from, dir: f, travelled: 0, bomb: stats.bomb });
      G.emit('waterShot', { from, dir: f.clone(), streams: stats.streams });
    }
    return true;
  }
  // W5: legend's water bomb: where a blob lands, everything round is pushed
  // and wetted (the one it hit already took its splash)
  function bomb(at, b, skip = null) {
    for (const e of G.enemies) {
      if (e === skip || e.gone || e.state === 'asleep' || e.dormant) continue;
      if (Math.hypot(e.pos.x - at.x, e.pos.z - at.z) > b.radius + (e.size?.[0] ?? 0.5)) continue;
      e.hurt({ damage: b.damage, from: at.clone(), push: b.push, kind: 'water' });
    }
    const ring = new THREE.Mesh(ringGeo, ringMat.clone());
    ring.position.set(at.x, (G.groundAt?.(at.x, at.z) ?? 0) + 0.08, at.z);
    ring.material.color.set('#7fd8ff');
    ring.renderOrder = 5;
    G.scene.add(ring);
    splashes.push({ ring, drops: [], t: 0, big: b.radius });
    G.emit('waterBomb', { at: at.clone() });
  }

  function splash(at, big) {
    sfx.splash();
    const ring = new THREE.Mesh(ringGeo, ringMat.clone());
    ring.position.set(at.x, (G.groundAt?.(at.x, at.z) ?? 0) + 0.06, at.z);
    ring.renderOrder = 5;
    G.scene.add(ring);
    const drops = [];
    for (let i = 0; i < (big ? 10 : 6); i++) {
      const d = new THREE.Mesh(dropGeo, dropMat);
      d.scale.setScalar(0.05 + Math.random() * 0.05);
      d.position.copy(at);
      const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 2;
      d.userData.v = new THREE.Vector3(Math.cos(a) * s, 2 + Math.random() * 2.5, Math.sin(a) * s);
      G.scene.add(d);
      drops.push(d);
    }
    splashes.push({ ring, drops, t: 0 });
  }

  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  const solid = (c) => !G.physics.heroHandles.has(c.handle);
  G.onUpdate((dt) => {
    wait = Math.max(0, wait - dt);
    sinceShot += dt;
    if (G.ticking() && sinceShot >= def.refillDelay) {
      const before = G.run.water;
      G.run.water = refillTank(G.run.water, dt, def.refill);
      if (G.run.water !== before) G.hud.water(G.run.water);
    }
    // shots in flight
    for (const s of shots) {
      const step = Math.min(def.speed * dt, def.range - s.travelled);
      const p = s.group.position;
      // the first animal along this step?
      let target = null, tAt = Infinity;
      for (const e of G.enemies) {
        if (e.gone || e.state === 'asleep') continue;
        const ex = e.pos.x - p.x, ez = e.pos.z - p.z;
        const along = ex * s.dir.x + ez * s.dir.z;
        if (along < -0.3 || along > step + 0.3) continue;
        const side = Math.abs(ex * s.dir.z - ez * s.dir.x);
        if (side < e.size[0] + 0.15 && along < tAt) { target = e; tAt = along; }
      }
      // M6a: poison it flies over (a cloud, a puddle, a swelling mushroom) is washed away
      let wash = null, wAt = Infinity;
      for (const w of G.washables ?? []) {
        if (!w.active()) continue;
        const wx = w.x - p.x, wz = w.z - p.z;
        const along = wx * s.dir.x + wz * s.dir.z, side = Math.abs(wx * s.dir.z - wz * s.dir.x);
        if (side > w.r || along < -w.r || along > step + 0.3) continue;
        const at = Math.max(0, along - Math.sqrt(Math.max(0, w.r * w.r - side * side)));
        if (at < wAt) { wash = w; wAt = at; }
      }
      // a wall or a pillar first?
      ray.origin = { x: p.x, y: p.y, z: p.z };
      ray.dir = { x: s.dir.x, y: 0, z: s.dir.z };
      const wall = world.castRay(ray, step + 0.1, true, flags, undefined, undefined, undefined, solid);
      const wallAt = wall ? (wall.timeOfImpact ?? wall.toi) : Infinity;
      if (wash && wAt <= wallAt && (!target || wAt <= tAt)) {
        wash.wash();
        splash(p.clone().addScaledVector(s.dir, wAt).setY((G.groundAt?.(p.x, p.z) ?? 0) + 0.3), true);
        G.emit('waterWash', { kind: wash.kind });
        s.done = true;
      } else if (target && tAt <= wallAt) {
        const at = target.pos.clone().setY(p.y);
        target.hurt({ damage: def.damage, from: at.clone().addScaledVector(s.dir, -1), push: def.push, kind: 'water' });
        splash(at, true);
        if (s.bomb) bomb(at, s.bomb, target);
        s.done = true;
      } else if (wallAt <= step) {
        const at = p.clone().addScaledVector(s.dir, wallAt);
        splash(at, false);
        if (s.bomb) bomb(at, s.bomb);
        s.done = true;
      } else {
        p.addScaledVector(s.dir, step);
        s.travelled += step;
        // the droplets trail behind the head, sagging a little
        s.group.children.forEach((d) => {
          const lag = Math.min(d.userData.lag, s.travelled);
          d.position.set(0, -lag * 0.04, -lag);
        });
        if (s.travelled >= def.range - 1e-3) { const at = p.clone().setY((G.groundAt?.(p.x, p.z) ?? 0) + 0.1); splash(at, false); if (s.bomb) bomb(at, s.bomb); s.done = true; }
      }
      if (s.done) G.scene.remove(s.group);
    }
    for (let i = shots.length - 1; i >= 0; i--) if (shots[i].done) shots.splice(i, 1);
    // splashes
    for (const sp of splashes) {
      sp.t += dt;
      const k = Math.min(1, sp.t / 0.5);
      sp.ring.scale.setScalar(0.2 + k * (sp.big ?? 0.9));
      sp.ring.material.opacity = 0.8 * (1 - k);
      for (const d of sp.drops) {
        d.userData.v.y -= 12 * dt;
        d.position.addScaledVector(d.userData.v, dt);
        d.visible = d.position.y > 0;
      }
      if (k >= 1) {
        G.scene.remove(sp.ring); sp.ring.material.dispose();
        for (const d of sp.drops) G.scene.remove(d);
        sp.done = true;
      }
    }
    for (let i = splashes.length - 1; i >= 0; i--) if (splashes[i].done) splashes.splice(i, 1);
  });

  // the right-click tool interface (main.js useTool, the HUD's sweep)
  return {
    id: 'waterGun', use: fire, fire, auto: true, // held: keeps shooting
    get shots() { return shots; }, get ready() { return wait <= 0; },
    get cooldown() { return wait * def.rate; }, // 0..1 of the wait still to go
    reset() { wait = 0; sinceShot = Infinity; },
  };
}
