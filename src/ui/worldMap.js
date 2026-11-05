// W1: the big world's map (the old seeded caves had their own, gone in W7). One picture of the
// whole world drawn once from world.sample() (2 m a pixel: the walkable
// ground by its level and kind, lighter the higher it lies, cliff lips
// outlined, water blue, bridges tan), shown only where the hero has been:
// a fog of war on a 4 m grid, uncovered within REVEAL m of the hero and
// kept in the save (core/state.js world.fog, base64). Drawn turned the way
// the camera looks (up the screen = −x −z), as a round minimap in the top
// right corner (the hero in the middle) and big with Tab, with the camp,
// the gates, the arena and the places' names on it.
const $ = (id) => document.getElementById(id);
const PX = 2; // m a picture pixel
const FOG = 4; // m a fog cell
const REVEAL = 28; // m round the hero
const MINI_SPAN = 110; // m across the minimap
const S = Math.SQRT1_2;
const toU = (x, z) => (x - z) * S, toV = (x, z) => (x + z) * S;

const COLORS = {
  moss: [98, 140, 82], meadow: [140, 158, 86], camp: [176, 140, 96], ramp: [150, 124, 92], sand: [140, 130, 100],
  crystal: [120, 96, 170], mushroom: [128, 92, 150], ice: [150, 190, 214], rock: [110, 112, 104],
};

export function createWorldMap(G) {
  const world = G.world, g = world.sample(), nav = G.navGrid;
  const [bx0, bz0, bx1, bz1] = world.bounds;
  const PW = Math.ceil((bx1 - bx0) / PX), PD = Math.ceil((bz1 - bz0) / PX);
  const FW = Math.ceil((bx1 - bx0) / FOG), FD = Math.ceil((bz1 - bz0) / FOG);
  const W = G.state.world;
  const big = $('map-canvas'), mini = $('minimap');

  // ---- the picture of the whole world
  const base = document.createElement('canvas');
  base.width = PW; base.height = PD;
  {
    const ctx = base.getContext('2d');
    const img = ctx.createImageData(PW, PD);
    const matOf = (k) => {
      const id = g.ids[g.region[k]];
      if (world.ramps.some((r) => r.id === id)) return 'ramp';
      return world.terraces.find((t) => t.id === id)?.material ?? 'moss';
    };
    const walk = (i, j) => {
      if (i < 0 || j < 0 || i >= g.W || j >= g.D) return false;
      const k = j * g.W + i;
      return nav.ok(k * 2) || nav.ok(k * 2 + 1);
    };
    for (let py = 0; py < PD; py++) for (let px = 0; px < PW; px++) {
      const i = px * PX, j = py * PX, k = j * g.W + i, o = (py * PW + px) * 4;
      if (i >= g.W || j >= g.D) continue;
      let c = null, a = 255;
      if (!Number.isNaN(g.deck[k]) && nav.ok(k * 2 + 1)) c = [205, 176, 120];
      else if (!Number.isNaN(g.water[k])) c = [70, 130, 190];
      else if (walk(i, j)) {
        const base = COLORS[matOf(k)] ?? COLORS.moss;
        const lift = Math.max(0.55, Math.min(1.25, (g.h[k] + 120) / 110));
        c = base.map((v) => v * lift);
        // a cliff's lip: a light rim where the ground stops
        if (!walk(i + PX, j) || !walk(i - PX, j) || !walk(i, j + PX) || !walk(i, j - PX)) c = c.map((v) => v * 0.6 + 235 * 0.4);
      } else if (g.open[k]) { c = [44, 48, 52]; a = 200; } // a cliff face or a ledge
      else { c = [24, 26, 30]; a = 140; } // rock
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = a;
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---- the fog
  const bits = new Uint8Array(Math.ceil((FW * FD) / 8));
  try {
    const raw = atob(W.fog || '');
    for (let n = 0; n < Math.min(raw.length, bits.length); n++) bits[n] = raw.charCodeAt(n);
  } catch { /* an unreadable fog: start dark */ }
  const fog = document.createElement('canvas');
  fog.width = PW; fog.height = PD;
  const fctx = fog.getContext('2d');
  fctx.fillStyle = '#fff';
  const k2 = FOG / PX;
  for (let j = 0; j < FD; j++) for (let i = 0; i < FW; i++) if (bits[(j * FW + i) >> 3] & (1 << ((j * FW + i) & 7))) fctx.fillRect(i * k2 - 0.5, j * k2 - 0.5, k2 + 1, k2 + 1);
  const shown = document.createElement('canvas');
  shown.width = PW; shown.height = PD;
  const sctx = shown.getContext('2d');
  let dirty = true, fogDirty = false;
  function compose() {
    sctx.globalCompositeOperation = 'source-over';
    sctx.clearRect(0, 0, PW, PD);
    sctx.drawImage(base, 0, 0);
    sctx.globalCompositeOperation = 'destination-in';
    sctx.drawImage(fog, 0, 0);
    sctx.globalCompositeOperation = 'source-over';
    dirty = false;
  }
  const seen = (x, z) => {
    const i = Math.floor((x - bx0) / FOG), j = Math.floor((z - bz0) / FOG);
    if (i < 0 || j < 0 || i >= FW || j >= FD) return false;
    const n = j * FW + i;
    return !!(bits[n >> 3] & (1 << (n & 7)));
  };
  let lastReveal = null;
  function reveal(p, r = REVEAL) {
    let fresh = 0;
    const r2 = Math.ceil(r / FOG);
    const ci = Math.floor((p.x - bx0) / FOG), cj = Math.floor((p.z - bz0) / FOG);
    for (let j = cj - r2; j <= cj + r2; j++) for (let i = ci - r2; i <= ci + r2; i++) {
      if (i < 0 || j < 0 || i >= FW || j >= FD) continue;
      if (Math.hypot((i + 0.5) * FOG + bx0 - p.x, (j + 0.5) * FOG + bz0 - p.z) > r) continue;
      const n = j * FW + i;
      if (bits[n >> 3] & (1 << (n & 7))) continue;
      bits[n >> 3] |= 1 << (n & 7);
      fctx.fillRect(i * k2 - 0.5, j * k2 - 0.5, k2 + 1, k2 + 1);
      fresh++;
    }
    if (fresh) { dirty = true; fogDirty = true; }
    return fresh;
  }
  const keepFog = () => {
    if (!fogDirty) return;
    let s = '';
    for (let n = 0; n < bits.length; n++) s += String.fromCharCode(bits[n]);
    W.fog = btoa(s);
    fogDirty = false;
  };

  // ---- what goes on top
  function marks(ctx, at, scale, full) {
    const icon = (text, x, z, size, alpha = 1) => {
      const [px, py] = at(x, z);
      ctx.globalAlpha = alpha;
      ctx.font = `${size}px sans-serif`;
      ctx.fillText(text, px, py);
      ctx.globalAlpha = 1;
    };
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const def = world.def, ex = G.expedition;
    if (full) {
      // the names of the places seen
      ctx.font = `bold ${Math.round(13 * scale)}px Jua, sans-serif`;
      for (const a of world.areas) {
        const c = a.label ?? a.circle ?? centroid(a.outline);
        if (!seen(c[0], c[1])) continue;
        const [px, py] = at(c[0], c[1]);
        ctx.fillStyle = 'rgba(20,16,30,0.6)';
        const w = ctx.measureText(a.name).width + 14 * scale;
        ctx.fillRect(px - w / 2, py + 9 * scale, w, 18 * scale);
        ctx.fillStyle = '#ffeab0';
        ctx.fillText(a.name, px, py + 18 * scale);
      }
    }
    if (W.camp && def.camp) icon('🔥', ...def.camp.at, 18 * scale);
    if (seen(...def.spawn)) icon('☀️', ...def.spawn, 15 * scale);
    if (def.arena && seen(...def.arena.at) && !W.bosses?.rabbitChief) icon('👑', ...def.arena.at, 17 * scale);
    for (const gt of Object.values(ex?.gates ?? {})) {
      if (!seen(gt.def.at[0], gt.def.at[1])) continue;
      if (gt.def.secret && !gt.open && !gt.revealed) continue; // (W5: a secret door shows once found)
      if (gt.def.secret) { icon(gt.open ? '✨' : '💎', gt.def.at[0], gt.def.at[1], 13 * scale); continue; }
      icon(gt.open ? gt.def.sign?.icon ?? '🚪' : '🔒', gt.def.at[0], gt.def.at[1], 13 * scale, gt.open ? 0.9 : 1);
    }
    // the hero: a gold dot with the way it faces
    const p = G.player.position, [hx, hy] = at(p.x, p.z);
    const h = G.player.state.heading ?? 0;
    const [fx, fy] = at(p.x + Math.sin(h) * 6, p.z + Math.cos(h) * 6);
    ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 2.5 * scale;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.fillStyle = '#ffcf4a';
    ctx.beginPath(); ctx.arc(hx, hy, 4.5 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a2a00'; ctx.lineWidth = 1.2 * scale; ctx.stroke();
  }

  // the picture drawn turned: world (x, z) → screen (u·k + ox, v·k + oy)
  function drawWorld(ctx, k, ox, oy) {
    if (dirty) compose();
    const a = PX * k * S;
    ctx.setTransform(a, a, -a, a, k * toU(bx0, bz0) + ox, k * toV(bx0, bz0) + oy);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(shown, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  const map = {
    open: false,
    toggle(on = !map.open) {
      map.open = on;
      $('map').classList.toggle('hidden', !map.open);
      if (map.open) map.render();
    },
    render() {
      // fit the seen part of the world (and the hero) to the screen
      const w = Math.min(innerWidth - 60, 980), h = Math.min(innerHeight - 150, 760);
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (let j = 0; j < FD; j++) for (let i = 0; i < FW; i++) {
        const n = j * FW + i;
        if (!(bits[n >> 3] & (1 << (n & 7)))) continue;
        const x = bx0 + (i + 0.5) * FOG, z = bz0 + (j + 0.5) * FOG;
        const u = toU(x, z), v = toV(x, z);
        u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
      }
      const p = G.player.position;
      if (!Number.isFinite(u0)) { u0 = u1 = toU(p.x, p.z); v0 = v1 = toV(p.x, p.z); }
      const pad = 40;
      u0 -= pad; u1 += pad; v0 -= pad; v1 += pad;
      const span = Math.max(u1 - u0, (v1 - v0) * (w / h), 160);
      const k = w / span;
      const r = devicePixelRatio;
      big.width = Math.round(w * r); big.height = Math.round(h * r);
      big.style.width = `${w}px`; big.style.height = `${h}px`;
      const ctx = big.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(16,12,24,0.92)';
      ctx.fillRect(0, 0, big.width, big.height);
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
      const ox = big.width / 2 - cu * k * r, oy = big.height / 2 - cv * k * r;
      drawWorld(ctx, k * r, ox, oy);
      marks(ctx, (x, z) => [toU(x, z) * k * r + ox, toV(x, z) * k * r + oy], r * 1.1, true);
      $('map-title').textContent = `🗺️ ${G.expedition?.label() || world.def.name}`;
    },
    renderMini() {
      if (!mini) return;
      const size = mini.width;
      const ctx = mini.getContext('2d');
      const k = size / MINI_SPAN;
      const p = G.player.position;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#141019';
      ctx.fillRect(0, 0, size, size);
      const ox = size / 2 - toU(p.x, p.z) * k, oy = size / 2 - toV(p.x, p.z) * k;
      drawWorld(ctx, k, ox, oy);
      marks(ctx, (x, z) => [toU(x, z) * k + ox, toV(x, z) * k + oy], size / 160, false);
    },
    reveal, seen,
    // for checks and screenshots: everything uncovered
    revealAll() { fctx.fillRect(0, 0, PW, PD); bits.fill(255); dirty = true; fogDirty = true; keepFog(); },
    get seenCount() { let n = 0; for (const b of bits) for (let q = b; q; q &= q - 1) n++; return n; },
  };

  let t = 0, keepT = 0;
  G.onUpdate((dt) => {
    if (G.mode === 'title') return;
    const p = G.player.position;
    if (!lastReveal || Math.hypot(p.x - lastReveal.x, p.z - lastReveal.z) > 3) { reveal(p); lastReveal = p.clone(); }
    keepT -= dt;
    if (keepT <= 0) { keepT = 2; keepFog(); }
    t -= dt;
    if (t > 0) return;
    t = 0.12;
    map.renderMini();
    if (map.open) map.render();
  });
  G.on('progress', keepFog);
  return map;
}

function centroid(pts) {
  let x = 0, z = 0;
  for (const [px, pz] of pts) { x += px; z += pz; }
  return [x / pts.length, z / pts.length];
}
