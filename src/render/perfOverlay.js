// Perf pass (tasks/20261107-perf-todo.md): `?perf=1` puts a small panel in
// the top-left corner with what a frame costs on this machine, and switches
// to turn each costly part off and on live, so a player can tell us what
// is slow on theirs:
//   fps, frame ms (median / 95th of the last second), the main loop's CPU ms
//   (update; draw = the render calls, which also wait when the GPU is
//   behind), GPU ms per pass when the browser has EXT_disjoint_timer_query_
//   webgl2 (shadow map, scene, AO, effect pass; ANGLE on Metal reports
//   these loosely: compare them with each other, and trust the fps and the
//   switches more), draw calls and triangles of the whole frame (every
//   pass), pixel ratio, drawing-buffer size, the level.
//   Switches: level, AO, bloom, shadows, MSAA, pixel ratio (they last until
//   the page is reloaded; the level switch is the menu's, and is kept).
// Only made with ?perf=1: without it nothing here runs.

const SWITCHES = [
  ['ao', 'AO'], ['bloom', '블룸'], ['shadows', '그림자'],
];
const MSAA = [0, 2, 4];
const RATIOS = [1, 1.25, 1.5, 2];

/**
 * `renderer`, `post` (render/post.js), `get()` the settings now drawn and
 * `level()` the level, `set(over)` changes them ({ ao, bloom, shadows, msaa,
 * pixelRatio } or { level }). Returns { begin(), mid(), end(), stats() }
 * for the main loop: begin at the top of a frame, mid before the draw, end
 * after it.
 */
export function createPerfOverlay({ renderer, post, get, level, set }) {
  const gl = renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  // ---- GPU timers: one query open at a time; a nested pass (the shadow
  // map inside the scene render) closes its parent's and opens it again
  const pending = [], stack = [], gpuSum = {};
  let open = null, gpuFrames = 0;
  const begin = (label) => { const query = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, query); open = { query, label }; };
  const close = () => { if (!open) return; gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(open); open = null; };
  const enter = (label) => { if (!ext) return; close(); stack.push(label); begin(label); };
  const leave = () => { if (!ext || !stack.length) return; close(); stack.pop(); if (stack.length) begin(stack.at(-1)); };
  const poll = () => {
    while (pending.length && gl.getQueryParameter(pending[0].query, gl.QUERY_RESULT_AVAILABLE)) {
      const { query, label } = pending.shift();
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) gpuSum[label] = (gpuSum[label] ?? 0) + gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(query);
    }
    if (pending.length > 64) for (const p of pending.splice(0)) gl.deleteQuery(p.query); // (results never come: drop them)
  };
  const timed = new WeakSet();
  const wrap = (obj, label) => {
    if (timed.has(obj)) return;
    timed.add(obj);
    const f = obj.render;
    obj.render = function (...a) { enter(label()); try { return f.apply(this, a); } finally { leave(); } };
  };
  const timePasses = () => { for (const p of post.composer.passes) { const name = post.passName(p); wrap(p, () => name); } };
  wrap(renderer.shadowMap, () => 'shadow');

  // ---- the frame
  const info = renderer.info;
  info.autoReset = false; // (counted over the whole frame: every pass)
  const dts = [], cpus = [];
  let t0 = 0, tMid = 0, last = 0, upd = 0, draw = 0, n = 0, calls = 0, tris = 0, shown = 0;
  const out = {
    begin() {
      const now = performance.now();
      if (last) dts.push(now - last);
      last = t0 = now;
      info.reset();
      if (ext) { poll(); timePasses(); gpuFrames++; }
    },
    mid() { tMid = performance.now(); },
    end() {
      const now = performance.now();
      upd += tMid - t0; draw += now - tMid; cpus.push(now - t0); n++;
      calls += info.render.calls; tris += info.render.triangles;
      if (now - shown > 1000) { show(now - shown); shown = now; }
    },
    stats: () => latest,
  };

  // ---- the panel
  const el = document.createElement('div');
  el.id = 'perf';
  el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:50;background:rgba(10,12,24,.82);color:#e8f0ff;font:12px/1.35 ui-monospace,Menlo,monospace;padding:8px 10px;border-radius:8px;pointer-events:auto;max-width:330px;white-space:pre';
  const text = document.createElement('div');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;white-space:normal';
  el.append(text, row);
  const btn = (label, fn) => {
    const b = document.createElement('button');
    b.style.cssText = 'font:11px ui-monospace,Menlo,monospace;padding:2px 6px;border-radius:5px;border:1px solid #6a78b0;background:#1e2442;color:#e8f0ff;cursor:pointer';
    b.onclick = (e) => { e.stopPropagation(); fn(); refresh(); };
    b.onmousedown = (e) => e.stopPropagation();
    row.append(b);
    return (t) => { b.textContent = t; };
  };
  const labels = [];
  labels.push([btn('', () => set({ level: { high: 'medium', medium: 'low', low: 'high' }[level()] })), () => `화질 ${level()}`]);
  for (const [k, name] of SWITCHES) labels.push([btn('', () => set({ [k]: !get()[k] })), () => `${name} ${get()[k] ? 'on' : 'off'}`]);
  labels.push([btn('', () => set({ msaa: MSAA[(MSAA.indexOf(get().msaa) + 1) % MSAA.length] })), () => `MSAA ${get().msaa}`]);
  labels.push([btn('', () => {
    const r = get().pixelRatio, i = RATIOS.findIndex((x) => x > r + 1e-6);
    set({ pixelRatio: i < 0 ? RATIOS[0] : RATIOS[i] });
  }), () => `px ${get().pixelRatio}`]);
  labels.push([btn('기본값', () => set({ reset: true })), () => '기본값']);
  const refresh = () => { for (const [setText, f] of labels) setText(f()); };
  refresh();
  document.body.append(el);

  let latest = null;
  const pct = (list, p) => { const s = [...list].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0; };
  function show(span) {
    if (!n) return;
    const g = Object.fromEntries(Object.entries(gpuSum).map(([k, v]) => [k, v / Math.max(1, gpuFrames)]));
    const gTot = Object.values(g).reduce((a, b) => a + b, 0);
    const s = get();
    latest = {
      fps: (dts.length * 1000) / span, p50: pct(dts, 0.5), p95: pct(dts, 0.95), cpu: cpus.reduce((a, b) => a + b, 0) / n,
      update: upd / n, draw: draw / n, gpu: ext ? g : null, gpuTotal: ext ? gTot : null,
      calls: Math.round(calls / n), tris: Math.round(tris / n), pixelRatio: renderer.getPixelRatio(),
      size: `${gl.drawingBufferWidth}×${gl.drawingBufferHeight}`, level: level(), settings: { ...s },
    };
    const f1 = (v) => v.toFixed(1);
    text.textContent = [
      `${f1(latest.fps)} fps   frame ${f1(latest.p50)} ms (p95 ${f1(latest.p95)})`,
      `CPU ${f1(latest.cpu)} ms  (update ${f1(latest.update)} · draw ${f1(latest.draw)})`,
      ext ? `GPU* ${f1(gTot)} ms  shadow ${f1(g.shadow ?? 0)} · scene ${f1(g.scene ?? 0)} · AO ${f1(g.ao ?? 0)} · fx ${f1(g.effect ?? 0)}` : 'GPU: (no timer query in this browser)',
      `draw calls ${latest.calls}   tris ${(latest.tris / 1000).toFixed(0)}k`,
      `pixels ${latest.size} (×${latest.pixelRatio})  level ${latest.level}`,
    ].join('\n');
    refresh();
    dts.length = 0; cpus.length = 0; upd = draw = 0; n = 0; calls = tris = 0;
    for (const k in gpuSum) delete gpuSum[k];
    gpuFrames = 0;
  }
  return out;
}
