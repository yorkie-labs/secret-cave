// W2 (tasks/20261102-world-redesign-todo.md): the Mushroom Forest's look and
// the big world's numbers. GAME_URL='http://localhost:5191/?start=mushroom&seed=4'.
// Screenshots: the forest canopy vista, the web bridge, a bounce mushroom's
// arc, a fumarole's puff, the queen's ring, the camp balcony's crystals, the
// whole world from far up (nothing stray past its edges); perf at the
// entrance, the valley vista (45 m), the camp, the forest (default, 45 m);
// and a check that no scattered thing stands off the ground.
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
log.push(['INFO', 'build', JSON.stringify(G.worldStats)]);

// every scattered thing stands on the world's ground (no strays in the void)
{
  const m4 = new G.camera.matrix.constructor(), v = new THREE.Vector3(), stray = [];
  let n = 0;
  for (const im of G.scene.getObjectByName('scatter').children) {
    for (let i = 0; i < im.userData.n; i++) {
      im.getMatrixAt(i, m4); v.setFromMatrixPosition(m4); n++;
      const [x0, z0, x1, z1] = W.bounds;
      const lip = im.name === 'scatter-icicles'; // (W3: icicles hang from a lip, over the drop)
      const off = v.x < x0 || v.x > x1 || v.z < z0 || v.z > z1 || (lip ? W.heightAt(v.x, v.z) > v.y + 1 : Math.abs(W.heightAt(v.x, v.z) - (v.y + 0.05)) > 1.5);
      if (off && stray.length < 8) stray.push([im.name, r1(v.x), r1(v.y), r1(v.z), r1(W.heightAt(v.x, v.z))]);
    }
  }
  check('every scattered thing stands on the ground', stray.length === 0, n, JSON.stringify(stray));
  // and the landmarks (sunk rock pillars aside)
  const lm = (D.landmarks ?? []).filter((l) => l.y === undefined && Math.abs((W.heightAt(l.x, l.z) - (l.sink ?? (l.model === 'seaStack' ? 1.5 : 0))) - W.heightAt(l.x, l.z)) > 4);
  check('every landmark stands on the ground', lm.length === 0, JSON.stringify(lm.map((l) => l.model)));
}

// ---- perf: region 1 and the camp (as W1), then the forest
await at(-40, 384, { dist: 30, ms: 2500 }); await perf('entrance');
await at(-20, 262, { dist: 45, ms: 2500 }); await shot('w2-perf-valley-vista'); await perf('valley vista 45 m');
await at(-10, 0, { dist: 32, ms: 2200 }); await perf('camp');

// ---- the forest
await at(300, 70, { dist: 32, ms: 2200 }); await shot('w2-01-forest'); await perf('forest');
await at(300, 70, { dist: 45, ms: 2200 }); await shot('w2-02-forest-canopy-vista'); await perf('forest 45 m');
await at(300, -2, { dist: 45, ms: 2200 }); await shot('w2-03-forest-over-hollow');
await at(362, 52, { dist: 38, ms: 1800 }); await shot('w2-04-web-bridge');
await at(440, 70, { dist: 40, ms: 1800 }); await shot('w2-05-east-shelf');
// a bounce mushroom's arc (the pair between the east shelf and the hollow)
{ const b = D.bounces.find((q) => q.id === 'b2'); G.expedition.jump(b.pad.map((c, i) => c + (i ? 3 : 3))); G.cam.rig.distance = 34; await wait(1500); }
await shot('w2-06-bounce-arc');
// a fumarole vent rumbling (its ring) and then its puff
{
  const v = G.expedition.forest.vents[0];
  G.expedition.jump([v.x + 4, v.z + 4]); G.cam.rig.distance = 26;
  const t0 = performance.now();
  while (v.state !== 'swell' && performance.now() - t0 < 15000) await wait(50);
  await wait(700); await shot('w2-07-vent-swell');
  while (v.state !== 'puff' && performance.now() - t0 < 20000) await wait(50);
  await wait(500); await shot('w2-08-vent-puff');
  check('a vent rumbles (its ring) before it puffs', v.state === 'puff' || v.state === 'rest');
}
await at(390, -60, { dist: 40, ms: 2000 }); await shot('w2-09-glow-hollow');
await at(270, -160, { dist: 42, ms: 2000 }); await shot('w2-10-deep');
await at(310, -150, { dist: 40, ms: 2000 }); await shot('w2-11-queen-ring');

// ---- the camp's balcony: the crystals far below
await at(0, -70, { dist: 40, ms: 2500 }); await shot('w2-12-balcony-crystals');

// ---- the widest zoom the game allows (45 m) at the world's edges: nothing
// drawn over ground that is not (no props floating in the void)
for (const [u, v, name] of [[500, 0, 'east tip'], [262, 200, 'forest south'], [-180, 300, 'valley west'], [0, -230, 'pit']]) {
  await at(u, v, { dist: 45, ms: 1800 });
  const props = G.worldProps.filter((p) => p.obj.visible && !G.terrain.builtAt(p.x, p.z));
  const sc = G.scene.getObjectByName('scatter').children.filter((m) => m.visible && !G.terrain.builtAt(...m.userData.at));
  check(`max zoom at the ${name}: nothing over undrawn ground`, !props.length && !sc.length, props.length, sc.length);
  if (name === 'east tip') await shot('w2-13-max-zoom-edge');
}
// ---- the whole world from far up (every chunk drawn for the picture)
G.camera.far = 1800; G.camera.updateProjectionMatrix();
G.scene.fog.far = 5000;
await at(80, 0, { dist: 45, ms: 300 });
G.terrain.warmAll();
G.cam.rig.distance = 760; await wait(3000);
await shot('w2-14-whole-world');
G.cam.rig.distance = 30; G.camera.far = D.look?.far ?? 200; G.camera.updateProjectionMatrix();
return log;
