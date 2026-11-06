// W9: the ending cutscene (tasks/20261107-ending-cutscene-todo.md, GDD §2.3):
// a 3D scene in the game's renderer (ui/ending.js) on the intro's forest and
// cave mouth, seven scenes, typed subtitles, letterbox, 건너뛰기 ▶▶ / Esc /
// Space, the numbers of the save, the credits, THE END…? → the result.
// Run with GAME_URL='http://localhost:5191/?start=heart&seed=4' (the debug
// start: the Ice Bear asleep, at the crystal door; `G.expedition.kingDown()`
// puts the Crystal King to sleep as if beaten, the escape starts, and a jump
// into the sunlight at the tunnel's end starts the ending the real way).
// Variants by adding `&w9=<mode>`:
//   (none)   the whole ending, nothing pressed: all seven scenes and every
//            line in order, a screenshot of each scene (held still), the
//            stars / bosses / shards / play time shown = the save, the
//            credits' names, THE END…?, the GPU memory back where it was →
//            the result (the same numbers) → 계속 탐험하기 (the camp, the
//            purple shard waiting); a second escape: Esc in scene 3 → the
//            result; a third: 건너뛰기 at once (before the set is up) → the
//            result; memory back again; on in the world
//   press    Space / click through it: every scene visited, the credits and
//            the tease are stops, then the result
//   mobile   (MOBILE=1 / MOBILE=landscape) bars, subtitle, 건너뛰기, the
//            numbers and the credits fit the screen; a tap skips → result
//   shots    screenshots of every scene only (`&q=low|medium|high`, `&tag=`)
const mode = new URLSearchParams(location.search).get('w9') ?? 'full';
const tag = new URLSearchParams(location.search).get('tag') ?? '';
const X = G.expedition, S = G.state;
const $ = (id) => document.getElementById(id);
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const until = async (test, ms = 8000, step = 40) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (test()) return true; await wait(step); } return false; };
const keyTap = (code) => { dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); };
const shown = (id) => !$(id).classList.contains('hidden') && getComputedStyle($(id)).visibility !== 'hidden';
const mem = () => ({ ...G.renderer.info.memory });
const r2 = (v) => +v.toFixed(2);
const SCENES = ['light', 'sunlight', 'cave', 'gathered', 'setoff', 'credits', 'tease'];
// (the star altar's prices: stars earned = in hand + spent, data/unlocks.js)
const COSTS = { heart1: 2, heart2: 2, herbPouch: 1, bigTank: 1, rabbitMask: 1, hat: 1, crown: 1, scarf: 1, boots: 1 };
const saved = () => JSON.parse(localStorage.getItem(G.saveKey ?? 'secret-cave-save-v1'));
const earned = (s) => s.stars + Object.keys(s.unlocks ?? {}).reduce((t, id) => t + (COSTS[id] ?? 0), 0);
const timeText = (sec) => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60); return h ? `${h}시간 ${m}분` : m ? `${m}분 ${s}초` : `${s}초`; };
let memAtSun = null, memNear = null;
G.on('sunlight', () => { memAtSun = mem(); });

await start();
await wait(1200);
check('the debug start: at the crystal door, the Ice Bear asleep', G.mode === 'play' && !!X.king && !S.world.bosses.crystalKing);

// the Crystal King asleep (as if beaten) → the escape → into the sunlight
async function toTheSun(label) {
  // (a few steps short of it first: the world there drawn once, its GPU memory the baseline)
  const D = G.world.def, sun = D.escape.sun, a = D.escape.tunnel[0], L = Math.hypot(a[0] - sun[0], a[1] - sun[1]);
  X.jump([sun[0] + (a[0] - sun[0]) / L * 8, sun[1] + (a[1] - sun[1]) / L * 8]);
  await wait(1200);
  memNear = mem();
  memAtSun = null;
  X.jump('sun');
  const ok = await until(() => G.mode === 'ending' && G.outro?.playing, 6000);
  check(`${label}: into the sunlight at the tunnel's end → the ending cutscene`, ok && shown('intro') && document.getElementById('intro').classList.contains('ending'), G.mode);
  return ok;
}
async function atResult(label) {
  const ok = await until(() => shown('result') && G.mode === 'result', 6000);
  check(`${label}: the whole game's result (계속 탐험하기 / 처음 화면)`, ok && shown('btn-continue') && shown('btn-title') && $('btn-again').classList.contains('hidden'), G.mode);
  await until(() => $('intro').classList.contains('hidden'), 2000);
  check(`${label}: the cutscene is gone, nothing of it left on the page`, $('intro').classList.contains('hidden') && !document.body.classList.contains('intro-on') && !G.story.view && !G.story.playing && !G.input.muffled);
  return ok;
}
async function continueOn(label) {
  $('btn-continue').click();
  const ok = await until(() => G.mode === 'play' && X.area?.id === 'camp', 6000);
  check(`${label}: 계속 탐험하기 → the camp, playing on`, ok && shown('hud'), G.mode, X.area?.id);
}

X.kingDown();
check('the king asleep: the escape starts', await until(() => X.escaping, 12000) && S.world.bosses.crystalKing);
// (the ending's forest set is fetched while the hero runs)
await wait(2500);

if (mode === 'mobile') {
  await toTheSun('phone');
  await until(() => G.outro.ready, 30000);
  G.outro.hold = true; G.outro.seek(21.8); await wait(1200);
  const top = document.querySelector('#intro .bar.top').getBoundingClientRect(), bottom = document.querySelector('#intro .bar.bottom').getBoundingClientRect();
  const skip = $('intro-skip').getBoundingClientRect(), line = $('intro-line').getBoundingClientRect();
  check('the bars sit top and bottom, the picture between', top.top === 0 && Math.abs(bottom.bottom - innerHeight) < 1 && top.height > 20 && bottom.height > 20, r2(top.height), r2(bottom.height), innerWidth, innerHeight);
  check('건너뛰기 is on screen and big enough for a thumb (≥ 36 px)', skip.left >= 0 && skip.right <= innerWidth && skip.top >= 0 && skip.height >= 36, JSON.stringify([r2(skip.left), r2(skip.top), r2(skip.width), r2(skip.height)]));
  check('the subtitle fits in the lower bar', line.left >= 0 && line.right <= innerWidth && line.top >= bottom.top - 1 && line.bottom <= innerHeight, JSON.stringify([r2(line.top), r2(line.bottom), r2(bottom.top)]));
  const chips = [...$('intro-stats').children].map((c) => c.getBoundingClientRect());
  check('the numbers (stars, bosses, shards, time) fit across the picture', chips.length === 4 && chips.every((c) => c.left >= 0 && c.right <= innerWidth && c.top >= top.bottom - 1 && c.bottom < bottom.top), chips.map((c) => `${r2(c.left)}-${r2(c.right)}`).join(' '));
  await shot(`${tag}ending-mobile-${innerWidth > innerHeight ? 'landscape' : 'portrait'}-stars`);
  G.outro.seek(38.5); await wait(900);
  const roll = $('intro-credits').getBoundingClientRect(), rows = [...$('intro-credits').querySelectorAll('.row')].map((r) => r.getBoundingClientRect());
  check('the credits roll inside the picture, every line within the screen\'s width', shown('intro-credits') && roll.top >= top.bottom - 1 && roll.bottom <= bottom.top + 1 && rows.every((r) => r.left >= 0 && r.right <= innerWidth), rows.length);
  await shot(`${tag}ending-mobile-${innerWidth > innerHeight ? 'landscape' : 'portrait'}-credits`);
  G.outro.seek(47); await wait(700);
  const title = $('intro-title').getBoundingClientRect();
  check('THE END…? fits the screen', title.left >= 0 && title.right <= innerWidth && title.height > 20, r2(title.width));
  await shot(`${tag}ending-mobile-${innerWidth > innerHeight ? 'landscape' : 'portrait'}-tease`);
  G.outro.hold = false;
  $('intro-skip').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
  $('intro-skip').click();
  await atResult('a tap on 건너뛰기');
  await wait(400);
  await shot(`${tag}ending-mobile-${innerWidth > innerHeight ? 'landscape' : 'portrait'}-result`);
  await continueOn('phone');
  return log;
}

if (mode === 'shots') {
  await toTheSun(`shots ${G.quality}`);
  await until(() => G.outro.ready, 30000);
  const AT = { light: 2.4, sunlight: 7.4, cave: 13.6, gathered: 21.9, setoff: 30.0, credits: 38.0, tease: 47.2 };
  for (const [i, sc] of SCENES.entries()) {
    G.outro.hold = true; G.outro.seek(AT[sc]); await wait(1000);
    await shot(`${tag}ending-${i + 1}-${sc}`);
  }
  G.outro.hold = false;
  check(`every scene drawn at quality ${G.quality}`, G.outro.scene === 'tease');
  G.outro.skip();
  await atResult('shots');
  return log;
}

if (mode === 'press') {
  await toTheSun('press');
  await until(() => G.outro.ready, 30000);
  await until(() => G.outro.line === 0, 4000);
  let n = 0;
  while (G.outro.playing && n < 60) { (n % 2 ? keyTap('Space') : $('intro').click()); n++; await wait(260); }
  check('Space / click move it on: every scene in order, every line', G.outro.seen.scenes.join() === SCENES.join() && G.outro.seen.lines.length === 9, G.outro.seen.scenes.join(), G.outro.seen.lines.join(), `${n} presses`);
  check('…and at the end the result', n < 60);
  await atResult('press');
  await continueOn('press');
  return log;
}

// ---- (full) the whole ending, nothing pressed
await toTheSun('the first escape');
check('…its forest was fetched while the hero ran (up within a moment)', await until(() => G.outro.ready, 8000), r2(G.outro.t));
const SHOT_AT = { light: 2.4, sunlight: 7.4, cave: 13.6, gathered: 21.9, setoff: 30.0, credits: 38.0, tease: 47.2 };
const taken = new Set(), order = [], lines = [];
let stats = null, credits = '', title = '', during = null;
const t0 = performance.now();
while (G.outro.playing && performance.now() - t0 < 120000) {
  const sc = G.outro.scene;
  if (order.at(-1) !== sc) order.push(sc);
  if (G.outro.line >= 0 && lines.at(-1) !== G.outro.line) lines.push(G.outro.line);
  if (!taken.has(sc) && G.outro.t >= SHOT_AT[sc]) {
    taken.add(sc);
    G.outro.hold = true; await wait(150);
    if (sc === 'gathered') { await wait(900); stats = { stars: $('outro-stars')?.textContent, bosses: $('outro-bosses')?.textContent, shards: $('outro-shards')?.textContent, time: $('outro-time')?.textContent, where: G.outro.where() }; during = mem(); }
    if (sc === 'credits') credits = $('intro-credits').textContent;
    if (sc === 'tease') title = G.outro.text;
    await shot(`${tag}ending-${SCENES.indexOf(sc) + 1}-${sc}`);
    G.outro.hold = false;
  }
  await wait(50);
}
const seen = G.outro.seen;
check('all seven scenes, in order', seen.scenes.join() === SCENES.join() && order.join() === SCENES.join(), seen.scenes.join(), order.join());
check('all nine subtitles, in order (typed in Jua)', seen.lines.join() === '0,1,2,3,4,5,6,7,8' && getComputedStyle($('intro-line')).fontFamily.includes('Jua'), seen.lines.join());
check('it lasts 40–52 s', G.outro.t >= 40 && G.outro.t <= 52, r2(G.outro.t), `${r2((performance.now() - t0) / 1000)} s real`);
check('a screenshot of every scene', taken.size === 7, [...taken].join());
const sv = saved();
const st = stats?.where?.stats;
check('the stars shown = every star earned in the save', !!st && st.stars === earned(sv) && stats.stars.includes(String(earned(sv))), stats?.stars, earned(sv));
check('the bosses shown = the save\'s (4/4)', !!st && st.bosses.length === 4 && stats.bosses.includes('4/4') && ['rabbitChief', 'mushroomQueen', 'iceBear', 'crystalKing'].every((id) => sv.world.bosses[id]), stats?.bosses);
check('the shards shown = the bag\'s', !!st && st.shards === G.run.shards && stats.shards.includes(String(G.run.shards)), stats?.shards, G.run.shards);
check('the play time shown = the save\'s, in words', !!st && Math.abs(st.time - sv.playTime) < 3 && stats.time.includes(timeText(st.time)), stats?.time, r2(sv.playTime));
check('the stars rose (a big one for each boss), the shards sparkled, the tools and the bag were put down', st && stats.where.pieces.big === 4 && stats.where.sparkling > 0 && stats.where.toolsDown && stats.where.bagDown, JSON.stringify(stats?.where?.pieces), stats?.where?.sparkling);
check('the credits: Jiyu, Hackerwins, Polyfork, three.js, Rapier, postprocessing, N8AO, Jua, the licences', ['Jiyu', 'Hackerwins', 'Polyfork', 'three.js', 'Rapier', 'postprocessing', 'N8AO', 'Jua', 'THIRD_PARTY_LICENSES.txt'].every((w) => credits.includes(w)), credits.slice(0, 80));
check('THE END…? over the dark cave and its purple shard', title === 'THE END…?', title);
check('the win is saved (wins, the world won)', sv.wins >= 1 && sv.world.won >= 1);
await atResult('the whole ending');
await wait(800);
const after = mem();
check('GPU memory back to before the ending (geometries, textures)', Math.abs(after.geometries - memNear.geometries) <= 3 && Math.abs(after.textures - memNear.textures) <= 1 && during.geometries > memNear.geometries + 20, JSON.stringify(memNear), JSON.stringify(during), JSON.stringify(after));
const resStars = Number($('stat-stars').querySelector('b').textContent), resBosses = $('stat-bosses').textContent, resShards = Number($('stat-shards').querySelector('b').textContent);
check('the result says the same: stars, bosses 4/4, shards', resStars === st?.stars && resBosses.includes('4/4') && resShards === st?.shards, resStars, resBosses, resShards);
await shot(`${tag}ending-8-result`);
await continueOn('first');
check('…the purple shard waits on the king\'s platform (the post-game)', !!X.secrets.shard?.alive);

// ---- a second escape: Esc in scene 3 → the result
await wait(800);
const won1 = saved().world.won;
await toTheSun('the second escape');
await until(() => G.outro.ready, 10000);
G.outro.seek(13.0);
await until(() => G.outro.scene === 'cave', 2000);
const memMid = mem();
keyTap('Escape');
await until(() => !G.outro.playing, 3000);
check('Esc skips it (in scene 3) — the menu did not open', !G.outro.playing && !shown('menu'), G.mode);
await atResult('Esc in scene 3');
await wait(800);
{ const m = mem(); check('GPU memory back again (the second, skipped mid-way)', Math.abs(m.geometries - memNear.geometries) <= 3 && Math.abs(m.textures - memNear.textures) <= 1 && memMid.geometries > memNear.geometries + 20, JSON.stringify(memNear), JSON.stringify(memMid), JSON.stringify(m)); }
check('…a second win in the save', saved().world.won === won1 + 1, saved().world.won);
await continueOn('second');

// ---- a third: 건너뛰기 at once, before the set is up
await wait(800);
await toTheSun('the third escape');
$('intro-skip').click();
await until(() => !G.outro.playing, 3000);
await atResult('건너뛰기 at once');
await wait(800);
const after3 = mem();
check('GPU memory back again (the third: never built)', Math.abs(after3.geometries - memNear.geometries) <= 3 && Math.abs(after3.textures - memNear.textures) <= 1, JSON.stringify(memNear), JSON.stringify(after3));
await continueOn('third');
await wait(600);
await shot(`${tag}ending-9-after`);
return log;
