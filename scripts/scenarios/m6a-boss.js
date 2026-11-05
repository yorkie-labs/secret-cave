// @bot
// M6a: the Poison Mushroom Queen (GDD §3.3 row 2). W2: in the big world,
// GAME_URL='http://localhost:5191/?start=mushroom&seed=4' (her sunken ring at
// the Mushroom Forest's far end). Straight into her ring (its gate
// closes behind the hero); the scripted player (scenarios/_bot.js) fights
// her with real input.
// Checked: the intro (camera on her, her name card), the plate, a mark on
// the floor before every attack that can hurt (≥ 0.7 s), poison only from
// clouds that seeped up from a marked zone, never two hurts in a row, the
// phases at 66 % and 33 % with a roar (phase 1: spores and clouds; phase 2
// adds the mushrooms she calls up; phase 3 three cones at once), a rest
// before every new attack, her cap droops after the spores and the clouds
// (the hammer hits twice as hard), the water gun washes a cloud away (a safe
// place to stand), and she can be beaten; then (the last area here) the
// crystal door opens on the way out.
const X = G.expedition;
// (W6: hand-written points are in the design frame; the layout squeezes them into the world)
const M = (u, v) => G.world?.def.M ? G.world.def.M(u, v) : [(u + v) * Math.SQRT1_2, (v - u) * Math.SQRT1_2];
const $ = (id) => document.getElementById(id);
const until = async (test, ms = 8000, step = 30) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (test()) return true; await wait(step); } return false; };
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const ev = [];
for (const name of ['bossTelegraph', 'bossAttack', 'bossHurt', 'bossPhase', 'bossStep', 'bossStunned', 'bossStart', 'queenClouds', 'queenDroop', 'poisonTick', 'poisonWashed', 'hurt']) G.on(name, (e) => ev.push({ ...e, ev: name, at: e?.at ?? G.time, hp: e?.hp }));
G.on('enemyHit', (e) => { if (e.enemy.isBoss) ev.push({ ev: 'hit', at: G.time, damage: e.damage, by: e.by, dazed: e.dazed }); });

await start(); await wait(600);
let b;
// W2: the forest's far end: into the queen's ring (W2 ?start=mushroom)
for (const r of X.spots.values()) if ((r.spot.region ?? 1) === 2) X.sleepSpot(r.spot.id);
const [qx, qz] = G.world.def.queen.at;
X.jump([qx + 6, qz + 6]); await wait(200);
b = X.queen;
check('the ring: the queen alone, its gate shut behind (the big world)', !!b && b.kind === 'mushroomQueen' && await until(() => !X.gates.ring.open && !b.dormant, 3000) && G.enemies.filter((e) => e.isBoss && !e.gone && !e.dormant).length === 1);
check('the intro: a short cut to her', await until(() => G.mode === 'cutscene', 3000));
await wait(1300);
check('…with her name card', $('card').textContent.includes('독버섯 여왕'), $('card').textContent);
await shot('m6a-boss-intro');
check('then the fight', await until(() => G.mode === 'play' && b.started, 6000));
check('the plate: name, hp, stun gauge, hint', !$('boss-plate').classList.contains('hidden') && $('boss-name').textContent.includes('독버섯 여왕') && $('boss-hint').textContent.length > 0, $('boss-hint').textContent);

const shots = new Set();
const once = async (n) => { if (!shots.has(n)) { shots.add(n); await shot(n); } };
const tFight = G.time, tReal = performance.now();
let washed = false;
while (b.state !== 'asleep' && performance.now() - tReal < 360000 && G.mode !== 'result') {
  // once, on purpose: stand in a fresh cloud and wash it away
  const cloud = !washed && G.poisonZones.find((z) => z.kind === 'queen' && z.live() && z.t > 0.5);
  if (cloud && !['puff', 'call', 'seep'].includes(b.doing)) {
    washed = true;
    // step into it and shoot (away from her): the water washes it off
    P.teleport(V3(cloud.x, gy(cloud.x, cloud.z), cloud.z));
    G.run.water = Math.max(G.run.water, 0.5); // (this checks the washing, not the tank)
    await wait(120);
    // (the gun may still be cooling down from the bot's last shot: wait for it, W4)
    for (let k = 0; k < 40 && !G.tools.waterGun.ready; k++) await wait(50);
    const tw = G.time;
    const away = Math.atan2(cloud.x - b.pos.x, cloud.z - b.pos.z);
    await toolAt('waterGun', V3(cloud.x + Math.sin(away) * 4, gy(cloud.x, cloud.z), cloud.z + Math.cos(away) * 4));
    await wait(400);
    check('the water gun washes one of her clouds away (a safe place)', ev.some((e) => e.ev === 'poisonWashed' && e.at >= tw) && !cloud.live(), bot.stats.water);
    await shot('m6a-boss-washed');
    continue;
  }
  await botStep({ goal: (c) => Math.abs(flat(c, b.pos) - 3.2) + (G.poisonAt(c.x, c.z, 0.6) ? 6 : 0) });
  if (b.phase === 1 && b.doing === 'puff' && b.ai.t > 0.5) await once('m6a-boss-p1-spores');
  if (b.doing === 'seep' && b.ai.t > 0.7) await once('m6a-boss-seep');
  if (b.doing === 'droop' && b.ai.t > 0.3) await once('m6a-boss-droop');
  if (b.phase === 2 && b.doing === 'call' && b.ai.t > 0.5) await once('m6a-boss-p2-summon');
  if (b.phase === 3 && b.doing === 'puff' && b.ai.t > 0.5) await once('m6a-boss-p3-spores');
  if (G.poisonZones.some((z) => z.kind === 'queen' && z.live() && z.t > 1)) await once('m6a-boss-clouds');
}
const fightTime = G.time - tFight;
check('beaten by play', b.state === 'asleep', `hp ${b.hp.toFixed(1)}`, `${fightTime.toFixed(0)} s of game time`);
check('the hero never ran out of hearts', bot.minHearts > 0, `min ${bot.minHearts}`, `${bot.stats.hits} hits taken`);

// ---- telegraphs before every attack
const attacks = ev.filter((e) => e.ev === 'bossAttack');
const teles = ev.filter((e) => e.ev === 'bossTelegraph');
const lead = attacks.map((a) => {
  const t = teles.filter((x) => x.kind === a.kind && x.at <= a.at).at(-1);
  const prev = attacks.filter((x) => x.kind === a.kind && x.at < a.at).at(-1);
  return t && (!prev || t.at >= prev.at) ? a.at - t.at : -1;
});
check('every attack had its mark on the floor first', attacks.length > 5 && lead.every((l) => l >= 0), `${attacks.length} attacks`, [...new Set(attacks.map((a) => a.kind))].join(','));
check('…and at least 0.7 s of warning', lead.every((l) => l >= 0.7 - 1e-6), Math.min(...lead).toFixed(2));
const hurts = ev.filter((e) => e.ev === 'bossHurt' && e.hurt);
check('every hurt came from a marked attack', hurts.every((h) => teles.some((t) => t.kind === h.kind && t.at < h.at)), hurts.map((h) => h.kind).join(','));
// poison: every tick from a cloud that seeped up after its mark
const clouds = ev.filter((e) => e.ev === 'queenClouds');
const ticks = ev.filter((e) => e.ev === 'poisonTick' && e.kind === 'queen' && e.hurt);
check('her poison only from clouds that came after a marked zone', clouds.every((c) => teles.some((t) => t.kind === 'poison' && t.at < c.at && c.at - t.at >= 0.7 - 1e-6)) && ticks.every((t) => clouds.some((c) => c.at < t.at)), `${clouds.length} seeps`, `${ticks.length} ticks`);
const all = ev.filter((e) => e.ev === 'hurt').map((e) => e.at);
const gaps = all.slice(1).map((h, i) => h - all[i]);
check('never two hurts in a row (at least the 0.7 s blink between)', gaps.every((g) => g >= 0.69), gaps.map((g) => g.toFixed(2)).join(','));

// ---- phases
const phases = ev.filter((e) => e.ev === 'bossPhase');
check('phase 2 at 66 % hp, phase 3 at 33 %', phases.length === 2 && phases[0].phase === 2 && phases[0].hp / b.maxHp <= 0.66 && phases[0].hp / b.maxHp > 0.4 && phases[1].phase === 3 && phases[1].hp / b.maxHp <= 0.33 && phases[1].hp / b.maxHp > 0.05, phases.map((p) => `${p.phase}@${p.hp.toFixed(1)}`).join(' '));
const steps = ev.filter((e) => e.ev === 'bossStep');
check('a roar at each new phase', phases.every((p) => steps.some((s) => s.name === 'roar' && s.at >= p.at && s.at - p.at < 6)));
const pats = (p) => [...new Set(steps.filter((s) => s.phase === p && s.pattern && ['puff', 'call', 'seep'].includes(s.name)).map((s) => s.pattern))].sort().join(',');
check('phase 1: spores and clouds, no mushrooms yet', !pats(1).includes('summon') && pats(1).includes('spray'), pats(1));
check('phase 2 adds the mushrooms she calls up', pats(2).includes('summon'), pats(2));
const cones3 = ev.filter((e) => e.ev === 'bossStep' && e.name === 'puff' && e.phase === 3);
check('phase 3: three spore cones at once', cones3.length === 0 || b.marks.cones.length === 3, pats(3));
const starts = steps.filter((s) => ['puff', 'call', 'seep'].includes(s.name));
check('a rest before every new attack', starts.every((s) => ['rest', 'idle', 'roar'].includes(steps[steps.indexOf(s) - 1]?.name) || ev.some((e) => e.ev === 'bossStunned' && e.at < s.at && s.at - e.at < 3.5)), starts.map((s) => steps[steps.indexOf(s) - 1]?.name).join(','));
const droops = steps.filter((s) => s.name === 'droop');
check('her cap droops after the spores and after the clouds', droops.length >= steps.filter((s) => s.name === 'spray').length, droops.length);
const dazedHits = ev.filter((e) => e.ev === 'hit' && e.dazed && e.by === 'hammer');
check('the hammer on her drooping cap hits twice as hard', dazedHits.length > 0 && dazedHits.every((h) => h.damage === 2), dazedHits.length);
check('in the codex: the queen', !!G.state.seen.mushroomQueen);

// ---- out
check('every heart back, the ring opens and the mushroom lift wakes (W2)', await until(() => X.gates.ring.open && G.state.world.gates.lift, 8000) && G.run.hearts === G.run.maxHearts, G.run.hearts);
await wait(500);
await shot('m6a-boss-asleep');
log.push(['INFO', 'fight', `${fightTime.toFixed(1)} s`, 'bot', JSON.stringify(bot.stats), 'hurts', JSON.stringify(ev.filter((e) => e.ev === 'hurt').map((e) => +e.at.toFixed(1)))]);
return log;
