// @bot
// W6 (tasks/20261104-world-shrink-todo.md): the first way down into Moss
// Valley, looked at closely — the user saw a solid black band across the
// dirt ramp under the hero and the hero's gold ring cut in half there. Run
// with GAME_URL='http://localhost:5191/?seed=7'.
// A fresh save: the sinkhole, the necklace, the gate; then the hero stands
// every couple of metres down each ramp of the valley's first steps (and on
// the lips at their tops), at the default 30 m lens and the far 45 m one;
// each time the frame is rendered and read back:
// - no hole in the ground: no patch of near-black (the cave's void or the
//   rock's dark inside) round the hero's feet and on the lens's side of it
//   (the cut-away may only open what really stands between the lens and the
//   hero: walkable ground under the line of sight is never cut)
// - the hero's ring is whole: its lens-side half is drawn too (gold pixels
//   on both sides of the hero's feet, the near half not under the slope)
// The rule is also asked of the terrain's own `isCut` (the shader's test)
// for the ground round the hero's feet.
const W = G.world, X = G.expedition, S = G.state;
const $ = (id) => document.getElementById(id);
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const until = async (test, ms = 8000, step = 40) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (test()) return true; await wait(step); } return false; };
const gl = G.renderer.getContext();

// zoom the lens to `d` m (the wheel, as a player would)
async function zoomTo(d) {
  for (let k = 0; k < 12; k++) canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 })); // (3 m a notch: down to 18)
  for (let k = 0; k < Math.round((d - 18) / 3); k++) canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
  await wait(700);
}
// Read the frame back: near-black pixels round the hero and on the lens's
// side of it (a box 660 px wide from a little over the hero down).
function look() {
  G.renderer.render(G.scene, G.camera);
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, k = w / canvas.clientWidth;
  const [sx, sy] = screenOf(P.position.clone());
  const cx = Math.round(sx * k), cy = Math.round(h - sy * k); // (GL rows go up)
  const bw = Math.round(330 * k), up = Math.round(120 * k), down = Math.round(230 * k);
  const x0 = Math.max(0, cx - bw), y0 = Math.max(0, cy - down), x1 = Math.min(w, cx + bw), y1 = Math.min(h, cy + up);
  const px = new Uint8Array((x1 - x0) * (y1 - y0) * 4);
  gl.readPixels(x0, y0, x1 - x0, y1 - y0, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let dark = 0, n = 0;
  for (let j = 0; j < y1 - y0; j++) for (let i = 0; i < x1 - x0; i++) {
    const o = (j * (x1 - x0) + i) * 4, r = px[o], g = px[o + 1], b = px[o + 2];
    n++;
    // (the void behind the ground, #0b1013, and the rock's dark inside,
    // ~#131617: a flat near-black grey, not a dark green fern)
    if (Math.max(r, g, b) < 27 && Math.abs(g - r) <= 7 && Math.abs(b - g) <= 5) dark++;
  }
  return { dark: +(dark / n).toFixed(4) };
}
// the ring under the ground: its gold band's vertices (as drawn, in the
// world) lower than the drawn ground there (the terrain mesh's own
// triangles, world.heightOnGrid; 2 cm slack)
function ringBuried() {
  const ring = G.scene.getObjectByName('heroRing').children[1];
  ring.updateMatrixWorld(true);
  const a = ring.geometry.attributes.position, v = V3(0, 0, 0);
  let n = 0;
  for (let i = 0; i < a.count; i += 4) {
    v.fromBufferAttribute(a, i).applyMatrix4(ring.matrixWorld);
    if (W.walkable(v.x, v.z) && W.heightOnGrid(v.x, v.z) > v.y + 0.02) n++;
  }
  return n;
}
// the terrain's own test (the shader's twin) on the walkable ground round
// the feet (within 4 m) that lies under the line of sight to the feet: a
// point of it may only be cut where its line of sight comes down onto open
// ground at the feet's height (it hides something); where that line runs
// on into the rock (the point is just the ground: the ramp in front of the
// hero, a bank beside it), a cut showed the void under the ground
function cutsGround() {
  const cam = G.camera.position, p = P.position;
  let cut = 0;
  for (let dx = -4; dx <= 4; dx += 0.5) for (let dz = -4; dz <= 4; dz += 0.5) {
    const x = p.x + dx, z = p.z + dz;
    if (!W.walkable(x, z)) continue;
    const y = W.heightAt(x, z);
    const t = Math.hypot(x - cam.x, z - cam.z) / Math.hypot(p.x - cam.x, p.z - cam.z);
    if (t >= 1 || y > cam.y + (p.y - cam.y) * t - 0.05) continue;
    const k = (p.y - cam.y) / (y - cam.y), qx = cam.x + (x - cam.x) * k, qz = cam.z + (z - cam.z) * k;
    if (W.heightAt(qx, qz) < p.y + 0.3) continue; // (open ground behind it: a cut there shows that ground)
    if (G.terrain.isCut(V3(x, y, z))) cut++;
  }
  return cut;
}

await start();
await until(() => Math.abs(P.position.y) < 0.6 && P.state.grounded, 6000);
await clickAt(X.necklace.pos.clone().setY(X.necklace.pos.y + 0.7));
check('the necklace taken', await until(() => S.necklace, 10000));
for (let k = 0; k < 20 && !G.hud.inDialog; k++) await wait(100);
while (G.hud.inDialog) { keyTap('Space'); await wait(300); }
check('the entrance gate opens', await until(() => X.gates.entrance.open, 5000));
await wait(800);

// every ramp of the first steps (and its lip), sampled every ~2 m
const want = ['rampE', 'ramp12', 'ramp23', 'ramp12b'];
const ramps = W.ramps.filter((r) => want.includes(r.id));
let worst = { dark: 0 }, ringBad = [], holes = [], cutBad = [], samples = 0;
for (const zoom of [18, 30, 45]) {
  let worstHere = 0;
  await zoomTo(zoom);
  for (const r of ramps) {
    const pts = r.pts, legs = [];
    for (let i = 0; i < pts.length - 1; i++) legs.push([pts[i], pts[i + 1]]);
    // (from 4 m before its top lip to 4 m past its foot)
    const [a0, a1] = legs[0], [b0, b1] = legs.at(-1);
    const ext = (p, q, d) => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]); return [p[0] + ((p[0] - q[0]) / l) * d, p[1] + ((p[1] - q[1]) / l) * d]; };
    const path = [ext(a0, a1, 4), ...pts, ext(b1, b0, 4)];
    let shotDone = false;
    for (let i = 0; i < path.length - 1; i++) {
      const [p, q] = [path[i], path[i + 1]], l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      for (let s = 0; s < l; s += 2) {
        const x = p[0] + ((q[0] - p[0]) * s) / l, z = p[1] + ((q[1] - p[1]) * s) / l;
        if (!W.walkable(x, z)) continue;
        // walking down: facing away from the lens (up the screen)
        P.teleport({ x, y: W.heightAt(x, z), z });
        P.state.heading = Math.atan2(q[0] - p[0], q[1] - p[1]);
        await wait(400);
        const L = look(), c = cutsGround(), rb = ringBuried();
        samples++;
        const where = `${r.id} ${zoom} m ${pos()}`;
        if (L.dark > worst.dark) worst = { ...L, where };
        if (L.dark > 0.015) holes.push(`${where} dark ${L.dark}`); // (a sliver at a trench's jittered lip at the closest lens: ≤ 1.5 %)
        if (L.dark > worstHere + 0.002) { worstHere = L.dark; await shot(`w6d-worst-${zoom}`); }
        if (rb) ringBad.push(`${where} ${rb}/24 vertices of the ring under the ground`);
        if (c > 2) cutBad.push(`${where} ${c} cells`); // (a cell or two at a hole's dithered rim: the shader reads the grid, this the world)
        if (!shotDone && s > 0 && i === 1) { shotDone = true; await shot(`w6d-${r.id}-${zoom}`); }
      }
    }
  }
}
check('sampled the first ramps down (three lenses)', samples > 90, samples);
check('no black hole in the ground round the hero (≤ 1.5 % void-black)', holes.length === 0, holes.slice(0, 6), 'worst', worst);
check('the hero\'s ring is whole: both halves drawn', ringBad.length === 0, ringBad.slice(0, 6), ringBad.length);
check('the cut-away never opens ground that hides only rock (the band, the slab)', cutBad.length === 0, cutBad.slice(0, 6), cutBad.length);

// and once on foot, the whole way down to the valley floor (a real walk)
await zoomTo(30);
const foot = W.def.ramps.find((r) => r.id === 'ramp23').pts.at(-1);
P.teleport({ x: X.gates.entrance.pos?.x ?? W.def.spawn[0], y: 0, z: X.gates.entrance.pos?.z ?? W.def.spawn[1] });
await wait(300);
P.teleport({ x: W.def.spawn[0], y: W.heightAt(...W.def.spawn), z: W.def.spawn[1] });
await wait(300);
let walkHoles = 0, walkRing = 0, frames = 0;
const tw = performance.now();
const going = travel(V3(foot[0], W.heightAt(...foot), foot[1]), { near: 3, ms: 150000 });
let done = false; going.then(() => { done = true; });
while (!done && performance.now() - tw < 150000) {
  await wait(600);
  const L = look(); frames++;
  if (L.dark > 0.015) { walkHoles++; if (walkHoles <= 4) await shot(`w6d-walk-dark-${walkHoles}`); log.push(['INFO', 'dark frame on the walk', L.dark, pos()]); }
  if (ringBuried()) walkRing++;
  if (frames % 25 === 1) await shot(`w6d-walk-${frames}`);
}
check('walked down to the valley floor', await going, pos());
check('on the walk: no black hole round the hero', walkHoles === 0, walkHoles, frames);
check('on the walk: the ring whole', walkRing === 0, walkRing, frames);
log.push(['INFO', 'worst frame', worst]);
return log;
