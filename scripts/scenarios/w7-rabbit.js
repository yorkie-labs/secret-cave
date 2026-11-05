// W7: the rabbit (GDD §3.2), on the test world's flat upper plateau (the old
// M5 check, m5-rabbit.js, ran only in the M6a open cave's dungeon rooms; the
// room checks, "≥ 9 m from the door" and "the first room is wolves only",
// went with it). Run with GAME_URL='http://localhost:5191/?world=test&seed=3'.
// One rabbit spawned (G.spawnEnemy) 8 m south of the spawn (22, 40): it
// notices the hero → keeps its distance → aims a red lane (≥ 0.85 s before it
// jumps) → the jump-dash along it costs half a heart → it lands and sits
// dazed (💫) for 0.8 s → a hammer click while it hops about misses (휙!, it
// dodges) → a roll out of the lane takes no damage → a hammer hit in the
// landing window knocks it silly (stagger 1.4 s) → a second hit: asleep.
const canvas = G.renderer.domElement;
const screenOf = (v) => { const p = v.clone().project(G.camera); const r = canvas.getBoundingClientRect(); return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; };
const mouse = (type, v, button = 0) => { const [x, y] = screenOf(v); canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button })); };
const V = (x, z, up = 0) => new THREE.Vector3(x, G.groundAt(x, z) + up, z); // a point on the plateau
const at = (e, up = 0.4) => e.pos.clone().setY(e.pos.y + up); // (an animal's body, for the cursor)
// a left click on the rabbit: the hammer (the hero swings at once when in reach)
const hammerAt = async (e) => { mouse('mousemove', at(e)); mouse('mousedown', at(e)); await wait(40); dispatchEvent(new MouseEvent('mouseup', { button: 0 })); };
const until = async (test, ms = 8000, step = 16) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (test()) return true; await wait(step); } return false; };
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r2 = (v) => +v.toFixed(2);
const events = [];
for (const ev of ['enemyDodge', 'enemyStunned', 'enemyBite', 'enemyDash', 'enemyWindup', 'hurt']) G.on(ev, (e) => events.push([ev, e?.enemy?.kind, +G.time.toFixed(2)]));
const lastEv = (ev) => events.filter((e) => e[0] === ev).at(-1);
// every swing that starts (one click must be one swing: W7 review)
const swings = [];
{ const act = P.act; P.act = (name) => { const ok = act(name); if (ok && name === 'swing') swings.push(+G.time.toFixed(2)); return ok; }; }

await start(); await wait(600);
// the basin's own two wolves sleep through this (far below, held still)
for (const e of G.enemies) e.update = () => {};
const r = G.spawnEnemy({ kind: 'rabbit', x: 22, z: 32, heading: 0 });
check('a rabbit spawned on the plateau at ground height', G.enemies.includes(r) && r.kind === 'rabbit' && Math.abs(r.pos.y + 10) < 0.2, r.pos.toArray().map(r2));
const t0 = G.time;
check('…it notices the hero (8 m off) after the breather', await until(() => r.state !== 'idle', 4000), r.state, r2(G.time - t0) + ' s');
check('the plate hint: 착지했을 때 망치로!', r.hint() === '착지했을 때 망치로!', r.hint());

// ---- it keeps its distance
await until(() => r.state === 'chase', 3000);
await go(r.pos.x + 0.4, r.pos.z + 2.6);
const close = flat(r.pos, P.position);
await wait(900);
const after = flat(r.pos, P.position);
check('it keeps its distance (backs off from 2.6 m)', after > close + 1 || r.state === 'windup', r2(close), r2(after), r.state);

// ---- the lane, the dash, half a heart
const ok1 = await until(() => r.state === 'windup', 6000);
const tw = G.time;
await wait(300);
const hz = r.hazard();
check('it aims a red lane on the floor (the telegraph)', ok1 && r.mark.visible && r.mark.name === 'laneMark' && hz?.shape === 'lane', JSON.stringify(hz && { shape: hz.shape, width: hz.width, length: hz.length }));
await shot('w7-rabbit-telegraph');
const hearts0 = G.run.hearts;
await until(() => r.state === 'attack', 3000);
const wEv = lastEv('enemyWindup'), dEv = lastEv('enemyDash');
check('the jump comes ≥ 0.85 s after the lane appears', dEv && wEv && dEv[2] - wEv[2] >= 0.85, wEv?.[2], dEv?.[2]);
await until(() => r.state === 'recover', 2000);
check('the dash along the lane costs half a heart (the hero stood in it)', G.run.hearts === hearts0 - 0.5 && events.some((e) => e[0] === 'hurt' && e[2] >= tw), hearts0, G.run.hearts);
const tl = G.time;
check('it lands dazed: 💫, hint 지금 망치로', r.landed && r.dazedSprite.visible && r.hint().includes('착지했어요'), r.hint());
await shot('w7-rabbit-landed');
await until(() => r.state !== 'recover', 2000);
check('the landing window lasts 0.8 s', Math.abs(G.time - tl - 0.8) < 0.15, r2(G.time - tl));

// ---- a hammer click while it hops about: it dodges
await until(() => r.state === 'chase', 2000);
G.run.hearts = 5; G.hud.update(G.run);
P.state.invulnerable = 0;
// right next to it, clicking on it at once (it hops away fast)
const hpBefore = r.hp, dodges0 = events.filter((e) => e[0] === 'enemyDodge').length;
// (no settling wait: in 0.35 s it is already out of reach)
P.teleport({ x: r.pos.x, y: r.pos.y, z: r.pos.z + 0.7 }); await wait(30);
await hammerAt(r);
await until(() => events.filter((e) => e[0] === 'enemyDodge').length > dodges0, 1000);
await wait(100);
check('a swing while it hops about: it dodges (휙!), no damage', r.hp === hpBefore && events.filter((e) => e[0] === 'enemyDodge').length > dodges0 && P.state.action?.name === 'swing', r.hp, P.state.action?.name);
const sw0 = swings.length;
await until(() => !P.state.action, 1500);
await wait(700);
check('one quick click in reach = one swing (no second swing after it)', swings.length === sw0 && !G.pointer.order, swings.length - sw0 + 1, G.pointer.order?.type);

// ---- a roll out of the lane: no damage
await until(() => r.state === 'windup', 8000);
const lane = r.hazard();
const hearts1 = G.run.hearts;
const vulnerable = P.state.invulnerable === 0; // (no leftover blink: only the roll can save it)
await until(() => r.hazard() && r.hazard().hitAt - G.time < 0.3, 2000);
// roll sideways, across the lane (the cursor aims the roll)
const side = lane.heading + Math.PI / 2;
mouse('mousemove', V(P.position.x + Math.sin(side) * 3, P.position.z + Math.cos(side) * 3));
dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2' })); dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit2' }));
await wait(50);
const rolled = P.state.action?.name === 'roll';
await until(() => r.state === 'recover', 2500);
check('rolling out of the lane: no damage', vulnerable && rolled && G.run.hearts === hearts1, hearts1, G.run.hearts, rolled);

// ---- the hammer in the landing window: knocked silly, then asleep
const hp2 = r.hp;
await go(r.pos.x + 0.9, r.pos.z + 0.9);
const sw1 = swings.length;
await hammerAt(r);
await until(() => r.hp < hp2, 700);
await wait(60);
check('a hammer hit while it is landed: damage and knocked silly (stagger 1.4 s)', r.hp === hp2 - 1 && r.state === 'stagger' && events.some((e) => e[0] === 'enemyStunned'), r.hp, r.state);
await shot('w7-rabbit-stunned');
const ts = G.time;
await wait(900);
check('…still dazed a second later (longer than a water stagger)', r.state === 'stagger' && r.dazedSprite.visible, r2(G.time - ts), r.state);
check('…and that click swung once: no second swing (one click = one swing)', swings.length - sw1 === 1 && r.hp === hp2 - 1, swings.length - sw1, r.hp);
await hammerAt(r);
await until(() => r.state === 'asleep', 1500);
check('a second hit: asleep', r.state === 'asleep', r.state, r.hp);
check('rabbit is in the codex', G.state.seen.rabbit === true);
check('scene time', true, `${r2(G.time - t0)} s`);
return log;
