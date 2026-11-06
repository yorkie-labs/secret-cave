// CPU profile of the game loop (tasks/20261107-perf-todo.md, after
// scary-island's): where the main thread's time goes while the hero stands
// at a spot, uncapped frames on the real GPU. Prints the scene's object
// counts and the functions with the most self time per frame.
// Needs a dev server. Usage:
//   GAME_URL='http://localhost:5191/?start=heart&seed=4' node scripts/profile.mjs [spot] [dist]
// spot: camp (default) | valley | forest | lake | heart (scenarios/perf.js's
// spots, design coordinates), dist the lens distance (default 30; valley 45).
// DPR=2 for a Retina screen.
import puppeteer from 'puppeteer-core';

const url = process.env.GAME_URL ?? 'http://localhost:5191/?start=heart&seed=4';
const SPOTS = { camp: [-10, 0, 30], valley: [-20, 262, 45], forest: [300, 70, 30], lake: [-330, 10, 30], heart: [0, -212, 30] };
const [spot = 'camp', distArg] = process.argv.slice(2);
const [u, v, d0] = SPOTS[spot] ?? SPOTS.camp;
const dist = Number(distArg ?? d0);
const dpr = Number(process.env.DPR ?? 1);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000,
  args: ['--use-angle=metal', '--window-size=1100,800', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1100, height: 800, deviceScaleFactor: dpr },
});
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.G && document.getElementById('loading-text').textContent === '', { timeout: 90000 });
await page.waitForFunction(() => !window.G.models || window.G.models.pending === 0, { timeout: 180000, polling: 250 });
const counts = await page.evaluate(async (u, v, dist) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.getElementById('btn-new').click(); await wait(600);
  if (!document.getElementById('intro').classList.contains('hidden')) { document.getElementById('intro-skip').click(); for (let i = 0; i < 40 && G.intro?.playing; i++) await wait(100); await wait(300); }
  for (let i = 0; i < 40 && G.mode !== 'play'; i++) { if (G.hud.inDialog) G.hud.advanceDialog(); await wait(200); }
  G.hurtPlayer = () => false;
  for (const r of G.expedition.spots.values()) G.expedition.sleepSpot(r.spot.id);
  G.expedition.jump(G.world.def.M(u, v));
  G.cam.rig.distance = dist;
  await wait(4000);
  let objects = 0, meshes = 0, visible = 0;
  G.scene.traverse((o) => { objects++; if (o.isMesh) meshes++; });
  G.scene.traverseVisible(() => visible++);
  return { objects, meshes, visible };
}, u, v, dist);
const cdp = await page.createCDPSession();
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
const frames = await page.evaluate(() => new Promise((done) => {
  let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < 5000) requestAnimationFrame(tick); else done(n); };
  requestAnimationFrame(tick);
}));
const { profile } = await cdp.send('Profiler.stop');
// self time per function (samples × interval)
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dts = profile.timeDeltas;
profile.samples.forEach((id, i) => {
  const n = byId.get(id), f = n.callFrame;
  const key = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/').replace(/\?.*/, '')}:${f.lineNumber + 1}`;
  self.set(key, (self.get(key) ?? 0) + (dts[i] ?? 0) / 1000);
});
const idle = ['(idle)', '(program)', '(garbage collector)'];
const total = [...self.values()].reduce((a, b) => a + b, 0);
const busy = [...self].filter(([k]) => !idle.some((s) => k.startsWith(s))).reduce((a, [, ms]) => a + ms, 0);
console.log(`${spot} (lens ${dist} m, dpr ${dpr}): ${frames} frames in 5 s (${(frames / 5).toFixed(1)} fps); scene objects ${counts.objects}, meshes ${counts.meshes}, visible ${counts.visible}`);
console.log(`profiled ${total.toFixed(0)} ms; JS (not idle/program/GC) ${(busy / frames).toFixed(2)} ms/frame`);
for (const [k, ms] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`${(ms / frames).toFixed(3)} ms/frame  ${(100 * ms / total).toFixed(1)}%  ${k}`);
await browser.close();
