// M6a: the bat merchant's shop and the mask (GDD §6.3, §7.3). W2: in the big
// world (the merchant at the camp), GAME_URL='http://localhost:5191/?start=mushroom&seed=4'.
// Checked: the camp's stall holds the bat merchant; Space next to it opens
// the shop (the world holds still); buying spends crystal shards and gives
// the goods (the HUD follows); not enough shards, a full herb belt, full
// hearts: no sale and the merchant says why; a tool bought leaves the
// shelf; Esc closes it. Then the mask bought there: Q reaches it, right
// click puts it on (a fox face on the Maltese), animals notice the hero
// from a third as far, it comes off by itself after 5 s and needs 20 s
// before it goes on again; the first hammer from behind it hits twice as
// hard and takes it off; the water gun takes it off too.
const X = G.expedition;
const $ = (id) => document.getElementById(id);
const until = async (test, ms = 8000, step = 30) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (test()) return true; await wait(step); } return false; };
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const V = (x, z) => new THREE.Vector3(x, G.groundAt?.(x, z) ?? 0, z);
const key = (code, type = 'keydown') => dispatchEvent(new KeyboardEvent(type, { code }));
const tap = async (code) => { key(code); key(code, 'keyup'); await wait(120); };
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const ev = [];
for (const name of ['shopOpen', 'shopClose', 'shopBuy', 'shopNo', 'maskOn', 'maskOff', 'maskAmbush', 'enemyHit']) G.on(name, (e) => ev.push({ name, at: G.time, e }));
const buyBtn = (id) => $('shop-goods').querySelector(`[data-id="${id}"]`);
const click = async (el) => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); await wait(150); };

await start(); await wait(700);
let merchant;
// W2: the bat merchant keeps the camp's stall
X.jump('camp'); await wait(600);
merchant = X.merchant;
check('the bat merchant stands at the camp (the big world)', !!merchant && !!G.scene.getObjectByName('merchant') && G.world.areaAt(merchant.pos.x, merchant.pos.z)?.id === 'camp');
await go(merchant.front.x, merchant.front.z); await wait(400);
while (G.hud.inDialog) { G.hud.advanceDialog(); await wait(100); }
await shot('m6a-shop-merchant');
check('near it: a prompt to talk to the merchant', $('prompt').textContent.includes('박쥐 상인'), $('prompt').textContent);
G.run.shards = 0; G.run.herbs = 0; G.refresh(); // (the big world's preset bag holds a herb)
await tap('Space');
check('Space opens the shop: goods with prices, the hero\'s shards', !$('shop').classList.contains('hidden') && $('shop-goods').querySelectorAll('.good').length >= 4 && $('shop-shards').textContent.includes('0'), $('shop-goods').textContent.replace(/\s+/g, ' ').slice(0, 160));
const t0 = G.time;
await wait(500);
check('the world holds still while it is open', G.mode === 'menu' && G.time === t0, G.mode);
await click(buyBtn('herb'));
check('no shards: no herb, and the merchant says why', G.run.herbs === 0 && $('shop-say').textContent.includes('모자라요') && ev.some((e) => e.name === 'shopNo' && e.e.reason === 'shards'), $('shop-say').textContent);
await tap('Escape');
check('Esc closes it', $('shop').classList.contains('hidden') && G.mode === 'play');
G.run.shards = 20; G.refresh();
await tap('Space');
check('back again: the merchant remembers', !$('shop').classList.contains('hidden') && $('shop-say').textContent.includes('또'), $('shop-say').textContent);
await click(buyBtn('herb'));
check('a herb for 3 shards: in the belt, on the HUD', G.run.herbs === 1 && G.run.shards === 17 && $('slot-4').textContent.includes('x1') && $('shop-shards').textContent.includes('17'), G.run.shards);
await click(buyBtn('mask'));
check('the mask for 6: owned, picked as the tool, off the shelf', G.run.owned.includes('mask') && G.run.tool === 'mask' && G.run.shards === 11 && !buyBtn('mask') && $('skill-right').textContent.includes('🎭'), G.run.shards);
G.run.herbs = 3;
await click(buyBtn('herb'));
check('a full herb belt: no sale ("가득")', G.run.herbs === 3 && G.run.shards === 11 && $('shop-say').textContent.includes('가득'), $('shop-say').textContent);
await click(buyBtn('heart'));
check('full hearts: no heart potion', G.run.hearts === G.run.maxHearts && G.run.shards === 11);
G.run.hearts = 2.5;
await click(buyBtn('heart'));
check('2½ hearts: a heart potion for 4 → 4½', G.run.hearts === 4.5 && G.run.shards === 7, G.run.hearts);
await wait(300);
await shot('m6a-shop-dialog');
await tap('Escape');
check('in the codex: the mask', !!G.state.seen.mask);

// ---- the mask
let fight;
// a pack with a wolf (W2: anywhere in the world; the expedition re-rolled till one has)
const find = () => [...X.spots.values()].find((r) => r.enemies.some((e) => e.kind === 'wolf'));
for (let k = 0; k < 12 && !find(); k++) X.startExpedition();
fight = find();
for (const r of X.spots.values()) if (r !== fight) for (const e of r.enemies) { e.dormant = true; e.model.visible = false; }
X.jump(fight.spot.id); await wait(600);
const wolf = fight.enemies.find((e) => e.kind === 'wolf');
for (const e of fight.enemies) if (e !== wolf) { e.dormant = true; e.model.visible = false; }
G.run.hearts = 5; G.refresh();
// a spot 5 m from the wolf, in sight
let spot = null;
for (let a = 0; a < Math.PI * 2 && !spot; a += 0.3) { const c = V(wolf.pos.x + Math.cos(a) * 5, wolf.pos.z + Math.sin(a) * 5); const r = G.nav.lineReach(wolf.pos, c); if (r && flat(r, c) < 0.6) spot = c; }
await go(spot.x, spot.z);
wolf.calm = 0;
face(wolf.pos.x, wolf.pos.z);
check('Q: water gun → vine? → mask (the mask is in the cycle)', G.run.tool === 'mask');
const tOn = G.time;
G.useTool();
await wait(100);
check('right click: the mask goes on (a fox face on the Maltese)', G.mask.active && P.model.getObjectByName('maskFace').visible && ev.some((e) => e.name === 'maskOn'));
await wait(300);
await shot('m6a-mask-on');
await wait(1500);
check('5 m from a wolf in disguise: it does not notice (detect × 1/3)', wolf.state === 'idle' && Math.abs(G.mask.scale - 1 / 3) < 1e-6, wolf.state, flat(wolf.pos, P.position).toFixed(1));
check('it comes off by itself after 5 s', await until(() => !G.mask.active, 5000) && G.time - tOn >= 4.9 && G.time - tOn < 5.6, (G.time - tOn).toFixed(2));
check('…and then the wolf notices', await until(() => wolf.state !== 'idle', 3000), wolf.state);
check('20 s before it can go on again (the tool sweep shows it)', !G.mask.ready && G.useTool() === false && G.mask.cooldown > 0.9, G.mask.cooldown.toFixed(2));
// the ambush: from behind the mask, the first hammer hits twice as hard
wolf.reset?.(); wolf.calm = 2;
G.mask.state.cooldown = 0;
let behind = null;
for (let a = 0; a < Math.PI * 2 && !behind; a += 0.3) { const c = V(wolf.pos.x + Math.cos(a) * 1.4, wolf.pos.z + Math.sin(a) * 1.4); const r = G.nav.lineReach(wolf.pos, c); if (r && flat(r, c) < 0.6) behind = c; }
await go(behind.x, behind.z);
face(wolf.pos.x, wolf.pos.z);
G.useTool(); await wait(150);
const hp0 = wolf.hp, tA = G.time;
await swing(wolf.pos.x, wolf.pos.z);
const hit = ev.find((e) => e.name === 'enemyHit' && e.at >= tA && e.e.enemy === wolf);
check('the first hammer from behind the mask: × 2', !!hit && hit.e.damage === 2 && Math.abs(wolf.hp - (hp0 - 2)) < 1e-6 && ev.some((e) => e.name === 'maskAmbush' && e.at >= tA), hit?.e.damage, wolf.hp);
check('…and the attack takes the mask off', !G.mask.active && ev.some((e) => e.name === 'maskOff' && e.at >= tA && e.e.reason === 'attack'));
// the water gun takes it off too
G.mask.state.cooldown = 0;
G.useTool(); await wait(100);
const tW = G.time;
G.waterGun.fire(); await wait(150);
check('a water shot takes it off too', !G.mask.active && ev.some((e) => e.name === 'maskOff' && e.at >= tW && e.e.reason === 'attack'));
return log;
