// @bot
// W1 (tasks/20261102-world-redesign-todo.md): the Giant Rabbit Chief in the
// big world, played through real input. GAME_URL='http://localhost:5191/?seed=4'.
// A save that has found the camp (and the necklace): from the camp on foot
// back over the viaduct, along the valley's lowest step, through the old
// mine and down the canyon into the burrow meadow; walking in seals the
// arena's gate and wakes the chief (the old boss, its own brain and body);
// asleep: a star, every heart, the arena's gate opens again, the gate to
// region 2 opens (W2: into the Mushroom Forest), and the shortcut to the camp opens:
// a mine cart over the trestle, and the camp is a new expedition.
const X = G.expedition, W = G.world, D = W.def, S = G.state;
// (W6: hand-written points are in the design frame; the layout squeezes them into the world)
const M = (u, v) => G.world?.def.M ? G.world.def.M(u, v) : [(u + v) * Math.SQRT1_2, (v - u) * Math.SQRT1_2];
// (W6: a design depth in the world, as the layout's H gives it)
const Y = (y) => (G.world?.def.H ? G.world.def.H(y) : y);
const $ = (id) => document.getElementById(id);
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const until = async (test, ms = 8000, step = 40) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (test()) return true; await wait(step); } return false; };
const at = (u, v) => { const [x, z] = M(u, v); return V3(x, gy(x, z), z); };
const t0 = performance.now();
const bossLog = [];
let sealed = 0, started = 0;
G.on('arenaSealed', () => sealed++);
G.on('bossStart', () => started++);
for (const ev of ['bossTelegraph', 'bossAttack', 'bossPhase', 'bossStep']) G.on(ev, (e) => bossLog.push([ev, e.kind ?? e.name ?? e.phase, +e.at.toFixed(2), e.phase]));
// (W7: the M5 boss checks, from the old m5-boss.js, now on the big world's chief)
const ev = [];
for (const name of ['bossTelegraph', 'bossAttack', 'bossHurt', 'bossPhase', 'bossStep', 'bossStunned']) G.on(name, (e) => { if (!X.chief || e?.boss === undefined || e.boss === X.chief) ev.push({ ...e, ev: name, at: e?.at ?? G.time, hp: e?.hp }); });
G.on('enemyHit', (e) => { if (e.enemy.isBoss) ev.push({ ev: 'hit', at: G.time, damage: e.damage, by: e.by, dazed: e.dazed }); });

// a save that has been to the camp
S.necklace = true; S.prologue = true;
Object.assign(S.world, { started: true, camp: true, expedition: 1, seed: 4 });
await start(); await wait(1500); await skip();
check('a saved game wakes at the camp', X.atCamp || Math.hypot(P.position.x - D.camp.at[0], P.position.z - D.camp.at[1]) < 3, pos(), $('area-name').textContent);
const chief = X.chief;
check('the chief sleeps in the meadow, the arena\'s gate open, the shortcut and region 2 shut', !!chief && chief.dormant && X.gates.arena.open && !X.gates.shortcut.open && !X.gates.region2.open);

// ---- on foot to the arena (the shortcut is shut: the long way round)
// (W6: on the viaduct, wherever the layout put it: a third of the way from
// its valley end, out of the camp's name on the map)
const viaMid = () => { const b = G.world.bridges.find((q) => q.id === 'viaduct'); return V3(b.a[0] + (b.b[0] - b.a[0]) / 3, b.y0, b.a[1] + (b.b[1] - b.a[1]) / 3); };
const legs = [['the viaduct', viaMid], ['the valley\'s lowest step', -60, 120], ['the old mine', 150, 135], ['the canyon into the meadow', 150, 92]];
for (const [name, u, v] of legs) {
  const ok = await travel(typeof u === 'function' ? u() : at(u, v), { near: 3, ms: 150000 });
  check(`on foot: ${name}`, ok, pos(), $('area-name').textContent, `hearts ${G.run.hearts}`);
}
await shot('w1c-01-canyon');
// into the arena: its gate shuts behind, the chief rises
if (!sealed) await travel(at(150, 14), { near: 3, ms: 60000 });
check('walking into the arena seals its gate', await until(() => sealed > 0, 6000) && !X.gates.arena.open);
if (G.mode === 'cutscene') { await wait(1000); await shot('w1c-02-chief-intro'); }
check('…and wakes the chief (its intro, then the fight)', await until(() => started > 0 && !chief.dormant, 8000), G.mode);
await until(() => G.mode === 'play', 8000);
check('the boss plate shows its name', !$('boss-plate').classList.contains('hidden') && $('boss-name').textContent.includes('거대 토끼 대장'));

// ---- the fight, by play
const tb = performance.now();
const shots = new Set();
const once = async (n) => { if (!shots.has(n)) { shots.add(n); await shot(n); } };
while (chief.state !== 'asleep' && performance.now() - tb < 360000) {
  if (G.fainted) break;
  await botStep({ goal: (c) => Math.abs(flat(c, chief.pos) - 3) });
  if (chief.phase === 1 && chief.doing === 'air') await once('w1c-03-slam');
  if (chief.phase === 3 && chief.doing === 'aim' && chief.ai.t > 0.4) await once('w1c-04-dash');
}
check('the chief is put to sleep by play', chief.state === 'asleep', chief.hp, `${((performance.now() - tb) / 1000).toFixed(0)} s real`, `min hearts ${bot.minHearts}`);
// ---- the M5 rules of the fight (GDD §3.3, §12 "보스"), from the events
{
  const b = chief;
  const attacks = ev.filter((e) => e.ev === 'bossAttack');
  const teles = ev.filter((e) => e.ev === 'bossTelegraph');
  const lead = attacks.map((a) => {
    const t = teles.filter((x) => x.kind === a.kind && x.at <= a.at).at(-1);
    const prev = attacks.filter((x) => x.kind === a.kind && x.at < a.at).at(-1);
    return t && (!prev || t.at >= prev.at) ? a.at - t.at : -1;
  });
  check('every attack had its mark on the floor first', attacks.length > 5 && lead.every((l) => l >= 0), `${attacks.length} attacks`, [...new Set(attacks.map((a) => a.kind))].join(','));
  check('…and at least 0.6 s of warning (the ring rolls out from the slam\'s mark)', attacks.every((a, i) => a.kind === 'wave' || lead[i] >= 0.6 - 1e-6), Math.min(...lead.filter((l, i) => attacks[i].kind !== 'wave')).toFixed(2));
  const hurts = ev.filter((e) => e.ev === 'bossHurt' && e.hurt);
  check('every hurt came from a marked attack', hurts.every((h) => teles.some((t) => t.kind === h.kind && t.at < h.at)), hurts.map((h) => h.kind).join(','));
  const gaps = hurts.slice(1).map((h, i) => h.at - hurts[i].at);
  check('never two hurts in a row (at least the 0.7 s blink between)', gaps.every((g) => g >= 0.69), gaps.map((g) => g.toFixed(2)).join(','));
  const phases = ev.filter((e) => e.ev === 'bossPhase');
  check('phase 2 at 66 % hp, phase 3 at 33 %', phases.length === 2 && phases[0].phase === 2 && phases[0].hp / b.maxHp <= 0.66 && phases[0].hp / b.maxHp > 0.45 && phases[1].phase === 3 && phases[1].hp / b.maxHp <= 0.33 && phases[1].hp / b.maxHp > 0.1, phases.map((p) => `${p.phase}@${p.hp?.toFixed(1)}`).join(' '));
  const steps = ev.filter((e) => e.ev === 'bossStep');
  check('a roar at each new phase', phases.every((p) => steps.some((q) => q.name === 'roar' && q.at >= p.at && q.at - p.at < 5)));
  const opens = (p) => steps.filter((q) => q.phase === p && ['crouch', 'ears'].includes(q.name) || (q.phase === p && q.name === 'aim' && q.pattern === 'dash' && steps[steps.indexOf(q) - 1]?.name !== 'gap'));
  const kinds = (p) => [...new Set(opens(p).map((q) => q.pattern))].sort().join(',');
  check('phase 1 only slams', kinds(1) === 'slam', kinds(1));
  check('phase 2 adds the ear gust', kinds(2).includes('gust'), kinds(2));
  check('phase 3 adds the triple dash (three lanes)', kinds(3).includes('dash') && steps.filter((q) => q.phase === 3 && q.name === 'aim').length >= 3, kinds(3));
  const starts = steps.filter((q, i) => (q.name === 'crouch' || q.name === 'ears' || (q.name === 'aim' && steps[i - 1]?.name !== 'gap')));
  check('a rest before every new attack', starts.every((q) => ['rest', 'idle', 'roar'].includes(steps[steps.indexOf(q) - 1]?.name) || ev.some((e) => e.ev === 'bossStunned' && e.at < q.at && q.at - e.at < 3.5)), starts.map((q) => steps[steps.indexOf(q) - 1]?.name).join(','));
  const dizzy = steps.filter((q) => q.name === 'dizzy');
  check('dazed after every landing (slam) and after the triple dash', dizzy.length >= steps.filter((q) => q.name === 'land').length, dizzy.length);
  const dazedHits = ev.filter((e) => e.ev === 'hit' && e.dazed && e.by === 'hammer');
  const plain = ev.filter((e) => e.ev === 'hit' && !e.dazed && e.by === 'hammer');
  check('the hammer hits twice as hard while it is dazed', dazedHits.length > 0 && plain.length > 0 && dazedHits.every((h) => Math.abs(h.damage - 2 * plain[0].damage) < 1e-6), dazedHits.map((h) => h.damage).join(','), plain[0]?.damage);
}
const fight = bossLog.filter((e) => e[0] === 'bossStep');
check('it went through all three phases', [1, 2, 3].every((p) => fight.some((e) => e[3] === p)), fight.map((e) => e[3]).join('').slice(0, 60));
check('a star the first time, every heart back', await until(() => S.beaten.rabbitChief === 1 && S.stars >= 1, 4000) && G.run.hearts === G.run.maxHearts, S.stars, G.run.hearts);
check('then the arena, the way to region 2 and the shortcut open', await until(() => X.gates.arena.open && X.gates.region2.open && X.gates.shortcut.open, 8000));
check('kept in the save: the chief beaten, the gates open', S.world.bosses.rabbitChief && S.world.gates.region2 && S.world.gates.shortcut && JSON.parse(localStorage.getItem(G.saveKey ?? 'secret-cave-save-v1')).world.gates.shortcut === true);
await wait(600);
await shot('w1c-05-chief-asleep');

// ---- region 2 (W2): through its gate, down the pass into the Mushroom Forest
const ok2 = await travel(at(296, 22), { near: 3, ms: 90000 });
check('through the open gate into the Mushroom Forest (W2: no more fence)', ok2 && await until(() => X.area?.region === 2, 3000), pos(), X.area?.id);
await wait(1500);
await shot('w1c-06-forest-edge');

// ---- the shortcut: the mine cart over the trestle to the camp
const tr = W.bridges.find((b) => b.id === 'trestle');
const cartAt = V3(tr.a[0] + (tr.a[0] - tr.b[0]) / tr.length * 4, 0, tr.a[1] + (tr.a[1] - tr.b[1]) / tr.length * 4);
cartAt.y = gy(cartAt.x, cartAt.z);
await travel(cartAt, { near: 2.5, ms: 90000 });
const n0 = X.n;
let rode = false;
G.on('rode', () => { rode = true; });
const cart = G.interactables.find((it) => it.kind === 'cart' && Math.hypot(it.pos.x - cartAt.x, it.pos.z - cartAt.z) < 1);
for (let k = 0; k < 6 && !rode && G.mode === 'play'; k++) { await clickAt(cart.pos.clone().setY(cart.pos.y + 0.6)); await until(() => G.mode === 'cutscene', 3000); }
await wait(900);
await shot('w1c-07-cart-ride');
check('the mine cart rides over the trestle', await until(() => rode, 15000));
check('…to the camp', await until(() => X.area?.id === 'camp', 4000) && Math.abs(P.position.y - Y(-30)) < 1, pos(), X.area?.id);
check('back at the camp from out there: a new expedition', await until(() => X.n === n0 + 1, 3000), n0, X.n);
// and on foot over the trestle, back and forth (the gate is open for good)
const meadowEnd = V3(tr.a[0], gy(tr.a[0], tr.a[1]), tr.a[1]);
check('the trestle can be walked too', await travel(meadowEnd, { near: 3, ms: 60000 }), pos());
check('the bot never ran out of hearts', bot.minHearts > 0 && !G.fainted, bot.minHearts);
log.push(['INFO', 'time', `${(G.run.time / 60).toFixed(2)} min of play`, `${((performance.now() - t0) / 1000).toFixed(0)} s real`, 'min hearts', bot.minHearts, 'bot', JSON.stringify(bot.stats)]);
return log;
