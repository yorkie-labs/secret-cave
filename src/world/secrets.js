import * as THREE from 'three';
import { place } from './models.js';
import { createChest } from '../entities/chest.js';
import { textSprite } from '../entities/enemy.js';
import { createGlyphWall } from '../entities/necklace.js';
import { shardModel } from '../ui/thumbs.js';
import { findSecret, shardWaiting, takePurpleShard } from '../core/growth.js';
import { openGate, save } from '../core/state.js';
import { SECRET_PAGES } from '../data/codex.js';
import { sfx } from '../audio/sound.js';

// W5: the secret pockets (GDD §6.4, §7.3 비밀 방): one in each region, down a
// short passage behind a crystal door that looks like a mossy rock wall.
//   - a sniff (1) that reaches the door reveals it: its crystals light up,
//     a ✨ hangs over it (saved: `world.sniffed`);
//   - walking up to a revealed door with the golden necklace makes the
//     necklace glow and the door sink (saved: an open gate);
//   - the first time, a star and the secret's codex page (its old letters);
//   - inside: the old letters on a stone, crystals, and a purple-lidded chest
//     that holds a rare reward every expedition (a grade-up gem, legend
//     armour in the ice pocket).
// And the post-game tease: once the hero has got out into the sunlight, a
// purple shard glows on the Crystal King's platform: taking it opens the
// codex's last page ("다음 모험…") and gives a last star.
const SNIFF_REACH = 12; // m: a sniff this close reveals a secret door
const DOOR_NEAR = 7; // m: a revealed door opens to the necklace this close
const HINT_NEAR = 6; // m: an unrevealed door says "sniff here" once an expedition

export function createSecrets(G, def, { gates, after }) {
  const { world, state } = G;
  const W = state.world;
  W.sniffed ??= {};
  const list = (def.secrets ?? []).map((s) => ({ ...s, g: gates[s.gate] })).filter((s) => s.g);
  const V = (p, dy = 0) => new THREE.Vector3(p[0], world.groundAt(p[0], p[1]) + dy, p[1]);
  let busy = false;
  const hinted = new Set();

  for (const s of list) {
    if (W.sniffed[s.id] || s.g.open) s.g.reveal();
    // inside: the old letters, a few crystals, a soft purple light
    const gy = world.groundAt(...s.glyph);
    const face = Math.atan2(s.at[0] - s.glyph[0], s.at[1] - s.glyph[1]);
    place(G, 'glyphStone', s.glyph[0], s.glyph[1], { s: 1.3, ry: face, y: gy, body: 'none' });
    G.physics.addCylinder(s.glyph[0], gy, s.glyph[1], { radius: 0.7, height: 2 });
    createGlyphWall(G, { x: s.glyph[0] + Math.sin(face) * 0.6, z: s.glyph[1] + Math.cos(face) * 0.6, y: gy + 0.7, facing: face, lit: true });
    for (let k = 0; k < 3; k++) {
      const a = face + Math.PI + (k - 1) * 0.9;
      const cx = s.at[0] + Math.sin(a) * 4.6, cz = s.at[1] + Math.cos(a) * 4.6;
      try { place(G, 'crystalCluster', cx, cz, { s: 0.9 + k * 0.15, ry: k * 1.7, y: world.groundAt(cx, cz), body: 'none' }); } catch { /* (not loaded) */ }
    }
    G.addLight({ pos: V(s.at, 2.6), color: '#d4a8ff', intensity: 7, distance: 11 });
    G.addInteractable({
      pos: V(s.glyph), radius: 2.6, name: '옛 글자', kind: 'secretGlyph', label: '📜 옛 글자 읽기',
      action: () => G.say([{ name: SECRET_PAGES[s.id].name, text: SECRET_PAGES[s.id].desc }]),
    });
  }

  // a sniff reaches a door: it shows itself
  G.on('sniff', ({ pos }) => {
    for (const s of list) {
      if (s.g.revealed || s.g.open) continue;
      const d = Math.hypot(pos.x - s.g.at.x, pos.z - s.g.at.z);
      if (d > SNIFF_REACH || Math.abs(pos.y - s.g.y) > 6) continue;
      setTimeout(() => {
        if (s.g.reveal()) {
          W.sniffed[s.id] = true;
          save(state);
          G.toast(state.necklace ? '✨ 킁킁! 바위 틈에서 비밀 수정 문을 찾았어요! 황금 목걸이를 가까이 대 봐요' : '✨ 킁킁! 바위 틈에 비밀 수정 문이 있어요!', 3600);
        }
      }, Math.min(3500, (d / 10) * 3500));
    }
  });

  function tick(pp) {
    if (busy) return;
    for (const s of list) {
      const g = s.g;
      if (g.open || g.opening >= 0) continue;
      const d = Math.hypot(pp.x - g.at.x, pp.z - g.at.z);
      if (Math.abs(pp.y - g.y) > 4) continue;
      if (!g.revealed) {
        if (d < HINT_NEAR && !hinted.has(s.id)) { hinted.add(s.id); G.toast('🐾 이 바위 벽에서 신기한 냄새가 나요… 1번(냄새 맡기)을 눌러 볼까요?', 3400); G.emit('secretHint', s.id); }
        continue;
      }
      if (!state.necklace || d > DOOR_NEAR) continue;
      busy = true;
      g.glow();
      G.hud.necklaceGlow?.(true);
      G.toast('🏅 황금 목걸이가 빛나요! 비밀 문이 열려요…', 2600);
      G.emit('necklaceGlow', { gate: g.id, at: G.time, secret: true });
      after(1.6, () => {
        g.unseal();
        openGate(state, g.id);
        const first = findSecret(state, s.id);
        if (first) G.discover?.(s.id);
        save(state);
        after(1.2, () => {
          G.hud.necklaceGlow?.(false);
          busy = false;
          if (first) G.hud.card(`<h2>✨ 비밀 구역을 찾았어요!</h2><p>${SECRET_PAGES[s.id].name} · ⭐ 별 하나 · 📖 도감 한 쪽</p>`, 3200);
          else G.toast('✨ 비밀 구역이 열렸어요', 2400);
          G.emit('secretFound', { id: s.id, first });
        });
      });
      return;
    }
  }

  // every expedition: the secret chests (inside the expedition's scope)
  function spawnChests(n) {
    return list.map((s, i) => createChest(G, {
      x: s.chest[0], z: s.chest[1], heading: Math.atan2(s.at[0] - s.chest[0], s.at[1] - s.chest[1]), // (facing the pocket's middle)
      index: n * 100 + 90 + i, loot: s.loot, grade: s.grade ?? 'common', target: s.target ?? null, secret: true,
    }));
  }

  // ---- the purple shard after the ending (on the king's platform)
  let shard = null;
  function spawnShard() {
    if (shard?.alive || !shardWaiting(state) || !def.king) return null;
    // (on the platform's far side from the crystal lift, so the way to it never passes the lift's pad)
    const L = def.lift4?.heart ?? [def.king.at[0] + 1, def.king.at[1]];
    const dx = def.king.at[0] - L[0], dz = def.king.at[1] - L[1], dl = Math.hypot(dx, dz) || 1;
    const p = [def.king.at[0] + (dx / dl) * 6, def.king.at[1] + (dz / dl) * 6];
    const y = world.groundAt(...p);
    const model = shardModel();
    model.scale.setScalar(1.6);
    const glow = G.addLight({ pos: () => model.position, color: '#b07bff', intensity: 10, distance: 10 });
    const halo = textSprite('✦', 1.4, '#e2c8ff');
    halo.visible = true;
    model.add(halo);
    halo.position.y = 0.9;
    shard = G.addPickup({
      model, pos: new THREE.Vector3(p[0], y, p[1]), float: 0.9, radius: 1.1, name: '보라색 조각', kind: 'purpleShard',
      onCollect: () => {
        glow.on = false;
        if (!takePurpleShard(state)) return;
        G.discover?.('purpleShard');
        save(state);
        sfx.necklace?.();
        G.hud.card('<h2>💜 보라색 조각</h2><p>따뜻하게 빛나며 어딘가를 가리켜요…<br>다음 모험…? · ⭐ 별 하나 · 📖 도감 마지막 쪽</p>', 4200);
        G.emit('purpleShard');
      },
      onRemove: () => { glow.on = false; },
    });
    G.emit('shardAppeared', { at: p });
    return shard;
  }

  return { list, tick, spawnChests, spawnShard, get shard() { return shard; } };
}
