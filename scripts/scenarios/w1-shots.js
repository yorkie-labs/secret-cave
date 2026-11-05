// W1 (tasks/20261102-world-redesign-todo.md): the big world's look and its
// numbers. GAME_URL='http://localhost:5191/' (the default world).
// Screenshots of the places that sell it (the sinkhole, the falls, the
// viaduct over the gorge, the valley seen from a high step, the camp and
// the pit below its balcony, the chief's arena, the maps, the whole world
// from far up) and perf at the entrance, a valley vista and the camp.
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
// frame times and one frame's draw calls / triangles here
async function perf(name) {
  const frames = []; let prev = performance.now();
  await new Promise((done) => { const t0 = performance.now(); (function f() { const now = performance.now(); frames.push(now - prev); prev = now; if (now - t0 < 3000) requestAnimationFrame(f); else done(); })(); });
  frames.shift();
  frames.sort((a, b) => a - b);
  const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
  const R = G.renderer; R.info.reset(); R.render(G.scene, G.camera);
  const pw = G.physics.world;
  const inst = G.scene.getObjectByName('scatter');
  let visibleInst = 0, scatterTris = 0; inst?.children.forEach((m) => { if (!m.visible) return; visibleInst += m.count; scatterTris += m.count * (m.geometry.attributes.position.count / 3); });
  log.push(['PERF', name, JSON.stringify({
    fps: r1(1000 / avg), frameMs: r1(avg), p95Ms: r1(frames[Math.floor(frames.length * 0.95)]),
    drawCalls: R.info.render.calls, tris: R.info.render.triangles,
    chunks: `${G.terrain.inView(G.camera)} in view / ${G.terrain.built} built / ${G.terrain.chunks.length}`, terrainTris: G.terrain.tris,
    bodies: pw.bodies.len(), colliders: pw.colliders.len(), scatterShown: visibleInst, scatterTris, scatterMeshes: inst?.children.length,
    lights: G.lightSources.length, enemies: G.enemies.length, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) + ' MB' : '?',
  })]);
}
await start(); await wait(2500);
log.push(['INFO', 'build', JSON.stringify(G.worldStats)]);
check('the main world is the default', W.def.id === 'main' && !!G.expedition);

// the sinkhole: just dropped in, the sun from above
await wait(2500);
await shot('w1-01-entrance-sinkhole');
await perf('entrance');
G.cam.rig.distance = 45; await wait(1200); await shot('w1-02-entrance-far');

// the stepped falls: from the mid step, looking up the screen at falls 2 and 3
await at(4, 272, { dist: 30 }); await shot('w1-03-falls-upper');
await at(8, 178, { dist: 32 }); await shot('w1-04-falls-mid');
await at(10, 122, { dist: 42, ms: 2200 }); await shot('w1-05-falls-into-gorge');

// the viaduct over the gorge
const via = W.bridges.find((b) => b.id === 'viaduct'); // (W6: wherever the layout put it)
await at(via.a, { dist: 42 }); await shot('w1-06-viaduct');
await at([(via.a[0] + via.b[0]) / 2, (via.a[1] + via.b[1]) / 2], { dist: 36 }); await shot('w1-07-viaduct-middle');

// the valley seen from a high step (the upper terrace's lip, looking up the screen)
await at(-20, 262, { dist: 45, ms: 2200 }); await shot('w1-08-vista-upper');
await perf('valley vista');
await at(-40, 175, { dist: 45, ms: 2200 }); await shot('w1-09-vista-mid');

// the camp and the pit below its balcony
await at(-10, 0, { dist: 32, ms: 2000 }); await shot('w1-10-camp');
await perf('camp');
await at(0, -70, { dist: 40, ms: 2200 }); await shot('w1-11-balcony-pit');

// the old mine, the meadow and the chief's arena
await at(170, 150, { dist: 36 }); await shot('w1-12-mine');
await at(150, 100, { dist: 40, ms: 2000 }); await shot('w1-13-arena-gate');
await at(150, 40, { dist: 42, ms: 2000 }); await shot('w1-14-arena');

// the maps
await at(-60, 300, { dist: 30 });
G.map.revealAll(); await wait(400);
await shot('w1-15-minimap');
G.map.toggle(true); await wait(500); await shot('w1-16-tabmap'); G.map.toggle(false);

// max zoom-out: the whole world from far up
G.camera.far = 1600; G.camera.updateProjectionMatrix();
G.scene.fog.far = 5000; const fogNear = G.scene.fog.near;
for (const c of G.terrain.chunks) if (!c.mesh) G.terrain.warm({ x: c.x, z: c.z });
await at(-20, 60, { dist: 45, ms: 300 });
G.cam.rig.distance = 720; await wait(3000);
await shot('w1-17-whole-world');
G.cam.rig.distance = 30; G.camera.far = D.look?.far ?? 200; G.camera.updateProjectionMatrix();
void fogNear;
return log;
