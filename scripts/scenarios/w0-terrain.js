// W0 (tasks/20261102-world-redesign-todo.md): the height-world engine on the
// test world. GAME_URL='http://localhost:5191/?world=test'.
// Walks plateau → ramp → basin; a click on the basin under a cliff goes round
// by the ramp (never off the cliff); crosses the bridge at deck height; a
// click into the chasm or the lake stops at the edge; a wolf chases up the
// ramp; the ground and a landmark between the lens and the hero give way;
// logs the perf numbers.
const canvas = G.renderer.domElement;
const screenOf = (v) => { const p = v.clone().project(G.camera); const r = canvas.getBoundingClientRect(); return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height, p.z]; };
const onScreen = (v) => { const [x, y, z] = screenOf(v); return z < 1 && x > 20 && x < innerWidth - 20 && y > 70 && y < innerHeight - 120; };
const mouse = (type, v) => { const [x, y] = screenOf(v); canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0 })); };
const click = async (v) => { mouse('mousemove', v); await wait(150); mouse('mousedown', v); await wait(60); dispatchEvent(new MouseEvent('mouseup', { button: 0 })); };
const V = (x, z, y) => new THREE.Vector3(x, y ?? G.groundAt(x, z), z);
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const r1 = (v) => +v.toFixed(1);
let falls = 0;
G.on('fell', () => falls++);
// every frame: the hero's height, for smoothness and "never off a cliff"
const track = { on: false, ys: [], pts: [], maxDy: 0 };
let lastY = null;
(function frame() {
  if (track.on) {
    const p = P.position;
    if (lastY !== null) track.maxDy = Math.max(track.maxDy, Math.abs(p.y - lastY));
    lastY = p.y; track.ys.push(p.y); track.pts.push([p.x, p.y, p.z]);
  }
  requestAnimationFrame(frame);
})();
const record = () => { track.on = true; track.ys = []; track.pts = []; track.maxDy = 0; lastY = null; };
const stop = () => { track.on = false; return track; };
// walk until the hero stops (or `ms` passes)
async function settle(ms) {
  const t0 = performance.now(); let last = P.position.clone(), still = 0;
  while (performance.now() - t0 < ms) { await wait(250); if (P.position.distanceTo(last) < 0.05) { if (++still > 3) break; } else still = 0; last.copy(P.position); }
}
const W = G.world, nav = G.navGrid;
const walkableHere = () => nav.nearest({ x: P.position.x, y: P.position.y, z: P.position.z }, 1) >= 0;

await start(); await wait(1200);
G.hurtPlayer = () => false; // the checks are about walking, not biting
check('the test world is built', !!G.world && G.world.def.id === 'test', JSON.stringify(G.worldStats));
check('spawned on the plateau', Math.abs(P.position.y - -10) < 0.6, pos());

// 1. plateau → ramp → basin, by the click-to-move paths
await go(2, 64); await wait(500);
record();
G.pointer.goTo(V(-24, 12), false);
await settle(30000);
let t = stop();
const ramp = W.ramps[0];
const usedRamp = t.pts.some(([x, y, z]) => Math.abs(x - -15.5) < 4.5 && y < -15 && y > -25);
check('walked down to the basin floor', Math.abs(P.position.y - -30) < 0.6 && Math.hypot(P.position.x + 24, P.position.z - 12) < 1.5, pos());
check('went by the ramp', usedRamp);
check('height changed smoothly (max |Δy| a frame < 0.35 m)', t.maxDy < 0.35, r1(t.maxDy * 100) / 100, `${t.ys.length} frames`);
check('no falls', falls === 0, falls);
G.cam.snap(P.position);
await go(-15.5, 42); await wait(900); await shot('w0-ramp');

// 2. on the plateau by its north cliff, a click on the basin below it. (The
// foot of a cliff facing away from the lens is hidden under its lip: about
// 24 m of the basin below a 20 m cliff. The click lands beyond that.)
await go(2, 1); await wait(700);
check('standing by the north cliff', Math.abs(P.position.y - -10) < 0.6 && walkableHere(), pos());
const below = V(2, -40);
check('the basin below is on screen', onScreen(below), screenOf(below).map(Math.round));
mouse('mousemove', below); await wait(120);
const aim = G.pointer.pick();
check('the cursor there means the basin floor', aim?.kind === 'ground' && Math.abs(aim.pos.y - -30) < 0.6 && aim.pos.distanceTo(below) < 2, aim?.pos?.toArray().map(r1));
const plan = G.nav.findPath(P.position, below);
check('A* finds a full path down', !!plan && !plan.partial, plan ? `${plan.points.length} pts` : 'none');
const viaRamp = !!plan && plan.points.some((p) => Math.abs(p.x - -15.5) < 4.5 && p.z > 20 && p.z < 66);
check('…and it goes round by the ramp', viaRamp);
record();
await click(below); await wait(400);
check('the click became a walk', !!G.pointer.order, G.pointer.order?.type);
await settle(60000);
t = stop();
check('arrived on the basin below the cliff', Math.abs(P.position.y - -30) < 0.6 && Math.hypot(P.position.x - 2, P.position.z + 40) < 1.2, pos());
check('never stepped off the cliff (max |Δy| a frame < 0.35 m, no fall)', t.maxDy < 0.35 && falls === 0, r1(t.maxDy * 100) / 100, falls);
check('took the long way (the ramp)', t.pts.some(([x, y, z]) => Math.abs(x - -15.5) < 4.5 && z > 25 && y < -15 && y > -25));
await shot('w0-basin');

// 3. the occluded hero: in the basin right at the foot of that cliff, the
// plateau stands between the lens and the hero
await go(2, -14); await wait(1000);
const head = P.position.clone().setY(P.position.y + 0.9);
// (W7: the lens tilts a little over it; what still stands in the way is cut)
log.push(['INFO', 'the lens tilts over the cliff', +G.cam.tilt.toFixed(0), '°']);
// every place the line of sight dives into the ground on its way to the
// hero: the ground there is cut away
const cam = G.camera.position, sight = head.clone().sub(cam), len = sight.length();
const blocking = [];
let wasAbove = true;
for (let s = 2; s < len - 1.2; s += 0.1) {
  const p = cam.clone().addScaledVector(sight, s / len);
  const above = p.y > W.heightAt(p.x, p.z);
  if (wasAbove && !above) blocking.push(p);
  wasAbove = above;
}
check('the ground in the way (if any) is cut away round the hero', blocking.every((q) => G.terrain.isCut(q)), `${blocking.length} ways in, ${blocking.filter((q) => !G.terrain.isCut(q)).length} not cut`);
await shot('w0-occluded');

// 4. the bridge over the chasm
await go(50, 10); await wait(500);
record();
G.pointer.goTo(V(50, -42), false);
await settle(20000);
t = stop();
const over = t.pts.filter(([, , z]) => z < -9 && z > -23);
const deckErr = over.reduce((m, [x, y, z]) => Math.max(m, Math.abs(y - W.deckAt(x, z).y)), 0);
check('crossed to the far plateau', Math.abs(P.position.y - -12) < 0.6 && P.position.z < -38, pos());
check('walked the deck over the chasm (|y − deck| < 0.5 m)', over.length > 20 && deckErr < 0.5, r1(deckErr * 100) / 100, `${over.length} frames over the chasm`);
await go(50, -14); await wait(900); await shot('w0-bridge');

// 5. clicks into the chasm and into the lake stop at the edge
await go(30, 3); await wait(800);
const chasm = V(30, -17, -10); // over the middle of the chasm, at the hero's level
check('the chasm is on screen', onScreen(chasm), screenOf(chasm).map(Math.round));
mouse('mousemove', chasm); await wait(120);
const into = G.pointer.pick();
check('the cursor there means a spot nobody can stand on', into?.kind === 'ground' && nav.nearest(into.pos, 1) < 0, into?.pos?.toArray().map(r1));
record();
await click(chasm); await settle(8000);
t = stop();
check('a click into the chasm stops at its rim', walkableHere() && Math.abs(P.position.y - -10) < 0.6 && P.position.z < 0 && P.position.z > -8, pos());
check('…without falling', falls === 0 && t.maxDy < 0.35, falls);
await go(-14, -20); await wait(800);
const lake = V(-27, -27, -30.6); // (W7: a little nearer: the lens tilts a little over the plateau's tip here)
check('the lake is on screen', onScreen(lake), screenOf(lake).map(Math.round));
await click(lake); await settle(8000);
const shore = W.waterAt(P.position.x, P.position.z);
// on the shore: a couple of metres on toward the click, nobody can stand
const toward = new THREE.Vector3(lake.x - P.position.x, 0, lake.z - P.position.z).normalize();
const ahead = P.position.clone().addScaledVector(toward, 2.5);
check('a click into the lake stops on the shore', walkableHere() && Math.abs(P.position.y - -30) < 0.8 && nav.nearest(ahead, 0) < 0 && (!shore || P.position.y > shore.level - 0.1), pos(), `${r1(Math.hypot(P.position.x - lake.x, P.position.z - lake.z))} m short of the click`);
await shot('w0-lake-shore');

// 6. a wolf chases the hero up the ramp
const wolf = G.enemies.find((e) => e.kind === 'wolf');
await go(-15.5, 34); await wait(300);
wolf.mover.teleport({ x: -16, y: G.groundAt(-16, 27), z: 27 });
wolf.model.position.set(-16, G.groundAt(-16, 27), 27);
await wait(2500); // it notices
const noticed = wolf.state !== 'idle';
G.pointer.goTo(V(2, 64), false);
let wolfTop = -Infinity;
for (let k = 0; k < 60 && wolfTop < -11; k++) { await wait(250); wolfTop = Math.max(wolfTop, wolf.pos.y); }
check('the wolf noticed the hero on the ramp', noticed, wolf.state);
check('the wolf chased up the ramp to the plateau', wolfTop > -11, r1(wolfTop), wolf.state, wolf.pos.toArray().map(r1));
await settle(8000);
await wait(400); await shot('w0-wolf-chase');

// 7. a landmark between the lens and the hero fades
const stack = G.scene.children.find((o) => o.name === 'seaStack' && Math.hypot(o.position.x + 4, o.position.z + 46) < 1);
await go(-12, -54); await wait(1200);
check('the rock pillar fades with the hero behind it', G.cam.faded.has(stack), pos());
await shot('w0-landmark');
// landmark scale: the hero beside the giant glowing mushroom
await go(46, -58); await wait(1000); await shot('w0-mushroom');

// 8. the overview
G.camera.far = 400; G.camera.updateProjectionMatrix();
G.cam.rig.distance = 120; await go(-5, 10); await wait(1500); await shot('w0-overview');
G.cam.rig.distance = 30; G.camera.far = 200; G.camera.updateProjectionMatrix();

// 9. perf: walk across the basin and read frame times and draw calls
await go(-50, 40); await wait(800);
G.pointer.goTo(V(-40, -5), false);
const frames = []; let prev = performance.now();
await new Promise((done) => {
  const t0 = performance.now();
  (function f() {
    const now = performance.now(); frames.push(now - prev); prev = now;
    if (now - t0 < 4000) requestAnimationFrame(f); else done();
  })();
});
// one frame's draw calls and triangles (shadow pass included), and the
// terrain's own share
const R = G.renderer, frameInfo = () => { R.info.reset(); R.render(G.scene, G.camera); return [R.info.render.calls, R.info.render.triangles]; };
const [calls, tris] = frameInfo();
G.terrain.group.visible = false;
const [calls0, tris0] = frameInfo();
G.terrain.group.visible = true;
frames.sort((a, b) => a - b);
const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
const pw = G.physics.world;
log.push(['PERF', JSON.stringify({
  fps: r1(1000 / avg), frameMs: r1(avg), p95Ms: r1(frames[Math.floor(frames.length * 0.95)]),
  drawCalls: calls, tris, terrainCalls: calls - calls0, terrainTris: tris - tris0,
  chunksInView: `${G.terrain.inView(G.camera)}/${G.terrain.chunks.length}`,
  bodies: pw.bodies.len(), colliders: pw.colliders.len(), ...G.worldStats,
})]);
const tp = performance.now();
const far = G.nav.findPath(V(-70, 70), V(50, -60));
log.push(['PERF', `a 250 m path (basin → ramp → bridge → far plateau) in ${r1(performance.now() - tp)} ms, partial ${far?.partial}`]);
check('no falls all along', falls === 0, falls);
return log;
