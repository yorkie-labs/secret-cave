// W7: fighting, on the test world's flat upper plateau (the old M2 check,
// m2-combat.js, ran only in M1's fixed cave). Run with
// GAME_URL='http://localhost:5191/?world=test&seed=3'.
// A wolf spawned (G.spawnEnemy) 16 m south of the spawn (22, 40) idles while
// the hero is far → the hero walks up by clicks → ❗ then a chase → a red
// mark on the floor before every bite (for at least the windup) → a bite
// takes half a heart and leaves 0.7 s of blinking (no second hurt inside it)
// → rolling through a bite takes nothing → the water gun pushes the wolf
// back ~1.5 m and cancels a windup, 1/8 of the tank a shot, an empty tank
// only splutters, it refills in ~10 s → three hammer hits put it to sleep and
// leave a crystal shard beside it → walk over the shard → a second wolf takes
// the last half heart → the hero faints → result card → 다시 하기 starts a
// fresh run (game.js restartRun: back at the spawn, the wolves at home).
const canvas = G.renderer.domElement;
const screenOf = (v) => { const p = v.clone().project(G.camera); const r = canvas.getBoundingClientRect(); return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; };
const mouse = (type, v, button = 0, extra = {}) => { const [x, y] = screenOf(v); canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button, ...extra })); };
const click = async (v, button = 0) => { mouse('mousemove', v); await wait(120); mouse('mousedown', v, button); await wait(60); dispatchEvent(new MouseEvent('mouseup', { button })); };
const V = (x, z, up = 0) => new THREE.Vector3(x, G.groundAt(x, z) + up, z); // a point on the plateau
const at = (e, up = 0.5) => e.pos.clone().setY(e.pos.y + up); // (an animal's body, for the cursor)
const settle = async (ms) => { const t0 = performance.now(); let last = P.position.clone(), still = 0; while (performance.now() - t0 < ms) { await wait(200); if (P.position.distanceTo(last) < 0.02) { if (++still > 3) break; } else still = 0; last.copy(P.position); } };
const until = async (test, ms = 8000, step = 16) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (test()) return true; await wait(step); } return false; };
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r2 = (v) => +v.toFixed(2);
const $ = (id) => document.getElementById(id);

// a timeline of what happens, every frame
const events = [];
G.on('hurt', ({ amount }) => events.push({ t: G.time, ev: 'hurt', amount, hearts: G.run.hearts }));
G.on('enemyBite', ({ enemy, inside: inMark, hurt }) => events.push({ t: G.time, ev: 'bite', wolf: enemy.index, inMark, hurt, inv: P.state.invulnerable, action: P.state.action?.name }));
G.on('enemyHit', ({ enemy, damage, by }) => events.push({ t: G.time, ev: 'hit', wolf: enemy.index, damage, by, hp: enemy.hp }));
G.on('shockwave', () => events.push({ t: G.time, ev: 'wave' }));
const marks = []; // when a wolf's floor mark was showing
// the first hurt: the blink straight after it (a second bite tried at once), and when it ends
const blink = {};
G.onUpdate(() => {
  const h = events.find((e) => e.ev === 'hurt');
  if (!h || blink.over) return;
  if (blink.inv === undefined) { blink.inv = P.state.invulnerable; blink.second = P.hurt(P.position.clone().add(new THREE.Vector3(1, 0, 0))); blink.hearts = G.run.hearts; }
  else if (P.state.invulnerable === 0) blink.over = G.time;
});
G.onUpdate(() => { for (const e of G.enemies) if (e.mark.visible) marks.push({ t: G.time, wolf: e.index, state: e.state }); });

await start(); await wait(800);
check('test world: the hero stands on the plateau at the spawn', G.world.def.id === 'test' && flat(P.position, { x: 22, z: 40 }) < 1 && Math.abs(P.position.y + 10) < 0.3, pos());
check('a run starts with 5 hearts, a full tank, no shards', G.run.hearts === 5 && G.run.water === 1 && G.run.shards === 0, JSON.stringify({ h: G.run.hearts, w: G.run.water, s: G.run.shards }));
// the basin's own two wolves sleep through this (far below, held still)
for (const e of G.enemies) e.update = () => {};
const w1 = G.spawnEnemy({ kind: 'wolf', x: 22, z: 24, heading: 0 });
const w2 = G.spawnEnemy({ kind: 'wolf', x: 44, z: 62, heading: Math.PI });
const w1update = w1.update, w2update = w2.update;
w2.update = () => {}; // the second waits its turn
check('two wolves spawned on the plateau at ground height', G.enemies.includes(w1) && G.enemies.includes(w2) && Math.abs(w1.pos.y + 10) < 0.2 && Math.abs(w2.pos.y + 10) < 0.2, w1.pos.toArray().map(r2), w2.pos.toArray().map(r2));
const t0 = G.time;

// --- the wolf idles far off, then spots the hero (within 10 m) and gives chase
await wait(1600); // (past the 1.2 s breather)
check('wolf idle while the hero is more than 10 m away', w1.state === 'idle' && flat(w1.pos, P.position) > 10, `${r2(flat(w1.pos, P.position))} m`);
// walk south by a click to ~6.5 m short of where it is now (it wanders about)
const toward = new THREE.Vector3(P.position.x - w1.pos.x, 0, P.position.z - w1.pos.z).normalize();
await click(V(w1.pos.x + toward.x * 6.5, w1.pos.z + toward.z * 6.5));
const sawAlert = await until(() => w1.state === 'alert', 6000);
check('wolf spots the hero: ❗ over its head', sawAlert && w1.alertSprite.visible, w1.state, `${r2(flat(w1.pos, P.position))} m away`);
await until(() => w1.state === 'chase', 2000);
const chaseFrom = flat(w1.pos, P.position);
await wait(300);
check('…then chases', w1.state === 'chase' || w1.state === 'windup', w1.state, `${r2(chaseFrom)} → ${r2(flat(w1.pos, P.position))} m`);

// --- the windup: a red mark on the floor first, then the bite
await until(() => w1.state === 'windup' && w1.t > 0.3, 8000);
await shot('w7-combat-telegraph');
check('windup shows the red bite mark on the floor', w1.mark.visible, w1.state, r2(w1.t));
await until(() => events.some((e) => e.ev === 'hurt'), 4000);
const hurt1 = events.find((e) => e.ev === 'hurt');
// the mark was showing all through the windup (0.6 s) before that bite
const markBefore = marks.filter((m) => m.wolf === w1.index && m.state === 'windup' && hurt1 && m.t < hurt1.t && m.t > hurt1.t - 1.2);
const markLead = hurt1 && markBefore.length ? hurt1.t - markBefore[0].t : 0;
check('the mark was up before the bite landed (≥ the 0.6 s windup)', !!hurt1 && markLead >= w1.def.windup - 0.05, `${markBefore.length} frames`, r2(markLead) + ' s before');
check('a bite takes half a heart: 5 → 4.5', G.run.hearts === 4.5 && hurt1?.amount === 0.5, G.run.hearts);
check('heart orb shows the half', $('heart-num').textContent === '4½/5', $('heart-num').textContent);
// (read in the frames right after it, wherever the scenario's own wait was)
check('0.7 s of blinking after the hit: no second hurt inside it', blink.inv > 0.6 && blink.second === false && blink.hearts === 4.5, r2(blink.inv ?? 0), blink.second, blink.hearts);
await until(() => blink.over, 2000);
check('the blinking is over after 0.7 s', blink.over && Math.abs(blink.over - hurt1.t - 0.7) < 0.06, r2((blink.over ?? 0) - hurt1.t) + ' s');
const hurts = events.filter((e) => e.ev === 'hurt');
check('no two hurts within the blink, all through the fight so far', hurts.every((h, i) => i === 0 || h.t - hurts[i - 1].t >= 0.69), hurts.map((h) => r2(h.t - t0)).join(', '));

// --- roll through the next bite: no damage (invulnerable all through the roll)
const heartsBeforeRoll = G.run.hearts;
const nBites = events.filter((e) => e.ev === 'bite').length;
let rolled = false;
G.onUpdate(() => {
  if (rolled || w1.state !== 'windup' || w1.t < 0.48) return; // the bite lands 0.1 s into the roll
  rolled = true;
  const through = w1.pos.clone().addScaledVector(new THREE.Vector3(w1.pos.x - P.position.x, 0, w1.pos.z - P.position.z).normalize(), 2);
  mouse('mousemove', V(through.x, through.z)); // through the wolf
  dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2' }));
  dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit2' }));
});
await until(() => events.filter((e) => e.ev === 'bite').length > nBites, 8000);
const rollBite = events.filter((e) => e.ev === 'bite')[nBites];
check('rolled through a bite: inside the mark, invulnerable, no damage', rolled && !!rollBite && rollBite.action === 'roll' && rollBite.inMark && rollBite.inv > 0 && !rollBite.hurt && G.run.hearts === heartsBeforeRoll,
  `bite during ${rollBite?.action}, inv ${r2(rollBite?.inv ?? 0)}, in mark ${rollBite?.inMark}`, G.run.hearts);

// --- the water gun: push back, drain the tank (and see the stream)
await wait(300);
const shoot = async () => { mouse('mousemove', at(w1)); await wait(30); mouse('mousedown', at(w1), 2); await wait(40); dispatchEvent(new MouseEvent('mouseup', { button: 2 })); };
// push during a windup: no bite comes
await until(() => w1.state === 'windup' && w1.t < 0.25, 8000);
const bitesBefore = events.filter((e) => e.ev === 'bite').length;
const d0 = flat(w1.pos, P.position), water0 = G.run.water, hp0 = w1.hp;
await shoot();
const water1 = G.run.water;
await wait(110);
await shot('w7-combat-water');
await until(() => w1.state === 'stagger', 1500);
const wasStaggered = w1.state === 'stagger';
// how far the push carries it, before it runs back in
let d1 = 0;
await until(() => { d1 = Math.max(d1, flat(w1.pos, P.position)); return w1.state !== 'stagger'; }, 1500);
check('water hits the wolf: pushed back ~1.5 m', d1 - d0 > 1.0 && d1 - d0 < 2.2, `${r2(d0)} → ${r2(d1)} m`);
check('water cancels the windup (stagger, no bite)', wasStaggered && events.filter((e) => e.ev === 'bite').length === bitesBefore, w1.state);
check('water hurts a little (1/3 hammer hit)', Math.abs(hp0 - w1.hp - 1 / 3) < 1e-6, r2(hp0), '→', r2(w1.hp));
check('one shot uses 1/8 of the tank', Math.abs(water0 - water1 - 1 / 8) < 1e-6, r2(water0), '→', r2(water1));
// keep shooting: the tank drains (2 shots a second), the orb follows
for (let i = 0; i < 5; i++) { await shoot(); await wait(520); }
const drained = G.run.water;
const orbH = parseFloat($('water-orb').querySelector('.fill').style.height);
check('the tank drains, the water orb shows it', drained < 0.5 && Math.abs(orbH - drained * 100) < 3, r2(drained), `${orbH}%`);
// empty: no water comes out, the orb flashes
G.run.water = 0.05;
const shotsBefore = G.waterGun.shots.length;
const fired = G.waterGun.fire();
check('an empty tank only splutters (orb flash)', !fired && G.waterGun.shots.length === shotsBefore && $('water-orb').classList.contains('dry'));
// …and fills again in about ten seconds (after a short pause from the last shot)
G.run.water = 0;
await until(() => G.run.water > 0.02, 4000);
const refill0 = G.time, water2 = G.run.water;
await wait(1500);
const secsFull = (G.time - refill0) / (G.run.water - water2);
check('the tank refills (~10 s from empty)', secsFull > 8.5 && secsFull < 11.5, r2(G.run.water), `${r2(secsFull)} s for a full tank`);
G.run.water = 1;

// --- the hammer: hold the button on the wolf: walk up and keep swinging (GDD §4.1)
w1.hp = 3; // a fresh wolf: exactly three hammer hits
P.state.invulnerable = 0;
G.run.hearts = 5; G.hud.update(G.run); // (enough hearts to get through the swings)
const hits0 = events.filter((e) => e.ev === 'hit' && e.by === 'hammer').length;
mouse('mousemove', at(w1)); await wait(120);
mouse('mousedown', at(w1));
const follow = setInterval(() => mouse('mousemove', at(w1)), 100);
await until(() => events.filter((e) => e.ev === 'hit' && e.by === 'hammer').length > hits0 + 1, 6000);
await wait(200);
await shot('w7-combat-hammer');
await until(() => w1.state === 'asleep', 8000);
clearInterval(follow);
dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
const hammerHits = events.filter((e) => e.ev === 'hit' && e.by === 'hammer').slice(hits0);
check('three hammer hits put the wolf to sleep', w1.state === 'asleep' && hammerHits.length === 3, hammerHits.map((h) => r2(h.hp)).join(' → '), w1.state);
check('swings came about once a second', hammerHits.length < 2 || hammerHits.slice(1).every((h, i) => h.t - hammerHits[i].t >= 0.9), hammerHits.map((h) => r2(h.t - t0)).join(', '));
check('the third hit in a row shook the ground', events.some((e) => e.ev === 'wave'));
await wait(700);
check('asleep: Zz, and it left a crystal shard', w1.zz.visible && G.pickups.some((p) => p.kind === 'shard'), w1.zz.visible);
await shot('w7-combat-asleep');
check('a sleeping wolf cannot be clicked or hit', !G.hittables.some((h) => h.enemy === w1 && h.enabled()));

// --- pick up the shard by walking over it
const shard = G.pickups.find((p) => p.kind === 'shard');
P.state.invulnerable = 0;
check('the shard lies beside the sleeping wolf, not under the hero', !!shard && flat(shard.pos, P.position) > 1.2 && flat(shard.pos, w1.pos) < 2.5, shard && r2(flat(shard.pos, P.position)), shard && r2(flat(shard.pos, w1.pos)));
if (shard) await click(shard.model.position);
await until(() => G.run.shards === 1, 6000);
await wait(300);
check('walked over the shard: counter 1', G.run.shards === 1 && $('shard-num').textContent === '1', G.run.shards);
await wait(4000);
check('the sleeping wolf faded away', w1.gone && !w1.model.visible);

// --- the second wolf takes the last half heart: the hero faints
w2.update = w2update;
G.run.hearts = 0.5; G.hud.update(G.run);
await go(w2.pos.x - 3, w2.pos.z);
const fainted = await until(() => G.fainted, 12000);
check('second wolf bites the last half heart: hearts 0, the hero faints', fainted && G.run.hearts === 0 && P.state.action?.name === 'faint', G.run.hearts, P.state.action?.name, w2.state, r2(flat(w2.pos, P.position)));
await wait(900);
check('…and stays down', P.state.action?.name === 'faint');
await until(() => G.mode === 'result', 3000);
const overlay = $('result');
check('result card: 몰티즈가 지쳐서 잠들었어요…', G.mode === 'result' && !overlay.classList.contains('hidden') && overlay.textContent.includes('몰티즈가 지쳐서 잠들었어요') && !$('btn-again').classList.contains('hidden'), G.mode);
check('…it counts the shard and the sleeping wolf', $('stat-shards')?.textContent.includes('1') && $('stat-asleep')?.textContent.includes('1'), $('stat-shards')?.textContent, $('stat-asleep')?.textContent);
await wait(300);
await shot('w7-combat-faint');

// --- 다시 하기: a fresh run (the test world: restartRun, from the spawn)
$('btn-again').click();
const homeAt = [w1, w2].map((e) => r2(flat(e.pos, e.home))); // (right at the click: before they wander)
await wait(800);
check('다시 하기: 5 hearts, a full tank, no shards, back in play', G.run.hearts === 5 && G.run.water === 1 && G.run.shards === 0 && G.mode === 'play' && overlay.classList.contains('hidden') && !G.fainted, JSON.stringify({ h: G.run.hearts, w: G.run.water, s: G.run.shards }), G.mode);
check('…back at the spawn, the wolves awake again at home, no shard left', flat(P.position, G.spawn) < 0.5 && homeAt.every((d) => d < 0.05) && [w1, w2].every((e) => !e.gone && e.hp === 3 && e.state === 'idle') && !G.pickups.some((p) => p.kind === 'shard'), pos(), [w1, w2].map((e, i) => `${e.state} ${e.hp} ${homeAt[i]} m`).join(' | '));
check('…the hero stands up, the orb shows 5/5', !P.state.action && $('heart-num').textContent === '5/5', P.state.action?.name, $('heart-num').textContent);
w1.update = w2.update = () => {}; // (hold them while the hero walks)
const p0 = P.position.clone();
await click(V(P.position.x - 3, P.position.z));
await settle(4000);
check('…and walks again by a click (the input is back)', flat(P.position, p0) > 2.5, pos());
check('scene time', true, `${r2(G.time - t0)} s of fighting`);
return log;
