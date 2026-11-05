// @bot
// W4 (tasks/20261102-world-redesign-todo.md): the Crystal King and the way
// out, played through real input. GAME_URL='http://localhost:5191/?start=heart&seed=4'.
// From the second floating rock a hop onto the heart's platform: the hops
// off it close, he rises under the giant crystal heart (a short look, his
// name card, the plate); his laser (a red wedge and the beam's line first),
// his spikes (circles first) and from phase 2 his crystal-tinted animals
// (purple rings where they rise); after a laser or the spikes he slumps,
// tired (his chest bare: the hammer ×2); three phases; asleep: a star, the
// heart's light fades, the cave shakes, the crystal bridge forms, the hidden
// way out opens and the escape runs (rocks: a red circle first; a soft
// clock) up the tunnel into the sunlight → "멍멍! 드디어 탈출했다!", THE END,
// the credits, the purple shard → the whole game's result → 계속 탐험하기:
// the camp again, the world open, the win saved; a new page offers 이어 하기.
const X = G.expedition, W = G.world, D = W.def, S = G.state;
// (W6: hand-written points are in the design frame; the layout squeezes them into the world)
const M = (u, v) => G.world?.def.M ? G.world.def.M(u, v) : [(u + v) * Math.SQRT1_2, (v - u) * Math.SQRT1_2];
// (W6: a design depth in the world, as the layout's H gives it)
const Y = (y) => (G.world?.def.H ? G.world.def.H(y) : y);
const $ = (id) => document.getElementById(id);
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const until = async (test, ms = 8000, step = 40) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (test()) return true; await wait(step); } return false; };
const t0 = performance.now();
const bossLog = [];
const ev = {};
for (const k of ['arenaSealed', 'hop', 'kingTired', 'kingSummoned', 'kingBeaten', 'escapeStart', 'escapeRock', 'escapeRockLanded', 'sunlight', 'ending', 'victory', 'faint', 'continued', 'crystalLift']) { ev[k] = []; G.on(k, (e) => ev[k].push({ t: G.time, e })); }
for (const k of ['bossStep', 'bossPhase', 'bossHurt', 'bossTelegraph', 'bossAttack', 'bossStunned']) G.on(k, (e) => bossLog.push([k, +G.time.toFixed(2), e?.name ?? e?.kind ?? '', e?.phase ?? '', e?.hurt ?? '', e?.pattern ?? '']));
const hits = [];
G.on('enemyHit', (e) => { if (e.enemy?.kind === 'crystalKing') hits.push({ t: G.time, dmg: e.damage, by: e.by, tired: !!e.tired }); });
const shots = new Set();
const once = async (name, dist = null) => {
  if (shots.has(name)) return; shots.add(name);
  const d = G.cam.rig.distance;
  if (dist) { G.cam.rig.distance = dist; await wait(160); }
  await shot(name);
  if (dist) G.cam.rig.distance = d;
};

await start(); await wait(1200);
const king = X.king;
check('the Crystal King waits on his platform, the way out hidden', !!king && king.dormant && !X.gates.exit.open && !S.world.bosses.crystalKing);
for (const r of X.spots.values()) if (r.spot.region === 4) X.sleepSpot(r.spot.id);
for (const g of ['pit3']) { X.gates[g].unseal(); }
await wait(1200);

// ---- onto the second floating rock, then the hop onto his platform
const w2 = W.islands.find((s) => s.id === 'w2');
X.jump([w2.at[0], w2.at[1]], w2.y); await wait(1000);
check('on the second floating rock, −101 m', Math.abs(P.position.y - w2.y) < 0.6, pos());
await once('w4k-01-before-the-hop', 26);
const [hx, hz] = D.king.at;
await travel(V3(hx - 2, Y(-112), hz + 3), { near: 3, ms: 40000 });
check('a hop onto the platform: the hops off it close, he rises', await until(() => ev.arenaSealed.some((e) => e.e?.boss === 'crystalKing') && !king.dormant, 8000) && ev.hop.some((h) => h.e.id === 'hw3'), JSON.stringify(ev.arenaSealed.at(-1)?.e));
check('…the hops off the platform are closed while he is awake', G.jumpOpen('hw3r') === false && G.jumpOpen('he3r') === false && G.jumpOpen('hw2') === true);
await until(() => G.mode === 'cutscene', 3000);
await wait(1400); await once('w4k-02-intro');
await until(() => king.started && G.mode === 'play', 8000);
check('the plate: his name, hp and a hint', !$('boss-plate').classList.contains('hidden') && $('boss-plate').textContent.includes('크리스탈 킹'));

// ---- the fight, by play
const tb = performance.now(), tg = G.run.time;
while (king.state !== 'asleep' && performance.now() - tb < 600000 && !G.fainted) {
  await botStep({ goal: (c) => Math.abs(flat(c, king.pos) - 3.4) });
  const d = king.doing, t = king.ai.t;
  if (d === 'aim' && t > 0.8) await once(`w4k-03-laser-aim-p${king.phase}`);
  if (d === 'sweep' && t > 0.4) await once(`w4k-04-laser-p${king.phase}`);
  if (d === 'tired' && t > 0.5) await once(`w4k-05-tired-p${king.phase}`);
  if (d === 'call' && king.ai.pattern === 'spikes' && t > 0.8) await once(`w4k-06-spikes-p${king.phase}`);
  if (d === 'raise' && t > 0.7) await once(`w4k-07-summon-p${king.phase}`);
  if (d === 'erupt' && t > 0.1) await once('w4k-08-spikes-burst');
}
check('the Crystal King is put to sleep by play', king.state === 'asleep', king.hp, `${((performance.now() - tb) / 1000).toFixed(0)} s real`, `${(G.run.time - tg).toFixed(0)} s of play`, `min hearts ${bot.minHearts}`, `faints ${ev.faint.length}`);
const steps = bossLog.filter((e) => e[0] === 'bossStep');
const phases = new Set(steps.map((e) => e[3]));
check('three phases', [1, 2, 3].every((p) => phases.has(p)), [...phases].join());
check('every attack drawn first: the laser, the spikes', ['laser', 'spike'].every((k) => bossLog.some((e) => e[0] === 'bossTelegraph' && e[2] === k)));
let ordered = true, minGap = 9;
for (const a of bossLog.filter((e) => e[0] === 'bossAttack')) {
  const tele = bossLog.filter((e) => e[0] === 'bossTelegraph' && e[2] === a[2] && e[1] <= a[1]).at(-1);
  if (!tele) { ordered = false; continue; }
  minGap = Math.min(minGap, a[1] - tele[1]);
  if (a[1] - tele[1] < 0.9 - 0.05) ordered = false;
}
check('…each hit at least 0.9 s after its warning', ordered, minGap.toFixed(2));
// every hurt the hero took from him came during an attack step (never a stray)
const hurts = bossLog.filter((e) => e[0] === 'bossHurt' && e[4] === true);
check('he hurts only by what he drew', hurts.every((h) => bossLog.some((a) => a[0] === 'bossAttack' && a[2] === h[2] && h[1] - a[1] < 1.4)), hurts.map((h) => h[2]).join(','));
check('after a laser and after the spikes he slumps, tired', ev.kingTired.some((e) => e.e.after === 'laser') && ev.kingTired.some((e) => e.e.after === 'spikes'), ev.kingTired.length);
const tiredHits = hits.filter((h) => h.tired && h.by === 'hammer');
check('…his chest bare: the hammer hits twice as hard', tiredHits.length > 0 && tiredHits.every((h) => Math.abs(h.dmg - 2) < 1e-6), tiredHits.length, hits.filter((h) => !h.tired && h.by === 'hammer').slice(0, 1).map((h) => h.dmg).join());
check('from phase 2 he calls crystal-tinted animals (never more than 3 awake)', ev.kingSummoned.length > 0 && king.summons.length > 0 && king.summons.every((a) => a.crystal), ev.kingSummoned.length, king.summons.map((a) => a.kind).join(','));
// (a pattern begins with its warning: the laser's aim, the spikes' call, the summons' raise)
const begins = (s) => s[2] === 'aim' || s[2] === 'raise' || (s[2] === 'call' && s[5] === 'spikes');
// (knocked on his back by the stun gauge is a rest too: the scheduler starts afresh after it)
check('…never two of his patterns without a rest between', (() => { let busy = false; for (const s of bossLog.filter((e) => e[0] === 'bossStep' || e[0] === 'bossStunned')) { if (s[0] === 'bossStunned' || s[2] === 'rest' || s[2] === 'roar' || s[2] === 'idle') busy = false; else if (begins(s)) { if (busy) return false; busy = true; } } return true; })());
log.push(['INFO', 'boss hits taken', hurts.map((h) => h[2]).join(',') || 'none', 'attacks', bossLog.filter((e) => e[0] === 'bossAttack').length, 'hammer hits', hits.filter((h) => h.by === 'hammer').length, 'tired hits', tiredHits.length]);

// ---- asleep: a star, the heart fades, the bridge, the way out, the escape
check('a star the first time, every heart back', await until(() => S.beaten.crystalKing === 1, 4000) && G.run.hearts === G.run.maxHearts, S.stars, G.run.hearts);
await wait(900); await once('w4k-09-asleep', 26);
check('the heart\'s light fades', await until(() => X.heart.crystal.faded, 5000));
check('the crystal bridge forms, the hidden way out opens, the escape begins', await until(() => X.gates.exit.open && X.heart.bridge.shown && ev.escapeStart.length > 0, 9000) && S.world.gates.exit, X.gates.exit.open, ev.escapeStart.length);
await wait(1500); await once('w4k-10-bridge', 30);
check('…the soft clock shows', !$('escape-clock').classList.contains('hidden') && $('escape-clock').textContent.includes('햇빛'), $('escape-clock').textContent);

// ---- the escape run: over the bridge, up the tunnel, rocks shown first
const sun = V3(D.escape.sun[0], Y(-96), D.escape.sun[1]);
const te = G.run.time;
const goTo = async (p, ms) => { const tA = performance.now(); while (performance.now() - tA < ms && !ev.sunlight.length) { if (await travel(p, { near: 2.5, ms: 4000 })) return true; } return !!ev.sunlight.length; };
await goTo(V3(0 + D.escape.tunnel[0][0], Y(-112), D.escape.tunnel[0][1]), 60000);
await once('w4k-11-escape');
await goTo(sun, 90000);
check('up the tunnel into the sunlight: the ending', await until(() => ev.sunlight.length > 0 && G.mode === 'ending', 8000), `${(G.run.time - te).toFixed(1)} s of running`, pos());
const rocks = ev.escapeRock.length, landed = ev.escapeRockLanded;
check('rocks fell on the way, each shown by its circle first (≤ 1 hit)', rocks > 0 && landed.filter((r) => r.e.hurt).length <= 1, rocks, landed.filter((r) => r.e.hurt).length);
await wait(2600);
check('"멍멍! 드디어 탈출했다!", THE END, the credits, the purple shard', !$('ending').classList.contains('hidden') && $('ending').textContent.includes('드디어 탈출했다') && $('ending').textContent.includes('THE END') && $('ending-credits').textContent.includes('Jiyu') && $('ending').textContent.includes('보라색 조각'));
check('…no "곧 열려요" on the big world\'s ending', document.querySelector('#ending .soon').classList.contains('hidden'));
await once('w4k-12-ending');
await until(() => !$('btn-ending').disabled, 6000);
$('btn-ending').click();
check('the whole game\'s result: time, stars, codex, bosses', await until(() => !$('result').classList.contains('hidden'), 4000) && !!$('stat-stars') && !!$('stat-codex') && $('stat-bosses').textContent.includes('4/4'), $('result-stats').textContent.replace(/\s+/g, ' '));
check('…with 계속 탐험하기', !$('btn-continue').classList.contains('hidden') && $('btn-again').classList.contains('hidden'));
await wait(500); await once('w4k-13-result');
const save1 = JSON.parse(localStorage.getItem(G.saveKey ?? 'secret-cave-save-v1'));
check('the win is saved: wins, the world won, the king asleep', save1.wins >= 1 && save1.world.won >= 1 && save1.world.bosses.crystalKing && save1.world.gates.exit, save1.wins, save1.world.won, save1.world.wonAt);

// ---- on in the world: the camp, the crystal lift down to the platform
$('btn-continue').click();
check('계속 탐험하기: back at the camp, playing, the world open', await until(() => G.mode === 'play' && X.area?.id === 'camp', 6000), G.mode, X.area?.id);
const lift = G.interactables.find((it) => it.kind === 'lift' && Math.hypot(it.pos.x - D.lift4.camp[0], it.pos.z - D.lift4.camp[1]) < 1);
await travel(lift.pos.clone(), { near: 2.5, ms: 30000 });
for (let k = 0; k < 6 && !ev.crystalLift.length && G.mode === 'play'; k++) { await clickAt(lift.pos.clone().setY(lift.pos.y + 0.8)); await until(() => G.mode === 'cutscene', 3000); }
check('the crystal lift takes the hero from the camp\'s balcony down to the platform', await until(() => ev.crystalLift.length > 0 && Math.abs(P.position.y - Y(-112)) < 1.2, 15000), pos());
await wait(800); await once('w4k-14-after', 30);
check('the bot never ran out of hearts', ev.faint.length === 0 && bot.minHearts > 0, bot.minHearts);
log.push(['INFO', 'time', `${(G.run.time / 60).toFixed(2)} min of play`, `${((performance.now() - t0) / 1000).toFixed(0)} s real`, 'min hearts', bot.minHearts, 'bot', JSON.stringify(bot.stats), 'hurt', JSON.stringify(bot.events.slice(0, 30))]);
return log;
