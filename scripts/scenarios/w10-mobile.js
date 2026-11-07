// W10 (tasks/20261107-mobile-todo.md): phone play after Scary Island's
// iPhone playtest, with the browser's own touches (touchInput: CDP, so a tap
// is a real tap with its click). Run with MOBILE=1 (390×844), MOBILE=landscape
// (844×390), MOBILE=ipad (1024×768) or MOBILE=landscape SIZE=844x340 (a short
// screen), GAME_URL='http://localhost:5192/?start=heart&seed=4'.
// The title and the cutscenes show no touch controls; the thumb buttons are
// on screen, big enough, clear of each other and of the HUD; the floating
// stick sits where the thumb came down and walks the hero; a tap walks there
// and a tap on an animal attacks it; a pinch zooms within the wheel's range;
// every button does its thing (the shield while held) and sweeps while it
// cools down; the panels fit; a toast lets a tap through; the words say taps
// and buttons, never keys or clicks.
const X = G.expedition, S = G.state;
const $ = (id) => document.getElementById(id);
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const until = async (test, ms = 8000, step = 30) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (test()) return true; await wait(step); } return false; };
const tag = `${innerWidth > innerHeight ? 'landscape' : 'portrait'}-${innerWidth}x${innerHeight}`;
const rect = (el) => (typeof el === 'string' ? $(el) : el).getBoundingClientRect();
const onScreen = (r) => r.width > 0 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
// (round things, the buttons and the stick: by their circles)
const round = (a, b) => Math.hypot(a.left + a.width / 2 - b.left - b.width / 2, a.top + a.height / 2 - b.top - b.height / 2) < (a.width + b.width) / 2 - 0.5;
const overlap = (a, b) => a.width > 0 && b.width > 0 && !(a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5);
const R = (r) => JSON.stringify([r.left, r.top, r.right, r.bottom].map(Math.round));
const shown = (el) => { const e = typeof el === 'string' ? $(el) : el; return !!e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && !e.closest('.hidden'); };
const btn = (key) => document.querySelector(`#touch [data-key="${key}"]`);
const centre = (el) => { const r = rect(el); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
// a finger: down, (moves), up
const down = (pts) => touchInput('touchStart', pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })));
const move = (pts) => touchInput('touchMove', pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })));
const up = () => touchInput('touchEnd', []);
async function tap(p, hold = 60) { await down([p]); await wait(hold); await up(); }
const KEYS = /클릭|마우스|휠|Space|Esc|Tab|Shift|Enter|\bQ\b|\b[1-4]번(?!째)|\([1-4]\)|\b[1-4](을|를)/;
const flat = () => ({ x: P.position.x, z: P.position.z });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
G.hurtPlayer = () => false;

// ---- the title: no touch controls over it
check('a touch screen (coarse pointer): body.touch', G.touch === true && document.body.classList.contains('touch'), innerWidth, innerHeight);
await wait(800);
check('the title shows no touch controls', !shown('touch'));
await shot(`w10-${tag}-title`);
await start(); await wait(1200); await skip();
X.jump('camp'); await wait(1500); await skip();
G.run.herbs = Math.max(G.run.herbs, 2); G.refresh();

// ---- the thumb buttons: on screen, thumb-sized, clear of each other and of the HUD
const keys = ['Hammer', 'Tool', 'Digit2', 'Digit3', 'Digit4', 'KeyQ', 'Digit1', 'Space', 'Tab', 'Escape'];
const btns = keys.map(btn);
check('the touch controls show in play', shown('touch') && btns.every(Boolean), keys.filter((k, i) => !btns[i]).join(','));
const sizes = btns.map((b) => Math.round(rect(b).width));
const minPx = innerHeight <= 310 ? 36 : 40; // (a very short screen shrinks the arc toward the corner)
check(`…every button on screen and at least ${minPx} px (the hammer biggest)`, btns.every((b) => onScreen(rect(b)) && rect(b).width >= minPx && rect(b).height >= minPx) && sizes[0] === Math.max(...sizes), sizes.join(','));
const clash = [];
for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) if (round(rect(btns[i]), rect(btns[j]))) clash.push(`${keys[i]}×${keys[j]}`);
check('…no two buttons overlap', !clash.length, clash.join(' '));
G.hud.necklace(true);
const hudParts = { bar: rect('bar-row'), mini: rect('minimap'), area: rect('area-name'), badge: rect('necklace-badge'), stick: rect('stick') };
check('the HUD on screen: the bar, the minimap, the area name, the necklace, the resting stick', Object.values(hudParts).every(onScreen), Object.entries(hudParts).map(([k, r]) => `${k}${R(r)}`).join(' '));
const hudClash = [];
for (const [k, r] of Object.entries(hudParts)) btns.forEach((b, i) => { if (k === 'stick' ? round(r, rect(b)) : overlap(r, rect(b))) hudClash.push(`${k}×${keys[i]}`); });
const hk = Object.keys(hudParts);
for (let i = 0; i < hk.length; i++) for (let j = i + 1; j < hk.length; j++) if (overlap(hudParts[hk[i]], hudParts[hk[j]])) hudClash.push(`${hk[i]}×${hk[j]}`);
check('…clear of the buttons and of each other', !hudClash.length, hudClash.join(' '));
check('the bar shows no key letters (no Q, no hotbar) and lets taps through', !shown('tool-others') && !shown('slots') && getComputedStyle($('bar')).pointerEvents === 'none');
check('the herb button is one slot with a count; 🔄 dim with nothing to switch to', btn('Digit4').dataset.count === String(G.run.herbs) && btn('KeyQ').classList.contains('dim') === !(G.run.owned ?? []).some((k) => ['vine', 'mask'].includes(k)), btn('KeyQ').className, btn('Digit4').dataset.count);
await shot(`w10-${tag}-camp`);

// ---- the same scale both ways up: metres per pixel on screen (logged; compare runs)
const px = (() => {
  const a = P.position.clone(), b = a.clone(); b.x += 1;
  const s = (v) => { const p = v.clone().project(G.camera); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; };
  const pa = s(a), pb = s(b); return Math.hypot(pa.x - pb.x, pa.y - pb.y);
})();
check('the lens: a phone closer than a desktop, a tablet like a desktop', Math.min(innerWidth, innerHeight) < 500 ? G.cam.rig.distance < 25 : G.cam.rig.distance === 30, G.cam.rig.distance, `${px.toFixed(1)} px per metre`);

// ---- a tap on the world walks there
const p0 = flat();
await tap({ x: innerWidth * 0.5, y: innerHeight * 0.36 });
await wait(1800);
check('a tap on the ground walks there (a real tap: its click)', dist(flat(), p0) > 1, dist(flat(), p0).toFixed(1), pos());
await until(() => !G.pointer.order, 3000);

// ---- the floating stick: it sits where the thumb came down, the knob stops at its rim
const sp = { x: innerWidth * 0.22, y: innerHeight * 0.62 };
const p1 = flat();
await down([sp]); await wait(50);
for (let k = 1; k <= 6; k++) { await move([{ x: sp.x + k * 2, y: sp.y - k * 12 }]); await wait(30); }
await wait(200);
const base1 = centre($('stick'));
check('the stick appears under the thumb', $('stick').classList.contains('held') && Math.hypot(base1.x - sp.x, base1.y - sp.y) < 2, R(rect('stick')));
await move([{ x: sp.x + 20, y: sp.y - 180 }]); await wait(800);
const base2 = centre($('stick')), kn = centre($('knob'));
check('…it stays there when the thumb goes far, the knob stops at the rim', Math.hypot(base2.x - sp.x, base2.y - sp.y) < 2 && Math.abs(Math.hypot(kn.x - sp.x, kn.y - sp.y) - 50) < 2, Math.round(Math.hypot(kn.x - sp.x, kn.y - sp.y)));
await shot(`w10-${tag}-stick`);
await wait(500);
await up(); await wait(300);
const moved = dist(flat(), p1);
check('…it walks the hero over the ground, and a drag leaves no walk order', moved > 2 && Math.abs(P.position.y - G.groundAt(P.position.x, P.position.z, P.position.y)) < 0.6 && !G.pointer.order && !$('stick').classList.contains('held'), moved.toFixed(1), pos());

// ---- pinch: two fingers zoom, within the wheel's range, and never walk
const d0 = G.cam.rig.distance, c = { x: innerWidth * 0.5, y: innerHeight * 0.45 }, p2 = flat();
async function pinch(from, to) {
  await down([{ x: c.x - from, y: c.y }, { x: c.x + from, y: c.y }]);
  for (let k = 1; k <= 8; k++) { const s = from + (to - from) * k / 8; await move([{ x: c.x - s, y: c.y }, { x: c.x + s, y: c.y }]); await wait(25); }
  await up(); await wait(250);
}
await pinch(100, 80);
const dOut = G.cam.rig.distance;
await pinch(150, 30); await pinch(150, 30);
const dMax = G.cam.rig.distance;
await pinch(60, 75);
const dIn = G.cam.rig.distance;
await pinch(30, 160); await pinch(30, 160); await pinch(30, 160);
const dMin = G.cam.rig.distance;
check('fingers together send the lens back, apart bring it closer, within 18–45 m', dOut > d0 && dMax === 45 && dIn < dMax && dMin === 18, [d0, dOut, dMax, dIn, dMin].map((v) => v.toFixed(1)).join(' → '));
check('…and the pinching fingers never walked the hero', dist(flat(), p2) < 0.3 && !G.pointer.order, dist(flat(), p2).toFixed(2));
G.cam.rig.distance = d0;

// ---- every button does its thing
await wait(400);
const press = async (key, hold = 80) => { await tap(centre(btn(key)), hold); };
const sweep = (key) => Number(btn(key).querySelector('.cd')?.dataset.p ?? 0);
await press('Hammer'); await wait(60);
check('🔨 swings, and its sweep runs', P.state.action?.name === 'swing' && sweep('Hammer') > 0, P.state.action?.name, sweep('Hammer'));
await wait(1100);
const water0 = G.run.water;
G.run.tool = 'waterGun'; G.refresh();
await press('Tool'); await wait(60);
check('💧 shoots the tool, and its sweep runs', G.run.water < water0 && sweep('Tool') > 0, water0.toFixed(2), G.run.water.toFixed(2), sweep('Tool'));
await wait(900);
const tool0 = G.run.tool;
await press('KeyQ'); await wait(200);
check('🔄 switches the tool (the 💧 button shows it)', G.run.tool !== tool0 && btn('Tool').querySelector('.ico').textContent !== '💧', tool0, G.run.tool);
G.run.tool = 'waterGun'; G.refresh();
await wait(300);
await press('Digit2'); await wait(60);
check('🌀 rolls, and its sweep runs', P.state.action?.name === 'roll' && sweep('Digit2') > 0, P.state.action?.name, sweep('Digit2'));
await wait(900);
await down([centre(btn('Digit3'))]); await wait(400);
const raised = G.shield.up && btn('Digit3').classList.contains('up');
await up(); await wait(250);
check('🛡️ held raises the shield (the button lights), let go lowers it', raised && !G.shield.up && !btn('Digit3').classList.contains('up'));
G.run.hearts = Math.max(1, G.run.maxHearts - 2); G.refresh();
const herbs0 = G.run.herbs;
await press('Digit4'); await wait(80);
check('🌱 eats a herb (one slot with a count), its sweep runs', P.state.action?.name === 'eat' && sweep('Digit4') > 0, sweep('Digit4'));
await until(() => G.run.herbs === herbs0 - 1, 3000);
check('…the count goes down', btn('Digit4').dataset.count === String(herbs0 - 1), btn('Digit4').dataset.count);
await wait(600);
await press('Digit1'); await wait(80);
check('👃 sniffs, and its sweep runs', P.state.action?.name === 'sniff' && sweep('Digit1') > 0, sweep('Digit1'));
await wait(2200);
check('✋ is dim with nothing near to use', btn('Space').classList.contains('dim') || !!G.nearInteractable);
const it = G.interactables.find((i) => i.enabled() && /상인|박쥐/.test(L(i) ?? '')) ?? G.interactables.find((i) => i.enabled() && /도감|제단/.test(L(i) ?? ''));
if (it) {
  const ip = typeof it.pos === 'function' ? it.pos() : it.pos;
  await go(ip.x + 1, ip.z + 0.5); await wait(400);
  check('…and lit next to something to use; ✋ uses it', !btn('Space').classList.contains('dim') && $('prompt').textContent.startsWith('✋'), L(it), $('prompt').textContent);
  await press('Space'); await wait(700);
  check('…(it did)', G.mode !== 'play' || G.shop?.isOpen || G.codex?.isOpen || G.altar?.isOpen || G.hud.inDialog, G.mode);
  if (G.shop?.isOpen) G.shop.close(); if (G.codex?.isOpen) G.codex.close(); if (G.altar?.isOpen) G.altar.close();
  await skip();
}
await press('Tab'); await wait(400);
check('🗺️ opens the map, its hint names the button', G.map.open && !KEYS.test(document.querySelector('#map .hint').textContent), document.querySelector('#map .hint').textContent);
await shot(`w10-${tag}-map`);
await press('Tab'); await wait(300);
check('…and closes it', !G.map.open);

// ---- a fight: tap an animal to attack it; the sweeps on screen
X.jump('camp'); await wait(800);
const fp = flat();
G.spawnEnemy({ kind: 'wolf', x: fp.x + 3.5, z: fp.z - 1.5 });
await wait(900);
const wolf = G.enemies.filter((e) => e.kind === 'wolf' || e.def?.kind === 'wolf').sort((a, b) => dist(a.pos, fp) - dist(b.pos, fp))[0];
if (wolf) {
  const s = wolf.pos.clone(); s.y += 0.5; s.project(G.camera);
  await tap({ x: (s.x + 1) / 2 * innerWidth, y: (1 - s.y) / 2 * innerHeight });
  await wait(120);
  check('a tap on an animal goes for it with the hammer (a left click)', G.pointer.order?.type === 'attack' || P.state.action?.name === 'swing', G.pointer.order?.type, P.state.action?.name);
  await wait(500);
  await press('Digit2'); await wait(40); await press('Tool'); await wait(80);
  await shot(`w10-${tag}-combat`);
  check('…the buttons sweep while they cool down (roll, tool)', sweep('Digit2') > 0 || sweep('Tool') > 0, sweep('Digit2'), sweep('Tool'));
  wolf.hp = 0; wolf.gone = true; wolf.model && (wolf.model.visible = false);
}
await wait(1500);

// ---- a toast and a card let taps through to the world; their words say taps
G.toast('🐾 이 바위 벽에서 신기한 냄새가 나요… [[1번(냄새 맡기)을|👃 냄새 버튼을]] 눌러 볼까요?', 6000);
G.hud.card('<h2>🍄 반딧불 골짜기</h2><p>2번째 지역 · 버섯 숲</p>', 6000);
await wait(500);
check('a toast says the button, not the key', /👃 냄새 버튼/.test($('toast').textContent) && !KEYS.test($('toast').textContent), $('toast').textContent);
const tr = rect('toast'), cr = rect('card');
const card = $('card').querySelector('h2').getBoundingClientRect();
check('the place card fits (smaller type on a phone)', onScreen(cr) && card.height < innerHeight * 0.16, R(cr), Math.round(card.height));
await shot(`w10-${tag}-toast-card`);
// (reached: the pointer planned a walk from it, or said it can't go there)
const reached = (t0, r0) => (G.pointer.lastGoal?.at ?? 0) > t0 || G.pointer.refused > r0;
const p3 = flat(), refused0 = G.pointer.refused, t3 = performance.now();
await tap({ x: tr.left + tr.width * 0.5, y: tr.top + tr.height / 2 });
await wait(900);
check('a tap on the toast reaches the world (walks, or says it can\'t go)', reached(t3, refused0), dist(flat(), p3).toFixed(1));
await until(() => !G.pointer.order, 4000);
const p4 = flat(), refused1 = G.pointer.refused, t4 = performance.now();
// (a point of the card over the world, not over a button such as the ✋ prompt)
const spot = [0.5, 0.3, 0.7, 0.15, 0.85].flatMap((fx) => [0.5, 0.25, 0.75].map((fy) => ({ x: cr.left + cr.width * fx, y: cr.top + cr.height * fy }))).find((p) => document.elementFromPoint(p.x, p.y) === G.renderer.domElement);
await tap(spot ?? { x: cr.left + cr.width * 0.3, y: cr.top + cr.height * 0.5 });
await wait(900);
check('…and a tap on the place card too', reached(t4, refused1), dist(flat(), p4).toFixed(1), !!spot);

// ---- the words: taps and buttons, never keys
G.toast('방패를 얻었어요! [[3을|🛡️ 방패 버튼을]] 누르고 있으면 앞을 막아요'); await wait(100); // (data/items.js shield.got)
const words = [
  ['the talk\'s "next"', $('dialog-next').textContent],
  ['the cutscene hint', document.querySelector('#intro .hint').textContent],
  ['the shield toast', $('toast').textContent],
  ['the close buttons', ['shop-close', 'codex-close', 'altar-close'].map((id) => $(id).textContent).join(' ')],
];
G.screens.openMenu(); await wait(300);
words.push(['the menu\'s controls', $('menu-controls').textContent]);
G.screens.closeMenu(); await wait(200);
const bad = words.filter(([, t]) => KEYS.test(t));
check('the words on a touch screen name taps and buttons, never keys or clicks', !bad.length, bad.map(([k, t]) => `${k}: ${t}`).join(' | '));

// ---- the panels fit the screen, scroll inside, and work by taps
async function panel(name, open, id, closeId, pick, okTest) {
  open(); await wait(500);
  const el = $(id), r = rect(el);
  const fits = onScreen(r) && el.scrollWidth <= el.clientWidth + 1;
  const scrolls = el.scrollHeight <= el.clientHeight + 1 || getComputedStyle(el).overflowY === 'auto';
  check(`${name}: fits the screen (scrolls inside if it must)`, fits && scrolls, R(r), `${el.scrollHeight}/${el.clientHeight}`);
  const words = el.textContent;
  check(`${name}: no key names in it`, !KEYS.test(words), (words.match(KEYS) ?? [])[0]);
  const b = document.querySelector(pick);
  if (b) { b.scrollIntoView({ block: 'center' }); await wait(150); await tap(centre(b)); await wait(400); }
  if (okTest) check(`${name}: a tap works`, okTest());
  await shot(`w10-${tag}-${name}`);
  const cl = $(closeId);
  cl.scrollIntoView({ block: 'nearest' }); await wait(100);
  const cOn = onScreen(rect(cl));
  await tap(centre(cl)); await wait(400);
  check(`${name}: its close button is on screen and a tap closes it`, cOn && el.classList.contains('hidden'));
}
G.run.shards = 30; const h0 = G.run.herbs;
await panel('shop', () => G.shop.open(), 'shop', 'shop-close', '#shop-goods [data-id="herb"]', () => G.run.herbs > h0 || G.run.shards < 30 || /가득|더는/.test($('shop-say').textContent));
S.stars = Math.max(S.stars, 3);
await panel('altar', () => G.altar.open(), 'altar', 'altar-close', '#altar-goods [data-id="herbPouch"]', () => !!S.unlocks.herbPouch);
await panel('codex', () => G.codex.open(), 'codex', 'codex-close', '#codex-grid [data-id="wolf"]', () => /늑대|wolf/i.test($('codex-detail').textContent) || $('codex-detail').textContent.length > 10);
S.seen = { ...S.seen, herb: true }; G.codex.open(); G.codex.show('items', 'herb'); await wait(300);
check('the codex\'s herb page names the 🌱 button', /🌱 약초 버튼/.test($('codex-detail').textContent) && !KEYS.test($('codex-detail').textContent), $('codex-detail').textContent.slice(0, 80));
G.codex.close(); await wait(200);

// ---- the menu: it fits, its sliders reachable
await press('Escape'); await wait(400);
const menuEl = $('menu');
check('☰ opens the menu; it fits (scrolls inside if it must), the sliders on screen', G.screens.menuOpen && menuEl.scrollWidth <= menuEl.clientWidth + 1 && (menuEl.scrollTop = 0, true), R(rect('vol-music')));
$('vol-music').scrollIntoView({ block: 'center' }); await wait(100);
check('…the volume sliders can be reached', onScreen(rect('vol-music')) && onScreen(rect('vol-sfx')));
menuEl.scrollTop = 0; await wait(100);
await shot(`w10-${tag}-menu`);
G.screens.closeMenu(); await wait(300);

// ---- a boss fight: the plate clear of the top pieces and the buttons
X.jump('heart'); await wait(400);
await until(() => G.mode === 'play' && X.king?.started, 12000);
await wait(1500);
const plate = rect('boss-plate');
const tops = { area: rect('area-name'), bar: rect('bar-row'), mini: rect('minimap'), badge: rect('necklace-badge'), map: rect(btn('Tab')), menu: rect(btn('Escape')) };
const pc = Object.entries(tops).filter(([, r]) => overlap(plate, r)).map(([k]) => k);
check('the Crystal King\'s plate on screen, clear of the name, the bar, the minimap, the necklace, 🗺️ ☰', shown('boss-plate') && onScreen(plate) && !pc.length, R(plate), pc.join(','));
G.toast('👑 크리스탈 킹이 나타났어요!', 4000); await wait(300);
const tb = rect('toast');
check('…a toast under it, not over it', !overlap(tb, plate) && onScreen(tb), R(tb));
G.hud.card('<h2>💜 심장의 단</h2><p>4번째 지역 · 수정의 심장</p>', 4000); await wait(700);
const cd = $('card').getBoundingClientRect();
const heroAt = (() => { const p = P.position.clone(); p.y += 0.4; p.project(G.camera); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; })();
check('…a place card clear of the plate, the toast and the hero', !overlap(cd, plate) && !overlap(cd, rect('toast')) && !(heroAt.y > cd.top && heroAt.y < cd.bottom && heroAt.x > cd.left && heroAt.x < cd.right) && onScreen(cd), R(cd), Math.round(heroAt.y));
await shot(`w10-${tag}-boss`);
return log;
