// @bot
// W1–W3: regions 1, 2 and 3 of the big world in one go (GDD §12 "완주"),
// played by the scripted bot (scenarios/_bot.js) through real input only.
// Run with GAME_URL='http://localhost:5191/?seed=4' (`npm run playtest`).
// (The old seeded caves' full run is full-open.js on ?world=open.)
// Fresh save → title → 새 게임 → the intro cutscene (a line on, then 건너뛰기) → the drop into the
// sinkhole → the necklace, the gate → down Moss Valley's steps on foot,
// putting the packs on the way to sleep → over the viaduct → the camp
// (found; the spring; the merchant if there are shards) → back out across
// the valley to the old mine → the canyon into the meadow (the arena seals)
// → the Giant Rabbit Chief by play → the shortcut opens → the mine cart to
// the camp (a new expedition) → W2: back over the trestle, through the
// chief's gate into the Mushroom Forest, packs put to sleep on the way, down
// to its deep (by bounce mushroom when the path says so) → the Poison
// Mushroom Queen by play in her ring → the mushroom lift home to the camp →
// W3: the merchant (armour if it can), through the ice door into the Ice
// Lake, packs put to sleep on the way, down onto the frozen lake → the Ice
// Bear by play on its rink → the rope lift home to the camp.
// W4: the spring and the merchant → the rope lift back down to the lake →
// the crystal door at its corner (the necklace glows, it opens) → the
// crystal canyon, packs on the way → down onto the west ruins → hops over
// the floating rocks onto the heart's platform → the Crystal King by play →
// the escape up the tunnel into the sunlight → the ending → the whole
// game's result → 계속 탐험하기 (the camp, the world open).
// W5: before the Crystal King, the star altar (a heart with the stars so
// far); after the ending, the crystal lift down to the king's platform for
// the purple shard (the codex's last page, a star). The Crystal King's
// laser hits are counted (the balance).
// The bot must never run out of hearts, within 45 min of game clock.
const X = G.expedition, W = G.world, D = W.def, S = G.state;
// (W5: stars earned, the ones spent at the star altar counted back in)
const COSTS = { heart1: 2, heart2: 2, herbPouch: 1, bigTank: 1, rabbitMask: 1, hat: 1, crown: 1, scarf: 1, boots: 1 };
const earned = () => S.stars + Object.keys(S.unlocks ?? {}).reduce((t, id) => t + (COSTS[id] ?? 0), 0);
// (W6: hand-written points are in the design frame; the layout squeezes them into the world)
const M = (u, v) => G.world?.def.M ? G.world.def.M(u, v) : [(u + v) * Math.SQRT1_2, (v - u) * Math.SQRT1_2];
// (W6: a design depth in the world, as the layout's H gives it)
const Y = (y) => (G.world?.def.H ? G.world.def.H(y) : y);
const $ = (id) => document.getElementById(id);
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const until = async (test, ms = 8000, step = 40) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (test()) return true; await wait(step); } return false; };
const at = (u, v) => { const [x, z] = M(u, v); return V3(x, gy(x, z), z); };
const t0 = performance.now();
const shots = new Set();
const once = async (name) => { if (shots.has(name)) return; shots.add(name); await shot(name); };
const legs = [];
const leg = async (name, to, near = 3) => {
  const tl = G.run.time;
  const ok = await travel(to, { near, ms: 300000 }); // (W6: the squeezed canyons put a pack on the way: room to fight it)
  legs.push([name, +(G.run.time - tl).toFixed(1)]);
  check(`on foot: ${name}`, ok, pos(), $('area-name').textContent, `hearts ${G.run.hearts}`);
  return ok;
};
let fainted = 0, sealed = 0, laserHits = 0, lasers = 0;
G.on('faint', () => fainted++);
G.on('bossHurt', (e) => { if (e.kind === 'laser' && e.hurt) laserHits++; });
G.on('bossAttack', (e) => { if (e.kind === 'laser') lasers++; });
G.on('arenaSealed', () => sealed++);

// ---- title and prologue (a fresh save)
check('fresh save: no necklace, the world not started', !S.necklace && !S.world.started && !S.prologue);
check('title: 비밀 동굴 SECRET CAVE', $('title').textContent.includes('비밀 동굴') && $('title').textContent.includes('SECRET CAVE'));
await once('full-title');
$('btn-new').click(); await wait(700);
check('새 게임 → the intro cutscene', !$('intro').classList.contains('hidden') && G.intro?.playing);
await until(() => G.intro?.ready && G.intro.t > 1, 15000);
const line0 = G.intro.line;
keyTap('Space'); await wait(250); keyTap('Space'); await wait(250);
check('Space moves the intro on a line', G.intro.line > line0 || G.intro.t > 7, line0, G.intro.line);
$('intro-skip').click();
await until(() => !G.intro.playing, 3000);
check('건너뛰기 ends it', !G.intro.playing);
await until(() => G.mode === 'play', 4000);
check('then the drop into the sinkhole, on seed 4', G.mode === 'play' && S.world.started && S.world.seed === 4, G.mode, S.world.seed);
await until(() => P.state.grounded && Math.abs(P.position.y) < 0.6, 6000);
await wait(1200);
await once('full-01-sinkhole');

// ---- the necklace and the gate
await clickAt(X.necklace.pos.clone().setY(X.necklace.pos.y + 0.7));
check('the necklace taken', await until(() => S.necklace, 10000));
await until(() => G.hud.inDialog, 3000);
while (G.hud.inDialog) { keyTap('Space'); await wait(250); }
check('the gate opens', await until(() => X.gates.entrance.open, 5000));

// ---- down the valley, putting packs to sleep on the way
async function fightSpot(id) {
  const rec = X.spot(id);
  if (!rec || !rec.enemies.length || rec.cleared) return false;
  const home = V3(rec.spot.at[0], gy(...rec.spot.at), rec.spot.at[1]);
  await travel(home, { near: rec.spot.r * 0.6, ms: 90000 });
  const kinds = rec.enemies.map((e) => e.kind).join(',');
  const ok = await clearByPlay(150000, { enemies: rec.enemies, home });
  check(`${id}: ${kinds} put to sleep by play`, ok && await until(() => rec.cleared, 2000), `min hearts ${bot.minHearts}`);
  await wait(1500); // the shards fly in
  return ok;
}
const fought = [];
await leg('the upper step', at(-80, 300));
for (const id of ['t1a', 't1b']) if (await fightSpot(id)) fought.push(id);
await leg('the middle step', at(-108, 210));
for (const id of ['t2a']) if (await fightSpot(id)) fought.push(id);
await once('full-02-valley');
await leg('the lowest step', at(-120, 125));
for (const id of ['t3a']) if (await fightSpot(id)) fought.push(id);
check('animals met and put to sleep on the way', fought.length >= 2 && G.run.asleep >= 3, fought.join(','), G.run.asleep);
// a chest on the way, if this expedition rolled one near
const chestSpot = ['t2b', 't3b', 't1c'].map((id) => X.spot(id)).find((r) => r?.chests.length);
if (chestSpot) {
  const c = chestSpot.chests[0];
  await travel(c.pos.clone(), { near: 2.5, ms: 90000 });
  for (let k = 0; k < 10 && !c.opened; k++) { await clickAt(c.pos.clone().setY(c.pos.y + 0.4)); await wait(800); }
  await until(() => !!c.loot, 3000); await wait(900);
  for (const p of G.pickups.filter((p) => p.alive && p.kind === 'loot' && p.item !== 'herb')) { await clickAt(p.model.position.clone()); await until(() => !p.alive, 5000); }
  check(`a chest opened: ${JSON.stringify(c.loot)}`, c.opened && !!c.loot);
}

// ---- over the viaduct to the camp
await leg('over the viaduct to the camp', V3(D.camp.at[0], gy(...D.camp.at), D.camp.at[1]));
check('the camp found', S.world.camp && X.area?.id === 'camp', $('area-name').textContent);
await wait(800);
await once('full-03-camp');
while (G.hud.inDialog) { keyTap('Space'); await wait(250); }
if (G.run.hearts < G.run.maxHearts) {
  for (let k = 0; k < 10 && G.run.hearts < G.run.maxHearts; k++) { await clickAt(X.spring.pos.clone().setY(X.spring.pos.y + 0.3)); await wait(800); }
}
check('the spring: every heart', G.run.hearts === G.run.maxHearts, G.run.hearts);
if (G.run.shards >= 3) {
  for (let k = 0; k < 10 && !G.shop.isOpen; k++) { await clickAt(X.merchant.pos.clone().setY(X.merchant.pos.y + 1.5)); await wait(700); }
  const b = document.querySelector('#shop-goods [data-id="herb"]');
  if (b && !b.classList.contains('no')) { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); await wait(300); }
  check('the bat merchant: a herb for shards', G.run.herbs >= 1, G.run.herbs, G.run.shards);
  G.shop.close(); await wait(300);
}

// ---- out to the chief, the long way round
const n1 = X.n;
// (W6: on the viaduct, wherever the layout put it: a third of the way from
// its valley end, out of the camp's name on the map)
const viaMid = () => { const b = G.world.bridges.find((q) => q.id === 'viaduct'); return V3(b.a[0] + (b.b[0] - b.a[0]) / 3, b.y0, b.a[1] + (b.b[1] - b.a[1]) / 3); };
await leg('back over the viaduct', viaMid());
await leg('along the lowest step to the mine', at(150, 135));
for (const id of ['mineA']) if (await fightSpot(id)) fought.push(id);
await leg('down the canyon to the arena', at(150, 92));
await once('full-04-canyon');
const chief = X.chief;
if (!sealed) await travel(at(150, 14), { near: 3, ms: 60000 });
check('the arena seals, the chief rises', await until(() => sealed > 0 && !chief.dormant, 6000));
if (G.mode === 'cutscene') { await wait(1000); await once('full-05-chief'); }
await until(() => G.mode === 'play', 8000);
const tb = performance.now(), tg = G.run.time;
while (chief.state !== 'asleep' && performance.now() - tb < 360000 && !G.fainted) {
  await botStep({ goal: (c) => Math.abs(flat(c, chief.pos) - 3) });
  if (chief.phase === 2 && chief.doing === 'ears' && chief.ai.t > 0.4) await once('full-06-chief-gust');
}
legs.push(['the chief', +(G.run.time - tg).toFixed(1)]);
check('the Giant Rabbit Chief put to sleep by play', chief.state === 'asleep', chief.hp, `min hearts ${bot.minHearts}`);
check('a star; the shortcut and the way to region 2 open', await until(() => X.gates.shortcut.open && X.gates.region2.open, 8000) && S.stars >= 1);
await wait(500);
await once('full-07-chief-asleep');

// ---- the shortcut home
const tr = W.bridges.find((b) => b.id === 'trestle');
const cartAt = V3(tr.a[0] + (tr.a[0] - tr.b[0]) / tr.length * 4, 0, tr.a[1] + (tr.a[1] - tr.b[1]) / tr.length * 4);
cartAt.y = gy(cartAt.x, cartAt.z);
await leg('to the mine cart', cartAt, 2.5);
let rode = false;
G.on('rode', () => { rode = true; });
const cart = G.interactables.find((it) => it.kind === 'cart' && Math.hypot(it.pos.x - cartAt.x, it.pos.z - cartAt.z) < 1);
for (let k = 0; k < 6 && !rode && G.mode === 'play'; k++) { await clickAt(cart.pos.clone().setY(cart.pos.y + 0.6)); await until(() => G.mode === 'cutscene', 3000); }
check('the mine cart over the trestle to the camp', await until(() => rode && X.area?.id === 'camp', 15000), X.area?.id);
check('home again: a new expedition', await until(() => X.n === n1 + 1, 3000), n1, X.n);
await wait(600);
await once('full-08-home');

// ---- W2: the Mushroom Forest
const t2 = G.run.time;
{ const mx = tr.a[0] + (tr.a[0] - tr.b[0]) / tr.length * 9, mz = tr.a[1] + (tr.a[1] - tr.b[1]) / tr.length * 9; await leg('back over the trestle to the meadow', V3(mx, G.groundAt(mx, mz), mz), 3); }
await leg('through the chief\'s gate into the Mushroom Forest', at(296, 22));
check('the Mushroom Forest (region 2)', X.area?.region === 2, $('area-name').textContent);
await once('full-09-forest');
for (const id of ['f1']) if (await fightSpot(id)) fought.push(id);
let bounced = 0;
G.on('bounce', () => bounced++);
await leg('down through the forest to its deep', at(296, -152), 3);
for (const id of ['f7']) if (await fightSpot(id)) fought.push(id);
check('down to the deep, −70 m', Math.abs(P.position.y - Y(-70)) < 1.5, pos(), `bounces ${bounced}`);
const queen = X.queen;
let qsealed = false;
G.on('arenaSealed', (e) => { if (e?.boss === 'mushroomQueen') qsealed = true; });
await travel(at(300, -179), { near: 3, ms: 60000 });
check('into the ring: its gate shuts, the queen rises', await until(() => qsealed && !queen.dormant, 6000));
if (G.mode === 'cutscene') { await wait(1000); await once('full-10-queen'); }
await until(() => G.mode === 'play' && queen.started, 8000);
const tq = G.run.time, tqr = performance.now();
while (queen.state !== 'asleep' && performance.now() - tqr < 420000 && !G.fainted) await botStep({ goal: (c) => Math.abs(flat(c, queen.pos) - 3.2) });
legs.push(['the queen', +(G.run.time - tq).toFixed(1)]);
check('the Poison Mushroom Queen put to sleep by play', queen.state === 'asleep', queen.hp, `min hearts ${bot.minHearts}`);
check('a second star; the ring opens and the lift wakes', await until(() => X.gates.ring.open && S.world.gates.lift, 8000) && S.stars >= 2, S.stars);
await wait(600);
await once('full-11-queen-asleep');
const lift = G.interactables.find((it) => it.kind === 'lift' && Math.hypot(it.pos.x - D.lift.ring[0], it.pos.z - D.lift.ring[1]) < 1);
const n2 = X.n;
let lifted = false;
G.on('lifted', () => { lifted = true; });
await leg('to the mushroom lift', lift.pos.clone(), 2.5);
for (let k = 0; k < 6 && !lifted && G.mode === 'play'; k++) { await clickAt(lift.pos.clone().setY(lift.pos.y + 0.8)); await until(() => G.mode === 'cutscene', 3000); }
check('the mushroom lift home to the camp', await until(() => lifted && X.area?.id === 'camp', 15000), X.area?.id);
check('home again: a new expedition', await until(() => X.n === n2 + 1, 3000), n2, X.n);
legs.push(['region 2 in all', +(G.run.time - t2).toFixed(1)]);
await wait(600);
await once('full-12-home-again');

// ---- W3: the Ice Lake
const t3 = G.run.time;
while (G.hud.inDialog) { keyTap('Space'); await wait(250); }
if (G.run.hearts < G.run.maxHearts) {
  await travel(X.spring.pos.clone(), { near: 2, ms: 30000 });
  for (let k = 0; k < 10 && G.run.hearts < G.run.maxHearts; k++) { await clickAt(X.spring.pos.clone().setY(X.spring.pos.y + 0.3)); await wait(800); }
}
// the bat merchant: the shield first (the deer's weakness), then armour
// (blue hearts) if there are shards for it, else a herb
if (G.run.shards >= 3) {
  await travel(X.merchant.pos.clone(), { near: 2.5, ms: 30000 });
  for (let k = 0; k < 10 && !G.shop.isOpen; k++) { await clickAt(X.merchant.pos.clone().setY(X.merchant.pos.y + 1.5)); await wait(700); }
  const want = G.run.shards >= 6 && !G.run.owned.includes('shield') ? 'shield' : G.run.shards >= 8 && !G.run.owned.includes('armor') ? 'armor' : 'herb';
  const b = document.querySelector(`#shop-goods [data-id="${want}"]`);
  if (b && !b.classList.contains('no')) { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); await wait(300); }
  log.push(['INFO', 'bought', want, 'shards', G.run.shards, 'armour', G.run.armor, 'herbs', G.run.herbs]);
  G.shop.close(); await wait(300);
}
check('the ice door by the camp is open (the queen asleep)', X.gates.ice.open);
await leg('through the ice door, down the icy pass', at(-196, -4));
check('the Ice Lake (region 3)', X.area?.region === 3, $('area-name').textContent);
await once('full-13-ice-lake');
for (const id of ['i1']) if (await fightSpot(id)) fought.push(id);
await leg('down onto the snow shelf', at(-262, 20));
for (const id of ['i2']) if (await fightSpot(id)) fought.push(id);
await leg('down the ramp onto the frozen lake', at(-322, 18));
check('on the frozen lake, −65 m (slippery)', Math.abs(P.position.y - Y(-65)) < 1.5 && W.slipAt(P.position.x, P.position.z) === 1, pos());
for (const id of ['i4']) if (await fightSpot(id)) fought.push(id);
const bear = X.bear;
let bsealed = false;
G.on('arenaSealed', (e) => { if (e?.boss === 'iceBear') bsealed = true; });
for (let k = 0; k < 3 && !bsealed; k++) await travel(at(-363, -18), { near: 3, ms: 60000 }); // (an animal on the way may hold it up)
check('into the rink: its frost gate shuts, the Ice Bear rises', await until(() => bsealed && !bear.dormant, 6000));
if (G.mode === 'cutscene') { await wait(1000); await once('full-14-ice-bear'); }
await until(() => G.mode === 'play' && bear.started, 8000);
const tbr = G.run.time, tbrr = performance.now();
while (bsealed && bear.state !== 'asleep' && performance.now() - tbrr < 480000 && !G.fainted) await botStep({ goal: (c) => Math.abs(flat(c, bear.pos) - 4.2) });
legs.push(['the Ice Bear', +(G.run.time - tbr).toFixed(1)]);
check('the Ice Bear put to sleep by play', bear.state === 'asleep', bear.hp, `min hearts ${bot.minHearts}`);
check('a third star; the rink opens and the rope lift comes down', await until(() => X.gates.bearGate.open && S.world.gates.lift3, 8000) && S.stars >= 3, S.stars);
await wait(600);
await once('full-15-ice-bear-asleep');
const rope = G.interactables.find((it) => it.kind === 'lift' && Math.hypot(it.pos.x - D.lift3.lake[0], it.pos.z - D.lift3.lake[1]) < 1);
const n3 = X.n;
let roped = false;
G.on('ropeLift', () => { roped = true; });
await leg('to the rope lift', rope.pos.clone(), 2.5);
for (let k = 0; k < 6 && !roped && G.mode === 'play'; k++) { await clickAt(rope.pos.clone().setY(rope.pos.y + 0.8)); await until(() => G.mode === 'cutscene', 3000); }
check('the rope lift home to the camp', await until(() => roped && X.area?.id === 'camp', 15000), X.area?.id);
check('home again: a new expedition', await until(() => X.n === n3 + 1, 3000), n3, X.n);
legs.push(['region 3 in all', +(G.run.time - t3).toFixed(1)]);
await wait(600);
await once('full-16-home-from-the-lake');

// ---- W4: the Crystal Heart, the Crystal King, the way out
const t4 = G.run.time;
while (G.hud.inDialog) { keyTap('Space'); await wait(250); }
if (G.run.hearts < G.run.maxHearts) {
  await travel(X.spring.pos.clone(), { near: 2, ms: 30000 });
  for (let k = 0; k < 10 && G.run.hearts < G.run.maxHearts; k++) { await clickAt(X.spring.pos.clone().setY(X.spring.pos.y + 0.3)); await wait(800); }
}
if (G.run.shards >= 3) {
  await travel(X.merchant.pos.clone(), { near: 2.5, ms: 30000 });
  for (let k = 0; k < 10 && !G.shop.isOpen; k++) { await clickAt(X.merchant.pos.clone().setY(X.merchant.pos.y + 1.5)); await wait(700); }
  for (const want of ['armor', 'herb', 'herb']) {
    const b = document.querySelector(`#shop-goods [data-id="${want}"]`);
    if (b && !b.classList.contains('no')) { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); await wait(300); }
  }
  log.push(['INFO', 'bought (W4)', 'shards', G.run.shards, 'armour', G.run.armor, 'herbs', G.run.herbs]);
  G.shop.close(); await wait(300);
}
// W5: the star altar: a heart for the stars so far (the bosses, the codex)
{
  const altarIt = G.interactables.find((it) => it.kind === 'altar');
  await travel(altarIt.pos.clone(), { near: 2.2, ms: 30000 });
  for (let k = 0; k < 8 && !G.altar.isOpen; k++) { await clickAt(altarIt.pos.clone().setY(altarIt.pos.y + 1.2)); await wait(700); }
  const stars0 = S.stars, max0 = G.run.maxHearts;
  for (const want of ['heart1', 'herbPouch']) { document.querySelector(`#altar-goods [data-id="${want}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await wait(300); }
  check('the star altar: a heart for two stars', G.altar.isOpen && S.unlocks.heart1 && G.run.maxHearts === max0 + 1 && S.stars < stars0, stars0, S.stars, G.run.maxHearts);
  log.push(['INFO', 'altar', JSON.stringify(S.unlocks), 'stars left', S.stars]);
  G.altar.close(); await wait(300);
}
const ropeC = G.interactables.find((it) => it.kind === 'lift' && Math.hypot(it.pos.x - D.lift3.camp[0], it.pos.z - D.lift3.camp[1]) < 1);
roped = false;
await leg('to the rope lift at the camp', ropeC.pos.clone(), 2.5);
for (let k = 0; k < 6 && !roped && G.mode === 'play'; k++) { await clickAt(ropeC.pos.clone().setY(ropeC.pos.y + 0.8)); await until(() => G.mode === 'cutscene', 3000); }
check('the rope lift back down to the lake', await until(() => roped && Math.abs(P.position.y - Y(-65)) < 1.5, 15000), pos());
let glowed = 0, doorOpen = false;
G.on('necklaceGlow', () => glowed++);
G.on('heartDoorOpened', () => { doorOpen = true; });
const door = X.gates.pit3;
await leg('across the lake to the crystal door at its corner', V3(door.at.x - door.def.dir[0] * 6, Y(-65), door.at.z - door.def.dir[1] * 6), 2.5);
check('the necklace glows, the crystal door opens', await until(() => glowed > 0 && door.open, 8000), glowed, door.open);
await until(() => doorOpen, 4000);
await once('full-17-crystal-door');
await leg('into the crystal canyon', at(-195, -200), 3); // (W6: past its spike patch, the squeezed canyon's far end)
check('the Crystal Heart (region 4)', X.area?.region === 4, $('area-name').textContent);
for (const id of ['c1']) if (await fightSpot(id)) fought.push(id);
await once('full-18-canyon');
await leg('down the ramp onto the west ruins', V3(D.places.ruinsW[0], gy(...D.places.ruinsW), D.places.ruinsW[1]) /* (W6: the ledge's flat middle, past its ramp) */, 3);
for (const id of ['c2']) if (await fightSpot(id)) fought.push(id);
check('the ruined west ledge, −90 m', Math.abs(P.position.y - Y(-90)) < 1.5, pos());
await once('full-19-ruins');
const king = X.king;
let ksealed = false, hops = 0;
G.on('arenaSealed', (e) => { if (e?.boss === 'crystalKing') ksealed = true; });
G.on('hop', () => hops++);
for (let k = 0; k < 3 && !ksealed; k++) await travel(V3(D.king.at[0], Y(-112), D.king.at[1]), { near: 4, ms: 90000 });
check('over the floating rocks by hops onto the heart\'s platform: the Crystal King rises', await until(() => ksealed && !king.dormant, 8000) && hops >= 3, hops);
if (G.mode === 'cutscene') { await wait(1200); await once('full-20-crystal-king'); }
await until(() => G.mode === 'play' && king.started, 8000);
const tk = G.run.time, tkr = performance.now();
while (ksealed && king.state !== 'asleep' && performance.now() - tkr < 600000 && !G.fainted) {
  await botStep({ goal: (c) => Math.abs(flat(c, king.pos) - 3.4) });
  if (king.doing === 'tired' && king.ai.t > 0.5) await once('full-21-king-tired');
}
legs.push(['the Crystal King', +(G.run.time - tk).toFixed(1)]);
check('the Crystal King put to sleep by play', king.state === 'asleep', king.hp, `min hearts ${bot.minHearts}`);
check('a fourth star; the bridge and the way out open, the escape begins', await until(() => X.gates.exit.open && X.escaping, 12000) && earned() >= 4, earned());
let sunlit = false;
G.on('sunlight', () => { sunlit = true; });
const te = G.run.time;
for (let k = 0; k < 8 && !sunlit; k++) await travel(V3(D.escape.sun[0], Y(-96), D.escape.sun[1]), { near: 2.5, ms: 30000 });
legs.push(['the escape', +(G.run.time - te).toFixed(1)]);
check('up the tunnel into the sunlight: the ending', await until(() => sunlit && G.mode === 'ending', 8000));
// (the ending cutscene, ui/ending.js: up, the first words in the sun, then 건너뛰기)
// (the bot's travel() may run on a while after the sunlight: what it showed is in `seen`)
check('the ending cutscene: into the light, then "멍멍! 드디어 탈출했다!" at the cave mouth in the sun', await until(() => G.outro?.ready && G.outro.seen.lines.includes(1), 30000) && G.outro.seen.scenes.slice(0, 2).join() === 'light,sunlight', G.outro?.seen.scenes.join(), G.outro?.seen.lines.join());
await once('full-22-ending');
$('intro-skip').click();
check('…건너뛰기 ends it', await until(() => !G.outro.playing, 3000));
check('the whole game\'s result', await until(() => !$('result').classList.contains('hidden'), 4000) && $('stat-bosses').textContent.includes('4/4'), $('result-stats').textContent.replace(/\s+/g, ' '));
await wait(500); await once('full-23-result');
$('btn-continue').click();
check('계속 탐험하기: the camp, playing on', await until(() => G.mode === 'play' && X.area?.id === 'camp', 6000));
legs.push(['region 4 in all', +(G.run.time - t4).toFixed(1)]);

// ---- W5: after the ending, the purple shard on the king's platform
const tp = G.run.time;
check('the purple shard waits on the king\'s platform', !!X.secrets.shard?.alive);
const lift4 = G.interactables.find((it) => it.kind === 'lift' && Math.hypot(it.pos.x - D.lift4.camp[0], it.pos.z - D.lift4.camp[1]) < 1);
let crystalLifted = false;
G.on('crystalLift', () => { crystalLifted = true; });
await leg('to the crystal lift on the balcony', lift4.pos.clone(), 2.5);
for (let k = 0; k < 6 && !crystalLifted && G.mode === 'play'; k++) { await clickAt(lift4.pos.clone().setY(lift4.pos.y + 0.8)); await until(() => G.mode === 'cutscene', 3000); }
check('the crystal lift down to the heart\'s platform', await until(() => crystalLifted && Math.abs(P.position.y - Y(-112)) < 1.5, 15000), pos());
const stars5 = S.stars;
check('the crystal lift sets the hero down off its pad', flat(P.position, V3(D.lift4.heart[0], 0, D.lift4.heart[1])) > 2.5, pos());
G.cam.rig.distance = 18; await wait(1200); await once('full-24a-shard-waiting'); G.cam.rig.distance = 30;
await travel(X.secrets.shard.pos.clone(), { near: 0.6, ms: 40000 });
check('the purple shard: the codex\'s last page and a last star', await until(() => S.world.shard, 5000) && S.seen.purpleShard && S.stars >= stars5 + 1, S.stars);
await wait(1500); await once('full-24-purple-shard');
legs.push(['the purple shard', +(G.run.time - tp).toFixed(1)]);

// ---- the numbers
const save = JSON.parse(localStorage.getItem(G.saveKey ?? 'secret-cave-save-v1'));
check('saved: the necklace, the camp, the chief, the queen, the Ice Bear, the Crystal King, the shortcut, the lifts, four stars, the win', save.necklace && save.world.camp && save.world.bosses.rabbitChief && save.world.bosses.mushroomQueen && save.world.bosses.iceBear && save.world.bosses.crystalKing && save.world.gates.shortcut && save.world.gates.lift && save.world.gates.lift3 && save.world.gates.lift4 && earned() >= 4 && save.wins >= 1 && save.world.won >= 1, JSON.stringify({ n: save.necklace, c: save.world.camp, s: save.stars, w: save.wins }));
check('the bot never ran out of hearts', bot.minHearts > 0 && fainted === 0, `min ${bot.minHearts}`, `hits ${bot.stats.hits}`, `faints ${fainted}`);
check('game clock ≤ 45 min', G.run.time <= 2700, `${(G.run.time / 60).toFixed(2)} min of play`, `${((performance.now() - t0) / 1000).toFixed(0)} s real`);
log.push(['INFO', 'king laser', `${laserHits} hits of ${lasers} sweeps`, 'grades', JSON.stringify(G.run.grades), 'codex', Object.keys(S.seen).length]);
log.push(['INFO', 'time', `${(G.run.time / 60).toFixed(2)} min`, 'min hearts', bot.minHearts, 'faints', fainted, 'stars earned', earned(), 'left', S.stars, 'asleep', G.run.asleep, 'shards', G.run.shards, 'legs', JSON.stringify(legs)]);
log.push(['INFO', 'bot', JSON.stringify(bot.stats), 'hurt', JSON.stringify(bot.events.slice(0, 40))]);
return log;
