// M1: the Maltese in the character gallery, from a few sides and mid-action.
// Run with GAME_URL=http://localhost:5191/gallery.html
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const { entries, show } = window.gallery;
const e = entries.find((x) => x.name === '몰티즈');
log.push(['entry', !!e]);
show(e);
const buttons = () => [...document.querySelectorAll('#bar button')];
const press = async (label, ms) => { buttons().find((b) => b.textContent === label)?.click(); await wait(ms); };
const cam = window.gallery.camera, target = window.gallery.controls.target;
const view = (x, y, z) => { cam.position.set(x, y, z); target.set(0, 0.6, 0); };
await wait(800);
view(0.4, 0.9, 2.6); await wait(300); await shot('gallery-front');
view(2.6, 1.0, 0.3); await wait(300); await shot('gallery-side');
view(-1.4, 1.1, -2.2); await wait(300); await shot('gallery-back');
view(1.6, 1.2, 2.2);
await press('물총', 200); await shot('gallery-shoot');
await press('망치', 160); await shot('gallery-swing');
await press('구르기', 180); await shot('gallery-roll');
await press('쓰러짐', 900); await shot('gallery-faint');
await wait(1500);
await press('승리', 300); await shot('gallery-victory');
await wait(1500);
await press('냄새', 400); await shot('gallery-sniff');
await wait(1000);
// M3: the vine throw, the shield (held: a toggle here), eating a herb
const { pose } = window.gallery;
pose('throw', 0.12); await wait(150); await shot('gallery-throw-back');
pose('throw', 0.3); await wait(150); await shot('gallery-throw');
pose(null);
await press('방패', 400); await shot('gallery-shield');
view(0.4, 0.9, 2.6); await wait(200); await shot('gallery-shield-front');
await press('방패', 300);
view(1.6, 1.2, 2.2);
pose('eat', 0.45); await wait(150); await shot('gallery-eat');
pose(null);
return log;
