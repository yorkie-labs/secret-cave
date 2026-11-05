// W3 (tasks/20261102-world-redesign-todo.md): the Ice Lake's look and the
// numbers. GAME_URL='http://localhost:5191/?start=ice&seed=4'.
// Screenshots: the lake vista, the frozen falls, the threshold, an ice wall,
// the grotto, the nook, the rink, the widest zoom; perf on the lake at the
// default zoom and at 45 m (and the shelf); and that nothing scattered or
// placed stands off the ground or over undrawn ground.
const W = G.world, D = W.def;
// (W6: hand-written points are in the design frame; the layout squeezes them into the world)
const M = (u, v) => G.world?.def.M ? G.world.def.M(u, v) : [(u + v) * Math.SQRT1_2, (v - u) * Math.SQRT1_2];
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const r1 = (v) => +v.toFixed(1);
G.hurtPlayer = () => false; // looking, not fighting
async function at(u, v, { dist = 30, ms = 1600, heading } = {}) {
  const [x, z] = M(u, v);
  G.expedition.jump([x, z]);
  if (heading !== undefined) P.state.heading = heading;
  G.cam.rig.distance = dist;
  await wait(300); await skip(); G.hud.toast('', 1);
  await wait(ms);
}
async function perf(name) {
  const frames = []; let prev = performance.now();
  await new Promise((done) => { const t0 = performance.now(); (function f() { const now = performance.now(); frames.push(now - prev); prev = now; if (now - t0 < 3000) requestAnimationFrame(f); else done(); })(); });
  frames.shift();
  frames.sort((a, b) => a - b);
  const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
  const R = G.renderer; R.info.reset(); R.render(G.scene, G.camera);
  const inst = G.scene.getObjectByName('scatter');
  let shown = 0, stris = 0; inst?.children.forEach((m) => { if (!m.visible) return; shown += m.count; stris += m.count * (m.geometry.attributes.position.count / 3); });
  log.push(['PERF', name, JSON.stringify({
    fps: r1(1000 / avg), frameMs: r1(avg), p95Ms: r1(frames[Math.floor(frames.length * 0.95)]),
    drawCalls: R.info.render.calls, tris: R.info.render.triangles,
    chunks: `${G.terrain.inView(G.camera)} in view / ${G.terrain.built} built / ${G.terrain.chunks.length}`, terrainTris: G.terrain.tris,
    scatterShown: shown, scatterTris: stris, lights: G.lightSources.length, enemies: G.enemies.length,
    heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) + ' MB' : '?',
  })]);
}
await start(); await wait(2500);
for (const r of G.expedition.spots.values()) if ((r.spot.region ?? 1) === 3) G.expedition.sleepSpot(r.spot.id);
log.push(['INFO', 'build', JSON.stringify(G.worldStats)]);

// every scattered thing stands on the world's ground (the icicles hang from a lip)
{
  const m4 = new G.camera.matrix.constructor(), v = new THREE.Vector3(), stray = [];
  let n = 0;
  for (const im of G.scene.getObjectByName('scatter').children) {
    for (let i = 0; i < im.userData.n; i++) {
      im.getMatrixAt(i, m4); v.setFromMatrixPosition(m4); n++;
      const [x0, z0, x1, z1] = W.bounds;
      const lip = im.name === 'scatter-icicles';
      const off = v.x < x0 || v.x > x1 || v.z < z0 || v.z > z1 || (lip ? W.heightAt(v.x, v.z) > v.y + 1 : Math.abs(W.heightAt(v.x, v.z) - (v.y + 0.05)) > 1.5);
      if (off && stray.length < 8) stray.push([im.name, r1(v.x), r1(v.y), r1(v.z), r1(W.heightAt(v.x, v.z))]);
    }
  }
  check('every scattered thing stands on the ground (icicles hang over a drop)', stray.length === 0, n, JSON.stringify(stray));
}

// ---- perf: the lake (default, 45 m), the shelf
await at(-330, 10, { dist: 30, ms: 2500 }); await perf('lake');
await at(-330, 10, { dist: 45, ms: 2500 }); await shot('w3-01-lake-vista-45'); await perf('lake 45 m');
await at(-262, 20, { dist: 32, ms: 2200 }); await perf('shelf');

// ---- the look
await at(-345, -70, { dist: 40, ms: 2000 }); await shot('w3-02-frozen-falls');
await at(-310, -95, { dist: 34, ms: 1800 }); await shot('w3-03-frozen-falls-near');
await at(-300, 40, { dist: 40, ms: 1800 }); await shot('w3-04-lake-shore');
await at(-200, -4, { dist: 38, ms: 1800 }); await shot('w3-05-threshold');
await at(-120, 4, { dist: 34, ms: 1800 }); await shot('w3-06-icy-pass');
await at(-231, -98, { dist: 30, ms: 1800 }); await shot('w3-07-ice-wall');
await at(-262, 120, { dist: 34, ms: 1800 }); await shot('w3-08-shelf-south');
await at(-340, 0, { dist: 42, ms: 2200 }); await shot('w3-09-rink');
await at(-410, 0, { dist: 42, ms: 1800 }); await shot('w3-10-lake-west');

// ---- the widest zoom the game allows (45 m) at the region's edges: nothing
// drawn over ground that is not
for (const [u, v, name] of [[-420, 0, 'lake west'], [-262, 160, 'nook'], [-232, -150, 'grotto'], [-330, -110, 'falls']]) {
  await at(u, v, { dist: 45, ms: 1800 });
  const props = G.worldProps.filter((p) => p.obj.visible && !G.terrain.builtAt(p.x, p.z));
  const sc = G.scene.getObjectByName('scatter').children.filter((m) => m.visible && !G.terrain.builtAt(...m.userData.at));
  check(`max zoom at the ${name}: nothing over undrawn ground`, !props.length && !sc.length, props.length, sc.length);
  if (name === 'lake west') await shot('w3-11-max-zoom');
}
// ---- region 3 from far up
G.camera.far = 1800; G.camera.updateProjectionMatrix();
G.scene.fog.far = 5000;
await at(-300, 10, { dist: 45, ms: 300 });
G.terrain.warmAll();
G.cam.rig.distance = 330; await wait(3000);
await shot('w3-12-region-from-above');
G.cam.rig.distance = 30; G.camera.far = D.look?.far ?? 200; G.camera.updateProjectionMatrix();
return log;
