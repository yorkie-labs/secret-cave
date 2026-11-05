// W8: the intro cutscene (tasks/20261105-intro-cutscene-todo.md, GDD §2.1):
// a 3D scene in the game's own renderer (ui/intro.js), six scenes, the
// subtitles typed in order, letterbox bars, 건너뛰기 ▶▶ / Esc / Space.
// Run with GAME_URL='http://localhost:5191/?seed=4' (a fresh save), and the
// variants by adding `&w8=<mode>` to the address:
//   (none)    새 게임 → the intro (scenes, lines, Space moves on a line) →
//             건너뛰기 in scene 2 → the game at the sinkhole's foot; then the
//             Esc menu's 이야기 보기: plays (no HUD over it), Esc skips it in
//             scene 5, back to the menu; again, skipped at once; GPU memory
//             (geometries, textures) back to what it was; the save is logged
//             (for the `continue` run)
//   full      새 게임 → the whole intro, no skipping: every scene and line in
//             order, a screenshot per scene → the game at the sinkhole's foot
//   continue  (run with a started save as the 3rd e2e argument) 이어 하기:
//             no intro, straight into the game
//   mobile    (MOBILE=1 / MOBILE=landscape) bars, subtitle and 건너뛰기 fit
//             the screen and take a tap; the tap lands in the game
const mode = new URLSearchParams(location.search).get('w8') ?? 'skip';
const $ = (id) => document.getElementById(id);
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const until = async (test, ms = 8000, step = 40) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (test()) return true; await wait(step); } return false; };
const keyTap = (code) => { dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); };
const shown = (id) => !$(id).classList.contains('hidden') && getComputedStyle($(id)).visibility !== 'hidden';
const mem = () => ({ ...G.renderer.info.memory });
const scenesInOrder = (seen) => ['forest', 'tracks', 'cave', 'fall', 'dark', 'tools'].filter((s) => seen.includes(s)).join() === seen.join();
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r2 = (v) => +v.toFixed(2);

// the drop into the sinkhole, then standing at the entrance (the game as before)
async function landsAtEntrance(label) {
  const ok = await until(() => G.mode === 'play', 6000);
  check(`${label}: the game starts (play)`, ok && G.state.world.started, G.mode);
  await until(() => P.state.grounded && P.position.y < 2, 8000);
  await wait(600);
  const home = G.expedition.home();
  check(`${label}: at the sinkhole's foot (the entrance)`, flat(P.position, home) < 3 && Math.abs(P.position.y - home.y) < 1, pos(), home.toArray().map(r2));
  check(`${label}: the intro is gone, the HUD is back`, $('intro').classList.contains('hidden') && !document.body.classList.contains('intro-on') && shown('hud') && !G.story.playing && !G.story.view);
}

if (mode === 'continue') {
  check('a saved game: the title says 이어 하기', $('btn-new').textContent === '이어 하기', $('btn-new').textContent);
  $('btn-new').click();
  await wait(300);
  check('이어 하기: no intro', $('intro').classList.contains('hidden') && !G.intro && !G.story.playing);
  await until(() => G.mode === 'play', 4000);
  check('…straight into the game', G.mode === 'play', G.mode);
  await shot('w8-continue');
  return log;
}

// ---- 새 게임 → the intro
check('a fresh save: the title says 새 게임', $('btn-new').textContent === '새 게임' && !G.state.world.started);
$('btn-new').click();
await wait(100);
check('새 게임 → the intro plays (letterbox, 건너뛰기 ▶▶)', shown('intro') && G.intro?.playing && $('intro-skip').textContent.includes('건너뛰기') && !shown('title'));
check('…its models were asked for at boot: ready at once or soon', await until(() => G.intro.ready, 20000), r2(G.intro.t));
const bar = () => [document.querySelector('#intro .bar.top').getBoundingClientRect(), document.querySelector('#intro .bar.bottom').getBoundingClientRect()];

if (mode === 'mobile') {
  await until(() => G.intro.line === 0 && G.intro.text.length > 10, 6000);
  const [top, bottom] = bar(), skip = $('intro-skip').getBoundingClientRect(), line = $('intro-line').getBoundingClientRect();
  check('the bars sit top and bottom, the picture between', top.top === 0 && Math.abs(bottom.bottom - innerHeight) < 1 && top.height > 20 && bottom.height > 20, r2(top.height), r2(bottom.height), innerWidth, innerHeight);
  check('건너뛰기 is on screen and big enough for a thumb (≥ 36 px)', skip.left >= 0 && skip.right <= innerWidth && skip.top >= 0 && skip.height >= 36, JSON.stringify([r2(skip.left), r2(skip.top), r2(skip.width), r2(skip.height)]));
  check('the subtitle fits in the lower bar', line.left >= 0 && line.right <= innerWidth && line.top >= bottom.top - 1 && line.bottom <= innerHeight, JSON.stringify([r2(line.top), r2(line.bottom), r2(bottom.top)]));
  await wait(1200);
  await shot(`w8-mobile-${innerWidth > innerHeight ? 'landscape' : 'portrait'}`);
  // a tap on the button (touch: pointer + click)
  $('intro-skip').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
  $('intro-skip').click();
  await until(() => !G.intro.playing, 3000);
  await landsAtEntrance('tap 건너뛰기');
  return log;
}

if (mode === 'full') {
  // every scene in turn, a picture of each, nothing pressed
  const SHOT_AT = { forest: 5.4, tracks: 9.2, cave: 15.4, fall: 21.6, dark: 32.6, tools: 39.2 };
  const taken = new Set();
  const order = [];
  const t0 = performance.now();
  while (G.intro.playing && performance.now() - t0 < 90000) {
    const sc = G.intro.scene;
    if (order.at(-1) !== sc) order.push(sc);
    if (!taken.has(sc) && G.intro.t >= SHOT_AT[sc]) {
      taken.add(sc);
      G.intro.hold = true; await wait(120);
      await shot(`intro-${order.length}-${sc}`);
      G.intro.hold = false;
    }
    if (G.intro.line >= 0) { const l = G.intro.line; if (!order.lines) order.lines = []; if (order.lines.at(-1) !== l) order.lines.push(l); }
    await wait(50);
  }
  const seen = G.intro.seen;
  check('all six scenes, in order (the debug hook)', seen.scenes.join() === 'forest,tracks,cave,fall,dark,tools' && scenesInOrder(order), seen.scenes.join(), order.join());
  check('all eleven subtitles, in order', seen.lines.join() === '0,1,2,3,4,5,6,7,8,9,10', seen.lines.join());
  check('it lasts 30–45 s', G.intro.t >= 30 && G.intro.t <= 45, r2(G.intro.t), `${r2((performance.now() - t0) / 1000)} s real`);
  check('a screenshot of every scene', taken.size === 6, [...taken].join());
  await landsAtEntrance('the whole intro');
  await shot('w8-after-full');
  return log;
}

// ---- (skip) scenes and lines in order, Space moves on a line, 건너뛰기 mid-scene
await until(() => G.intro.line === 0, 4000);
await wait(300);
const typed = () => $('intro-line').querySelector('span')?.textContent.length ?? 0;
const typed0 = typed();
await wait(500);
check('the first line is typed out softly (more letters a moment later)', typed0 > 0 && typed() > typed0 && $('intro-line').querySelector('i').textContent.length > 0, typed0, typed());
check('…in the Jua font', getComputedStyle($('intro-line')).fontFamily.includes('Jua'));
const tA = G.intro.t;
keyTap('Space'); await wait(120);
check('Space finishes a typing line at once', $('intro-line').querySelector('i').textContent === '' && G.intro.line === 0, $('intro-line').querySelector('i').textContent);
keyTap('Space'); await wait(200);
check('…and Space again: the next line (scene 2: the footprints)', G.intro.line === 1 && G.intro.scene === 'tracks' && G.intro.t > tA, G.intro.line, G.intro.scene);
$('intro').click(); await wait(150); $('intro').click(); await wait(150);
check('a click moves on too', G.intro.line === 2, G.intro.line, G.intro.text);
check('scenes seen so far in order', G.intro.seen.scenes.join() === 'forest,tracks', G.intro.seen.scenes.join());
check('the HUD is hidden under the intro', !shown('hud'));
$('intro-skip').click();
await until(() => !G.intro.playing, 3000);
check('건너뛰기 ends it within a moment', !G.intro.playing);
await landsAtEntrance('건너뛰기');
await shot('w8-after-skip');
const saveJson = localStorage.getItem(G.saveKey ?? 'secret-cave-save-v1');

// ---- the Esc menu's 이야기 보기: plays, Esc skips it, back to the menu
await wait(1500);
keyTap('Escape'); await wait(300);
check('Esc: the menu', shown('menu') && G.mode === 'menu');
await wait(400);
const before = mem();
$('btn-intro').click();
await wait(100);
check('이야기 보기 → the intro again (menu and HUD hidden)', G.intro.playing && shown('intro') && !shown('menu') && !shown('hud'));
await until(() => G.intro.ready, 10000);
await wait(1500);
G.intro.seek(27.6); await wait(600); // (on to scene 5: the dark)
check('…playing on (the debug hook: scene 5, a line)', G.intro.scene === 'dark' && G.intro.line === 7, G.intro.scene, G.intro.line);
const during = mem();
keyTap('Escape');
await until(() => !G.intro.playing, 3000);
await wait(100);
check('Esc skips it (in scene 5): back to the menu (the menu did not catch that Esc)', !G.intro.playing && shown('menu') && G.mode === 'menu', G.mode);
await wait(1200);
check('…the intro overlay is gone', $('intro').classList.contains('hidden'));
// once more, skipped at once (even before its first line)
$('btn-intro').click(); await wait(50);
$('intro-skip').click();
await until(() => !G.intro.playing, 3000);
await wait(1200);
check('skipped at once: back to the menu', shown('menu') && G.mode === 'menu' && $('intro').classList.contains('hidden'));
await wait(500);
const after = mem();
check('GPU memory back to before (geometries, textures)', Math.abs(after.geometries - before.geometries) <= 3 && Math.abs(after.textures - before.textures) <= 1, JSON.stringify(before), JSON.stringify(during), JSON.stringify(after));
$('btn-resume').click(); await wait(300);
check('the menu closes: playing again', G.mode === 'play' && shown('hud'), G.mode);
await shot('w8-back-in-game');
log.push(['SAVE', saveJson]);
return log;
