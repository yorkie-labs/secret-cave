// @bot
// W2 (tasks/20261102-world-redesign-todo.md): the Poison Mushroom Queen in
// her sunken ring at the Mushroom Forest's far end, played through real
// input. GAME_URL='http://localhost:5191/?start=mushroom&seed=4'.
// From the glow hollow down the ramp into the deep and into the ring:
// walking in seals its gate and wakes her (the M6a queen, her own brain and
// body, on the ring's floor at −76 m); her spores, mushrooms and clouds are
// drawn first; asleep: a star, every heart, the ring opens, the mushroom
// lift wakes (the ring ⇄ the camp: a ride home, a new expedition), and the
// ice door by the camp opens (W3: the Ice Lake).
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
const bossLog = [];
let sealed = null, faints = 0, lifted = null;
G.on('arenaSealed', (e) => { sealed = e; });
G.on('faint', () => faints++);
G.on('lifted', (e) => { lifted = e; });
for (const k of ['bossStep', 'bossPhase', 'bossHurt', 'bossTelegraph', 'bossStunned', 'queenBeaten']) G.on(k, (e) => bossLog.push([k, +G.time.toFixed(2), e?.name ?? e?.kind ?? '', e?.phase ?? '']));
const shots = new Set();
const once = async (name) => { if (shots.has(name)) return; shots.add(name); await shot(name); };

await start(); await wait(1200);
const queen = X.queen;
check('the queen sleeps in her ring, its gate open, the lift asleep', !!queen && queen.dormant && X.gates.ring.open && !S.world.gates.lift);
const ice = G.interactables.find((it) => it.gate === X.gates.ice);
check('before her, the ice door says she must sleep first', ice.label().includes('여왕'), ice.label());
for (const r of X.spots.values()) if ((r.spot.region ?? 1) === 2) X.sleepSpot(r.spot.id); // (the way there is clear: this is about her)

// ---- from the glow hollow, down into the deep, into the ring
X.jump(M(330, -80)); await wait(800);
check('down the ramp into the deep', await travel(at(296, -152), { near: 3, ms: 90000 }) && X.area?.id === 'mushDeep', pos(), X.label());
await travel(at(300, -179), { near: 3, ms: 60000 });
check('walking in: the ring\'s gate shuts, the queen rises', await until(() => sealed?.boss === 'mushroomQueen' && !queen.dormant && !X.gates.ring.open, 8000), JSON.stringify(sealed));
check('…on the ring\'s floor at −76 m (the hero down its ramp)', Math.abs(queen.pos.y - Y(-76)) < 0.8 && P.position.y < Y(-73.5), queen.pos.y, pos());
await until(() => G.mode === 'cutscene', 3000);
await wait(900); await once('w2q-01-queen-intro');
await until(() => queen.started && G.mode === 'play', 8000);
check('the plate up top: her name, hp', !$('boss-plate')?.classList.contains('hidden') && ($('boss-plate')?.textContent ?? '').includes('독버섯 여왕'));

// ---- the fight, by play
const tb = performance.now(), tg = G.run.time;
while (queen.state !== 'asleep' && performance.now() - tb < 420000 && !G.fainted) {
  await botStep({ goal: (c) => Math.abs(flat(c, queen.pos) - 3.2) });
  if (queen.doing === 'puff' && queen.ai.t > 0.5) await once('w2q-02-spores');
  if (queen.doing === 'seep' && queen.ai.t > 0.6) await once('w2q-03-clouds');
  if (queen.doing === 'call' && queen.ai.t > 0.5) await once('w2q-04-sprouts');
}
check('the Poison Mushroom Queen is put to sleep by play', queen.state === 'asleep', queen.hp, `${((performance.now() - tb) / 1000).toFixed(0)} s real`, `${(G.run.time - tg).toFixed(0)} s of play`, `min hearts ${bot.minHearts}`);
const phases = new Set(bossLog.filter((e) => e[0] === 'bossStep').map((e) => e[3]));
check('she went through all three phases', [1, 2, 3].every((p) => phases.has(p)), [...phases].join());
check('every attack drawn first: her spores, mushrooms and clouds', ['spray', 'sprout', 'poison'].every((k) => bossLog.some((e) => e[0] === 'bossTelegraph' && e[2] === k)));
check('a star the first time, every heart back', await until(() => S.beaten.mushroomQueen === 1, 4000) && G.run.hearts === G.run.maxHearts, S.stars, G.run.hearts);
check('then the ring opens and the mushroom lift wakes', await until(() => X.gates.ring.open && S.world.gates.lift && S.world.bosses.mushroomQueen, 8000));
await wait(900); await once('w2q-05-queen-asleep');
check('W3: the ice door by the camp now opens (the Ice Lake)', await until(() => X.gates.ice.open && S.world.gates.ice, 6000));

// ---- the lift home
const lift = G.interactables.find((it) => it.kind === 'lift' && Math.hypot(it.pos.x - D.lift.ring[0], it.pos.z - D.lift.ring[1]) < 1);
check('the lift in the ring is ready', !!lift && lift.enabled());
const n0 = X.n;
await travel(lift.pos.clone(), { near: 2.5, ms: 30000 });
for (let k = 0; k < 6 && !lifted && G.mode === 'play'; k++) { await clickAt(lift.pos.clone().setY(lift.pos.y + 0.8)); await until(() => G.mode === 'cutscene', 3000); }
await wait(700); await once('w2q-06-lift');
check('the mushroom lift carries the hero home to the camp', await until(() => lifted?.to === '캠프' && X.area?.id === 'camp', 15000) && Math.abs(P.position.y - Y(-30)) < 1, pos(), X.area?.id);
check('…a new expedition', await until(() => X.n === n0 + 1, 3000), n0, X.n);
await wait(800); await once('w2q-07-camp');
// and back down again, from the camp
lifted = null;
const back = G.interactables.find((it) => it.kind === 'lift' && Math.hypot(it.pos.x - D.lift.camp[0], it.pos.z - D.lift.camp[1]) < 1);
await travel(back.pos.clone(), { near: 2.5, ms: 30000 });
for (let k = 0; k < 6 && !lifted && G.mode === 'play'; k++) { await clickAt(back.pos.clone().setY(back.pos.y + 0.8)); await until(() => G.mode === 'cutscene', 3000); }
check('…and from the camp back down to the ring', await until(() => lifted?.to === '버섯 고리' && X.area?.id === 'ring', 15000), pos(), X.area?.id);

const save = JSON.parse(localStorage.getItem(G.saveKey ?? 'secret-cave-save-v1'));
check('kept in the save: the queen asleep, the lift, a star', save.world.bosses.mushroomQueen && save.world.gates.lift && save.beaten.mushroomQueen === 1);
check('the bot never ran out of hearts', bot.minHearts > 0 && faints === 0, bot.minHearts);
log.push(['INFO', 'time', `${(G.run.time / 60).toFixed(2)} min of play`, `${((performance.now() - t0) / 1000).toFixed(0)} s real`, 'min hearts', bot.minHearts, 'bot', JSON.stringify(bot.stats), 'hurt', JSON.stringify(bot.events.slice(0, 30))]);
return log;
