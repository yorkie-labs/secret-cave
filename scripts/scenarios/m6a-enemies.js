// M6a: the mushroom cave's animals and hazards (GDD §3.2, §7.1). W2: in the
// big world's Mushroom Forest, GAME_URL='http://localhost:5191/?start=mushroom&seed=1'
// (its spots, mud pools, poison mushrooms and bounce mushrooms).
// Checked: the fox hides (all but invisible, does not notice the hero at
// 6.5 m), springs up close (❗, then the red cone before its bite), slinks
// back and hides again; water shows it up and it cannot hide for a while;
// the hammer puts it to sleep. The mole runs underground as a mound (the
// hammer does nothing there), shows a red circle before it bursts out, digs
// down again; water into its mound floods it out (stunned, the hammer
// works). Poison: a puddle ticks half a heart after a grace (green tint), a
// poison mushroom swells (a ring) before its cloud, water washes the cloud
// away. A bounce mushroom throws the hero along its arc to the mark.
const X = G.expedition;
const $ = (id) => document.getElementById(id);
const until = async (test, ms = 8000, step = 30) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (test()) return true; await wait(step); } return false; };
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const V = (x, z) => new THREE.Vector3(x, G.groundAt?.(x, z) ?? 0, z);
// the middle of a place: an old cavern, or (W2) a forest spot
const mid = (zone) => ({ x: zone.spot.at[0], z: zone.spot.at[1] });
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const ev = [];
for (const name of ['foxAmbush', 'foxSlink', 'foxHidden', 'foxRevealed', 'moleFlooded', 'enemyWindup', 'enemyBite', 'poisonTick', 'poisonSwell', 'poisonPuff', 'poisonWashed', 'launched', 'bounced', 'hurt']) G.on(name, (e) => ev.push({ name, at: G.time, kind: e?.enemy?.kind ?? e?.kind, e }));
const after = (name, t, kind) => ev.find((x) => x.name === name && x.at >= t && (!kind || x.kind === kind));
// a spot `d` m from p on open floor (toward the cavern's middle first)
function spotNear(p, d, zone) {
  for (let k = 0; k < 24; k++) {
    const a = Math.atan2(mid(zone).z - p.z, mid(zone).x - p.x) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.26;
    const c = V(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d);
    const r = G.nav.lineReach(p, c);
    if (r && flat(r, c) < 0.6 && !G.poisonAt(c.x, c.z, 1)) return c;
  }
  return V(p.x, p.z);
}
const shoot = async (target) => { face(target.x, target.z); G.waterGun.fire(); await wait(700); };
const heal = () => { G.run.hearts = G.run.maxHearts; G.hud.update(G.run); };

await start(); await wait(800);
const hush = (list) => { for (const e of list) { e.dormant = true; e.model.visible = false; } };
let rz, rzM;
// W2: the Mushroom Forest (region 2): an expedition with a fox and a mole
check('the hero starts in the Mushroom Forest (region 2): its name, the chief\'s gate open', X.area?.region === 2 && G.run.area === 1 && $('area-name').textContent.startsWith('버섯 숲') && X.gates.region2.open, $('area-name').textContent);
const find = (kind) => [...X.spots.values()].find((r) => r.spot.region === 2 && r.enemies.some((e) => e.kind === kind));
for (let k = 0; k < 12 && !(find('fox') && find('mole')); k++) X.startExpedition();
rz = find('fox'); rzM = find('mole');
for (const r of X.spots.values()) if (r !== rz && r !== rzM) hush(r.enemies);
X.jump(rz.spot.id); await wait(500);
const fox = rz.enemies.find((e) => e.kind === 'fox');
const mole = rzM.enemies.find((e) => e.kind === 'mole');
const others = [...rz.enemies, ...rzM.enemies].filter((e) => e !== fox && e !== mole);
hush([...others, mole]);
check('fox and mole: × 1.25 hp in the mushroom cave', fox.maxHp === 3.75 && mole.maxHp === 3.75, fox.maxHp, mole.maxHp);

// ---- the fox
const opacityOf = (e) => { let o = 1; e.model.traverse((m) => { if (m.isMesh && m.material.transparent) o = Math.min(o, m.material.opacity); }); return o; };
check('the fox hides in a mushroom\'s shade: all but invisible', fox.cloak.hidden && opacityOf(fox) < 0.3, opacityOf(fox).toFixed(2), rz.spot.id);
let p = spotNear(fox.pos, 6.5, rz);
await go(p.x, p.z); await wait(300);
await shot('m6a-fox-hidden');
await wait(1500);
check('6.5 m away it keeps hiding (it only springs up close)', fox.state === 'idle' && fox.cloak.hidden, fox.state);
let t = G.time;
p = spotNear(fox.pos, 3.2, rz);
await go(p.x, p.z);
check('up close it springs out: ❗ then the chase', await until(() => after('foxAmbush', t), 3000) && !fox.cloak.hidden);
await until(() => fox.state === 'windup', 4000);
const tw = after('enemyWindup', t, 'fox')?.at ?? G.time;
check('its bite is drawn first: the red cone', !!fox.hazard() && fox.mark.visible, JSON.stringify(fox.hazard()));
await shot('m6a-fox-ambush');
check('…and the bite comes after it', await until(() => after('enemyBite', tw, 'fox'), 3000));
const tb = after('enemyBite', tw, 'fox').at;
check('the windup lasted ≥ 0.6 s (time to step out)', tb - tw >= 0.6, (tb - tw).toFixed(2));
// it slinks off to hide again; the hero keeps away
p = spotNear(fox.pos, 9, rz);
await go(p.x, p.z);
check('after its bite it slinks back to the shade…', await until(() => after('foxSlink', tw), 6000));
check('…and hides again', await until(() => after('foxHidden', tw), 12000) && fox.cloak.hidden, fox.state);
await wait(800);
// water shows it up
t = G.time;
p = spotNear(fox.pos, 6, rz);
await go(p.x, p.z); await wait(200);
await shoot(fox.pos);
check('water on it: shown up (and wet)', !!after('foxRevealed', t) && !fox.cloak.hidden && G.time < fox.wetUntil);
await wait(500);
await shot('m6a-fox-revealed');
check('the plate says so', fox.hint().includes('드러났어요'), fox.hint());
const tr = G.time;
let hid = false;
while (G.time - tr < 5.5) { if (fox.cloak.hidden || fox.cloak.slinking) hid = true; if (fox.state === 'windup' && flat(fox.pos, P.position) < 3) { G.emit('rollTowardCursor'); } await wait(60); }
check('for a while it cannot hide: it fights in the open', !hid, fox.state);
// the hammer finishes it
heal();
for (let k = 0; k < 120 && fox.state !== 'asleep'; k++) {
  if (flat(fox.pos, P.position) < 2.1) { await swing(fox.pos.x, fox.pos.z); continue; }
  if (fox.state === 'idle' || fox.cloak.hidden) { p = spotNear(fox.pos, 1.6, rz); await go(p.x, p.z); }
  if (fox.cloak.hidden && G.tools.waterGun.ready) await shoot(fox.pos);
  await wait(120);
}
check('the hammer puts the fox to sleep', fox.state === 'asleep', fox.hp, fox.state);
check('in the codex: the fox', !!G.state.seen.fox);

// ---- the mole
heal();
 X.jump(rzM.spot.id); await wait(500); rz = rzM; hush(rzM.enemies.filter((e) => e !== mole)); 
mole.dormant = false; mole.model.visible = true;
mole.calm = 0;
check('the mole waits underground: only its mound shows', mole.underground && mole.model.getObjectByName('moleMound').visible && !mole.model.getObjectByName('moleBody').visible, mole.state);
p = spotNear(mole.pos, 1.3, rz);
await go(p.x, p.z);
const hp0 = mole.hp;
await swing(mole.pos.x, mole.pos.z);
check('the hammer does nothing to a mound', mole.hp === hp0, mole.hp);
p = spotNear(mole.pos, 6, rz);
const tw0 = G.time;
await go(p.x, p.z);
const d0 = flat(mole.pos, P.position);
check('it notices the hero and runs at it underground', await until(() => mole.state === 'travel', 3000) && await until(() => flat(mole.pos, P.position) < d0 - 1.5, 4000), mole.state, flat(mole.pos, P.position).toFixed(1));
await shot('m6a-mole-mound');
check('it stops: a red circle where it will burst out', await until(() => mole.state === 'windup', 5000) && !!mole.hazard() && mole.mark.visible, JSON.stringify(mole.hazard()));
const tm = after('enemyWindup', tw0, 'mole')?.at ?? G.time, h0 = G.run.hearts;
await wait(300);
await shot('m6a-mole-telegraph');
check('…then it bursts out (still standing in the circle: a heart)', await until(() => after('enemyBite', tm, 'mole'), 3000) && after('enemyBite', tm, 'mole').e.hurt && G.run.hearts <= h0 - 1, G.run.hearts);
check('the circle showed ≥ 0.9 s before the pop', after('enemyBite', tm, 'mole').at - tm >= 0.9, (after('enemyBite', tm, 'mole').at - tm).toFixed(2));
check('up out of its hole: the hammer\'s chance', mole.exposed, mole.state);
await shot('m6a-mole-up');
check('then it digs down again', await until(() => mole.state === 'dig' || mole.state === 'travel', 4000), mole.state);
// water into the mound floods it out
heal();
await until(() => mole.underground && mole.state === 'travel', 4000);
p = spotNear(mole.pos, 5, rz);
await go(p.x, p.z); await wait(100);
t = G.time;
await shoot(mole.pos);
check('water into its mound: flooded out, stunned (💫), up where the hammer reaches', !!after('moleFlooded', t) && mole.state === 'flooded' && mole.exposed && mole.dazed, mole.state);
await shot('m6a-mole-flooded');
check('the plate says to hit it now', mole.hint().includes('망치'), mole.hint());
const hp1 = mole.hp;
p = spotNear(mole.pos, 1.4, rz);
await go(p.x, p.z);
await swing(mole.pos.x, mole.pos.z);
check('the hammer lands on a flooded mole', mole.hp < hp1, hp1, mole.hp);
for (let k = 0; k < 160 && mole.state !== 'asleep'; k++) {
  heal();
  if (mole.exposed && flat(mole.pos, P.position) < 2.1) { await swing(mole.pos.x, mole.pos.z); continue; }
  if (mole.underground && mole.state !== 'idle' && G.tools.waterGun.ready && G.run.water > 0.2) { await shoot(mole.pos); }
  if (mole.exposed && flat(mole.pos, P.position) >= 2.1) { p = spotNear(mole.pos, 1.4, rz); await go(p.x, p.z); }
  await wait(100);
}
check('the mole falls asleep too', mole.state === 'asleep', mole.hp);
check('in the codex: the mole', !!G.state.seen.mole);

// ---- poison
heal();
let pz, puddle, pm;
// (the forest's mud pool and a poison mushroom near it)
puddle = X.forest.pools[0];
pm = X.forest.shrooms.reduce((a, q) => (Math.hypot(q.x - puddle.x, q.z - puddle.z) < Math.hypot(a.x - puddle.x, a.z - puddle.z) ? q : a));
pz = { spot: { at: [puddle.x, puddle.z] }, enemies: [] };
for (const r of X.spots.values()) hush(r.enemies);
X.jump([puddle.x + 6, puddle.z + 6]); await wait(300);
t = G.time;
let hh = G.run.hearts;
P.teleport(V(puddle.x, puddle.z)); await wait(150);
check('stepping into a poison puddle: a moment of grace first', G.run.hearts === hh && !after('poisonTick', t));
check('…then half a heart, and the screen turns green at the edges', await until(() => after('poisonTick', t), 3000) && G.run.hearts === hh - 0.5 && Number($('poison-tint').style.opacity) > 0.3, G.run.hearts, $('poison-tint').style.opacity);
await shot('m6a-poison-puddle');
const outside = spotNear(V(puddle.x, puddle.z), puddle.r + 2.5, pz);
P.teleport(outside); await wait(1100);
check('out of it: no more poison, the green fades', Number($('poison-tint').style.opacity) < 0.2 && !G.poisonAt(P.position.x, P.position.z), $('poison-tint').style.opacity, pos(), JSON.stringify(puddle), JSON.stringify(outside));
const across = V(2 * puddle.x - outside.x, 2 * puddle.z - outside.z);
const path = G.nav.findPath(outside, across);
const pts = [outside, ...(path?.points ?? [])];
let through = false;
for (let i = 1; i < pts.length; i++) for (let u = 0; u <= 1; u += 0.05) if (Math.hypot(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u - puddle.x, pts[i - 1].z + (pts[i].z - pts[i - 1].z) * u - puddle.z) < puddle.r - 0.2) through = true;
check('click-to-move walks round a puddle', !!path && !path.partial && !through, path?.points.length);
heal();
 pz = { spot: { at: [pm.x, pm.z] }, enemies: [] }; X.jump([pm.x + 6, pm.z + 6]); await wait(2500); 
t = G.time;
p = spotNear(V(pm.x, pm.z), 2.6, pz);
await go(p.x, p.z);
check('a poison mushroom swells first: a ring on the floor where its cloud will be', await until(() => after('poisonSwell', t), 2000) && G.fieldHazards().some((h) => h.kind === 'poisonPuff'));
await wait(400);
await shot('m6a-poison-swell');
P.teleport(spotNear(V(pm.x, pm.z), 6.5 * (G.world?.def.K ?? 1), pz)); // (W6: the squeezed forest: nearer, so no giant stands between)
check('…then it puffs a cloud', await until(() => after('poisonPuff', t), 3000) && G.poisonZones.some((z) => z.kind === 'puff' && z.live()));
const puffAt = after('poisonPuff', t).at, swellAt = after('poisonSwell', t).at;
check('the ring showed ≥ 0.6 s before the cloud', puffAt - swellAt >= 0.6, (puffAt - swellAt).toFixed(2));
await wait(300);
await shot('m6a-poison-cloud');
const tc = G.time;
await shoot(V(pm.x, pm.z));
check('the water gun washes the cloud away', !!after('poisonWashed', tc) && !G.poisonZones.some((z) => z.kind === 'puff' && z.live()));

// ---- the bounce mushroom
heal();
let bz, b;
b = X.forest.bounces[0];
bz = { spot: { at: [b.x, b.z] }, enemies: [] };
P.teleport(spotNear(V(b.x, b.z), 3, bz)); await wait(300);
t = G.time;
await go(b.x, b.z);
check('stepping on a bounce mushroom throws the hero', await until(() => after('launched', t), 2000));
await wait(380);
const high = P.position.y;
await shot('m6a-bounce');
const y0 = b.y, y1 = b.to.y;
check('…up in the air along its arc', high > y0 + (y1 - y0) * 0.3 + 1.5, high.toFixed(2));
check('…down on the marked landing', await until(() => after('bounced', t), 4000) && flat(P.position, b.to) < 0.6 && Math.abs(P.position.y - y1) < 0.6, pos(), JSON.stringify(b.to));
check('nothing hurts on the way', !ev.some((x) => x.name === 'hurt' && x.at > t));
return log;
