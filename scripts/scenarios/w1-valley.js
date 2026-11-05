// @bot
// W1 (tasks/20261102-world-redesign-todo.md): the big world's first hour,
// played through real input by the scripted bot. GAME_URL='http://localhost:5191/?seed=7'.
// A fresh save: the hero drops into the sinkhole, takes the necklace, the
// entrance's gate opens; down the valley's steps on foot (0 → −8 → −16 →
// −24, by the ramps, fighting what wakes); over the viaduct across the gorge
// to the camp (found and kept); the spring, the merchant, the codex stone.
// Then out again: shards found, a faint → the hero wakes at the camp with
// half of this expedition's shards; a new expedition re-rolls the spots.
const X = G.expedition, W = G.world, D = W.def, S = G.state;
// (W6: hand-written points are in the design frame; the layout squeezes them into the world)
const M = (u, v) => G.world?.def.M ? G.world.def.M(u, v) : [(u + v) * Math.SQRT1_2, (v - u) * Math.SQRT1_2];
// (W6: a design depth in the world, as the layout's H gives it)
const Y = (y) => (G.world?.def.H ? G.world.def.H(y) : y);
const $ = (id) => document.getElementById(id);
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const until = async (test, ms = 8000, step = 40) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (test()) return true; await wait(step); } return false; };
const r1 = (v) => +v.toFixed(1);
const at = (u, v) => { const [x, z] = M(u, v); return V3(x, gy(x, z), z); };
const level = () => r1(P.position.y);
let falls = 0;
G.on('fell', () => falls++);
const t0 = performance.now();

// ---- a fresh save: the drop through the sinkhole
check('a fresh save: no necklace, the world not started', !S.necklace && !S.world.started && !S.world.camp);
await start();
let peak = P.position.y;
for (let k = 0; k < 20; k++) { peak = Math.max(peak, P.position.y); await wait(50); }
check('new game: the hero drops in from above the sinkhole', peak > 6, r1(peak));
await until(() => Math.abs(P.position.y - 0) < 0.6 && P.state.grounded, 6000);
check('…and lands on its mossy floor at 0 m', Math.abs(P.position.y) < 0.6, pos());
await until(() => $('area-name').textContent.length > 0, 2000);
check('the HUD names the place', $('area-name').textContent === '동굴 입구', $('area-name').textContent);
check('the minimap is on (round, top right)', getComputedStyle($('minimap')).display !== 'none' && !document.body.classList.contains('no-map'));
const gate = X.gates.entrance;
check('the necklace lies there; the gate waits for it', !!X.necklace?.alive && !gate.open);
await wait(1200);
await shot('w1v-01-landed');

// ---- the necklace: the gate opens
await clickAt(X.necklace.pos.clone().setY(X.necklace.pos.y + 0.7));
check('taken by walking up to it: kept in the save', await until(() => S.necklace, 10000));
check('the old letters read the line', await until(() => G.hud.inDialog && $('dialog-text').textContent.includes('가장 깊은 곳'), 4000));
while (G.hud.inDialog) { keyTap('Space'); await wait(250); }
check('then the entrance\'s gate sinks away', await until(() => gate.open, 5000));

// ---- down the valley's steps, on foot
const stepTo = async (name, u, v, want) => {
  const ok = await travel(at(u, v), { near: 3, ms: 150000 });
  check(`on foot to ${name} (${want} m)`, ok && Math.abs(P.position.y - want) < 0.8, pos(), $('area-name').textContent, `min hearts ${bot.minHearts}`);
  return ok;
};
await stepTo('the upper step', -96, 290, Y(-8));
check('the valley\'s name on the HUD', $('area-name').textContent.startsWith('이끼 계곡'), $('area-name').textContent);
await stepTo('the middle step', -108, 210, Y(-16));
await shot('w1v-02-mid-step');
await stepTo('the lowest step by the gorge', -110, 122, Y(-24));
check('no falls off a cliff on the way', falls === 0, falls);

// ---- over the viaduct to the camp
const via = W.bridges.find((b) => b.id === 'viaduct');
const ys = [];
const track = setInterval(() => { const d = W.deckAt(P.position.x, P.position.z); if (d && W.heightAt(P.position.x, P.position.z) < d.y - 3) ys.push(Math.abs(P.position.y - d.y)); }, 50);
const camp = V3(...D.camp.at.slice(0, 1), 0, 0);
const campAt = V3(D.camp.at[0], gy(...D.camp.at), D.camp.at[1]);
void camp;
const reached = await travel(campAt, { near: 3, ms: 150000 });
clearInterval(track);
check('walked over the viaduct, on its deck', ys.length > 20 && Math.max(...ys) < 0.6, ys.length, r1(Math.max(0, ...ys)));
check('found the camp at −30 m', reached && S.world.camp && Math.abs(P.position.y - Y(-30)) < 0.8, pos(), $('area-name').textContent);
await wait(600);
await shot('w1v-03-camp-found');
while (G.hud.inDialog) { keyTap('Space'); await wait(250); }
void via;

// ---- the camp: spring, merchant, codex stone
G.run.hearts = 2; G.hud.update(G.run);
for (let k = 0; k < 15 && G.run.hearts < G.run.maxHearts; k++) { await clickAt(X.spring.pos.clone().setY(X.spring.pos.y + 0.3)); await wait(700); }
check('the camp\'s spring heals every heart', G.run.hearts === G.run.maxHearts, G.run.hearts);
for (let k = 0; k < 15 && !G.shop.isOpen; k++) { await clickAt(X.merchant.pos.clone().setY(X.merchant.pos.y + 1.5)); await wait(700); }
check('the bat merchant opens his shop', G.shop.isOpen);
await shot('w1v-04-shop');
if (G.shop.isOpen) { keyTap('Escape'); await wait(300); }
const codexAt = V3(D.camp.codex[0], gy(...D.camp.codex), D.camp.codex[1]);
for (let k = 0; k < 4 && !G.codex.isOpen; k++) { await clickAt(codexAt.clone().setY(codexAt.y + 0.3)); await until(() => G.codex.isOpen, 6000); }
check('the codex stone opens the codex (what has been met)', G.codex.isOpen && Number($('codex-count').textContent.split('/')[0]) >= 3 && $('codex-grid').querySelectorAll('.entry img').length > 0 /* (W5: the codex book, a page at a time) */, $('codex-count').textContent);
await shot('w1v-05-codex');
if (G.codex.isOpen) { keyTap('Escape'); await wait(300); }
check('nothing left open: back to play', G.mode === 'play', G.mode);

// ---- out again: shards found, then a faint
const n0 = X.n;
const rolls0 = JSON.stringify(X.rolls.map((r) => [r.kind, r.enemies.map((e) => e.kind)]));
// (W6: on the viaduct, wherever the layout put it: a third of the way from
// its valley end, out of the camp's name on the map)
const viaMid = () => { const b = G.world.bridges.find((q) => q.id === 'viaduct'); return V3(b.a[0] + (b.b[0] - b.a[0]) / 3, b.y0, b.a[1] + (b.b[1] - b.a[1]) / 3); };
check('out of the camp to the viaduct\'s middle', await travel(viaMid(), { near: 3 }), pos(), X.area?.id);
check('leaving the camp sets out this expedition\'s shard count', S.world.departShards === G.run.shards, S.world.departShards, G.run.shards);
const before = G.run.shards;
for (let k = 0; k < 8; k++) G.dropShard({ x: P.position.x + Math.cos(k) * 0.4, z: P.position.z + Math.sin(k) * 0.4 });
await until(() => G.run.shards >= before + 8, 4000);
const carried = G.run.shards;
check('eight shards found out here', carried === before + 8, carried);
let woke = null;
G.on('woke', (e) => { woke = e; });
G.onHurt(9);
check('out of hearts: the hero faints', G.fainted);
check('…and wakes at the camp', await until(() => !!woke && G.mode === 'play', 12000) && S.world.camp && Math.hypot(P.position.x - D.camp.at[0], P.position.z - D.camp.at[1]) < 3, pos());
check('with every heart', G.run.hearts === G.run.maxHearts, G.run.hearts);
check('half of this expedition\'s shards lost (rounded down), the rest kept', G.run.shards === carried - 4 && woke.lost === 4, `${carried} → ${G.run.shards}`);
check('the necklace, the camp and the open gate stay', S.necklace && S.world.camp && gate.open);
await wait(800);
await shot('w1v-06-woke-at-camp');
check('a new expedition: its spots re-rolled', X.n === n0 + 1 && JSON.stringify(X.rolls.map((r) => [r.kind, r.enemies.map((e) => e.kind)])) !== rolls0, n0, X.n);

// ---- each return to the camp is a new expedition
const n1 = X.n;
await travel(at(-67, 65), { near: 3 });
await travel(campAt, { near: 3 });
check('out and back to the camp: another new expedition', await until(() => X.n === n1 + 1, 3000), n1, X.n);
const saved = JSON.parse(localStorage.getItem(G.saveKey ?? 'secret-cave-save-v1'));
check('the save keeps the world: camp, necklace, expedition, the bag', saved.world.camp && saved.necklace && saved.world.expedition === X.n && saved.world.bag?.shards === G.run.shards, JSON.stringify({ camp: saved.world.camp, n: saved.world.expedition, bag: saved.world.bag }));
check('the fog of war is kept in the save', (saved.world.fog ?? '').length > 100, (saved.world.fog ?? '').length);

// ---- the maps
G.map.toggle(true); await wait(500);
await shot('w1v-07-tabmap');
check('Tab opens the map', !$('map').classList.contains('hidden'));
G.map.toggle(false);
check('the bot never ran out of hearts in a fight', bot.minHearts > 0, bot.minHearts);
log.push(['INFO', 'time', `${(G.run.time / 60).toFixed(2)} min of play`, `${((performance.now() - t0) / 1000).toFixed(0)} s real`, 'bot', JSON.stringify(bot.stats)]);
return log;
