// W4 (tasks/20261102-world-redesign-todo.md): the Crystal Heart's look and
// the numbers. GAME_URL='http://localhost:5191/?start=heart&seed=4'.
// Screenshots: the pit vista, the floating rocks, the ruins and the
// guardians, the canyons, the heart's platform under the crystal, the way
// out, the balcony view down into the built pit; perf in the pit at the
// default zoom and at 45 m and on the balcony; nothing scattered off the
// ground or over undrawn ground.
const W = G.world, D = W.def;
// (W6: hand-written points are in the design frame; the layout squeezes them into the world)
const M = (u, v) => G.world?.def.M ? G.world.def.M(u, v) : [(u + v) * Math.SQRT1_2, (v - u) * Math.SQRT1_2];
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const r1 = (v) => +v.toFixed(1);
G.hurtPlayer = () => false; // looking, not fighting
// (u, v: a design point; or u: a world point [x, z] and v the options)
async function at(u, v, opts = {}) {
  const [x, z] = Array.isArray(u) ? u : M(u, v);
  const { dist = 30, ms = 1600, heading } = Array.isArray(u) ? (v ?? {}) : opts;
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
for (const r of G.expedition.spots.values()) if (r.spot.region === 4) G.expedition.sleepSpot(r.spot.id);
G.expedition.king.update = () => {}; // (he sleeps through the pictures)
log.push(['INFO', 'build', JSON.stringify(G.worldStats)]);
{
  const m4 = new G.camera.matrix.constructor(), v = new THREE.Vector3(), stray = [];
  let n = 0;
  for (const im of G.scene.getObjectByName('scatter').children) {
    for (let i = 0; i < im.userData.n; i++) {
      im.getMatrixAt(i, m4); v.setFromMatrixPosition(m4); n++;
      const lip = im.name === 'scatter-icicles';
      const off = lip ? W.heightAt(v.x, v.z) > v.y + 1 : Math.abs(W.heightAt(v.x, v.z) - (v.y + 0.05)) > 1.5;
      if (off && stray.length < 8) stray.push([im.name, r1(v.x), r1(v.y), r1(v.z), r1(W.heightAt(v.x, v.z))]);
    }
  }
  check('every scattered thing stands on the ground', stray.length === 0, n, JSON.stringify(stray));
}
// ---- perf: the pit (the west ruins, default and 45 m), the platform, the balcony
await at(-100, -205, { dist: 30, ms: 2500 }); await perf('pit: west ruins 30 m');
await at(-60, -200, { dist: 45, ms: 2500 }); await shot('w4s-01-pit-vista-45'); await perf('pit: stones 45 m');
await at(0, -212, { dist: 30, ms: 2200 }); await perf('pit: the heart platform 30 m');
await at(1, -74, { dist: 30, ms: 2500 }); await perf('balcony 30 m'); await shot('w4s-02-balcony');
await at(1, -74, { dist: 45, ms: 2500 }); await perf('balcony 45 m'); await shot('w4s-03-balcony-45');
// ---- the look
await at(-50, -196, { dist: 32, ms: 1800 }); await shot('w4s-04-stones');
await at(-112, -200, { dist: 36, ms: 1800 }); await shot('w4s-05-ruins-west');
await at(-118, -250, { dist: 34, ms: 1800 }); await shot('w4s-06-ruins-moai');
await at(110, -200, { dist: 36, ms: 1800 }); await shot('w4s-07-ruins-east');
await at(60, -222, { dist: 30, ms: 1800 }); await shot('w4s-08-rope-bridge');
await at(-240, -182, { dist: 34, ms: 1800 }); await shot('w4s-09-canyon-west');
await at(D.places.pass4e, { dist: 34, ms: 1800 }); await shot('w4s-10-canyon-east');
await at(-4, -200, { dist: 34, ms: 1800 }); await shot('w4s-11-heart-platform');
await at(0, -310, { dist: 36, ms: 1800 }); await shot('w4s-12-guardians');
for (const [u, v, name] of [[-110, -205, 'west ruins'], [110, -205, 'east ruins'], [0, -212, 'heart']]) {
  await at(u, v, { dist: 45, ms: 1800 });
  const props = G.worldProps.filter((p) => p.obj.visible && !G.terrain.builtAt(p.x, p.z));
  const sc = G.scene.getObjectByName('scatter').children.filter((m) => m.visible && !G.terrain.builtAt(...m.userData.at));
  check(`max zoom at the ${name}: nothing over undrawn ground`, !props.length && !sc.length, props.length, sc.length);
}
G.camera.far = 1800; G.camera.updateProjectionMatrix();
G.scene.fog.far = 5000;
await at(0, -210, { dist: 45, ms: 300 });
G.terrain.warmAll();
G.cam.rig.distance = 300; await wait(3000);
await shot('w4s-13-region-from-above');
G.cam.rig.distance = 30; G.camera.far = D.look?.far ?? 200; G.camera.updateProjectionMatrix();
return log;
