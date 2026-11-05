// Helpers every scenario gets (evaluated in the page).
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const P = G.player;
const L = (it) => it && (typeof it.label === 'function' ? it.label() : it.label);
const pos = () => P.position.toArray().map((v) => +v.toFixed(1));
async function skip() { for (let i = 0; i < 40; i++) { if (G.hud.inDialog) { G.hud.advanceDialog(); await wait(100); } else if (G.mode === 'play') break; else await wait(200); } }
async function go(x, z, y) { P.teleport({ x, y: y ?? G.groundAt(x, z), z }); await wait(350); }
async function use() { G.interact(); await wait(400); await skip(); }
function face(x, z) { P.state.heading = Math.atan2(x - P.position.x, z - P.position.z); }
async function swing(x, z) { face(x, z); P.act('swing'); await wait(560); }
// 새 게임 (a fresh save plays the intro cutscene first: skipped here)
async function start() {
  document.getElementById('btn-new').click(); await wait(600);
  if (!document.getElementById('intro').classList.contains('hidden')) { document.getElementById('intro-skip').click(); for (let i = 0; i < 40 && G.intro?.playing; i++) await wait(100); await wait(300); }
  await skip();
}
const log = [];
const THREE = { Vector3: P.position.constructor };
