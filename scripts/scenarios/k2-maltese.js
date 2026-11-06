// K2 (tasks/20261106-maltese-look-todo.md): the hero's look, same shots
// before and after a model change (a look check, not a gate). Shots are
// named `<tag><n>-<what>`; pass the prefix with `&tag=before-`.
//   gallery GAME_URL='http://localhost:5191/gallery.html?tag=before-'
//           front, side, back, 3/4, a close face, and walk, run, roll,
//           swing, shoot, faint, victory, shield, eat held still
//   world   GAME_URL='http://localhost:5191/?seed=4&k2=world&tag=before-'
//           camp and valley at the default 30 m and the close 18 m zoom,
//           running, cosmetics on (hat + scarf + boots, then the crown),
//           the codex thumbnail
//   intro   GAME_URL='http://localhost:5191/?seed=4&k2=intro&tag=before-'
//           the intro's scene 1 and scene 6 (the tools, the cheer)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q2 = new URLSearchParams(location.search);
const tag = q2.get('tag') ?? '';
const snap = (name) => shot(`${tag}${name}`);
const out = [];

if (window.gallery) {
  const { entries, show, camera: cam, controls, pose } = window.gallery;
  show(entries.find((x) => x.name === '몰티즈'));
  const press = async (label, ms) => { [...document.querySelectorAll('#bar button')].find((b) => b.textContent === label)?.click(); await sleep(ms); };
  const view = (x, y, z, ty = 0.6) => { cam.position.set(x, y, z); controls.target.set(0, ty, 0); };
  await sleep(800);
  view(0, 0.9, 2.7); await sleep(300); await snap('g1-front');
  view(2.7, 0.9, 0); await sleep(300); await snap('g2-side');
  view(0, 1.0, -2.7); await sleep(300); await snap('g3-back');
  view(1.9, 1.3, 1.9); await sleep(300); await snap('g4-three-quarter');
  view(0, 1.35, 1.45, 0.85); await sleep(300); await snap('g5-face');
  // the game camera's angle (40° down), from far enough to look small
  view(0, 2.2, 2.6); await sleep(300); await snap('g6-game-angle');
  view(1.9, 1.3, 1.9);
  await press('걷기', 700); await snap('g7-walk');
  await press('달리기', 700); await snap('g8-run');
  view(2.7, 1.0, 0); await sleep(200); await snap('g8b-run-side');
  await press('서기', 300);
  view(1.9, 1.3, 1.9);
  for (const [name, t, file] of [['roll', 0.18, 'g9-roll'], ['swing', 0.12, 'g10-swing-up'], ['swing', 0.3, 'g11-swing'], ['shoot', 0.3, 'g12-shoot'], ['faint', 1.1, 'g13-faint'], ['victory', 0.5, 'g14-victory'], ['eat', 0.45, 'g15-eat'], ['sniff', 0.5, 'g16-sniff'], ['hurt', 0.2, 'g17-hurt']]) {
    pose(name, t); await sleep(200); await snap(file);
  }
  pose(null);
  await press('방패', 400); await snap('g18-shield'); await press('방패', 300);
  // the star altar's cosmetics on the gallery hero
  const { applyWear } = await import('/src/entities/cosmetics.js');
  const dog = entries.find((x) => x.name === '몰티즈').object;
  applyWear(dog, { head: 'hat', neck: 'scarf', feet: 'boots' });
  view(1.9, 1.3, 1.9); await sleep(300); await snap('g19-hat-scarf-boots');
  applyWear(dog, { head: 'crown', neck: 'scarf', feet: 'boots' });
  view(0, 1.0, 2.7); await sleep(300); await snap('g20-crown-front');
  view(2.7, 0.9, 0); await sleep(300); await snap('g21-crown-side');
  applyWear(dog, {});
  return out;
}

const X = G.expedition;
const mode = q2.get('k2') ?? 'world';
const FACE_CAM = Math.PI / 4;
const until = async (test, ms = 8000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (test()) return true; await sleep(40); } return false; };

if (mode === 'intro') {
  document.getElementById('btn-new').click();
  await until(() => G.intro?.ready, 20000);
  G.intro.seek(4.6); G.intro.hold = true; await sleep(1200);
  await snap('i1-intro-scene1');
  G.intro.seek(36.4); await sleep(900);
  await snap('i2-intro-scene6-tools');
  G.intro.seek(39.0); await sleep(900);
  await snap('i3-intro-scene6-cheer');
  G.intro.skip();
  return out;
}

G.hurtPlayer = () => false;
await start(); await sleep(2500);
for (const r of X.spots.values()) X.sleepSpot(r.spot.id);
const D = G.world.def;
async function at(u, v, dist) {
  X.jump(D.M(u, v)); P.state.heading = FACE_CAM; G.cam.rig.distance = dist;
  await sleep(300); await skip(); G.hud.toast('', 1); P.state.heading = FACE_CAM;
  await sleep(2200); await skip(); await sleep(400); // (the bat merchant's hello at the camp)
}
await at(-10, 0, 30); await snap('w1-camp-30m');
G.cam.rig.distance = 18; await sleep(1500); await snap('w2-camp-18m');
P.act('swing'); await sleep(150); await snap('w3-camp-18m-swing'); await sleep(800);
await at(-20, 262, 30); await snap('w4-valley-30m');
G.cam.rig.distance = 18; await sleep(1500); await snap('w5-valley-18m');
// cosmetics on (the star altar's): hat + scarf + boots, then the crown
const { applyWear } = await import('/src/entities/cosmetics.js');
await at(-10, 0, 18);
applyWear(P.model, { head: 'hat', neck: 'scarf', feet: 'boots' }); await sleep(500); await snap('w6-camp-hat-scarf-boots');
applyWear(P.model, { head: 'crown', neck: 'scarf', feet: 'boots' }); await sleep(500); await snap('w7-camp-crown');
applyWear(P.model, {});
// the codex picture, big on a plain card
const { thumbOf } = await import('/src/ui/thumbs.js');
const url = thumbOf('maltese');
const card = document.createElement('div');
card.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#3b2f4a;display:flex;align-items:center;justify-content:center';
card.innerHTML = `<img src="${url}" style="width:256px;height:256px;image-rendering:auto;background:#f3e9d2;border-radius:12px">`;
document.body.appendChild(card); await sleep(300); await snap('w8-codex-thumb'); card.remove();
// triangles of the hero alone (the model, no outlines / silhouettes)
let tris = 0, all = 0;
P.model.traverse((o) => {
  if (!o.isMesh) return;
  const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3;
  all += n; if (!o.userData.isOutline && !o.userData.isSilhouette) tris += n;
});
out.push(['HERO TRIS', tris, 'with outlines+silhouettes', all]);
return out;
