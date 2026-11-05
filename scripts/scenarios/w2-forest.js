// @bot
// W2 (tasks/20261102-world-redesign-todo.md): the Mushroom Forest, played
// through real input. GAME_URL='http://localhost:5191/?start=mushroom&seed=4'
// (the progress of a hero who has just put the chief to sleep: core/state.js
// presetProgress). From the forest's edge: the gate behind is open, the
// animals here are tougher; over the orb web across the chasm on foot; a
// fox waits in a giant's shade (it springs, the water shows it up); a mole
// under the loam (water floods it out); the mask from its chest, put on; a
// click down into the hollow goes by the bounce mushroom; a click past a
// mud pool walks round it; a fumarole's puff is shown before it comes; the
// resting spring; and a click up out of the deep by the other bounce.
const X = G.expedition, W = G.world, D = W.def, S = G.state;
// (W6: hand-written points are in the design frame; the layout squeezes them into the world)
const M = (u, v) => G.world?.def.M ? G.world.def.M(u, v) : [(u + v) * Math.SQRT1_2, (v - u) * Math.SQRT1_2];
// (W6: a design depth in the world, as the layout's H gives it)
const Y = (y) => (G.world?.def.H ? G.world.def.H(y) : y);
const $ = (id) => document.getElementById(id);
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const until = async (test, ms = 8000, step = 40) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (test()) return true; await wait(step); } return false; };
const at = (u, v) => { const [x, z] = M(u, v); return V3(x, G.groundAt(x, z), z); };
const t0 = performance.now();
const ev = {};
for (const k of ['foxAmbush', 'foxRevealed', 'moleFlooded', 'maskOn', 'bounce', 'poisonIn', 'poisonTick', 'ventSwell', 'ventPuff', 'springUsed', 'chestOpened', 'faint']) { ev[k] = []; G.on(k, (e) => ev[k].push({ t: G.time, e })); }
const shotOnce = new Set();
const once = async (name) => { if (shotOnce.has(name)) return; shotOnce.add(name); await shot(name); };

await start(); await wait(1500);
check('?start=mushroom: the chief asleep, the camp found, at the forest\'s edge', S.world.bosses.rabbitChief && S.world.camp && X.area?.region === 2, X.label(), pos());
check('the gate from the meadow is open (the chief\'s), the queen\'s ring and the pit\'s door shut', X.gates.region2.open && !X.gates.ice.open && !X.gates.pit2.open && X.gates.ring.open);
check('the forest is named on the HUD', $('area-name').textContent.includes('버섯 숲'), $('area-name').textContent);

// an expedition whose spots hold a fox and a mole on this side of the forest
const has = (kind, ids) => [...X.spots.values()].find((r) => ids.includes(r.spot.id) && r.enemies.some((e) => e.kind === kind && !e.gone));
for (let k = 0; k < 12 && !(has('fox', ['f1', 'f4', 'f7']) && has('mole', ['f2', 'f4', 'f5'])); k++) X.startExpedition();
const foxSpot = has('fox', ['f1', 'f4', 'f7']), moleSpot = has('mole', ['f2', 'f4', 'f5']);
check('this expedition has a fox and a mole in the forest', !!foxSpot && !!moleSpot, foxSpot?.spot.id, moleSpot?.spot.id, X.n);
const fox = foxSpot.enemies.find((e) => e.kind === 'fox');
check('the forest\'s animals are tougher (GDD §8.5: ×1.25 hp)', Math.abs(fox.maxHp - 3 * 1.25) < 1e-6, fox.maxHp);
const valley = [...X.spots.values()].find((r) => (r.spot.region ?? 1) === 1 && r.enemies.length);
if (valley) check('…the valley\'s are not', valley.enemies.every((e) => e.maxHp <= 4.01), valley.enemies.map((e) => e.maxHp).join());
// the other spots on the way doze: this is about the forest's tricks
for (const r of X.spots.values()) if (r !== foxSpot && r !== moleSpot && (r.spot.region ?? 1) === 2) X.sleepSpot(r.spot.id);

// ---- over the orb web across the chasm, on foot
const web = W.bridges.find((b) => b.id === 'web');
let onWeb = 0;
const watchWeb = () => { const d = W.deckAt(P.position.x, P.position.z); if (d?.bridge === web && Math.abs(P.position.y - d.y) < 0.6 && W.heightAt(P.position.x, P.position.z) < d.y - Y(25)) onWeb++; };
G.onUpdate(watchWeb);
await travel(at(330, 52), { near: 3, ms: 60000 });
const crossed = await travel(at(398, 52), { near: 3, ms: 60000 });
check('walked over the orb web, the chasm far under its strands', crossed && onWeb > 10, onWeb, pos());
G.updaters.splice(G.updaters.indexOf(watchWeb), 1);
await once('w2f-01-web');

// ---- the fox in the giants' shade: it springs, the water shows it up, sleep
async function fightSpot(rec, name) {
  const home = V3(rec.spot.at[0], G.groundAt(...rec.spot.at), rec.spot.at[1]);
  await travel(home, { near: rec.spot.r * 0.9, ms: 90000 });
  const ok = await clearByPlay(150000, { enemies: rec.enemies, home });
  check(`${name}: ${rec.enemies.map((e) => e.kind).join(',')} put to sleep by play`, ok && await until(() => rec.cleared, 3000), `min hearts ${bot.minHearts}`);
  await wait(1200);
  return ok;
}
{
  const hidden = fox.cloak.hidden;
  check('the fox waits hidden (all but invisible)', hidden && fox.cloak.hidden);
  // (the bot fights in short turns so the picture is taken just after it springs)
  const home = V3(foxSpot.spot.at[0], G.groundAt(...foxSpot.spot.at), foxSpot.spot.at[1]);
  await travel(home, { near: foxSpot.spot.r * 0.9, ms: 90000 });
  for (let k = 0; k < 120 && !foxSpot.cleared; k++) {
    await clearByPlay(1200, { enemies: foxSpot.enemies, home });
    if (ev.foxAmbush.length) await once('w2f-02-fox-ambush');
  }
  await fightSpot(foxSpot, `fox spot ${foxSpot.spot.id}`);
  check('it sprang from hiding (❗ the ambush)', ev.foxAmbush.length > 0, ev.foxAmbush.length);
  check('the water gun showed it up', ev.foxRevealed.length > 0, ev.foxRevealed.length);
}

// ---- the mole under the loam: water floods it out
await fightSpot(moleSpot, `mole spot ${moleSpot.spot.id}`);
check('water flooded the mole out of its mound', ev.moleFlooded.length > 0, ev.moleFlooded.length);

// ---- the mask from its chest on the east shelf, put on
{
  const c = X.maskChest;
  await travel(c.pos.clone(), { near: 2.5, ms: 90000 });
  for (let k = 0; k < 10 && !c.opened; k++) { await clickAt(c.pos.clone().setY(c.pos.y + 0.4)); await wait(800); }
  await until(() => !!c.loot, 3000); await wait(900);
  check('the forest\'s chest holds the mask', c.loot?.item === 'mask', JSON.stringify(c.loot));
  for (const p of G.pickups.filter((q) => q.alive && q.kind === 'loot' && q.item === 'mask')) { await clickAt(p.model.position.clone()); await until(() => !p.alive, 5000); }
  while (G.hud.inDialog) { keyTap('Space'); await wait(200); }
  check('…and the mask is in the bag', G.run.owned.includes('mask'), G.run.owned.join());
  for (let k = 0; k < 3 && G.run.tool !== 'mask'; k++) { keyTap('KeyQ'); await wait(150); }
  mouse('mousemove', at(470, 20)); mouse('mousedown', at(470, 20), 2); dispatchEvent(new MouseEvent('mouseup', { button: 2 }));
  check('Q to the mask, right click: on (the animals notice from a third as far)', await until(() => G.mask.active, 2000) && G.mask.scale < 0.5, G.run.tool, G.mask.scale);
  await wait(300);
  await once('w2f-03-mask');
  for (let k = 0; k < 3 && G.run.tool !== 'waterGun'; k++) { keyTap('KeyQ'); await wait(150); }
}

// ---- a click down into the hollow: by the bounce mushroom
{
  const b2 = D.bounces.find((b) => b.id === 'b2');
  await travel(at(426, 8), { near: 2.5, ms: 60000 });
  // a spot on the hollow's floor the cursor really points at (not hidden by the shelf's lip)
  G.cam.rig.distance = 45; await wait(600);
  let target = null;
  for (let dv = -50; dv >= -90 && !target; dv -= 4) {
    const c = at(412, dv);
    if (Math.abs(c.y - Y(-55)) > 0.6 || !onScreen(c)) continue;
    mouse('mousemove', c);
    const h = G.pointer.pick();
    if (h?.kind === 'ground' && flat(h.pos, c) < 1.5 && Math.abs(h.pos.y - c.y) < 1) target = c;
  }
  target ??= at(412, -60);
  const plan = G.nav.findPath(P.position, target, { near: 1, jumps: true });
  check('the path down into the hollow goes by the bounce mushroom', plan && !plan.partial && plan.points.some((p) => p.jump === 'b2'), plan?.points.length);
  const n0 = ev.bounce.length, y0 = P.position.y;
  // one click on the hollow's floor
  await clickAt(target);
  await until(() => ev.bounce.length > n0, 12000);
  await wait(450); await once('w2f-04-bounce');
  check('one click: the hero walked onto the pad and flew down a level', ev.bounce.length > n0 && ev.bounce.at(-1).e.id === 'b2', ev.bounce.map((q) => q.e.id).join());
  check('…landing in the hollow', await until(() => !P.state.flight && Math.abs(P.position.y - Y(-55)) < 1.2, 6000), pos(), y0);
  G.cam.rig.distance = 30;
}

// ---- a click past a mud pool: the way goes round it
{
  const pool = X.forest.pools.find((p) => Math.abs(p.y - P.position.y) < 3) ?? X.forest.pools[0];
  // (W6: either side of the pool, as far as the squeezed forest allows)
  const d = 7 * (D.K ?? 1);
  const from = V3(pool.x - d, 0, pool.z - d); from.y = G.groundAt(from.x, from.z);
  const to = V3(pool.x + d, 0, pool.z + d); to.y = G.groundAt(to.x, to.z);
  await travel(from, { near: 1.5, ms: 60000 });
  const plan = G.nav.findPath(P.position, to, { near: 0.5, jumps: true });
  const inPool = (p) => Math.hypot(p.x - pool.x, p.z - pool.z) < pool.r;
  let steps = 0, through = 0;
  for (let i = 1; i < (plan?.points.length ?? 0); i++) { const a = plan.points[i - 1], b = plan.points[i]; for (let t = 0; t <= 1; t += 0.05) { steps++; if (inPool({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) through++; } }
  check('the straight way crosses a mud pool; the path goes round it', !!plan && through === 0 && steps > 0, `${pool.look} r ${pool.r}`, plan?.points.length);
  const n0 = ev.poisonIn.length;
  await clickAt(to); await until(() => flat(P.position, to) < 1.2, 12000);
  check('…and walking it, no poison', ev.poisonIn.length === n0 && flat(P.position, to) < 1.5, pos());
}

// ---- a fumarole's puff is shown (a ring, steam) before it comes
{
  const v = X.forest.vents.find((q) => Math.abs(q.y - P.position.y) < 3) ?? X.forest.vents[0];
  // (beside it, up the screen: into the hollow, away from the shelf's lip)
  await travel(V3(v.x - 4.5, G.groundAt(v.x - 4.5, v.z - 4.5, v.y), v.z - 4.5), { near: 2, ms: 60000 });
  const n0 = ev.ventPuff.length;
  await until(() => ev.ventPuff.filter((q) => q.e.x === v.x).length > 0 && ev.ventPuff.length > n0, 25000);
  const sw = ev.ventSwell.filter((q) => q.e.x === v.x).at(-1), pf = ev.ventPuff.filter((q) => q.e.x === v.x).at(-1);
  check('a vent rumbles with its ring 1 s and more before it puffs', !!sw && !!pf && pf.t - sw.t > 1.0, sw && pf ? (pf.t - sw.t).toFixed(2) : '-', pos(), v.state, Math.hypot(P.position.x - v.x, P.position.z - v.z).toFixed(1));
  check('…and the bot stayed out of it', ev.poisonTick.filter((q) => q.e.hurt).length === 0, ev.poisonTick.length);
}

// ---- the resting spring
{
  G.run.hearts = Math.max(1, G.run.hearts - 2); G.hud.update(G.run);
  const sp = X.forest.spring;
  await travel(sp.pos.clone(), { near: 2, ms: 60000 });
  for (let k = 0; k < 6 && !sp.used; k++) { await clickAt(sp.pos.clone().setY(sp.pos.y + 0.3)); await wait(800); }
  check('the resting spring: hearts back', ev.springUsed.length > 0, G.run.hearts);
}

// ---- down to the deep and a click back up by the one-way bounce
{
  const deep = await travel(at(282, -156), { near: 3, ms: 90000 });
  log.push(['INFO', 'down to the deep', deep, pos(), X.label()]);
  const b3 = D.bounces.find((b) => b.id === 'b3');
  const up = V3(b3.land[0] + 3, G.groundAt(b3.land[0] + 3, b3.land[1] + 4), b3.land[1] + 4); // (world x, z)
  const plan = G.nav.findPath(P.position, up, { near: 1, jumps: true });
  check('the path up out of the deep goes by the one-way bounce', plan && plan.points.some((p) => p.jump === 'b3'), plan?.points.length);
  const n0 = ev.bounce.length;
  const ok = await travel(up, { near: 2, ms: 30000 });
  check('…flown up a level', ok && ev.bounce.slice(n0).some((q) => q.e.id === 'b3') && Math.abs(P.position.y - Y(-55)) < 1.2, pos());
}

check('the bot never ran out of hearts', bot.minHearts > 0 && ev.faint.length === 0, bot.minHearts);
log.push(['INFO', 'time', `${(G.run.time / 60).toFixed(2)} min of play`, `${((performance.now() - t0) / 1000).toFixed(0)} s real`, 'min hearts', bot.minHearts, 'bot', JSON.stringify(bot.stats), 'events', JSON.stringify(Object.fromEntries(Object.entries(ev).map(([k, v]) => [k, v.length])))]);
return log;
