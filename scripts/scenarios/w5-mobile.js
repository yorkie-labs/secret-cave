// W5 (tasks/20261102-world-redesign-todo.md): the big world on a phone (GDD
// §4.2). Run with MOBILE=1 (upright) and MOBILE=landscape, GAME_URL=
// 'http://localhost:5192/?start=heart&seed=4'. The touch controls show; a
// button for every action (hammer, tool, Q, roll, shield, herb, sniff, use,
// the map, the menu), all on screen and big enough for a thumb; the HUD's
// pieces on screen and clear of each other; the joystick walks the hero
// over the terrain; the 🗺️ button opens and closes the map; the shop, the
// codex book and the star altar fit the screen and work by taps; the boss
// plate, the necklace badge and the minimap stay clear of each other.
const X = G.expedition, D = G.world.def, S = G.state;
const $ = (id) => document.getElementById(id);
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const until = async (test, ms = 8000, step = 30) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (test()) return true; await wait(step); } return false; };
const tag = innerWidth > innerHeight ? 'landscape' : 'portrait';
const rect = (el) => (typeof el === 'string' ? $(el) : el).getBoundingClientRect();
const onScreen = (r) => r.width > 0 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
const overlap = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
const R = (r) => JSON.stringify([r.left, r.top, r.right, r.bottom].map(Math.round));
const touch = (el, type, x, y) => {
  const t = new Touch({ identifier: 7, target: el, clientX: x, clientY: y });
  el.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
};
const tapKey = (key) => { const b = document.querySelector(`#touch [data-key="${key}"]`); touch(b, 'touchstart', 1, 1); touch(b, 'touchend', 1, 1); };
G.hurtPlayer = () => false;
check('a touch screen', G.touch === true && document.body.classList.contains('touch'), innerWidth, innerHeight);
await start(); await wait(1500); await skip();
X.jump('camp'); await wait(1500); await skip();
check('the touch controls show in play', getComputedStyle($('touch')).display !== 'none');
// every action has a button, on screen, big enough
const keys = ['Hammer', 'Tool', 'KeyQ', 'Digit2', 'Digit3', 'Digit4', 'Digit1', 'Space', 'Tab', 'Escape'];
const btns = keys.map((k) => document.querySelector(`#touch [data-key="${k}"]`));
check('a button for every action (hammer, tool, Q, roll, shield, herb, sniff, use, map, menu)', btns.every(Boolean), keys.filter((k, i) => !btns[i]).join(','));
check('…all on screen, at least 44 px', btns.every((b) => b && onScreen(rect(b)) && rect(b).width >= 44 && rect(b).height >= 44), btns.map((b) => b && Math.round(rect(b).width)).join(','));
const hud = { bar: rect('bar-row'), mini: rect('minimap'), area: rect('area-name'), badge: rect('necklace-badge'), stick: rect('stick'), btns: (() => { const rs = [...document.querySelectorAll('#touch-buttons button')].map(rect); return { left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)), right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)), width: 1 }; })() };
check('the HUD on screen: the bar, the minimap, the area name, the badge, the stick', ['bar', 'mini', 'area', 'badge', 'stick'].every((k) => onScreen(hud[k])), Object.entries(hud).map(([k, r]) => `${k}${R(r)}`).join(' '));
const pairs = [['bar', 'btns'], ['mini', 'btns'], ['mini', 'badge'], ['area', 'mini']]; // (the stick floats now: w10-mobile checks it against the round buttons)
check('…clear of each other (the bar, the stick, the buttons, the minimap)', pairs.every(([a, b]) => !overlap(hud[a], hud[b])), pairs.filter(([a, b]) => overlap(hud[a], hud[b])).map((p) => p.join('×')).join(','));
await shot(`w5-mobile-${tag}-camp`);
// the joystick walks the hero over the terrain (W10: it floats, so the thumb
// lands on the world where the resting stick shows)
const st = G.renderer.domElement, sr = rect('stick');
const p0 = P.position.clone();
touch(st, 'touchstart', sr.left + sr.width / 2, sr.top + sr.height / 2);
touch(st, 'touchmove', sr.left + sr.width / 2 + 10, sr.top + sr.height / 2 - 50);
await wait(1400);
touch(st, 'touchend', sr.left + sr.width / 2, sr.top + sr.height / 2);
const moved = Math.hypot(P.position.x - p0.x, P.position.z - p0.z);
check('the joystick walks the hero (on the ground)', moved > 2 && Math.abs(P.position.y - G.groundAt(P.position.x, P.position.z, P.position.y)) < 0.6, moved.toFixed(1), pos());
// the map button
tapKey('Tab'); await wait(400);
check('🗺️ opens the map', G.map.open && !$('map').classList.contains('hidden'));
await shot(`w5-mobile-${tag}-map`);
tapKey('Tab'); await wait(300);
check('…and closes it', !G.map.open);
// the tool cycle, the herb and the shield by touch
const tool0 = G.run.tool;
tapKey('KeyQ'); await wait(200);
check('🔄 cycles the tool', G.run.tool !== tool0, tool0, G.run.tool);
G.run.hearts = 3; G.hud.update(G.run);
const herbs0 = G.run.herbs;
tapKey('Digit4'); await wait(1400);
check('🌱 eats a herb', G.run.herbs === herbs0 - 1 && G.run.hearts === 5, G.run.herbs, G.run.hearts);
const sb = document.querySelector('#touch [data-key="Digit3"]');
touch(sb, 'touchstart', 1, 1); await wait(300);
const up = G.shield.up;
touch(sb, 'touchend', 1, 1); await wait(200);
check('🛡️ held raises the shield, let go lowers it', up && !G.shield.up);
// the panels by touch
async function panel(name, open, el, closeId, tapSel) {
  open(); await wait(500);
  const r = rect(el);
  check(`${name}: fits the screen`, onScreen(r), R(r), innerWidth, innerHeight);
  const b = document.querySelector(tapSel);
  if (b) { b.click(); await wait(300); }
  await shot(`w5-mobile-${tag}-${name}`);
  const c = $(closeId);
  check(`${name}: its close button is on screen and works`, onScreen(rect(c)) && (c.click(), await wait(300), $(el).classList.contains('hidden')));
}
G.run.shards = 20;
await panel('shop', () => G.shop.open(), 'shop', 'shop-close', '#shop-goods [data-id="herb"]');
check('…a tap bought a herb', G.run.herbs >= 1);
S.stars = Math.max(S.stars, 2);
await panel('altar', () => G.altar.open(), 'altar', 'altar-close', '#altar-goods [data-id="herbPouch"]');
check('…a tap opened the herb pouch', !!S.unlocks.herbPouch);
await panel('codex', () => G.codex.open(), 'codex', 'codex-close', '#codex-grid [data-id="wolf"]');
// the boss plate, the badge and the minimap during a fight
X.jump('heart'); await wait(400);
await until(() => G.mode === 'play' && X.king?.started, 10000);
await wait(1200);
const plate = rect('boss-plate'), badge = rect('necklace-badge'), mini = rect('minimap'), area = rect('area-name');
check('the Crystal King\'s plate on screen, clear of the area name, the badge and the minimap', !$('boss-plate').classList.contains('hidden') && onScreen(plate) && !overlap(plate, area) && !overlap(plate, badge) && !overlap(plate, mini), R(plate), R(badge), R(mini));
await shot(`w5-mobile-${tag}-boss`);
// the menu: the volume sliders reachable
tapKey('Escape'); await wait(400);
check('☰ opens the menu, its volume sliders on screen', G.screens.menuOpen && onScreen(rect('vol-music')) && onScreen(rect('vol-sfx')), R(rect('vol-music')));
await shot(`w5-mobile-${tag}-menu`);
G.screens.closeMenu();
return log;
