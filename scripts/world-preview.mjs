// Draws a height world top-down, the way the camera's map sees it (up the
// screen = −x −z), to a PNG: colour by height, rock dark, unwalkable red
// tint, the walkable piece the spawn is in bright; gates, spots, ramps.
// Usage: node scripts/world-preview.mjs [main|test] out.png [mPerPx]
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createWorld, gateBlocks } from '../src/world/world.js';
import { buildNavGrid } from '../src/world/navGrid.js';
import { MAIN_WORLD } from '../src/world/worlds/main.js';
import { TEST_WORLD } from '../src/world/worlds/test.js';

// (W2: an optional 4th argument crops to a window of the map: "u0,v0,u1,v1")
const [which = 'main', out = 'world.png', mpp = '1', win = ''] = process.argv.slice(2);
const def = { main: MAIN_WORLD, test: TEST_WORLD }[which];
let t = performance.now();
const world = createWorld(def);
const g = world.sample();
const tS = performance.now() - t; t = performance.now();
const nav = buildNavGrid(world);
const tN = performance.now() - t;
console.log(`sample ${tS.toFixed(0)} ms, nav ${tN.toFixed(0)} ms, cells ${g.W}x${g.D}, walkable ${nav.walkableCount}, pieces ${nav.sizes.filter((s) => s >= 40).length}, parts ${nav.parts}`);
const S = Math.SQRT1_2, k = Number(mpp);
const [bx0, bz0, bx1, bz1] = world.bounds;
const [wu0, wv0, wu1, wv1] = win ? win.split(',').map(Number) : [-(bx1 - bx0) / Math.SQRT2, -(bx1 - bx0) / Math.SQRT2, (bx1 - bx0) / Math.SQRT2, (bx1 - bx0) / Math.SQRT2];
const U = Math.ceil((wu1 - wu0) / k), V = Math.ceil((wv1 - wv0) / k);
const img = Buffer.alloc(U * V * 3);
const sp = nav.nearest({ x: def.spawn[0], z: def.spawn[1] }, 4);
const home = sp >= 0 ? nav.piece[sp] : -1;
for (let py = 0; py < V; py++) for (let px = 0; px < U; px++) {
  const u = wu0 + px * k, v = wv0 + py * k;
  const x = (u + v) * S, z = (v - u) * S;
  let r = 10, gg = 10, b = 14;
  if (x >= bx0 && x <= bx1 && z >= bz0 && z <= bz1) {
    const i = Math.round((x - bx0)), j = Math.round((z - bz0)), c = j * g.W + i;
    const h = g.h[c];
    const lum = Math.max(0, Math.min(1, (h + 110) / 120));
    r = 40 + lum * 150; gg = 40 + lum * 160; b = 50 + lum * 120;
    const n0 = c * 2, n1 = c * 2 + 1;
    const walk = nav.ok(n0) || nav.ok(n1);
    if (!g.open[c] && Number.isNaN(g.deck[c])) { r *= 0.55; gg *= 0.5; b *= 0.5; }
    if (walk) {
      const mine = nav.piece[nav.ok(n1) ? n1 : n0] === home;
      if (mine) { gg += 40; } else { r += 50; }
    }
    if (!Number.isNaN(g.water[c])) { r = 40; gg = 90; b = 170; }
    if (!Number.isNaN(g.deck[c])) { r = 200; gg = 170; b = 110; }
    for (const gt of world.gates) if (gateBlocks(gt, x, z)) { r = 255; gg = 60; b = 200; }
  }
  // W2: the map frame's grid, every 50 m (brighter every 100 m), to place things by
  const gu = Math.abs(u % 50) < k * 0.6 || Math.abs(u % 50) > 50 - k * 0.6, gv = Math.abs(v % 50) < k * 0.6 || Math.abs(v % 50) > 50 - k * 0.6;
  if (gu || gv) { const hund = (gu && Math.abs(Math.round(u) % 100) < 2) || (gv && Math.abs(Math.round(v) % 100) < 2); r += hund ? 60 : 25; gg += hund ? 60 : 25; b += hund ? 60 : 25; }
  const o = (py * U + px) * 3;
  img[o] = Math.min(255, r); img[o + 1] = Math.min(255, gg); img[o + 2] = Math.min(255, b);
}
// spots and spawn
const dot = (x, z, col, rad = 2) => {
  const u = (x - z) * S, v = (x + z) * S;
  const cx = Math.round((u - wu0) / k), cy = Math.round((v - wv0) / k);
  for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
    const X = cx + dx, Y = cy + dy; if (X < 0 || Y < 0 || X >= U || Y >= V) continue;
    const o = (Y * U + X) * 3; img[o] = col[0]; img[o + 1] = col[1]; img[o + 2] = col[2];
  }
};
for (const s of def.spots ?? []) dot(s.at[0], s.at[1], [255, 220, 0], 3);
dot(def.spawn[0], def.spawn[1], [255, 255, 255], 4);
if (def.camp) dot(def.camp.at[0], def.camp.at[1], [255, 120, 0], 4);
if (def.arena) dot(def.arena.at[0], def.arena.at[1], [200, 0, 255], 4);
for (const l of def.landmarks ?? []) dot(l.x, l.z, [0, 0, 0], 1);
// W2: bounce pads (orange) and their landings (cyan), poison (green), the queen (violet)
for (const b of def.bounces ?? []) { dot(b.pad[0], b.pad[1], [255, 140, 0], 3); dot(b.land[0], b.land[1], [0, 230, 255], 3); }
for (const h of [...(def.hazards?.mud ?? []), ...(def.hazards?.tar ?? [])]) dot(h.at[0], h.at[1], [60, 200, 40], 2);
for (const v of def.hazards?.vents ?? []) dot(v[0], v[1], [200, 255, 60], 2);
if (def.queen) dot(def.queen.at[0], def.queen.at[1], [200, 0, 255], 4);
// PNG
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const crc = (buf) => { let c, crcT = []; for (let n = 0; n < 256; n++) { c = n; for (let k2 = 0; k2 < 8; k2++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; } let x = 0xffffffff; for (const b of buf) x = crcT[(x ^ b) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
writeFileSync(out, png(U, V, img));
console.log('wrote', out, U, 'x', V);
