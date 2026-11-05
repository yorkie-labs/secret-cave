// @bot
// W3 (tasks/20261102-world-redesign-todo.md): the Ice Lake, played through
// real input. GAME_URL='http://localhost:5191/?start=ice&seed=4' (the
// progress of a hero who has just put the Poison Mushroom Queen to sleep:
// core/state.js presetProgress, the shield and the vine in the bag). From
// just past the ice door: the gate behind is open (the queen's), the animals
// here are tougher; on the frozen lake the hero slides (a roll further); the
// hammer breaks an ice wall into the grotto (the paths learn it) where rare
// armour waits (two blue hearts on the HUD, taken before the red); icicles
// fall in a pass, each shown by its shadow first; a deer's charge into the
// raised shield sticks its antlers (2 s, the hammer); water in a bear's face
// makes it stagger (2 s, the hammer); the nook's spring fills the armour.
const X = G.expedition, W = G.world, D = W.def, S = G.state;
// (W6: hand-written points are in the design frame; the layout squeezes them into the world)
const M = (u, v) => G.world?.def.M ? G.world.def.M(u, v) : [(u + v) * Math.SQRT1_2, (v - u) * Math.SQRT1_2];
const $ = (id) => document.getElementById(id);
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const until = async (test, ms = 8000, step = 40) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (test()) return true; await wait(step); } return false; };
const at = (u, v) => { const [x, z] = M(u, v); return V3(x, G.groundAt(x, z), z); };
const t0 = performance.now();
const ev = {};
for (const k of ['iceWallHit', 'iceWallBroken', 'icicleWarn', 'icicleFall', 'deerStuck', 'bearStagger', 'shieldBlock', 'armorHit', 'springUsed', 'chestOpened', 'faint', 'enemyDash']) { ev[k] = []; G.on(k, (e) => ev[k].push({ t: G.time, e })); }
const once = new Set();
// (a close look for the fights: the lens in to 18 m for the picture, then back)
const snap = async (name, close = false) => {
  if (once.has(name)) return; once.add(name);
  const d = G.cam.rig.distance;
  if (close) { G.cam.rig.distance = 18; await wait(140); }
  await shot(name);
  if (close) G.cam.rig.distance = d;
};

await start(); await wait(1500);
check('?start=ice: the queen asleep, past the ice door, in the Ice Lake', S.world.bosses.mushroomQueen && X.area?.region === 3, X.label(), pos());
check('the ice door is open (the queen\'s), the ice walls and the pit\'s door shut', X.gates.ice.open && !X.gates.iceWall1.open && !X.gates.iceWall2.open && !X.gates.pit3.open && X.gates.bearGate.open);
check('the lake is named on the HUD', $('area-name').textContent.includes('얼음 호수'), $('area-name').textContent);
check('no armour yet: no blue hearts', (G.run.armor ?? 0) === 0 && $('armor-pips').classList.contains('hidden'));
// an expedition whose spots hold a deer on the shelf and a bear on the lake
const has = (kind, ids) => [...X.spots.values()].find((r) => ids.includes(r.spot.id) && r.enemies.some((e) => e.kind === kind && !e.gone));
for (let k = 0; k < 16 && !(has('deer', ['i2', 'i3', 'i4']) && has('bear', ['i4', 'i5', 'i6'])); k++) X.startExpedition();
const deerSpot = has('deer', ['i2', 'i3', 'i4']), bearSpot = has('bear', ['i4', 'i5', 'i6']);
check('this expedition has a deer and a bear', !!deerSpot && !!bearSpot, deerSpot?.spot.id, bearSpot?.spot.id, X.n);
const deer = deerSpot.enemies.find((e) => e.kind === 'deer'), bear = bearSpot.enemies.find((e) => e.kind === 'bear');
check('the lake\'s animals are tougher (GDD §8.5: ×1.5 hp, ×1.3 damage)', Math.abs(deer.maxHp - 6) < 1e-6 && Math.abs(bear.maxHp - 9) < 1e-6 && Math.abs(bear.damage - 1.95) < 1e-6, deer.maxHp, bear.maxHp, bear.damage);
for (const r of X.spots.values()) if (r !== deerSpot && r !== bearSpot && (r.spot.region ?? 1) === 3) X.sleepSpot(r.spot.id);
// (the two spots doze until each is visited)

// ---- the frozen lake: the hero slides
async function glide(u, v, du, dv) {
  X.jump(M(u, v)); await wait(700);
  const from = P.position.clone();
  const [tx, tz] = M(u + du, v + dv);
  const target = V3(tx, G.groundAt(tx, tz), tz);
  G.pointer.goTo(target, false);
  let released = null, peak = 0;
  const tA = performance.now();
  while (performance.now() - tA < 6000) {
    peak = Math.max(peak, P.state.vel.length());
    if (!released && !G.pointer.order) released = P.position.clone();
    if (released && P.state.vel.length() < 0.05) break;
    await wait(30);
  }
  const end = P.position.clone();
  return { slide: released ? flat(end, released) : 0, travelled: flat(end, from), miss: flat(end, target), peak, slip: P.state.slip };
}
const snow = await glide(-262, 40, 0, 14);
const ice = await glide(-330, 60, -16, -16);
check('on the snow the hero stops where it stops', snow.slide < 0.3, JSON.stringify(snow));
check('on the ice the hero slides on after letting go, and still stops near the click', ice.slip === 1 && ice.slide > 0.6 && ice.miss < 1.6, JSON.stringify(ice));
// a roll on the ice carries further than on the snow
async function rollFrom(u, v) {
  X.jump(M(u, v)); await wait(600);
  const from = P.position.clone();
  mouse('mousemove', G3(from.x - 6, from.z - 6)); keyTap('Digit2');
  await until(() => P.state.action?.name === 'roll', 1000);
  await until(() => !P.state.action && P.state.vel.length() < 0.05, 6000);
  await wait(200);
  return flat(P.position, from);
}
const rollSnow = await rollFrom(-262, 60), rollIce = await rollFrom(-320, 20);
check('a roll on the ice slides much further than on the snow', rollIce > rollSnow + 2.5, rollSnow.toFixed(1), rollIce.toFixed(1));
await snap('w3l-01-slide');

// ---- the ice wall into the grotto: the hammer breaks it
const wall = X.gates.iceWall1;
const grotto = at(-232, -146);
const before = G.nav.findPath(P.position, grotto);
X.jump(M(-262, -70)); await wait(600);
const pathBefore = G.nav.findPath(P.position, grotto);
check('before: no way into the grotto (the wall)', !pathBefore || pathBefore.partial, pathBefore?.partial);
void before;
await travel(at(-231, -100), { near: 2.5, ms: 40000 });
await snap('w3l-02-ice-wall');
for (let k = 0; k < 12 && !wall.open && wall.opening < 0; k++) {
  const hp = wall.at.clone().setY(wall.y + 1);
  await clickAt(hp); await wait(1100);
  if (k === 1) await snap('w3l-03-ice-wall-cracked');
}
check('three hammer swings: cracks, then the wall shatters', ev.iceWallHit.length >= 3 && await until(() => wall.open, 3000), ev.iceWallHit.map((h) => h.e.hits).join(','));
await wait(300); await snap('w3l-04-ice-wall-broken');
check('broken for good (saved), and the paths know the way in', S.world.gates.iceWall1 === true && !G.nav.findPath(P.position, grotto)?.partial);
// ---- the grotto's chest: rare armour
await travel(at(-233, -140), { near: 2.5, ms: 40000 });
const chest = X.armorChest;
for (let k = 0; k < 10 && !chest.opened; k++) { await clickAt(chest.pos.clone().setY(chest.pos.y + 0.4)); await wait(800); }
await until(() => !!chest.loot, 3000); await wait(900);
check('the grotto\'s chest holds armour', chest.loot?.item === 'armor' && chest.loot?.grade === 'rare', JSON.stringify(chest.loot));
const vest = G.pickups.find((p) => p.alive && p.item === 'armor');
if (vest) { await clickAt(vest.model.position.clone()); await until(() => !vest.alive, 5000); }
check('worn: two blue hearts over the heart orb', G.run.armorGrade === 'rare' && G.run.armor === 2 && !$('armor-pips').classList.contains('hidden') && $('armor-pips').querySelectorAll('i:not(.gone)').length === 2 && $('heart-orb').classList.contains('armored'), G.run.armor, $('armor-pips').innerHTML);
await wait(400); await snap('w3l-05-armor-hud');

// ---- icicles in the pass to the grotto: shown first, walked out of
const zone = X.lake.zones.find((z) => Math.hypot(z.x - M(-231, -118)[0], z.z - M(-231, -118)[1]) < 2);
const hearts0 = G.run.hearts, armor0 = G.run.armor;
const tI = performance.now();
let warned = false;
// stand in the pass; the bot sees the shadow and steps out of it
await travel(at(-231, -117), { near: 2, ms: 20000 });
while (performance.now() - tI < 16000 && ev.icicleFall.length < 3) {
  await botStep({ goal: (c) => flat(c, V3(zone.x, 0, zone.z)) * 0.3 });
  if (!warned && ev.icicleWarn.length && G.time - ev.icicleWarn[0].t > 0.7) { warned = true; await snap('w3l-06-icicle-shadow'); }
}
const falls = ev.icicleFall.slice(0, 3);
check('icicles fell in the pass, each shadow shown first (≥ 1.2 s)', falls.length >= 3 && ev.icicleWarn.slice(0, falls.length).every((w, i) => falls[i].t - w.t >= 1.2), falls.map((f, i) => (f.t - ev.icicleWarn[i].t).toFixed(2)).join(','));
check('the bot walked out of their shadows (none or one hit)', falls.filter((f) => f.e.hurt).length <= 1, falls.map((f) => f.e.hurt).join(','), `hearts ${hearts0}→${G.run.hearts}`, `armor ${armor0}→${G.run.armor}`);

// ---- armour takes the hits first
{
  const h = G.run.hearts, a = G.run.armor;
  P.state.invulnerable = 0;
  G.hurtPlayer(P.position.clone().setX(P.position.x + 1), 1);
  await wait(200);
  check('a hit takes blue hearts before red ones', G.run.armor === Math.max(0, a - 1) && G.run.hearts === h - Math.max(0, 1 - a), `blue ${a}→${G.run.armor}`, `red ${h}→${G.run.hearts}`);
  await wait(800);
}

// ---- the deer: its charge into the raised shield sticks its antlers
await travel(at(-262, -50), { near: 3, ms: 40000 });
const deerHome = V3(deerSpot.spot.at[0], G.groundAt(...deerSpot.spot.at), deerSpot.spot.at[1]);
await travel(deerHome, { near: deerSpot.spot.r * 0.9, ms: 40000 });
const tD = performance.now();
while (performance.now() - tD < 120000 && !G.fainted && deerSpot.enemies.some((e) => e.state !== 'asleep' && !e.gone)) {
  await botStep({ goal: (c) => flat(c, deerHome) * 0.2 });
  if (deer.stunned && deer.ai.t > 0.15) await snap('w3l-07-deer-stuck', true);
}
check('a deer charged into the raised shield: its antlers stuck fast (2 s, 💫)', ev.deerStuck.length >= 1 && ev.deerStuck[0].e.secs === 2, ev.deerStuck.length, ev.enemyDash.length, `shield ${bot.stats.shield}`);
check('…and the hammer put it to sleep while it was stuck', deer.state === 'asleep', deer.hp);

// ---- the bear: water in its face, it staggers
if (bot.shieldFor) { keyUp('Digit3'); bot.shieldFor = null; }
const bearHome = V3(bearSpot.spot.at[0], G.groundAt(...bearSpot.spot.at), bearSpot.spot.at[1]);
await travel(bearHome, { near: bearSpot.spot.r * 0.9, ms: 60000 });
const tB = performance.now();
while (performance.now() - tB < 120000 && !G.fainted && bearSpot.enemies.some((e) => e.state !== 'asleep' && !e.gone)) {
  await botStep({ goal: (c) => flat(c, bearHome) * 0.2 });
  if (bear.stunned && bear.ai.t > 0.2) await snap('w3l-08-bear-stagger', true);
}
check('water in the bear\'s face: it staggered (2 s, 💫)', ev.bearStagger.length >= 1 && ev.bearStagger[0].e.secs === 2, ev.bearStagger.length);
check('…and the hammer put it to sleep', bear.state === 'asleep', bear.hp);

// ---- the nook: the other ice wall, the resting spring fills the armour
const wall2 = X.gates.iceWall2;
await travel(at(-262, 60), { near: 3, ms: 90000 }); // (back up onto the shelf, then south along it)
await travel(at(-267, 141), { near: 2.5, ms: 60000 });
for (let k = 0; k < 12 && !wall2.open && wall2.opening < 0; k++) { await clickAt(wall2.at.clone().setY(wall2.y + 1)); await wait(1100); }
check('the second ice wall breaks too (the nook)', await until(() => wall2.open, 3000), pos(), wall2.hits);
G.run.armor = 0; G.hud.update(G.run);
const spring = X.lake.spring;
await travel(V3(spring.pos.x, spring.pos.y, spring.pos.z), { near: 2.2, ms: 30000 });
for (let k = 0; k < 8 && !spring.used; k++) { await clickAt(spring.pos.clone().setY(spring.pos.y + 0.3)); await wait(800); }
check('the nook\'s spring fills the blue hearts again', spring.used && G.run.armor === 2, G.run.armor);
await wait(500); await snap('w3l-09-nook');

check('the bot never ran out of hearts', bot.minHearts > 0 && !ev.faint.length, bot.minHearts);
log.push(['INFO', 'time', `${(G.run.time / 60).toFixed(2)} min of play`, `${((performance.now() - t0) / 1000).toFixed(0)} s real`, 'min hearts', bot.minHearts, 'bot', JSON.stringify(bot.stats), 'hurt', JSON.stringify(bot.events.slice(0, 30))]);
return log;
