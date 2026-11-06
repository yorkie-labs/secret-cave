// A scripted player (M5) for scenarios that start with `// @bot`: it plays
// through real input only — clicks on the canvas (walk, hammer, use, take),
// the right button (water gun, vine), Q, 2 (roll) and 4 (herb), Space for
// dialogue. It reads the world from `window.G` the way a player reads the
// screen: where the animals are, and the red marks on the floor (every
// telegraph's `hazard()`), and it steps out of a mark, or rolls if it is too
// late to walk, before the hit lands.
const canvas = G.renderer.domElement;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const screenOf = (v) => { const p = v.clone().project(G.camera); const r = canvas.getBoundingClientRect(); return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height, p.z]; };
const onScreen = (v, m = 40) => { const [x, y, z] = screenOf(v); const r = canvas.getBoundingClientRect(); return z < 1 && x > r.left + m && x < r.right - m && y > r.top + m && y < r.bottom - 130; };
const mouse = (type, v, button = 0) => { const [x, y] = screenOf(v); canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button, shiftKey: false })); };
const keyTap = (code) => { dispatchEvent(new KeyboardEvent('keydown', { code })); dispatchEvent(new KeyboardEvent('keyup', { code })); };
const keyDown = (code) => dispatchEvent(new KeyboardEvent('keydown', { code }));
const keyUp = (code) => dispatchEvent(new KeyboardEvent('keyup', { code }));
const bot = { stats: { clicks: 0, swings: 0, rolls: 0, water: 0, vine: 0, herbs: 0, hits: 0, shield: 0 }, minHearts: G.run.hearts, events: [], tick: 50 };
G.on('hurt', ({ amount }) => { bot.stats.hits++; bot.events.push(['hurt', amount, +G.time.toFixed(2)]); });
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// the ground's height under (x, z) nearest the hero's (W1: a world of levels;
// the old caves' floor is 0)
const gy = (x, z) => G.groundAt?.(x, z, P.position.y) ?? 0;
const G3 = (x, z, up = 0) => V3(x, gy(x, z) + up, z);

// a left click on a world point (the ground, an animal, a door…)
async function clickAt(v, button = 0) {
  mouse('mousemove', v); mouse('mousedown', v, button);
  dispatchEvent(new MouseEvent('mouseup', { button }));
  bot.stats.clicks++;
}
// walk toward a point; off screen, click the ground part of the way there
function walkTo(p) {
  const pp = P.position;
  let target = G3(p.x, p.z);
  if (!onScreen(target)) {
    const d = flat(target, pp) || 1;
    target = G3(pp.x + (p.x - pp.x) / d * Math.min(d, 5), pp.z + (p.z - pp.z) / d * Math.min(d, 5));
  }
  return clickAt(target);
}
// roll toward a point (the cursor aims it)
function rollTo(p) {
  mouse('mousemove', G3(p.x, p.z));
  keyTap('Digit2');
  bot.stats.rolls++;
}
// the right-click tool at a point; switches with Q first if needed
async function toolAt(tool, p) {
  if (G.run.tool !== tool) { if (!G.run.owned.includes(tool)) return false; keyTap('KeyQ'); await wait(60); }
  if (G.run.tool !== tool) return false;
  mouse('mousemove', G3(p.x, p.z, 0.5)); mouse('mousedown', G3(p.x, p.z, 0.5), 2);
  dispatchEvent(new MouseEvent('mouseup', { button: 2 }));
  bot.stats[tool === 'vine' ? 'vine' : 'water']++;
  return true;
}

// --- reading the red marks
function hazards() {
  const out = [];
  for (const e of G.enemies) {
    if (e.gone) continue;
    const h = e.hazard?.();
    if (h) out.push(...(Array.isArray(h) ? h : [h]));
  }
  out.push(...(G.fieldHazards?.() ?? [])); // M6a: poison clouds, puddles, swelling mushrooms
  return out;
}
// is p inside the mark (with a margin)?
function inside(h, p, pad = 0.5) {
  const dx = p.x - h.x, dz = p.z - h.z;
  if (h.shape === 'circle') return Math.hypot(dx, dz) < h.r + pad;
  if (h.shape === 'lane') {
    const ax = Math.sin(h.heading), az = Math.cos(h.heading);
    const along = dx * ax + dz * az, side = Math.abs(dx * az - dz * ax);
    return along > -pad - 0.6 && along < h.len + pad && side < h.width / 2 + pad;
  }
  if (h.shape === 'cone') {
    const d = Math.hypot(dx, dz);
    if (d > h.r + pad) return false;
    if (d < 1 + pad) return true;
    let a = Math.atan2(dx, dz) - h.heading; a = Math.atan2(Math.sin(a), Math.cos(a));
    return Math.abs(a) < (h.arc * Math.PI) / 360 + Math.asin(Math.min(1, (pad + 0.3) / d));
  }
  return false; // rings: rolled through (see danger())
}
// What threatens the hero now: { h, t (s to the hit), ring }
function danger() {
  const pp = P.position;
  let worst = null;
  for (const h of hazards()) {
    let t = h.hitAt - G.time, hit = false, ring = false;
    if (h.shape === 'ring') {
      const d = flat(pp, h);
      if (d > h.rMax + 0.8) continue;
      ring = true;
      // when the band's inner edge reaches the hero
      const reach = d - h.band / 2 - 0.35;
      if (reach < h.r - 0.2) continue; // inside the ring already: it rolls away from the hero
      t = Math.max(t, 0) + Math.max(0, reach - h.r) / h.speed;
      hit = true;
    } else hit = inside(h, pp, 0.45);
    if (hit && (!worst || t < worst.t)) worst = { h, t, ring };
  }
  return worst;
}
// a nearby spot outside every mark, as close as possible to what `want(p)`
// likes (lower is better); null if none
function safeSpot(want, radii = [1.4, 2.6, 3.8, 5, 6.5]) {
  const pp = P.position;
  const marks = hazards().filter((h) => h.shape !== 'ring');
  let best = null, bs = Infinity;
  for (const r of radii) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const c = V3(pp.x + Math.sin(a) * r, 0, pp.z + Math.cos(a) * r);
      const reach = G.nav.lineReach(pp, c);
      if (!reach || flat(reach, c) > 0.3) continue;
      if (marks.some((h) => inside(h, c, 0.9))) continue;
      const s = r * 0.4 + (want ? want(c) : 0);
      if (s < bs) { bs = s; best = c; }
    }
  }
  return best;
}

let lastMove = 0, lastAttack = 0, lastRoll = -9, lastDodged = null;
// One look at the screen and one thing done. `goal(p)`: where the bot would
// like to be when there is nothing to fight (lower is better).
async function botStep({ goal = null } = {}) {
  bot.minHearts = Math.min(bot.minHearts, G.run.hearts);
  if (G.hud.inDialog) { keyTap('Space'); await wait(150); return 'dialog'; }
  if (G.mode !== 'play') { await wait(bot.tick); return G.mode; }
  const now = performance.now();
  const pp = P.position;
  const s = P.state;
  // W3: holding the shield against a charging deer: keep facing it until its
  // charge is over (stuck in the shield, or past), then let go
  if (bot.shieldFor) {
    const e = bot.shieldFor;
    if (!e.gone && (e.state === 'windup' || e.state === 'attack') && G.shield.up) { mouse('mousemove', e.pos.clone().setY(e.pos.y + 0.6)); await wait(bot.tick); return 'shield'; }
    keyUp('Digit3'); bot.shieldFor = null;
  }
  // 1. a mark under the hero: step out, or roll if the hit is close
  const dz = danger();
  // W3: a deer's lane at the hero, the shield in the bag and ready: stand and
  // block it (its antlers stick fast) instead of getting out of the way
  if (dz && dz.h.kind === 'deer' && dz.h.shape === 'lane' && G.run.owned.includes('shield') && !s.action && dz.t < 0.55) {
    const e = G.enemies.find((q) => q.kind === 'deer' && (q.state === 'windup' || q.state === 'attack') && flat(q.pos, pp) < 14);
    if (e) {
      G.pointer?.cancel();
      mouse('mousemove', e.pos.clone().setY(e.pos.y + 0.6));
      keyDown('Digit3');
      if (G.shield.up) { bot.shieldFor = e; bot.stats.shield++; await wait(bot.tick); return 'shield'; }
      keyUp('Digit3');
    }
  }
  if (dz && !(dz.h.kind === 'deer' && dz.h.shape === 'lane' && G.run.owned.includes('shield') && dz.t >= 0.55 && !s.action)) {
    // a bite's cone: roll a little earlier (the water tank is often low in the mushroom cave)
    const late = dz.ring ? dz.t < 0.2 : dz.t < (dz.h.shape === 'cone' && dz.h.r < 3 ? 0.45 : 0.32);
    if (late) {
      // through a ring: toward its middle; out of a mark: the nearest safe side
      let to = dz.ring ? V3(dz.h.x, 0, dz.h.z) : safeSpot(null, [2.8]);
      if (!to) { const a = Math.atan2(pp.x - dz.h.x, pp.z - dz.h.z) + (dz.h.shape === 'lane' ? Math.PI / 2 : 0); to = V3(pp.x + Math.sin(a) * 3, 0, pp.z + Math.cos(a) * 3); }
      if (G.time - lastRoll > 0.5 && (!s.action || s.action.name === 'hurt') && s.cooldown <= 0) {
        rollTo(to);
        if (P.state.action?.name === 'roll') lastRoll = G.time; // (a key press the hero could not act on is tried again)
      } else if (!dz.ring && s.action?.name !== 'roll' && now - lastMove > 150) { await walkTo(to); lastMove = now; } // mid-swing: step out as soon as it can
      await wait(bot.tick); return 'roll';
    }
    // M6a: standing in a poison cloud: wash it away with the water gun
    const cloud = dz.h.poison && G.washables?.find((w) => w.active() && w.kind === 'cloud' && flat(w, pp) < w.r + 0.3);
    if (cloud && G.run.water >= 0.13 && G.tools.waterGun.ready && !s.action) { await toolAt('waterGun', V3(cloud.x, 0, cloud.z)); await wait(bot.tick); return 'wash'; }
    if (!dz.ring) {
      // a wolf winding up: the water gun knocks it out of the bite
      const e = G.enemies.find((x) => (x.kind === 'wolf' || x.kind === 'fox') && x.state === 'windup' && flat(x.pos, pp) < 3);
      if (e && dz.t > 0.25 && G.run.water >= 0.13 && G.tools.waterGun.ready && !s.action) { await toolAt('waterGun', e.pos); await wait(bot.tick); return 'water'; }
      const id = `${dz.h.kind}${dz.h.x.toFixed(1)},${dz.h.z.toFixed(1)}`; // a new mark: move at once
      if (now - lastMove > 250 || id !== lastDodged) {
        lastDodged = id;
        const near = goal ?? (() => 0);
        const to = safeSpot((c) => near(c) * 0.3);
        if (to) { await walkTo(to); lastMove = now; }
      }
      await wait(bot.tick); return 'dodge';
    }
  }
  if (dz) { await wait(bot.tick); return 'wait-deer'; } // (a deer aims at the hero: hold still for the block)
  const awake = G.enemies.filter((e) => !e.gone && !e.dormant && e.state !== 'asleep' && (!e.isBoss || e.started) && (!e.returning || flat(e.pos, pp) < 6));
  const soon = hazards().some((h) => h.shape !== 'ring' && h.hitAt - G.time < 0.9 && flat(pp, h) < (h.r ?? h.len ?? 3) + 2.5);
  // 2. a herb when low and nothing is coming
  if (G.run.hearts <= 2.5 && G.run.herbs > 0 && !soon && !s.action && awake.every((e) => e.isBoss ? ['dizzy', 'droop', 'stuck', 'stunned', 'rest', 'roar', 'tired'].includes(e.doing) : flat(e.pos, pp) > 4.5)) {
    keyTap('Digit4'); bot.stats.herbs++; await wait(1100); return 'herb';
  }
  // 3. fight
  if (awake.length) {
    const target = pickTarget(awake, pp);
    if (target) return attack(target, soon, now);
  }
  // 4. nothing to fight: go where the goal says
  if (goal && now - lastMove > 400) {
    const to = safeSpot((c) => goal(c), [2, 4, 5.5]);
    if (to && goal(to) < goal(pp) - 0.3) { await walkTo(to); lastMove = now; }
  }
  await wait(bot.tick);
  return 'idle';
}

const openNow = (e) => e.isBoss ? ['dizzy', 'droop', 'stuck', 'stunned', 'rest', 'idle', 'roar', 'tired'].includes(e.doing)
  : e.kind === 'mole' ? e.exposed
  : ['bound', 'recover', 'stagger', 'idle', 'alert'].includes(e.state)
    // a chasing wolf is worth a swing in the moss cave; deeper (tougher
    // animals) the bot waits for the bite to miss and hits the opening
    || (e.kind === 'wolf' && e.state === 'chase' && (G.difficulty?.hp ?? 1) <= 1);
function pickTarget(awake, pp) {
  return awake.slice().sort((a, b) => score(a) - score(b))[0];
  function score(e) { return flat(e.pos, pp) - (openNow(e) ? 3 : 0) - (e.landed || e.dazed ? 5 : 0); }
}

async function attack(e, soon, now) {
  const pp = P.position;
  const d = flat(e.pos, pp);
  const s = P.state;
  // M6a: a hidden fox: the water gun shows it up (then it cannot hide)
  if (e.kind === 'fox' && (e.cloak?.hidden || e.cloak?.slinking) && d < 9.5 && G.run.water > 0.15 && G.tools.waterGun.ready && !s.action) {
    await toolAt('waterGun', e.pos); await wait(120); return 'water';
  }
  // M6a: a mole underground: water into its mound floods it out
  if (e.kind === 'mole' && e.underground && e.state !== 'idle' && d < 9.5 && G.run.water > 0.15 && G.tools.waterGun.ready && !s.action && !soon) {
    await toolAt('waterGun', e.pos); await wait(120); return 'water';
  }
  if (e.kind === 'mole' && e.underground) {
    // keep a little way off while it digs about (its circle is dodged above)
    if (now - lastMove > 500 && d < 3.5) { const to = safeSpot((c) => Math.abs(flat(c, e.pos) - 6), [2, 3.5]); if (to) { await walkTo(to); lastMove = now; } }
    else if (e.state === 'idle' && d > 6 && now - lastMove > 500) { await walkTo(e.pos.clone()); lastMove = now; }
    await wait(bot.tick); return 'wait';
  }
  // W3: a bear coming for the hero: water in its face (it staggers: the hammer's chance)
  if (e.kind === 'bear' && !e.stunned && ['chase', 'windup', 'recover', 'alert'].includes(e.state) && d < 8.5 && G.run.water >= 0.13 && G.tools.waterGun.ready && !s.action) {
    const toHero = Math.atan2(pp.x - e.pos.x, pp.z - e.pos.z);
    let off = toHero - e.heading; off = Math.atan2(Math.sin(off), Math.cos(off));
    if (Math.abs(off) < 0.9) { await toolAt('waterGun', e.pos); await wait(120); return 'water'; }
  }
  if (e.kind === 'bear' && !e.stunned && !soon && d < 4 && now - lastMove > 400) {
    // too close to a bear that is not reeling: back off a little (its slam is wide)
    const to = safeSpot((c) => Math.abs(flat(c, e.pos) - 6), [2, 3.5]); if (to) { await walkTo(to); lastMove = now; }
    await wait(bot.tick); return 'back';
  }
  // the vine on a wolf (bound: 3 s of free hits)
  if (e.kind === 'wolf' && e.state !== 'bound' && G.run.owned.includes('vine') && G.tools.vine.ready && d < 5.5 && d > 1.2 && !s.action) {
    await toolAt('vine', e.pos); await wait(250); return 'vine';
  }
  // the vine trips the chief (stun gauge)
  if (e.isBoss && G.run.owned.includes('vine') && G.tools.vine.ready && d < 5.5 && !s.action && ['rest', 'idle', 'gap', 'dizzy', 'tired'].includes(e.doing)) {
    await toolAt('vine', e.pos); await wait(250); return 'vine';
  }
  if (openNow(e) && !soon) {
    if (now - lastAttack > 350) { await clickAt(e.pos.clone().setY(e.pos.y + 0.5)); lastAttack = now; bot.stats.swings++; }
    await wait(bot.tick); return 'hammer';
  }
  // not open: a rabbit hopping about dodges; keep at a hop's distance so it
  // jumps (its landing is the opening). The chief mid-attack: stay out of
  // its marks and close enough to strike when it is dazed.
  // W3: a deer keeps its distance too: wait in the open for its charge
  if (e.kind === 'deer') {
    if (now - lastMove > 600 && (d > 9 || d < 3)) { const to = safeSpot((c) => Math.abs(flat(c, e.pos) - 6.5), [1.5, 3]); if (to) { await walkTo(to); lastMove = now; } }
  } else if (e.kind === 'rabbit' || e.kind === 'hare') {
    if (now - lastMove > 500 && (d > 6 || d < 3)) { const to = safeSpot((c) => Math.abs(flat(c, e.pos) - 4.5), [1.5, 3]); if (to) { await walkTo(to); lastMove = now; } }
    // from afar, the water gun wears it down (and knocks it off its feet)
    else if (G.run.water > 0.5 && G.tools.waterGun.ready && d < 7 && e.state === 'chase' && !s.action) await toolAt('waterGun', e.pos);
  } else if (e.isBoss) {
    const want = e.doing === 'crouch' || e.doing === 'air' ? 3.6 : 2.6;
    if (now - lastMove > 350 && Math.abs(d - want) > 1) { const to = safeSpot((c) => Math.abs(flat(c, e.pos) - want), [1.5, 3, 4.5]); if (to) { await walkTo(to); lastMove = now; } }
    else if (G.run.water > 0.4 && G.tools.waterGun.ready && d > 4 && !s.action && ['rest', 'idle'].includes(e.doing)) await toolAt('waterGun', e.pos);
  } else if (now - lastAttack > 400 && !soon) { await clickAt(e.pos.clone().setY(e.pos.y + 0.5)); lastAttack = now; }
  await wait(bot.tick);
  return 'wait';
}

// Fight until no animal (or boss) of a spot is awake, up to `ms`. Between
// fights it keeps to the spot's middle. `{ enemies, home }` names the spot's own.
async function clearByPlay(ms = 120000, opts = {}) {
  const t0 = performance.now();
  const mine = opts.enemies ? (e) => opts.enemies.includes(e) : () => true;
  const home = opts.home ?? V3(0, 0, 0);
  while (performance.now() - t0 < ms) {
    if (G.mode === 'result') return false;
    const awake = G.enemies.some((e) => mine(e) && !e.gone && e.state !== 'asleep');
    if (!awake && G.mode === 'play') return true;
    await botStep({ goal: (c) => flat(c, home) * 0.2 });
  }
  return false;
}

// Walk to a far point the way a player would on the big map: follow an A*
// path (the nav's own), clicking the furthest point of it that is on screen
// and close, and stop to fight whatever comes after the hero on the way.
async function travel(to, { ms = 90000, near = 2.5 } = {}) {
  const t0 = performance.now();
  let path = null, planned = -1e9, stuck = 0, last = P.position.clone();
  while (performance.now() - t0 < ms) {
    if (G.mode === 'result') return false;
    if (flat(P.position, to) < near) return true;
    if (G.hud.inDialog) { keyTap('Space'); await wait(150); continue; }
    // a click by a shop or the codex stone opened it on the way: close it
    if (G.mode === 'menu' && (G.shop?.isOpen || G.codex?.isOpen || G.altar?.isOpen)) { G.shop?.close(); G.codex?.close(); G.altar?.close(); await wait(100); continue; }
    if (G.mode !== 'play') { await wait(100); continue; }
    const pp = P.position;
    const after = G.enemies.some((e) => !e.dormant && !e.gone && !e.returning && ['alert', 'chase', 'windup', 'attack', 'recover', 'stagger', 'bound', 'travel', 'surface', 'flooded', 'dig'].includes(e.state) && flat(e.pos, pp) < 12);
    if (after || danger()) { await botStep({ goal: (c) => flat(c, to) * 0.2 }); path = null; continue; }
    if (!path || performance.now() - planned > 3000) { path = G.nav.findPath(pp, to, { near: 1, jumps: true })?.points ?? null; planned = performance.now(); }
    let target = null;
    if (path) {
      while (path.length > 1 && flat(path[0], pp) < 1.5) path.shift();
      // (W3: along the path, a point every metre: a long straight leg over the
      // open snow has its next corner far off screen)
      const cands = [];
      let prev = { x: pp.x, z: pp.z };
      walk: for (const p of path) {
        // (a bounce mushroom's flight is not walked: its landing is one point, never the air before it;
        // W4: a hop between floating rocks may be longer: its landing is clicked from further)
        if (p.jump) { if (flat(p, pp) <= (G.world?.def.hops?.some((h) => h.id === p.jump) ? 24 : 13) && onScreen(p, 70)) cands.push(p); break; }
        const seg = flat(p, prev);
        for (let d = 1; d <= seg; d += 1) {
          const q = { x: prev.x + (p.x - prev.x) * d / seg, z: prev.z + (p.z - prev.z) * d / seg };
          q.y = d >= seg - 0.5 ? p.y : gy(q.x, q.z);
          if (flat(q, pp) > 13 || !onScreen(V3(q.x, q.y ?? 0, q.z), 70)) break walk;
          if (d >= seg - 0.5 || d % 3 === 0) cands.push(d >= seg - 0.5 ? p : q);
        }
        prev = p;
      }
      // (W2: the furthest one the cursor really points at: a point down a
      // ramp's cut may hide behind its lip, and a click there means the lip)
      for (const p of cands.reverse()) {
        const v = V3(p.x, p.y ?? gy(p.x, p.z), p.z);
        mouse('mousemove', v);
        const h = G.pointer.pick();
        // (W7: never a point where the cursor is on something to use: a click
        // there rides the mine cart back, opens the shop…)
        if ((h?.kind !== 'ground' && h?.kind !== 'use') || (h?.kind === 'ground' && flat(h.pos, v) < 1.5 && Math.abs(h.pos.y - v.y) < 1.5)) { target = p; break; }
      }
      target ??= path[0];
    }
    await clickAt(target ? V3(target.x, target.y ?? gy(target.x, target.z), target.z) : G3(to.x, to.z));
    await wait(380);
    stuck = flat(P.position, last) < 0.3 ? stuck + 1 : 0;
    last = P.position.clone();
    if (stuck > 6) { path = null; stuck = 0; await walkTo(V3(pp.x + (Math.random() - 0.5) * 6, 0, pp.z + (Math.random() - 0.5) * 6)); await wait(500); }
  }
  return false;
}
