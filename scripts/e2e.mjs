// Headless playtest driver: opens the game in a separate headless Chrome
// (1100×800, or SIZE=WxH),
// runs a scenario script (a JS file evaluated in the page) and saves
// screenshots. Usage: node scripts/e2e.mjs <scenario.js> [outDir] [saveJson]
// With GAME_URL=.../gallery.html it drives the character gallery instead
// (`window.gallery`, no game helpers).
import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync } from 'node:fs';

const [scenarioPath, outDir = '/tmp', savePath] = process.argv.slice(2);
const url = process.env.GAME_URL ?? 'http://localhost:5191/';
const gallery = url.includes('gallery');
// SIZE=1600x900: another window size (the default 1100×800), e.g. to check 16:9
const [vw, vh] = (process.env.SIZE ?? '1100x800').split('x').map(Number);
// DPR=2: a Retina screen (device pixels = 2 × css); UNCAPPED=1: no vsync and no
// 60 fps cap, so a frame's real cost shows in the fps (perf checks)
const dpr = Number(process.env.DPR ?? 1);
const uncap = process.env.UNCAPPED ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [];
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  protocolTimeout: 3600000, // (W3: the whole-game run takes ~20 min real)
  args: ['--use-angle=metal', '--enable-unsafe-swiftshader', `--window-size=${vw},${vh}`, '--autoplay-policy=no-user-gesture-required', ...uncap],
  defaultViewport: { width: vw, height: vh, deviceScaleFactor: dpr },
});
const page = await browser.newPage();
// MOBILE=1: an upright phone (touch, coarse pointer); MOBILE=landscape: lying down
if (process.env.MOBILE) {
  const land = process.env.MOBILE === 'landscape';
  await page.emulate({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', viewport: { width: land ? 844 : 390, height: land ? 390 : 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: land } });
}
const logs = [];
await page.setRequestInterception(true);
page.on('request', (r) => (/fonts\.(googleapis|gstatic)\.com/.test(r.url()) ? r.abort() : r.continue()));
// headless Chrome has no audio device: WebAudio logs this one line, which is
// the environment, not the game (M2 review), so it is left out
const KNOWN = ['AudioContext encountered an error'];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !KNOWN.some((k) => m.text().includes(k))) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
mkdirSync(outDir, { recursive: true });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
// (a started save goes in both slots: the real one, and the sandbox one a
// production build plays debug links in, core/state.js)
await page.evaluate((save) => { localStorage.clear(); if (save) { localStorage.setItem('secret-cave-save-v1', save); localStorage.setItem('secret-cave-sandbox-save-v1', save); } }, savePath ? readFileSync(savePath, 'utf8') : null);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
try {
  await page.waitForFunction(gallery ? () => window.gallery : () => window.G && document.getElementById('loading-text').textContent === '', { timeout: 90000 });
} catch (e) {
  console.log('LOAD FAILED:', await page.evaluate(() => document.getElementById('loading-text')?.textContent ?? ''), '\n' + logs.join('\n'));
  await browser.close();
  process.exit(1);
}
// release: the title comes up before every model is here (the later
// regions stream in behind it, world/models.js); the scenarios were written
// for the whole world, so they start once it has all come
if (!gallery) {
  try { await page.waitForFunction(() => !window.G.models || window.G.models.pending === 0, { timeout: 180000, polling: 250 }); } catch { console.log('MODELS STILL LOADING after 180 s:', await page.evaluate(() => JSON.stringify(window.G.models && { pending: window.G.models.pending, failed: window.G.models.failed }))); }
  const failed = await page.evaluate(() => window.G.models?.failed ?? []);
  if (failed.length) console.log('MODELS LEFT OUT:', failed.join(', '));
}
await page.exposeFunction('shot', async (name) => { await page.screenshot({ path: `${outDir}/${name}.png` }); return `${outDir}/${name}.png`; });
const scenario = readFileSync(scenarioPath, 'utf8');
// `// @bot` in a scenario: the scripted player (scenarios/_bot.js) comes too
const lib = gallery ? '' : readFileSync(new URL('./scenarios/_lib.js', import.meta.url), 'utf8')
  + (scenario.includes('// @bot') ? `\n${readFileSync(new URL('./scenarios/_bot.js', import.meta.url), 'utf8')}` : '');
const result = await page.evaluate(`(async () => { ${lib}\ntry {\n${scenario}\n} catch (e) { log.push(['ERROR', e.message, e.stack?.split('\\n')[1]]); return log; } })()`);
console.log(JSON.stringify(result, null, 1));
if (logs.length) console.log('CONSOLE:\n' + [...new Set(logs)].slice(0, 30).join('\n'));
await browser.close();
