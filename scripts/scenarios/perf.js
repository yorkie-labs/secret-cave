// Perf pass (tasks/20261107-perf-todo.md): the same five spots at every
// quality level: fps, frame ms (p50 / p95), the main loop's CPU ms, GPU ms
// per pass (EXT_disjoint_timer_query_webgl2: shadow map, scene, AO,
// effect pass), draw calls and triangles of one whole frame; and same-spot
// screenshots per level (camp, valley vista, forest, heart).
//   GAME_URL='http://localhost:5191/?start=heart&seed=4&levels=high,medium,low'
//   UNCAPPED=1 DPR=2 SIZE=1440x900 node scripts/e2e.mjs scripts/scenarios/perf.js <outDir>
// UNCAPPED=1 lifts the 60 fps cap (the fps then says what a frame costs), DPR=2
// is a Retina screen. `&tag=before-` names the shots; `&shots=0` skips them.
// The timers are put on from here (the composer's passes, the shadow map),
// so the same script measures a build without the perf overlay too.
const q = new URLSearchParams(location.search);
const levels = (q.get('levels') ?? 'high,low').split(',');
const tag = q.get('tag') ?? '', shots = q.get('shots') !== '0';
const X = G.expedition, D = G.world.def;
const M = (u, v) => D.M(u, v);
const r1 = (v) => +v.toFixed(1), r2 = (v) => +v.toFixed(2);
const FACE_CAM = Math.PI / 4;
const R = G.renderer, gl = R.getContext();
const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
const dbg = gl.getExtension('WEBGL_debug_renderer_info');
log.push(['GPU', dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a', 'timer query: ' + !!ext, 'dpr ' + devicePixelRatio, `${innerWidth}×${innerHeight}`]);

// ---- GPU timers: one query open at a time; a nested pass (the shadow map
// inside the scene render) closes its parent's and opens it again after
const pending = [], stack = [], gpu = {};
let open = null, timing = false;
const begin = (label) => { const query = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, query); open = { query, label }; };
const close = () => { if (!open) return; gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(open); open = null; };
const enter = (label) => { if (!ext || !timing) return; close(); stack.push(label); begin(label); };
const leave = () => { if (!ext || !timing || !stack.length) return; close(); stack.pop(); if (stack.length) begin(stack.at(-1)); };
const poll = () => {
  while (pending.length && gl.getQueryParameter(pending[0].query, gl.QUERY_RESULT_AVAILABLE)) {
    const { query, label } = pending.shift();
    if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) gpu[label] = (gpu[label] ?? 0) + gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
    gl.deleteQuery(query);
  }
};
const wrap = (obj, name, label) => {
  const f = obj[name];
  if (f.__timed) return;
  const g = function (...a) { enter(label(this)); try { return f.apply(this, a); } finally { leave(); } };
  g.__timed = true;
  obj[name] = g;
};
const labelOf = (p) => /RenderPass/.test(p.name ?? p.constructor.name) ? 'scene' : /N8AO/i.test(p.constructor.name) || p === G.post.ao ? 'ao' : 'effect';
const timePasses = () => { for (const p of G.post.composer.passes) wrap(p, 'render', labelOf); };
wrap(R.shadowMap, 'render', () => 'shadow');
// the main loop's CPU (what it calls through G: the whole update, the
// camera, the lights, the post chain's draw calls)
let cpu = 0;
const cpuWrap = (obj, name) => { const f = obj[name]; obj[name] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { cpu += performance.now() - t; } }; };
for (const [o, n] of [[G.physics, 'step'], [G.player, 'update'], [G, 'update'], [G.pointer, 'update'], [G.cam, 'update'], [G.look, 'update'], [G.post, 'render']]) cpuWrap(o, n);
let frames = 0;
{ const f = G.post.render; G.post.render = function (...a) { frames++; poll(); return f.apply(this, a); }; }

async function at(u, v, dist) {
  X.jump(M(u, v));
  P.state.heading = FACE_CAM;
  G.cam.rig.distance = dist;
  await wait(300); await skip(); G.hud.toast('', 1);
  P.state.heading = FACE_CAM;
  await wait(2000);
}
async function measure(level, spot) {
  timePasses();
  const dts = []; let prev = performance.now();
  for (const k in gpu) delete gpu[k];
  cpu = 0; frames = 0; timing = true;
  await new Promise((done) => { const t0 = performance.now(); (function f() { const now = performance.now(); dts.push(now - prev); prev = now; if (now - t0 < 3000) requestAnimationFrame(f); else done(); })(); });
  timing = false; close(); stack.length = 0;
  const n = frames, cpuMs = cpu;
  await wait(300); poll();
  dts.shift(); dts.sort((a, b) => a - b);
  const avg = dts.reduce((a, b) => a + b, 0) / dts.length;
  R.info.autoReset = false; R.info.reset();
  for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
  const calls = Math.round(R.info.render.calls / 20), tris = Math.round(R.info.render.triangles / 20);
  R.info.autoReset = true;
  const g = Object.fromEntries(Object.entries(gpu).map(([k, v]) => [k, r2(v / n)]));
  log.push(['PERF', level, spot, JSON.stringify({ fps: r1(1000 / avg), p50: r1(dts[dts.length >> 1]), p95: r1(dts[Math.floor(dts.length * 0.95)]), cpu: r2(cpuMs / n), gpu: g, gpuSum: r2(Object.values(gpu).reduce((a, b) => a + b, 0) / n), calls, tris, pr: R.getPixelRatio(), buf: `${gl.drawingBufferWidth}×${gl.drawingBufferHeight}`, perf: G.perfStats?.() ?? null })]);
}

G.hurtPlayer = () => false;
await start(); await wait(2500);
for (const r of X.spots.values()) X.sleepSpot(r.spot.id);

// `&ab=camp,valley`: what each part costs, one switch at a time from the
// old high (2 px per css px, MSAA 4, AO, bloom, a 2048 shadow map),
// interleaved in rounds (a busy machine drifts) — needs G.setRender
const ab = q.get('ab');
if (ab) {
  const OLD = { pixelRatio: 2, msaa: 4, ao: true, bloom: true, shadows: true, shadowMap: 2048 };
  const CONFIGS = [['old high', {}], ['AO off', { ao: false }], ['bloom off', { bloom: false }], ['shadows off', { shadows: false }],
    ['shadow 1024', { shadowMap: 1024 }], ['AO no glows', { aoGlows: false }], ['AO Perf', { aoMode: 'Performance' }], ['MSAA 2', { msaa: 2 }], ['MSAA 0', { msaa: 0 }], ['px 1.5', { pixelRatio: 1.5 }], ['px 1.25', { pixelRatio: 1.25 }], ['px 1', { pixelRatio: 1 }],
    ['new high', null], ['new medium', null], ['new low', null]];
  const rounds = Number(q.get('rounds') ?? 3);
  for (const name of ab.split(',')) {
    const [, u, v, dist] = [['camp', -10, 0, 30], ['valley', -20, 262, 45], ['forest', 300, 70, 30], ['lake', -330, 10, 30], ['heart', 0, -212, 30]].find((x) => x[0] === name);
    await at(u, v, dist);
    const res = {};
    for (let r = 0; r < rounds; r++) {
      for (const [label, over] of CONFIGS) {
        G.setRender({ reset: true });
        if (over) { G.setQuality('high'); G.setRender({ ...OLD, ...over }); } else G.setQuality(label.split(' ')[1]);
        await wait(400);
        const dts = []; let prev = performance.now();
        await new Promise((done) => { const t0 = performance.now(); (function f() { const now = performance.now(); dts.push(now - prev); prev = now; if (now - t0 < 1500) requestAnimationFrame(f); else done(); })(); });
        dts.shift(); dts.sort((a, b) => a - b);
        (res[label] ??= []).push(dts[dts.length >> 1]);
      }
    }
    G.setRender({ reset: true });
    const med = (l) => [...l].sort((a, b) => a - b)[l.length >> 1];
    const base = med(res['old high']);
    for (const [label] of CONFIGS) log.push(['AB', name, label.padEnd(12), `p50 ${r1(med(res[label]))} ms`, `Δ ${r1(med(res[label]) - base)} ms`, `runs ${res[label].map(r1).join('/')}`]);
  }
  return log;
}
const SPOTS = [
  ['camp', -10, 0, 30, true],
  ['valley', -20, 262, 45, true],
  ['forest', 300, 70, 30, true],
  ['lake', -330, 10, 30, false],
  ['heart', 0, -212, 30, true],
];
for (const level of levels) {
  G.setQuality(level);
  await wait(500);
  for (const [name, u, v, dist, shoot] of SPOTS) {
    await at(u, v, dist);
    if (shots && shoot) await shot(`${tag}${level}-${name}`);
    await measure(level, name);
  }
}
return log;
