// @bot
// W3 (tasks/20261102-world-redesign-todo.md): the Ice Bear on its rink sunk
// into the frozen lake, played through real input.
// GAME_URL='http://localhost:5191/?start=ice&seed=4'.
// From the shore down the rink's ramp: walking in seals its frost gate and
// wakes it (a short look at it, its name plate); its fists, falling ice and
// blizzard are each drawn first (a circle, shadows, a cone) and hurt only
// inside them; its fists stick in the ice after a pound (the hammer hits
// twice as hard); three phases; asleep: a star, every heart, the rink opens,
// the rope lift comes down (the lake ⇄ the camp: a ride home, a new
// expedition), and the crystal door at the lake's far corner says the
// Crystal Heart comes next (W4: before the bear, "얼음 곰을 재우면 열려요";
// after it, "목걸이를 가까이 대 봐요": it opens to the necklace).
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
let sealed = null, faints = 0, roped = null;
G.on('arenaSealed', (e) => { sealed = e; });
G.on('faint', () => faints++);
G.on('ropeLift', (e) => { roped = e; });
for (const k of ['bossStep', 'bossPhase', 'bossHurt', 'bossTelegraph', 'bossAttack', 'bossStunned', 'iceBearStuck', 'iceBearBeaten']) G.on(k, (e) => bossLog.push([k, +G.time.toFixed(2), e?.name ?? e?.kind ?? '', e?.phase ?? '', e?.hurt ?? '']));
const shots = new Set();
const once = async (name) => { if (shots.has(name)) return; shots.add(name); await shot(name); };

await start(); await wait(1200);
const bear = X.bear;
check('the Ice Bear sleeps on its rink, the gate open, the rope lift not yet down', !!bear && bear.dormant && X.gates.bearGate.open && !S.world.gates.lift3);
const pit3 = G.interactables.find((it) => it.gate === X.gates.pit3);
check('the lake\'s crystal door down to the Crystal Heart waits for the Ice Bear', !!pit3 && pit3.label().includes('얼음 곰'), pit3?.label());
for (const r of X.spots.values()) if ((r.spot.region ?? 1) === 3) X.sleepSpot(r.spot.id); // (the way is clear: this is about the bear)

// ---- from the shore down the ramp into the rink
X.jump(M(-330, -2)); await wait(800);
await travel(at(-363, -18), { near: 3, ms: 60000 });
check('walking in: the frost gate shuts, the Ice Bear rises', await until(() => sealed?.boss === 'iceBear' && !bear.dormant && !X.gates.bearGate.open, 8000), JSON.stringify(sealed));
check('…on the rink\'s ice at −71 m (slippery: the rink is bare ice)', W.slipAt(...D.iceBear.at) === 1 && Math.abs(bear.pos.y - Y(-71)) < 0.8 && P.position.y < Y(-68), bear.pos.y, pos());
await until(() => G.mode === 'cutscene', 3000);
await wait(1000); await once('w3b-01-intro');
await until(() => bear.started && G.mode === 'play', 8000);
check('the plate up top: its name, hp and a hint', !$('boss-plate')?.classList.contains('hidden') && ($('boss-plate')?.textContent ?? '').includes('얼음 곰'));

// ---- the fight, by play
const tb = performance.now(), tg = G.run.time;
while (bear.state !== 'asleep' && performance.now() - tb < 480000 && !G.fainted) {
  await botStep({ goal: (c) => Math.abs(flat(c, bear.pos) - 4.2) });
  if (bear.doing === 'raise' && bear.ai.t > 0.6) await once(`w3b-02-fist-p${bear.phase}`);
  if (bear.doing === 'stuck' && bear.ai.t > 0.3) await once('w3b-03-stuck');
  if (bear.doing === 'call' && bear.ai.t > 0.9) await once(`w3b-04-chunks-p${bear.phase}`);
  if (bear.doing === 'inhale' && bear.ai.t > 0.7) await once('w3b-05-blizzard-aim');
  if (bear.doing === 'breath' && bear.ai.t > 0.3) await once('w3b-06-blizzard');
}
check('the Ice Bear is put to sleep by play', bear.state === 'asleep', bear.hp, `${((performance.now() - tb) / 1000).toFixed(0)} s real`, `${(G.run.time - tg).toFixed(0)} s of play`, `min hearts ${bot.minHearts}`);
const steps = bossLog.filter((e) => e[0] === 'bossStep');
const phases = new Set(steps.map((e) => e[3]));
check('it went through all three phases', [1, 2, 3].every((p) => phases.has(p)), [...phases].join());
check('every attack drawn first: its fists, the falling ice, the blizzard', ['fist', 'chunk', 'blizzard'].every((k) => bossLog.some((e) => e[0] === 'bossTelegraph' && e[2] === k)));
// each attack came after its own telegraph, at least the minimum warning later
let ordered = true;
for (const a of bossLog.filter((e) => e[0] === 'bossAttack')) {
  const tele = bossLog.filter((e) => e[0] === 'bossTelegraph' && e[2] === a[2] && e[1] <= a[1]).at(-1);
  if (!tele || a[1] - tele[1] < BOSSES_MIN() - 0.05) ordered = false;
}
function BOSSES_MIN() { return 0.85; }
check('…each hit at least 0.85 s after its warning', ordered);
check('its fists stuck in the ice after a pound (the hammer\'s chance)', bossLog.some((e) => e[0] === 'iceBearStuck'));
const hits = bossLog.filter((e) => e[0] === 'bossHurt');
log.push(['INFO', 'boss hits taken', hits.filter((h) => h[4] === true).map((h) => h[2]).join(',') || 'none', 'attacks', bossLog.filter((e) => e[0] === 'bossAttack').length]);
check('a star the first time, every heart back', await until(() => S.beaten.iceBear === 1, 4000) && G.run.hearts === G.run.maxHearts, S.stars, G.run.hearts);
check('then the rink opens and the rope lift comes down', await until(() => X.gates.bearGate.open && S.world.gates.lift3 && S.world.bosses.iceBear, 8000));
await wait(900); await once('w3b-07-asleep');

// ---- the rope lift home
const lift = G.interactables.find((it) => it.kind === 'lift' && Math.hypot(it.pos.x - D.lift3.lake[0], it.pos.z - D.lift3.lake[1]) < 1);
check('the rope lift on the lake is ready', !!lift && lift.enabled());
const n0 = X.n;
await travel(lift.pos.clone(), { near: 2.5, ms: 40000 });
await once('w3b-08-rope-lift');
for (let k = 0; k < 6 && !roped && G.mode === 'play'; k++) { await clickAt(lift.pos.clone().setY(lift.pos.y + 0.8)); await until(() => G.mode === 'cutscene', 3000); }
await wait(700); await once('w3b-09-lift-up');
check('the rope lift carries the hero up to the camp', await until(() => roped?.to === '캠프' && X.area?.id === 'camp', 15000) && Math.abs(P.position.y - Y(-30)) < 1, pos(), X.area?.id);
check('…a new expedition', await until(() => X.n === n0 + 1, 3000), n0, X.n);
await wait(800); await once('w3b-10-camp');
roped = null;
const back = G.interactables.find((it) => it.kind === 'lift' && Math.hypot(it.pos.x - D.lift3.camp[0], it.pos.z - D.lift3.camp[1]) < 1);
await travel(back.pos.clone(), { near: 2.5, ms: 30000 });
for (let k = 0; k < 6 && !roped && G.mode === 'play'; k++) { await clickAt(back.pos.clone().setY(back.pos.y + 0.8)); await until(() => G.mode === 'cutscene', 3000); }
check('…and from the camp back down to the lake', await until(() => roped?.to === '얼음 호수' && Math.abs(P.position.y - Y(-65)) < 1.2, 15000), pos(), X.area?.id);
check('the crystal door now waits for the necklace (W4)', pit3.label().includes('목걸이'), pit3.label());

const save = JSON.parse(localStorage.getItem(G.saveKey ?? 'secret-cave-save-v1'));
check('kept in the save: the Ice Bear asleep, the rope lift, a star', save.world.bosses.iceBear && save.world.gates.lift3 && save.beaten.iceBear === 1);
check('the bot never ran out of hearts', bot.minHearts > 0 && faints === 0, bot.minHearts);
log.push(['INFO', 'time', `${(G.run.time / 60).toFixed(2)} min of play`, `${((performance.now() - t0) / 1000).toFixed(0)} s real`, 'min hearts', bot.minHearts, 'bot', JSON.stringify(bot.stats), 'hurt', JSON.stringify(bot.events.slice(0, 30))]);
return log;
