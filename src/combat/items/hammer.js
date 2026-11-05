import * as THREE from 'three';
import { ITEMS } from '../../data/items.js';
import { inCone, comboHit, newCombo } from '../hits.js';
import { gradeOf, hammerStats } from '../grades.js';
import { counterDamage, armorMend } from '../combos.js';
import { sfx } from '../../audio/sound.js';

// The hammer (GDD §6.3): the swing lands on everything in a cone in front of
// the hero, `range` m long. Every 3rd hit in a row shakes the ground: a small
// shockwave that knocks back (and lightly hurts) what stands around.
export function createHammer(G) {
  const def = ITEMS.hammer;
  let combo = newCombo();
  const waves = [];
  const mended = new Set(); // W5: the fights the hammer + armour combo mended in

  // the swing lands (player.js calls this mid-swing)
  function strike() {
    const pp = G.player.position, heading = G.player.state.heading;
    const stats = hammerStats(gradeOf(G.run, 'hammer')); // W5: rare reaches further
    const hits = [];
    for (const h of G.hittables) {
      if (h.enabled && !h.enabled()) continue;
      const hp = typeof h.pos === 'function' ? h.pos() : h.pos;
      if (Math.abs(hp.y - pp.y) > 2.5) continue;
      if (inCone(pp.x, pp.z, heading, hp.x, hp.z, stats.range, stats.arc, h.radius)) hits.push(h);
    }
    G.emit('noise', { pos: pp.clone(), radius: 9, kind: 'hammer' });
    if (!hits.length) { G.mask?.off?.('attack'); return hits; } // a whiff is forgiven: only a pause breaks the chain
    // M6a: the first hammer from behind the mask hits twice as hard (and takes it off)
    let damage = G.mask ? G.mask.ambush(def.damage) : def.damage;
    if (damage > def.damage) G.emit('maskAmbush', { damage });
    // W5: shield + hammer: a swing right after a block hits twice as hard
    const counter = counterDamage(damage, G.shield?.lastBlock ?? null, G.time);
    if (counter.combo && hits.some((h) => h.enemy)) { damage = counter.damage; G.shield.lastBlock = null; G.itemCombo?.('shieldCounter'); }
    for (const h of hits) h.onHit({ damage, from: pp, push: 0.5, kind: 'hammer' });
    // W5: hammer + armour: a hit on an animal mends half a blue heart, once a fight
    const foe = hits.find((h) => h.enemy)?.enemy;
    if (foe && armorMend(G.run, mended, foe.isBoss ? `boss:${foe.kind}:${G.expedition?.n ?? 0}` : `spot:${foe.spot ?? foe.index}:${G.expedition?.n ?? 0}`) > 0) { G.hud.update(G.run); G.itemCombo?.('hammerArmor'); }
    combo = comboHit(combo, G.time, def.combo);
    G.combo = combo;
    if (combo.wave) shockwave(pp, hits);
    else if (stats.wave) shockwave(pp, hits, stats.wave); // W5: legend: a small shockwave every swing that lands
    return hits;
  }

  function shockwave(at, already, small = null) {
    const c = small ?? def.combo;
    for (const h of G.hittables) {
      if (h.enabled && !h.enabled()) continue;
      const hp = typeof h.pos === 'function' ? h.pos() : h.pos;
      if (Math.hypot(hp.x - at.x, hp.z - at.z) - h.radius > c.radius) continue;
      h.onHit({ damage: already.includes(h) ? 0 : c.damage, from: at, push: c.push, kind: 'wave' });
    }
    sfx.stomp();
    G.cam?.shake(small ? 0.15 : 0.35);
    G.emit('shockwave', { pos: at.clone(), small: !!small });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffe9a0', transparent: true, opacity: 0.9, depthWrite: false, fog: false }),
    );
    ring.position.set(at.x, at.y + 0.06, at.z);
    ring.renderOrder = 5;
    G.scene.add(ring);
    if (small) ring.material.color.set('#ffd36a');
    waves.push({ ring, t: 0, r: c.radius });
  }

  G.onUpdate((dt) => {
    for (const w of waves) {
      w.t += dt;
      const k = Math.min(1, w.t / 0.35);
      w.ring.scale.setScalar(0.3 + k * (w.r ?? def.combo.radius));
      w.ring.material.opacity = 0.9 * (1 - k);
      if (k >= 1) { G.scene.remove(w.ring); w.ring.geometry.dispose(); w.ring.material.dispose(); w.done = true; }
    }
    for (let i = waves.length - 1; i >= 0; i--) if (waves[i].done) waves.splice(i, 1);
  });

  return { strike, get combo() { return combo; }, reset() { combo = newCombo(); }, mended };
}
