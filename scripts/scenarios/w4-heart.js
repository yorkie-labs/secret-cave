// @bot
// W4 (tasks/20261102-world-redesign-todo.md): the Crystal Heart, played
// through real input. GAME_URL='http://localhost:5191/?start=heart&seed=4'
// (the progress of a hero who has just put the Ice Bear to sleep, with the
// golden necklace: core/state.js presetProgress). From the frozen lake's
// corner: walking up to the crystal door, the necklace glows (HUD badge, the
// door's crystals turn gold) and the door sinks; down the crystal canyon the
// animals are every kind at once, crystal-tinted (purple eyes and rims) and
// strongest (×1.8 hp, ×1.5 bite); crystal spikes burst out of the floor where
// a ring showed first; the ramp from the canyon's lip onto the ruined ledge;
// the old letters; the floating rocks crossed by hops (a click on a far rock:
// the path hops there, both ways); the east side: its own door (the
// necklace again), the rope bridge onto the big floating rock, a hop on.
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
for (const k of ['necklaceGlow', 'heartDoorOpened', 'spikeWarn', 'spikeBurst', 'hop', 'glyphRead', 'faint', 'arenaSealed', 'bounced']) { ev[k] = []; G.on(k, (e) => ev[k].push({ t: G.time, e })); }
const shots = new Set();
const once = async (name, dist = null) => {
  if (shots.has(name)) return; shots.add(name);
  const d = G.cam.rig.distance;
  if (dist) { G.cam.rig.distance = dist; await wait(200); }
  await shot(name);
  if (dist) G.cam.rig.distance = d;
};

await start(); await wait(1500);
check('?start=heart: the Ice Bear asleep, the necklace, at the lake\'s far corner', S.world.bosses.iceBear && S.necklace && X.area?.region === 3, X.label(), pos());
check('both crystal doors to the Crystal Heart still shut', !X.gates.pit3.open && !X.gates.pit2.open);
const pit3 = G.interactables.find((it) => it.gate === X.gates.pit3);
check('the door says: bring the necklace close', !!pit3 && pit3.label().includes('목걸이'), pit3?.label());
check('the way out past the king is hidden (no sign, shut)', !X.gates.exit.open && !G.interactables.some((it) => it.gate === X.gates.exit));

// ---- the necklace opens the lake's door
const door = X.gates.pit3;
let badge = false;
const watch = setInterval(() => { if ($('necklace-badge').classList.contains('glow')) badge = true; }, 50);
await travel(V3(door.at.x - door.def.dir[0] * 6, 0, door.at.z - door.def.dir[1] * 6), { near: 2, ms: 60000 });
check('walking up to it: the necklace glows', await until(() => ev.necklaceGlow.length > 0, 6000) && await until(() => badge, 2000), JSON.stringify(ev.necklaceGlow[0]?.e));
await wait(500); await once('w4h-01-necklace-door', 20);
check('…and the door sinks open (kept in the save)', await until(() => door.open, 6000) && S.world.gates.pit3, door.open);
clearInterval(watch);
await until(() => ev.heartDoorOpened.length > 0, 4000);

// ---- the crystal canyon: crystal-tinted animals, strongest
const c1 = X.spot('c1');
const tinted = [...X.spots.values()].filter((r) => r.spot.region === 4).flatMap((r) => r.enemies);
check('region 4\'s animals are crystal-tinted (eyes, rims)', tinted.length > 0 && tinted.every((e) => e.crystal), tinted.map((e) => e.kind).join(','));
const wolf = tinted.find((e) => e.kind === 'wolf'), deer = tinted.find((e) => e.kind === 'deer'), bear = tinted.find((e) => e.kind === 'bear');
check('…and strongest (GDD §8.5: ×1.8 hp, ×1.5 bite)', (!wolf || Math.abs(wolf.maxHp - 5.4) < 1e-6) && (!deer || Math.abs(deer.maxHp - 7.2) < 1e-6) && (!bear || Math.abs(bear.maxHp - 10.8) < 1e-6) && (!bear || Math.abs(bear.damage - 2.25) < 1e-6), wolf?.maxHp, deer?.maxHp, bear?.maxHp, bear?.damage);
const kinds = new Set(tinted.map((e) => e.kind));
check('every kind of animal down here', kinds.size >= 3, [...kinds].join(','));
await travel(at(-282, -140), { near: 3, ms: 60000 });
check('the crystal canyon (region 4)', X.area?.region === 4, $('area-name').textContent);
await once('w4h-02-canyon');
if (c1?.enemies.length && !c1.cleared) {
  await travel(V3(c1.spot.at[0], 0, c1.spot.at[1]), { near: 5, ms: 60000 });
  await wait(600); await once('w4h-03-crystal-animals', 16);
  const ok = await clearByPlay(150000, { enemies: c1.enemies, home: V3(c1.spot.at[0], 0, c1.spot.at[1]) });
  check(`c1: ${c1.enemies.map((e) => e.kind).join(',')} put to sleep by play`, ok, `min hearts ${bot.minHearts}`);
}

// ---- crystal spikes: a ring first, then they burst (the bot walks off)
const zone = X.heart.zones[0]; // (W6: the west canyon has one spike patch now)
const z0 = ev.spikeBurst.length;
await travel(V3(zone.x, 0, zone.z), { near: 2, ms: 60000 });
const tz = performance.now();
while (ev.spikeBurst.length < z0 + 3 && performance.now() - tz < 25000) {
  await botStep({ goal: (c) => flat(c, V3(zone.x, 0, zone.z)) * 0.4 });
  if (zone.hazards().length && zone.hazards()[0].hitAt - G.time < 0.8) await once('w4h-04-spikes', 16);
}
const bursts = ev.spikeBurst.slice(z0);
const warned = bursts.every((b) => ev.spikeWarn.some((w) => Math.hypot(w.e.x - b.e.x, w.e.z - b.e.z) < 0.01 && b.t - w.t >= 1.3));
check('crystal spikes: every burst shown by its ring ≥ 1.3 s before', bursts.length >= 3 && warned, bursts.length);
check('…and the bot walked off them (≤ 1 of 3 hit)', bursts.filter((b) => b.e.hurt).length <= 1, bursts.map((b) => b.e.hurt).join(','));

// ---- down the ramp from the canyon's lip onto the west ledge, the old letters
await travel(V3(D.places.ruinsW[0], gy(...D.places.ruinsW), D.places.ruinsW[1]) /* (W6: the ledge's flat middle, past its ramp) */, { near: 3, ms: 150000 });
check('down the ramp onto the ruined west ledge (−90 m)', Math.abs(P.position.y - Y(-90)) < 1 && X.area?.id === 'ruinsW', pos(), X.label());
const c2 = X.spot('c2');
if (c2?.enemies.length && !c2.cleared) {
  const ok = await clearByPlay(150000, { enemies: c2.enemies, home: V3(c2.spot.at[0], 0, c2.spot.at[1]) });
  check(`c2: ${c2.enemies.map((e) => e.kind).join(',')} put to sleep by play`, ok, `min hearts ${bot.minHearts}`);
}
await once('w4h-05-ruins');
const glyph = G.interactables.find((it) => it.kind === 'glyph');
await travel(glyph.pos.clone(), { near: 2, ms: 30000 });
await clickAt(glyph.pos.clone().setY(glyph.pos.y + 0.8));
check('the old letters tell what happened here', await until(() => G.hud.inDialog, 4000) && $('dialog-text').textContent.length > 10, $('dialog-text').textContent.slice(0, 30));
await wait(400); await once('w4h-06-glyph');
while (G.hud.inDialog) { keyTap('Space'); await wait(250); }

// ---- the floating rocks: a click on the far rock, the path hops there
const isl = W.islands.find((s) => s.id === 'w2');
await travel(at(-80, -196), { near: 3, ms: 30000 });
const h0 = ev.hop.length;
const target = V3(isl.at[0], isl.y, isl.at[1]);
await once('w4h-07-stones-before', 26);
// one click (the player's way): walk to the pad, hop, walk on, hop again
mouse('mousemove', target);
G.pointer.goTo(target, true);
check('one order to the second rock: hop, walk across, hop', await until(() => ev.hop.length >= h0 + 2 && flat(P.position, target) < 1.6 && !P.state.flight, 20000), ev.hop.slice(h0).map((h) => h.e.id).join(','), pos());
check('…on its deck, −101 m, never fell', Math.abs(P.position.y - isl.y) < 0.6 && ev.faint.length === 0, pos());
await wait(400); await once('w4h-08-on-a-rock', 22);
// the travel way (the bot clicks the landing), and back: the hops go both ways
const back = V3(...[W.islands.find((s) => s.id === 'w1')].map((s) => [s.at[0], s.y, s.at[1]])[0]);
await travel(back, { near: 1.8, ms: 30000 });
check('…and back: a hop the other way', ev.hop.slice(h0).some((h) => h.e.id === 'hw2r') && Math.abs(P.position.y - Y(-95)) < 0.6, ev.hop.slice(h0).map((h) => h.e.id).join(','));
// a hop arcs through the air and lands on the mark
const last = ev.hop.at(-1), landed = ev.bounced.at(-1);
check('a hop lands where its ring is', !!landed && flat(landed.e.at, last.e.to) < 0.5, landed && flat(landed.e.at, last.e.to).toFixed(2));
// standing on a pad without meaning to hop never throws the hero
const f0 = ev.hop.length;
const pad = X.heart.hops.find((h) => h.id === 'hw2');
P.teleport(pad.from.clone()); await wait(1500);
check('a hop only when the walk means it (standing on a pad: nothing)', ev.hop.length === f0 && Math.abs(P.position.y - Y(-95)) < 0.6, ev.hop.length - f0);

// ---- the east side: its door, the rope bridge, the big rock, a hop on
for (const r of X.spots.values()) if (r.spot.region === 4 && ['c4', 'c5'].includes(r.spot.id)) X.sleepSpot(r.spot.id);
X.jump(M(262, -190)); await wait(1200);
const g2 = X.gates.pit2;
await travel(V3(g2.at.x + g2.def.dir[0] * -6, 0, g2.at.z + g2.def.dir[1] * -6), { near: 2, ms: 40000 });
check('the deep forest\'s door opens to the necklace too', await until(() => g2.open, 9000) && S.world.gates.pit2);
await travel(V3(D.places.ruinsE[0], gy(...D.places.ruinsE), D.places.ruinsE[1]) /* (W6: the ledge's flat middle, past its ramp) */, { near: 3, ms: 90000 });
check('down the east canyon onto the east ledge (−90 m)', Math.abs(P.position.y - Y(-90)) < 1 && X.area?.id === 'ruinsE', pos(), X.label());
await once('w4h-09-east-ruins');
const e1 = W.islands.find((s) => s.id === 'e1');
await travel(V3(e1.at[0], e1.y, e1.at[1]), { near: 2, ms: 40000 });
const rope = W.bridges.find((b) => b.id === 'rope4');
check('over the rope bridge onto the big floating rock (−90 m)', Math.hypot(P.position.x - e1.at[0], P.position.z - e1.at[1]) < e1.r && Math.abs(P.position.y - Y(-90)) < 0.6, pos(), rope.length.toFixed(1));
await once('w4h-10-rope-bridge', 24);
const e2 = W.islands.find((s) => s.id === 'e2');
const h1 = ev.hop.length;
await travel(V3(e2.at[0], e2.y, e2.at[1]), { near: 1.8, ms: 30000 });
check('…and a hop on to the next (he2)', ev.hop.slice(h1).some((h) => h.e.id === 'he2') && Math.abs(P.position.y - e2.y) < 0.6, pos());
check('nobody fainted, no fall', ev.faint.length === 0, bot.minHearts);
log.push(['INFO', 'time', `${(G.run.time / 60).toFixed(2)} min of play`, `${((performance.now() - t0) / 1000).toFixed(0)} s real`, 'min hearts', bot.minHearts, 'bot', JSON.stringify(bot.stats), 'hops', ev.hop.map((h) => h.e.id).join(',')]);
return log;
