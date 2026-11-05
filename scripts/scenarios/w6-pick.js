// @bot
// W7 (tasks/20261105-review-fixes-todo.md): a click on the ground goes where
// the cursor is. The review found 20.6 % of clicks on visible walkable
// ground near tall rock going elsewhere (a short prop's invisible 30 m
// column, a rock top in front of the lens, the foot of a back wall falling
// through to the level behind). Run with GAME_URL='http://localhost:5191/?seed=7'.
// At fixed spots (the forest's moss cushions and back wall, the snow shelf,
// a valley sea stack, the ice camp's logs, the camp, the trestle's meadow end
// by the mine cart, and the review's worst rock-covered spots), at the 30 m
// and the 45 m lens, a 12 × 9 grid of screen points. For each point whose
// first visible surface (the drawn ground, marched independently, through
// what the cut-away opens) is walkable ground:
// - pick() lands within 1 m (and 0.6 m in height) of it
// - a click there moves the hero within 1.5 m of it when a path reaches it;
//   when none does, the red × and a word say so
// For points on visible rock past the hero: the hero never goes down to a
// level behind the rock (the old fall-through).
// Plus: a click on the ground beside the mine cart walks there (no ride),
// the boss plate goes when the hero is far from a woken boss, and the
// share of the screen rock in front of the lens covers stays small.
const W = G.world, X = G.expedition, NAV = G.navGrid;
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const until = async (test, ms = 8000, step = 40) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (test()) return true; await wait(step); } return false; };
const T3 = await import('/node_modules/three/build/three.module.js');
const rc = new T3.Raycaster();

await start();
await wait(1200);
for (let i = 0; i < 30 && G.mode !== 'play'; i++) { await skip(); await wait(300); }
// (the bosses stay asleep: nobody is woken by a teleport into an arena)
for (const b of ['chief', 'queen', 'bear', 'king']) if (X[b]) X[b].dormant = true;

async function zoomTo(d) {
  for (let k = 0; k < 12; k++) canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
  for (let k = 0; k < Math.round((d - 18) / 3); k++) canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
  await wait(700);
}
// the walkable node nearest a spot (where the hero can stand)
function standAt(x, z) {
  const n = NAV.nearest({ x, z }, 8);
  return n < 0 ? null : NAV.posOf(n);
}
// the first surface the eye meets along a ray: the drawn ground (the
// terrain mesh's own triangles), a deck, the water; what the cut-away
// opens is looked through. Fine steps, no cleverness: the reference.
function visible(o, d, from = 0.5) {
  let prevY = o.y + d.y * from, prevH = W.heightOnGrid(o.x + d.x * from, o.z + d.z * from), inside = prevY < prevH;
  for (let t = from; t < 280; t += 0.05) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    const deck = W.deckAt(x, z);
    if (deck && prevY >= deck.y && y <= deck.y) return { p: V3(x, deck.y, z), walk: true, deck: true, t };
    const h = W.heightOnGrid(x, z);
    if (y <= h && !inside) {
      inside = true;
      const p = V3(x, h, z);
      const wl = W.waterAt(x, z);
      if (wl && wl.level > h + 0.1) return { p: V3(x, wl.level, z), walk: false, t };
      if (G.terrain.isCut(p)) continue;
      return { p, walk: W.walkable(x, z), t };
    }
    if (y > h) inside = false;
    prevY = y; prevH = h;
  }
  return null;
}
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const L = W.def.landmarks ?? [];
const near = (model, x, z) => L.filter((l) => l.model === model && l.radius).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
const tr = W.bridges.find((b) => b.id === 'trestle');
const meadow = [tr.a[0] + (tr.a[0] - tr.b[0]) / tr.length * 6, tr.a[1] + (tr.a[1] - tr.b[1]) / tr.length * 6];
const stack = near('seaStack', 107, -4), logs = near('snowLogs', -27, 132);
const SPOTS = [
  ['forest moss cushion', 135, -115],
  ['forest back wall', 78.7, -73.3],
  ['snow shelf', -52, 65],
  ['valley sea stack', stack.x + 5, stack.z + 5],
  ['ice camp logs', logs.x + 4, logs.z + 4],
  ['camp', W.def.camp.at[0], W.def.camp.at[1]],
  ['trestle meadow (mine cart)', meadow[0], meadow[1]],
  ['ruins east (rock cover)', -2, -111],
  ['deep forest (rock cover)', 54, -113],
  ['forest edge (rock cover)', 109, -39],
  ['valley (rock cover)', 106, 17],
];

const tally = { ground: 0, pickOff: 0, targetOff: 0, unreachable: 0, unsaid: 0, props: 0, rock: 0, fellThrough: 0 };
const bad = [];
let shotA = false, firstSaid = null;
for (const zoom of [30, 45]) {
  await zoomTo(zoom);
  for (const [name, sx, sz] of SPOTS) {
    const s = standAt(sx, sz);
    if (!s) { check(`a place to stand at ${name}`, false); continue; }
    P.teleport({ x: s.x, y: s.y, z: s.z });
    await wait(900);
    G.terrain.warm?.(P.position);
    await wait(300);
    while (G.hud.inDialog) { G.hud.advanceDialog(); await wait(100); }
    G.camera.updateMatrixWorld(true);
    const r = canvas.getBoundingClientRect();
    let n = 0, off = 0;
    for (let gy = 0.12; gy <= 0.86; gy += 0.0925) for (let gx = 0.06; gx <= 0.95; gx += 0.08) {
      const cx = r.left + gx * r.width, cy = r.top + gy * r.height;
      rc.setFromCamera({ x: gx * 2 - 1, y: -(gy * 2 - 1) }, G.camera);
      const vis = visible(rc.ray.origin, rc.ray.direction);
      if (!vis) continue;
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: cx, clientY: cy, bubbles: true }));
      const pk = G.pointer.pick();
      if (!pk || pk.kind !== 'ground') continue; // (an animal, a chest, a door: not this check)
      const heroY = P.position.y, heroDepth = flat(rc.ray.origin, P.position);
      if (pk.pos.kind === 'prop') { tally.props++; continue; } // (a click on a drawn prop: its foot)
      const fire = () => {
        const before = G.pointer.refused;
        canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: cx, clientY: cy, bubbles: true, button: 0 }));
        dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
        const o = G.pointer.order, tgt = o?.type === 'move' ? o.point.clone() : null;
        G.pointer.cancel();
        const said = G.pointer.refused !== before;
        if (said && !firstSaid) firstSaid = { text: document.getElementById('toast')?.textContent ?? '', name, zoom };
        return { tgt, said, kind: o?.type };
      };
      if (!vis.walk) {
        // rock past the hero: never the level behind it
        if (flat(rc.ray.origin, vis.p) > heroDepth) {
          tally.rock++;
          const { tgt } = fire();
          if (tgt && tgt.y < Math.min(heroY, vis.p.y) - 2 && flat(rc.ray.origin, tgt) > flat(rc.ray.origin, vis.p) + 1) { tally.fellThrough++; bad.push({ name, zoom, why: 'fell through', hero: pos(), vis: vis.p.toArray().map((v) => +v.toFixed(1)), pick: [pk.pos.x, pk.pos.y, pk.pos.z].map((v) => +v.toFixed(1)), pickKind: pk.pos.kind, tgt: tgt.toArray().map((v) => +v.toFixed(1)) }); }
        }
        continue;
      }
      n++; tally.ground++;
      const dPick = flat(pk.pos, vis.p), dyPick = Math.abs(pk.pos.y - vis.p.y);
      const res = G.nav.findPath(P.position, vis.p, { near: 0.6, jumps: true });
      const reach = res && !res.partial && Math.abs((res.points.at(-1)?.y ?? vis.p.y) - vis.p.y) < 1.5;
      const { tgt, said, kind } = fire();
      const dT = tgt ? flat(tgt, vis.p) : null;
      let why = null;
      if (dPick > 1.0 || dyPick > 0.6) { why = 'pick'; tally.pickOff++; } else if (reach && kind !== 'use' && (dT === null || dT > 1.5)) { why = 'target'; tally.targetOff++; } else if (!reach) {
        tally.unreachable++;
        if ((dT === null || dT > 3) && !said) { why = 'unsaid'; tally.unsaid++; }
      }
      if (why) {
        off++;
        bad.push({ name, zoom, why, screen: [+gx.toFixed(2), +gy.toFixed(2)], vis: vis.p.toArray().map((v) => +v.toFixed(1)), pick: [pk.pos.x, pk.pos.y, pk.pos.z].map((v) => +v.toFixed(1)), pickKind: pk.pos.kind, tgt: tgt?.toArray().map((v) => +v.toFixed(1)) ?? null, kind });
      }
    }
    log.push(['INFO', `${name} ${zoom} m`, `${off}/${n} off`, 'lens', +G.cam.dolly?.toFixed(1), 'tilt', +G.cam.tilt?.toFixed(0), 'lift', +G.cam.lift?.toFixed(1)]);
    await shot(`pick-${name.split(' ')[0]}-${name.split(' ')[1] ?? ''}-${zoom}`);
    void shotA;
  }
}
const miss = tally.pickOff + tally.targetOff + tally.unsaid;
log.push(['INFO', 'tally', tally, 'mismatch', `${miss}/${tally.ground}`, +(miss / Math.max(1, tally.ground) * 100).toFixed(2) + ' %']);
log.push(['INFO', 'off', bad.slice(0, 30)]);
check('clicks on visible walkable ground: pick and target where the cursor is (< 2 %)', tally.ground > 800 && miss / tally.ground < 0.02, `${miss}/${tally.ground}`);
check('no click on rock past the hero sends it down behind the rock', tally.fellThrough === 0, tally.fellThrough, 'of', tally.rock);
check('an unreachable click always says so (× and a word) when it lands far off', tally.unsaid === 0, tally.unsaid, 'of', tally.unreachable);

// the mine cart by the trestle: the ground round it walks there, the cart rides
X.gates.shortcut?.unseal?.();
{
  const cart = G.interactables.find((it) => it.kind === 'cart' && flat(it.pos, V3(meadow[0], 0, meadow[1])) < 6);
  await zoomTo(30);
  const s = standAt(meadow[0] + 6, meadow[1] - 6);
  P.teleport({ x: s.x, y: s.y, z: s.z }); await wait(900);
  let rides = 0, tried = 0;
  for (let a = 0; a < 16; a++) {
    const gx = cart.pos.x + Math.cos(a * Math.PI / 8) * 2.6, gz = cart.pos.z + Math.sin(a * Math.PI / 8) * 2.6;
    if (!W.walkable(gx, gz)) continue;
    const g = V3(gx, W.heightAt(gx, gz), gz);
    rc.setFromCamera((() => { const v = g.clone().project(G.camera); return { x: v.x, y: v.y }; })(), G.camera);
    const box = new T3.Box3().setFromObject(cart.obj).expandByScalar(0.3);
    if (rc.ray.intersectBox(box, new T3.Vector3())) continue; // (the cursor is on the cart itself, or at its very edge)
    tried++;
    mouse('mousemove', g);
    const h = G.pointer.pick();
    if (h?.kind === 'use' && h.it === cart) rides++;
    else if (h?.kind !== 'ground') log.push(['INFO', 'by the cart, not ground', h?.kind, h?.label, [gx, gz].map((v) => +v.toFixed(1))]);
  }
  check('the ground beside the mine cart is ground, not a ride', tried >= 6 && rides === 0, `${rides}/${tried}`);
  mouse('mousemove', cart.obj.position.clone().setY(cart.obj.position.y + 0.6));
  check('the cart itself is still a ride', G.pointer.pick()?.kind === 'use' && G.pointer.pick()?.it === cart, G.pointer.pick()?.kind);
}

// the red × and the word on a click nobody can walk to (seen in the sweep above)
check('a click on a place the hero cannot reach shows the red × and "저기는 못 가요"', /못 가요/.test(firstSaid?.text ?? ''), firstSaid);
{
  // (and its picture: from the snow shelf, a click on the lake far below)
  const s = standAt(-52, 65);
  P.teleport({ x: s.x, y: s.y, z: s.z }); await wait(1200);
  const r = canvas.getBoundingClientRect();
  let done = false;
  for (let gy = 0.15; gy < 0.85 && !done; gy += 0.04) for (let gx = 0.1; gx < 0.9 && !done; gx += 0.04) {
    const before = G.pointer.refused;
    canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: r.left + gx * r.width, clientY: r.top + gy * r.height, bubbles: true }));
    if (G.pointer.pick()?.kind !== 'ground') continue;
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: r.left + gx * r.width, clientY: r.top + gy * r.height, bubbles: true, button: 0 }));
    dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    if (G.pointer.refused !== before) { done = true; await wait(150); await shot('pick-cant-go'); }
    else G.pointer.cancel();
  }
  G.pointer.cancel();
}

// the boss plate: a woken boss far away never keeps its plate up
{
  const A = W.def.arena;
  const s = standAt(A.at[0], A.at[1]);
  X.chief.dormant = false;
  P.teleport({ x: s.x, y: s.y, z: s.z }); await wait(400);
  const plateOn = () => !document.getElementById('boss-plate').classList.contains('hidden');
  const up = await until(plateOn, 6000);
  X.jump('camp'); await wait(1500);
  check('the boss plate shows at its fight and goes when the hero is far away', up && !plateOn(), up, plateOn());
}

// the share of the screen the rock in front of the lens covers (the review's probe-occl)
{
  await zoomTo(30);
  const res = [];
  let seed = 99; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const g = W.sample();
  const fixed = [[-52, 65], [-2, -111], [54, -113], [109, -39], [106, 17], [135, -115], [131, -72], [135, -91]];
  for (let k = 0; k < 6000 && res.length < 160 + fixed.length; k++) {
    let x, z;
    if (res.length < fixed.length) [x, z] = fixed[res.length]; else { x = g.x0 + rnd() * g.W; z = g.z0 + rnd() * g.D; }
    const s = standAt(x, z);
    if (!s || (res.length >= fixed.length && Math.hypot(s.x - x, s.z - z) > 1.5)) continue;
    P.teleport({ x: s.x, y: s.y, z: s.z }); await wait(450);
    while (G.hud.inDialog) { G.hud.advanceDialog(); await wait(100); }
    const heroD = G.camera.position.distanceTo(P.position);
    // fg: the review's measure (any rock nearer the lens than 3/4 of the
    // way to the hero); cover: the part of it over the hero's feet (what can
    // hide something: lower rock is the drop below the hero's ledge)
    let fg = 0, cover = 0, hides = 0, n2 = 0;
    for (let gy = 0.1; gy < 0.86; gy += 0.08) for (let gx = 0.05; gx < 0.96; gx += 0.07) {
      rc.setFromCamera({ x: gx * 2 - 1, y: -(gy * 2 - 1) }, G.camera);
      const v = visible(rc.ray.origin, rc.ray.direction);
      n2++;
      if (v && v.t < heroD * 0.75 && !v.walk && !v.deck) {
        fg++;
        if (v.p.y > P.position.y + 0.3) {
          cover++;
          // what lies behind it: walkable ground it hides?
          const b = visible(rc.ray.origin, rc.ray.direction, v.t + 0.1);
          if (b && b.walk && b.p.y > P.position.y - 3) hides++;
        }
      }
    }
    res.push({ at: [s.x, s.y, s.z].map((v) => +v.toFixed(0)), area: W.areaAt?.(s.x, s.z)?.id ?? null, fg: +(fg / n2).toFixed(2), cover: +(cover / n2).toFixed(2), hides: +(hides / n2).toFixed(2), lens: +G.cam.dolly.toFixed(1), tilt: +G.cam.tilt.toFixed(0), lift: +G.cam.lift.toFixed(1) });
    if (res.length === 1) await shot('occl-snow-shelf');
  }
  const sorted = [...res].sort((a, b) => b.hides - a.hides || b.cover - a.cover);
  const over = (t, k = 'cover') => res.filter((q) => q[k] > t).length;
  const hist = (k) => [0, 0.1, 0.25, 0.5].map((t) => [`>${t * 100}%`, over(t, k)]);
  log.push(['INFO', 'rock in front of the lens', res.length, 'hiding walkable ground', hist('hides'), 'over the feet', hist('cover'), 'any (the review\'s)', hist('fg'), 'fixed spots', res.slice(0, fixed.length), 'worst', sorted.slice(0, 8), 'worst any', [...res].sort((a, b) => b.fg - a.fg).slice(0, 8)]);
  check('no spot has more than 25 % of the screen covered by rock in front of the lens that hides walkable ground', over(0.25, 'hides') === 0, over(0.25, 'hides'), sorted.slice(0, 3));
  check('no spot has more than 50 % of the screen rock in front of the lens (any)', over(0.5, 'fg') === 0, over(0.5, 'fg'));
  P.teleport({ x: sorted[0].at[0], y: sorted[0].at[1], z: sorted[0].at[2] }); await wait(1200);
  await shot('occl-worst');
}
return log;
