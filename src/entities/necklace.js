import * as THREE from 'three';
import { takeNecklace } from '../core/state.js';
import { textSprite } from './enemy.js';
import { sfx } from '../audio/sound.js';

// The golden necklace (GDD §6.4): on the very first run it lies glowing in
// the moss cave's entrance; taking it lights up the old letters carved in
// the wall, which say "동굴의 가장 깊은 곳에 닿는 자만이 빛을 볼 수 있으리."
// It is kept for good (core/state.js) and opens the Crystal Heart's crystal
// doors and the secret pockets' (world/expedition.js, world/secrets.js).
export const NECKLACE_LINE = '동굴의 가장 깊은 곳에 닿는 자만이 빛을 볼 수 있으리.';

const gold = new THREE.MeshStandardMaterial({ color: '#ffd24a', emissive: '#c48a10', emissiveIntensity: 1.1, metalness: 0.5, roughness: 0.3, flatShading: true });
const gem = new THREE.MeshStandardMaterial({ color: '#ffe9a0', emissive: '#ffb020', emissiveIntensity: 1.6, flatShading: true });

export function createNecklaceModel() {
  const g = new THREE.Group();
  g.name = 'necklace';
  // a loop of little gold beads, and a round pendant with a shining stone
  const bead = new THREE.IcosahedronGeometry(0.045, 0);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const b = new THREE.Mesh(bead, gold);
    b.position.set(Math.sin(a) * 0.3, Math.cos(a) * 0.36 + 0.12, 0);
    g.add(b);
  }
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 12).rotateX(Math.PI / 2), gold);
  disc.position.y = -0.3;
  g.add(disc);
  const stone = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), gem);
  stone.position.set(0, -0.3, 0.04);
  stone.scale.z = 0.5;
  g.add(stone);
  g.scale.setScalar(1.2);
  // a soft ring on the floor under it: "something to take"
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.65, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffe17a', transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
  ring.position.y = -0.62;
  ring.renderOrder = 4;
  g.add(ring);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// The necklace lying on the floor. Walking over it (or clicking it) takes
// it: a chime, the wall letters glow (`glyphs.light()`), the line is read.
export function dropNecklace(G, at, glyphs) {
  const model = createNecklaceModel();
  const glow = G.addLight({ pos: () => model.position, color: '#ffd66a', intensity: 8, distance: 7, flicker: 0.05 });
  const p = G.addPickup({
    model, pos: new THREE.Vector3(at.x, at.y ?? 0, at.z), float: 0.75, radius: 0.9, name: '황금 목걸이', kind: 'key',
    onCollect: () => {
      glow.on = false;
      G.discover?.('necklace'); // (the codex first: it also lists it as new on the result)
      takeNecklace(G.state);
      sfx.necklace?.();
      G.hud.necklace(true);
      G.hud.necklaceGlow();
      G.toast('🏅 황금 목걸이를 얻었어요!', 2600);
      G.emit('necklace', { at: model.position.clone() });
      glyphs?.light();
      // the letters light up, then the line is read out
      setTimeout(() => {
        G.say([
          { name: '벽에 새겨진 글자', text: `“${NECKLACE_LINE}”` },
          { name: '몰티즈', text: '멍! 가장 깊은 곳… 거기에 나가는 길이 있을까?' },
        ]);
      }, 900);
    },
  });
  return p;
}

// Old letters carved into the wall (world x, z on the wall line; `facing`:
// the room side, as a yaw). Dim stone until `light()`: then they glow gold,
// letter by letter. `lit`: already glowing (the necklace was found before).
export function createGlyphWall(G, { x, z, y = 0, facing = 0, lit = false }) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 192;
  const ctx = canvas.getContext('2d');
  // rune-like marks: circles, lines and arcs, the same each time
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 9; ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const cx = 36 + i * 55, cy = 96;
    ctx.beginPath();
    const kind = Math.floor(r() * 4);
    if (kind === 0) { ctx.arc(cx, cy, 18, 0, Math.PI * 2); ctx.moveTo(cx, cy - 34); ctx.lineTo(cx, cy + 34); }
    else if (kind === 1) { ctx.moveTo(cx - 18, cy + 30); ctx.lineTo(cx, cy - 32); ctx.lineTo(cx + 18, cy + 30); ctx.moveTo(cx - 10, cy + 6); ctx.lineTo(cx + 10, cy + 6); }
    else if (kind === 2) { ctx.arc(cx, cy - 8, 18, Math.PI, 0); ctx.moveTo(cx - 18, cy - 8); ctx.lineTo(cx - 18, cy + 30); ctx.moveTo(cx + 18, cy - 8); ctx.lineTo(cx + 18, cy + 30); }
    else { ctx.moveTo(cx - 18, cy - 28); ctx.lineTo(cx + 18, cy + 28); ctx.moveTo(cx + 18, cy - 28); ctx.lineTo(cx - 18, cy + 28); ctx.moveTo(cx - 22, cy); ctx.lineTo(cx + 22, cy); }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.25, color: '#9aa39a', depthWrite: false, fog: false });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 1.5), mat);
  plate.name = 'glyphs';
  plate.position.set(x, y + 0.82, z);
  plate.rotation.y = facing;
  plate.translateZ(0.06);
  plate.renderOrder = 3;
  plate.userData.noFade = true;
  G.scene.add(plate);
  const light = G.addLight({ pos: plate.position.clone().add(new THREE.Vector3(Math.sin(facing), 0.4, Math.cos(facing)).multiplyScalar(1.2)), color: '#ffd66a', intensity: 0, distance: 7 });
  const sparkle = textSprite('✨', 1.1);
  sparkle.position.copy(plate.position).setY(y + 2.0);
  G.scene.add(sparkle);
  const w = { plate, lit: false, t: -1 };
  const GOLD = new THREE.Color('#ffd66a'), STONE = new THREE.Color('#9aa39a');
  w.light = () => { if (w.lit) return; w.lit = true; w.t = 0; sfx.ting(); };
  if (lit) { w.lit = true; w.t = 9; }
  G.onUpdate((dt) => {
    if (!w.lit) return;
    w.t += dt;
    const k = Math.min(1, w.t / 1.2);
    mat.opacity = 0.25 + 0.7 * k;
    mat.color.copy(STONE).lerp(GOLD, k);
    light.intensity = (lit ? 2.5 : 6) * k * (0.85 + Math.sin(G.time * 3) * 0.15);
    sparkle.visible = w.t < 3;
    if (sparkle.visible) sparkle.material.opacity = Math.max(0, 1 - w.t / 3);
  });
  return w;
}
