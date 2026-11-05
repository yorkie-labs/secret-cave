// W7: items, on the test world's flat upper plateau (the old M3 check,
// m3-items.js, ran only in M1's fixed cave and took its items from the
// seed-3 chests; the chest loot is unit-tested, so here the items are
// dropped on the floor with G.dropLoot and walked over). Run with
// GAME_URL='http://localhost:5191/?world=test&seed=3'.
// The starting bag (hammer, water gun; no shield, no herbs) → 3 without a
// shield does nothing → walk over a shield → hold 3 facing a wolf (spawned
// with G.spawnEnemy): the bite clangs off, no damage; let go: 4 s cooldown,
// the slot sweeps → from behind it still bites → behind the shield the hero
// walks at half speed, the hold runs out after 2 s → walk over the vine → Q
// cycles water gun ↔ vine → a dry wolf is bound ~3 s, 8 s cooldown → water,
// then the vine: ~5 s → a bound wolf is hammered to sleep → herbs: the belt
// takes 3 ("pouch full"), 4 at full hearts says so, eat (1 s) → +2 hearts,
// capped at 5, a bite mid-meal spoils it → a new run: the starting bag again.
const canvas = G.renderer.domElement;
const screenOf = (v) => { const p = v.clone().project(G.camera); const r = canvas.getBoundingClientRect(); return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; };
const mouse = (type, v, button = 0, extra = {}) => { const [x, y] = screenOf(v); canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button, ...extra })); };
const click = async (v, button = 0) => { mouse('mousemove', v); await wait(120); mouse('mousedown', v, button); await wait(60); dispatchEvent(new MouseEvent('mouseup', { button })); };
const key = (code, type = 'keydown') => dispatchEvent(new KeyboardEvent(type, { code }));
const V = (x, z, up = 0) => new THREE.Vector3(x, G.groundAt(x, z) + up, z); // a point on the plateau
const at = (e, up = 0.5) => e.pos.clone().setY(e.pos.y + up); // (an animal's body, for the cursor)
const until = async (test, ms = 8000, step = 16) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (test()) return true; await wait(step); } return false; };
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r2 = (v) => +v.toFixed(2);
const $ = (id) => document.getElementById(id);

const events = [];
for (const ev of ['hurt', 'enemyBite', 'shieldBlock', 'shieldUp', 'shieldDown', 'itemGot', 'enemyBound', 'vineBind', 'healed', 'toolChanged', 'enemyAsleep']) {
  G.on(ev, (d) => events.push({ t: G.time, ev, action: P.state.action?.name, hearts: G.run.hearts, ...(d && typeof d === 'object' && !d.isVector3 ? { item: d.item, blocked: d.blocked, hurt: d.hurt, inside: d.inside, secs: d.secs, wet: d.wet } : {}) }));
}
const last = (ev) => events.filter((e) => e.ev === ev).at(-1);
const count = (ev) => events.filter((e) => e.ev === ev).length;
const toastSeen = [];
new MutationObserver(() => toastSeen.push($('toast').textContent)).observe($('toast'), { childList: true, characterData: true, subtree: true });
// a drop on the floor (it flies out first), then a click on it: walk over it
async function take(item, dx = 2.4, dz = 0) {
  G.dropLoot(item, { x: P.position.x + dx, z: P.position.z + dz });
  await wait(800);
  const p = G.pickups.find((q) => q.item === item);
  if (p) await click(p.model.position);
  return p;
}

await start(); await wait(600);
// the basin's own two wolves sleep through this (far below, held still)
for (const e of G.enemies) e.update = () => {};
const w1 = G.spawnEnemy({ kind: 'wolf', x: 32, z: 40, heading: -Math.PI / 2 });
const w1update = w1.update;
const freeze = () => { w1.update = () => {}; };
const thaw = () => { w1.update = w1update; };
freeze();
check('a run starts with the hammer and the water gun; no shield, no herbs', JSON.stringify(G.run.owned) === '["hammer","waterGun"]' && G.run.tool === 'waterGun' && G.run.herbs === 0, JSON.stringify(G.run.owned));
check('HUD: R shows the water gun, the shield slot is dim, the belt shows x0', $('skill-right').textContent.includes('💧') && $('slot-3').classList.contains('locked') && $('slot-4').textContent.includes('x0'));
key('Digit3'); await wait(50); key('Digit3', 'keyup');
check('3 without a shield: nothing comes up (it says so)', !G.shield.up && !P.state.shield && toastSeen.some((t) => t.includes('방패는 아직 없어요')), toastSeen.at(-1));

// --- 1. the shield on the floor: walk over it (and see the normal walking speed)
const shieldLoot = await take('shield', 0, 3);
let walkSpeed = 0;
await until(() => { walkSpeed = Math.max(walkSpeed, P.state.speed); return G.run.owned.includes('shield'); }, 6000);
const got1 = last('itemGot');
check('walk over: the shield is taken (pickup animation, toast)', !!shieldLoot && G.run.owned.includes('shield') && got1?.item === 'shield' && P.state.action?.name === 'pickup' && toastSeen.some((t) => t.includes('방패를 얻었어요')), got1?.action, toastSeen.at(-1));
await wait(300);
check('HUD: the shield slot lights up', !$('slot-3').classList.contains('locked'));

// --- 2. the shield against a wolf bite
await go(w1.pos.x - 5, w1.pos.z);
P.state.heading = Math.PI / 2;
mouse('mousemove', at(w1));
thaw();
await until(() => w1.state === 'windup' && w1.t > 0.1, 10000);
mouse('mousemove', at(w1));
const hearts0 = G.run.hearts, hurts0 = count('hurt');
key('Digit3');
await wait(60);
check('3 held: the shield comes up (mesh out, HUD slot lit)', G.shield.up && P.state.shield && P.model.userData.rig.shield.visible && $('slot-3').classList.contains('up'));
await until(() => count('enemyBite') && last('enemyBite').t > G.time - 0.05, 3000);
await wait(60);
await shot('w7-items-shield-block');
const bite = last('enemyBite');
check('a bite into the raised shield is blocked: no damage', !!bite && bite.blocked && !bite.hurt && G.run.hearts === hearts0 && count('hurt') === hurts0, JSON.stringify(bite), G.run.hearts);
check('…clang and sparks', count('shieldBlock') >= 1);
// let go: 4 s cooldown from release
key('Digit3', 'keyup');
await wait(50);
check('let go: the shield comes down, 4 s cooldown starts', !G.shield.up && !P.state.shield && G.shield.state.cooldown > 3.8, r2(G.shield.state.cooldown));
key('Digit3'); await wait(50);
check('…3 again during the cooldown does nothing (the slot shows the sweep)', !G.shield.up && Number($('slot-3').querySelector('.cd').dataset.p) > 0.8, $('slot-3').querySelector('.cd').dataset.p);
key('Digit3', 'keyup');
freeze();
const cd0 = G.time;
await until(() => G.shield.state.cooldown === 0, 5000);
check('…the cooldown is 4 s', Math.abs(G.time - cd0 - 3.9) < 0.3, r2(G.time - cd0 + 0.1) + ' s');
// from behind it does not help
P.state.invulnerable = 0;
await go(w1.pos.x - 1.6, w1.pos.z); // (in reach: the next bite is sure to land)
thaw();
await until(() => w1.state === 'windup' && w1.t > 0.2, 10000);
// the cursor (and so the shield) points away from the wolf
mouse('mousemove', V(P.position.x - 3, P.position.z));
key('Digit3');
const hurtsB = count('hurt');
await until(() => count('enemyBite') && last('enemyBite').t > G.time - 0.05, 3000);
await wait(60);
const bite2 = last('enemyBite');
check('a bite from behind the shield still lands', G.shield.up && bite2.inside && !bite2.blocked && count('hurt') === hurtsB + 1, JSON.stringify(bite2), G.run.hearts);
// hold too long: it drops after 2 s by itself (walking meanwhile: slowly)
freeze();
const upAt = last('shieldUp')?.t;
await wait(100);
await click(V(P.position.x - 3, P.position.z));
await wait(400);
const slowSpeed = P.state.speed;
// (a click-walk runs at 6 m/s; behind the shield only a walk, at half the 4 m/s walk)
check('behind the shield the hero walks at half speed (2 m/s, not the 6 m/s click run)', P.state.shield && slowSpeed > 1.8 && slowSpeed <= 2.05 && walkSpeed > 3.9, r2(slowSpeed), 'm/s, without the shield', r2(walkSpeed));
await until(() => !G.shield.up, 3000);
check('held past 2 s: the shield drops by itself', !G.shield.up && G.time - upAt >= 1.9 && G.time - upAt <= 2.25, r2(G.time - upAt) + ' s');
key('Digit3', 'keyup');
check('…and the cooldown runs from the timeout', G.shield.state.cooldown > 3.5, r2(G.shield.state.cooldown));
G.run.hearts = 5; G.hud.update(G.run);

// --- 3. the vine on the floor
G.pointer.cancel(); await wait(300);
await take('vine', 0, 2.4);
await until(() => G.run.owned.includes('vine'), 6000);
check('walk over: the vine is taken; toast says how to use it', G.run.owned.includes('vine') && toastSeen.some((t) => t.includes('덩굴을 얻었어요') && t.includes('Q')), toastSeen.at(-1));
await wait(100);
check('a new tool is selected straight away; HUD R shows 🌿, Q row shows 💧', G.run.tool === 'vine' && $('skill-right').textContent.includes('🌿') && $('tool-others').textContent.includes('💧'));
key('KeyQ'); await wait(80);
const afterQ1 = G.run.tool;
const rIcon1 = $('skill-right').textContent;
key('KeyQ'); await wait(80);
check('Q cycles the owned tools: vine → water gun → vine', afterQ1 === 'waterGun' && rIcon1.includes('💧') && G.run.tool === 'vine' && $('skill-right').textContent.includes('🌿'), afterQ1, G.run.tool);

// --- 4. the vine binds a dry wolf ~3 s
const throwVine = async () => { mouse('mousemove', at(w1)); await wait(30); mouse('mousedown', at(w1), 2); await wait(40); dispatchEvent(new MouseEvent('mouseup', { button: 2 })); };
// a fresh wolf at home, the hero 4.5 m off; then it chases in
async function freshChase(off = 4.5) {
  w1.reset(); freeze();
  P.state.invulnerable = 0;
  await go(w1.pos.x - off, w1.pos.z);
  thaw();
  await until(() => w1.state === 'chase', 6000);
}
await freshChase();
await until(() => flat(w1.pos, P.position) < 4.5, 3000);
check('the wolf is dry', G.time >= w1.wetUntil);
await throwVine();
check('right click throws the vine (throw animation)', P.state.action?.name === 'throw', P.state.action?.name);
await until(() => w1.state === 'bound', 1500);
const boundAt = G.time;
check('the vine binds the wolf', w1.state === 'bound' && last('vineBind')?.secs === 3 && !last('vineBind')?.wet, JSON.stringify(last('vineBind')));
await wait(150);
check('…cooldown starts: the R icon sweeps dark', G.vine.cooldown > 0.9 && Number($('skill-right').querySelector('.cd').dataset.p) > 0.9, r2(G.vine.cooldown));
await wait(450);
await shot('w7-items-vine-bound');
const boundPos = w1.pos.clone();
check('bound: the vine wraps it, it stands still', w1.wrap.visible && w1.state === 'bound');
await until(() => w1.state !== 'bound', 6000);
const dry = G.time - boundAt;
check('…for ~3 s (dry), then chases again', Math.abs(dry - 3) < 0.25 && ['chase', 'windup'].includes(w1.state) && flat(w1.pos, boundPos) < 0.05, r2(dry) + ' s', w1.state);
// right click again during the cooldown: nothing thrown
await throwVine();
check('during the 8 s cooldown the vine is not thrown', P.state.action?.name !== 'throw' && G.vine.cooldown > 0, r2(G.vine.cooldown * 8) + ' s left');
freeze();
await until(() => G.vine.ready, 8000);
const vineCd = G.time - boundAt;
check('…the vine is back 8 s after the throw', vineCd > 7.6 && vineCd < 8.6, r2(vineCd) + ' s after the bind');

// --- 5. water first, then the vine: ~5 s
await freshChase();
key('KeyQ'); await wait(60); // water gun
check('Q: the water gun again', G.run.tool === 'waterGun', G.run.tool);
mouse('mousemove', at(w1)); await wait(30); mouse('mousedown', at(w1), 2); await wait(40); dispatchEvent(new MouseEvent('mouseup', { button: 2 }));
await until(() => G.time < w1.wetUntil, 1500);
await wait(50);
check('water hits: the wolf is wet (a drop over its head)', G.time < w1.wetUntil && w1.wetSprite.visible, r2(w1.wetUntil - G.time));
key('KeyQ'); await until(() => !P.state.action && P.state.cooldown <= 0, 1000); // the vine, once the shot is done
await throwVine();
await until(() => w1.state === 'bound', 1500);
const wetAt = G.time;
check('the vine binds the wet wolf for 5 s', last('vineBind')?.secs === 5 && last('vineBind')?.wet, JSON.stringify(last('vineBind')));
await until(() => w1.state !== 'bound', 8000);
const wetFor = G.time - wetAt;
check('…bound ~5 s (wet)', Math.abs(wetFor - 5) < 0.25, r2(wetFor) + ' s');

// --- 6. a bound wolf is hammered to sleep
freeze();
await until(() => G.vine.ready, 9000);
await freshChase(4);
await throwVine();
await until(() => w1.state === 'bound', 1500);
const hpB = w1.hp;
mouse('mousemove', at(w1)); await wait(100);
mouse('mousedown', at(w1));
await until(() => w1.hp < hpB, 4000);
check('the hammer lands on a bound wolf; it stays bound', w1.hp < hpB && w1.state === 'bound', r2(hpB), '→', r2(w1.hp), w1.state);
await until(() => w1.state === 'asleep', 4000);
dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
check('three hits put the bound wolf to sleep before the vine lets go', w1.state === 'asleep' && !w1.wrap.visible, w1.state);
await wait(600);

// --- 7. herbs
G.pointer.cancel();
await go(P.position.x - 3, P.position.z); // (away from the sleeping wolf and its shard)
const herbAt = V(P.position.x, P.position.z + 2.4);
for (let i = 0; i < 4; i++) G.dropLoot('herb', herbAt.clone().add(new THREE.Vector3((i % 2) * 0.3, 0, Math.floor(i / 2) * 0.3)));
await wait(800);
await click(herbAt);
await until(() => G.run.herbs === 3, 6000);
await wait(1500);
check('the belt takes 3 herbs; the 4th stays on the floor', G.run.herbs === 3 && G.pickups.filter((p) => p.item === 'herb').length === 1, G.run.herbs);
check('…"the pouch is full"', toastSeen.some((t) => t.includes('약초 주머니가 가득')), toastSeen.at(-1));
check('HUD belt shows x3', $('slot-4').textContent.includes('x3') && !$('slot-4').classList.contains('empty'));
await go(P.position.x - 2.5, P.position.z); // off the 4th herb
G.run.hearts = 5; G.hud.update(G.run);
await wait(400);
await shot('w7-items-hud');
key('Digit4'); await wait(80);
check('4 with full hearts: not eaten, 하트가 가득해요', G.run.herbs === 3 && P.state.action?.name !== 'eat' && toastSeen.some((t) => t.includes('하트가 가득')), toastSeen.at(-1));
// a bite
P.state.invulnerable = 0;
P.hurt(w1.pos, 2.5);
await wait(800);
check('hurt: 5 → 2.5 hearts', G.run.hearts === 2.5, G.run.hearts);
key('Digit4');
const eatFrom = G.time;
await wait(400);
check('4: the hero eats (1 s, standing still), hearts not yet up', P.state.action?.name === 'eat' && G.run.hearts === 2.5 && P.model.userData.rig.herb.visible, P.state.action?.name);
await shot('w7-items-eat');
await until(() => last('healed'), 2000);
check('…after 1 s', !!last('healed') && Math.abs(last('healed').t - eatFrom - 1) < 0.12, r2((last('healed')?.t ?? 0) - eatFrom) + ' s');
check('…eaten up: +2 hearts (2.5 → 4.5), one herb used', G.run.hearts === 4.5 && G.run.herbs === 2 && $('heart-num').textContent === '4½/5' && $('slot-4').textContent.includes('x2'), G.run.hearts, G.run.herbs);
await wait(300);
key('Digit4');
await until(() => G.run.herbs === 1, 2000);
await wait(100);
check('another herb at 4.5: capped at 5', G.run.hearts === 5 && G.run.herbs === 1, G.run.hearts);
// a bite mid-meal spoils nothing
P.hurt(w1.pos, 1); await wait(800);
key('Digit4'); await wait(300);
P.state.invulnerable = 0; P.hurt(w1.pos, 0.5); await wait(900);
check('bitten mid-meal: no heal, the herb stays', G.run.hearts === 3.5 && G.run.herbs === 1, G.run.hearts, G.run.herbs);

// --- 8. a new run: the bag as it started
G.restartRun({ seed: 3 }); await wait(300);
check('a new run: starting bag, loot gone, the shield slot dim', JSON.stringify(G.run.owned) === '["hammer","waterGun"]' && G.run.herbs === 0 && G.run.tool === 'waterGun' && !G.pickups.some((p) => p.kind === 'loot') && $('slot-3').classList.contains('locked'), JSON.stringify(G.run.owned));
return log;
