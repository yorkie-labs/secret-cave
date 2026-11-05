// @bot
// W5 (tasks/20261102-world-redesign-todo.md): the star altar at the camp
// (GDD §8.3). GAME_URL='http://localhost:5191/?start=heart&seed=4' (three
// bosses asleep: three stars). Walk to the altar and click it → the panel →
// a heart (+1, filled at once, the HUD's 6/6) → the explorer's hat (on the
// Maltese) → no stars left: a kind no → more stars (as if earned) → the herb
// pouch, the big tank, the rabbit mask, the crown, the scarf, the boots →
// a cosmetic off and on again → out of the camp and back: a new expedition
// sets out with the pouch's herb, the hearts, the big tank (12 shots), the
// rabbit mask lasts 7 s. Screenshots: the altar, the Maltese dressed up.
const X = G.expedition, D = G.world.def, S = G.state;
const $ = (id) => document.getElementById(id);
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const until = async (test, ms = 8000, step = 40) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (test()) return true; await wait(step); } return false; };
const tap = (id) => document.querySelector(`#altar-goods [data-id="${id}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
G.hurtPlayer = () => false;
await start(); await wait(1500); await skip();
X.jump('camp'); await wait(1200); await skip();
check('three bosses asleep and half the codex seen: four stars', S.stars === 4 && S.milestones.half, S.stars, JSON.stringify(S.milestones));
S.stars = 3; // (from here on: as if the codex star were not there yet)
const altarIt = G.interactables.find((it) => it.kind === 'altar');
check('the altar says how many stars', /별 3개/.test(altarIt.label()), altarIt.label());
await travel(altarIt.pos.clone(), { near: 2.2, ms: 40000 });
for (let k = 0; k < 8 && !G.altar.isOpen; k++) { await clickAt(altarIt.pos.clone().setY(altarIt.pos.y + 1.2)); await wait(700); }
check('a click on the altar opens its panel (the world holds still)', G.altar.isOpen && G.mode === 'menu', G.mode);
check('every unlock on the shelf with its price', document.querySelectorAll('#altar-goods .unlock').length === 9 && $('altar-stars').textContent.includes('3'), $('altar-goods').textContent.slice(0, 80));
await shot('w5-altar-panel');
tap('heart1'); await wait(300);
check('하트 +1: two stars, the most hearts 6, filled at once', S.unlocks.heart1 && S.stars === 1 && G.run.maxHearts === 6 && G.run.hearts === 6 && $('heart-num').textContent === '6/6', G.run.hearts, G.run.maxHearts, $('heart-num').textContent);
tap('hat'); await wait(300);
check('the explorer\'s hat: on the Maltese at once', S.unlocks.hat && S.wear.head === 'hat' && P.model.userData.wear?.head?.id === 'hat' && S.stars === 0);
tap('crown'); await wait(300);
check('no stars left: a kind no', !S.unlocks.crown && /별이 모자라요/.test($('altar-say').textContent), $('altar-say').textContent);
S.stars += 8; // (as if earned: the secrets, the codex)
tap('heart2'); tap('herbPouch'); tap('bigTank'); tap('rabbitMask'); tap('crown'); tap('scarf'); tap('boots'); await wait(300);
check('everything open, all eleven stars spent', ['heart1', 'heart2', 'herbPouch', 'bigTank', 'rabbitMask', 'hat', 'crown', 'scarf', 'boots'].every((id) => S.unlocks[id]) && S.stars === 0 && G.run.maxHearts === 7, JSON.stringify(S.unlocks), S.stars);
check('the newest hat is worn: the crown, the scarf, the boots', JSON.stringify(S.wear) === JSON.stringify({ head: 'crown', neck: 'scarf', feet: 'boots' }), JSON.stringify(S.wear));
await shot('w5-altar-all');
tap('scarf'); await wait(200);
check('a cosmetic off with a tap…', S.wear.neck === null && !P.model.userData.wear?.neck);
tap('scarf'); await wait(200);
check('…and on again', S.wear.neck === 'scarf' && !!P.model.userData.wear?.neck);
G.altar.close(); await wait(300);
check('closed: playing again', G.mode === 'play');
// the Maltese up close, dressed
X.jump([D.camp.at[0] + 9, D.camp.at[1] + 2]); await wait(400);
G.cam.rig.distance = 7; P.state.heading = Math.PI / 4; await wait(1200);
await shot('w5-maltese-dressed');
G.altar.open(); tap('hat'); G.altar.close(); P.state.heading = Math.PI / 4 - 0.6; await wait(900);
await shot('w5-maltese-hat');
G.cam.rig.distance = 30;
// out of the camp and back: a new expedition with what the altar gives
const n0 = X.n;
G.run.herbs = 0;
X.jump('arena'); await wait(1500);
X.jump('camp'); await wait(1500); await skip();
check('back at the camp: a new expedition', X.n === n0 + 1, n0, X.n);
check('the herb pouch: at least one herb', G.run.herbs >= 1, G.run.herbs);
check('seven hearts still', G.run.maxHearts === 7, G.run.maxHearts);
G.run.water = 1; G.run.tool = 'waterGun'; G.waterGun.reset();
G.waterGun.fire(); await wait(50);
check('the big tank: a shot takes 1/12', Math.abs(1 - G.run.water - 1 / 12) < 0.01, (1 - G.run.water).toFixed(4));
if (!G.run.owned.includes('mask')) G.run.owned.push('mask');
G.mask.reset(); G.run.tool = 'mask';
check('the rabbit mask: on for 7 s', G.mask.use() && Math.abs(G.mask.left - 7) < 0.05, G.mask.left);
await wait(500);
await shot('w5-rabbit-mask');
// the music: the camp's own loop here
X.jump('camp'); await wait(1200); await skip();
check('the music: the camp\'s loop at the camp', G.music().wants === 'camp', JSON.stringify(G.music()));
// GDD §8.5: losing to the same boss again and again: a herb more
G.run.herbs = 0;
for (let k = 0; k < 2; k++) {
  X.jump('heart'); await wait(300);
  await until(() => X.kingFight, 6000);
  if (k === 0) check('the music: the Crystal King\'s theme in his fight', await until(() => G.music().wants === 'crystalKing', 6000), JSON.stringify(G.music()));
  G.run.herbs = 0;
  G.faint();
  await until(() => !G.fainted && G.mode === 'play', 12000); await wait(600); await skip();
}
check('two faints to the Crystal King in a row: a herb more on waking', (S.bossLosses?.crystalKing ?? 0) === 2 && G.run.herbs >= 2, JSON.stringify(S.bossLosses), G.run.herbs);
const save = JSON.parse(localStorage.getItem(G.saveKey ?? 'secret-cave-save-v1'));
check('saved: the unlocks and what is worn', save.unlocks.boots && save.wear.head === 'hat' && save.stars === 0, JSON.stringify(save.wear));
return log;
