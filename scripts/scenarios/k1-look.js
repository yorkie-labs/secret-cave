// K1 (tasks/20261105-cozy-look-todo.md): the cozy look's same-spot
// screenshots and numbers (a look check, not a gate). Pick a mode with
// `&k1=<mode>` on the address (the default is `world`):
//   world  GAME_URL='http://localhost:5191/?start=heart&seed=4&k1=world'
//          entrance, valley vista, camp, balcony, forest, ice lake, crystal
//          heart (shots) + perf (fps, p95, draw calls of a whole frame) at
//          camp, valley vista, forest, lake and heart at the default zoom
//   boss   GAME_URL='http://localhost:5191/?seed=4&k1=boss' the giant
//          rabbit chief's fight, a shot while a warning is drawn
//   intro  GAME_URL='http://localhost:5191/?seed=4&k1=intro' (a fresh save)
//          the intro's first scene
// Shots are named `<prefix><n>-<place>`; pass the prefix with `&tag=before-`.
// Add `&q=low` for the low-quality path; SIZE=1600x900 (e2e.mjs) for 16:9.
const q = new URLSearchParams(location.search);
const mode = q.get('k1') ?? 'world', tag = q.get('tag') ?? '';
const X = G.expedition, D = G.world.def;
const M = (u, v) => D.M ? D.M(u, v) : [(u + v) * Math.SQRT1_2, (v - u) * Math.SQRT1_2];
const r1 = (v) => +v.toFixed(1);
const until = async (test, ms = 8000, step = 40) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (test()) return true; await wait(step); } return false; };
const snap = (name) => shot(`${tag}${name}`);
const FACE_CAM = Math.PI / 4; // (the lens sits at +x +z of the hero: the face shows)
async function at(u, v, { dist = 30, ms = 2200 } = {}) {
  const [x, z] = Array.isArray(u) ? u : M(u, v);
  X.jump([x, z]);
  P.state.heading = FACE_CAM;
  G.cam.rig.distance = dist;
  await wait(300); await skip(); G.hud.toast('', 1);
  P.state.heading = FACE_CAM;
  await wait(ms);
}
// frame times over 3 s, and the draw calls of one whole frame as the main
// loop draws it (every pass of the post chain), plus the scene alone
async function perf(name) {
  const frames = []; let prev = performance.now();
  await new Promise((done) => { const t0 = performance.now(); (function f() { const now = performance.now(); frames.push(now - prev); prev = now; if (now - t0 < 3000) requestAnimationFrame(f); else done(); })(); });
  frames.shift(); frames.sort((a, b) => a - b);
  const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
  const R = G.renderer;
  // (30 frames counted together: no guessing which rAF callback runs first)
  R.info.autoReset = false; R.info.reset();
  for (let i = 0; i < 30; i++) await new Promise((r) => requestAnimationFrame(r));
  const frame = { calls: Math.round(R.info.render.calls / 30), tris: Math.round(R.info.render.triangles / 30) };
  R.info.autoReset = true;
  R.info.reset(); R.render(G.scene, G.camera);
  log.push(['PERF', name, JSON.stringify({ fps: r1(1000 / avg), frameMs: r1(avg), p95Ms: r1(frames[Math.floor(frames.length * 0.95)]), frameCalls: frame.calls, sceneCalls: R.info.render.calls, tris: R.info.render.triangles, quality: G.quality ?? 'n/a' })]);
}

if (mode === 'intro') {
  document.getElementById('btn-new').click();
  await until(() => G.intro?.ready, 20000);
  G.intro.seek(4.6); G.intro.hold = true; await wait(1200);
  await snap('8-intro-scene1');
  G.intro.seek(33); await wait(900);
  await snap('8b-intro-dark');
  G.intro.skip();
  return log;
}

if (mode === 'boss') {
  const S = G.state;
  S.necklace = true; S.prologue = true;
  Object.assign(S.world, { started: true, camp: true, expedition: 1, seed: 4 });
  await start(); await wait(1200); await skip();
  G.hurtPlayer = () => false;
  let warned = 0; G.on('bossTelegraph', () => warned++);
  X.jump(M(150, 18)); P.state.heading = FACE_CAM; G.cam.rig.distance = 30;
  await until(() => G.mode === 'cutscene' || X.chief?.started, 8000);
  await until(() => G.mode === 'play' && X.chief?.started, 10000);
  await until(() => warned > 1, 20000); await wait(450); // (the second warning: the area banner has gone)
  await snap('7-boss-chief');
  await perf('boss');
  return log;
}

// world
G.hurtPlayer = () => false; // looking, not fighting
await start(); await wait(2500);
for (const r of X.spots.values()) X.sleepSpot(r.spot.id); // (still: no animals walking through the shots)
X.jump('entrance'); P.state.heading = FACE_CAM; G.cam.rig.distance = 30; await wait(2500);
await snap('1-entrance');
await at(-20, 262, { dist: 45, ms: 2500 }); await snap('2-valley-vista'); await perf('valley vista 45 m');
await at(-10, 0, { dist: 30 }); await snap('3a-camp'); await perf('camp');
await at(0, -70, { dist: 40 }); await snap('3b-balcony');
await at(300, 70, { dist: 30 }); await snap('4-forest'); await perf('forest');
await at(390, -60, { dist: 40 }); await snap('4b-glow-hollow');
await at(-330, 10, { dist: 30, ms: 2500 }); await snap('5-ice-lake'); await perf('lake');
await at(0, -212, { dist: 30, ms: 2500 }); await snap('6-heart'); await perf('heart');
await at(-60, -200, { dist: 45, ms: 2200 }); await snap('6b-heart-vista');
return log;
