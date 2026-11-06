// Perf pass (tasks/20261107-perf-todo.md): the ?perf=1 panel, its switches,
// the menu's 화질 button (높음 → 중간 → 낮음, kept) and the adaptive step
// down (a slow machine made by a busy loop in each frame).
//   GAME_URL='http://localhost:5191/?seed=4&perf=1&adapt=1' node scripts/e2e.mjs scripts/scenarios/perf-ui.js <outDir>
const until = async (test, ms = 8000, step = 50) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (test()) return true; await wait(step); } return false; };
const check = (name, ok, extra = '') => log.push([ok ? 'PASS' : 'FAIL', name, extra]);
const panel = document.getElementById('perf');
check('the panel is there with ?perf=1', !!panel);
await start(); await wait(1500);
// the adaptive step down: frames of ~30 ms (under 50 fps) for 5 s of warm-up
// and 4 s of samples → one level down, a word, kept as the adaptive's own
let slow = true;
G.onUpdate(() => { if (slow) { const t = performance.now(); while (performance.now() - t < 28); } });
let toast = '';
const t = G.toast; G.toast = (text, ms) => { toast = text; return t(text, ms); };
check('starts high, not chosen', G.quality === 'high' && !G.adaptive.done, G.quality);
await until(() => G.quality !== 'high', 20000);
check('steps down to medium', G.quality === 'medium', `${G.quality} after p50 ${G.adaptive.last?.toFixed(1)} ms`);
check('says so', toast.includes('화질을 낮췄어요'), toast);
check('keeps it as the adaptive\'s own', localStorage.getItem('secret-cave-quality') === 'auto:medium', localStorage.getItem('secret-cave-quality'));
check('medium: no AO, bloom, 1024 map, at most 1.25 px', !G.renderSettings().ao && G.renderSettings().bloom && G.look.key.shadow.mapSize.x === 1024 && G.renderer.getPixelRatio() <= 1.25, JSON.stringify(G.renderSettings()));
await shot('perf-ui-1-medium');
slow = false;
// a fast machine at medium: the adaptive stops (never steps up)
await until(() => G.adaptive.done, 15000);
check('stops at medium once it runs well (never up)', G.adaptive.done && G.quality === 'medium', G.quality);
// the panel's switches
const buttons = [...panel.querySelectorAll('button')];
const byText = (s) => buttons.find((b) => b.textContent.startsWith(s));
await wait(1200);
check('the panel reads fps, CPU, calls, pixels', /fps/.test(panel.textContent) && /CPU/.test(panel.textContent) && /draw calls/.test(panel.textContent) && /pixels/.test(panel.textContent), panel.firstChild.textContent.replace(/\n/g, ' | '));
byText('블룸').click(); await wait(200);
check('블룸 switch', G.renderSettings().bloom === false && G.post.settings.bloom === false);
byText('그림자').click(); await wait(200);
check('그림자 switch', G.look.key.castShadow === false);
byText('AO').click(); await wait(200);
check('AO switch on at medium', G.post.settings.ao === true && G.post.ao?.enabled === true);
byText('MSAA').click(); await wait(200);
const m = G.post.settings.msaa;
check('MSAA switch cycles', [0, 2, 4].includes(m), String(m));
byText('px').click(); await wait(200);
check('px switch', G.renderer.getPixelRatio() > 0, String(G.renderer.getPixelRatio()));
await wait(1200);
await shot('perf-ui-2-switches');
byText('기본값').click(); await wait(300);
check('기본값 drops the switches', G.renderSettings().bloom === true && G.look.key.castShadow === true && G.post.settings.ao === false);
// the menu's 화질 button: medium → low → high, the player's own pick
document.getElementById('btn-quality').click(); await wait(200);
check('menu: 중간 → 낮음', G.quality === 'low' && localStorage.getItem('secret-cave-quality') === 'low', document.getElementById('btn-quality').textContent);
document.getElementById('btn-quality').click(); await wait(200);
check('menu: 낮음 → 높음', G.quality === 'high' && localStorage.getItem('secret-cave-quality') === 'high' && document.getElementById('btn-quality').textContent === '화질: 높음');
check('high: AO, bloom, 2048 map', G.post.settings.ao && G.post.settings.bloom && G.look.key.shadow.mapSize.x === 2048);
return log;
