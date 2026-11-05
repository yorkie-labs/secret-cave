// W5 (tasks/20261102-world-redesign-todo.md): the codex book at the camp's
// codex stone (GDD §8.4). GAME_URL='http://localhost:5191/?start=heart&seed=4'.
// Click the stone → the book: tabs (동물 · 대장 · 물건 · 비밀 · 콤보), the
// count n/N and its bar, the milestone stars; every seen entry a picture of
// its own model, unseen ones a dark silhouette with "?"; an animal's page
// says where it lives and its weakness, a boss's how to beat it; the secret
// pages are shadows until found; half of the codex gave a star; a combo
// written in once it goes off; seeing everything gives the last star.
const X = G.expedition, S = G.state;
const $ = (id) => document.getElementById(id);
const check = (name, ok, ...info) => log.push([ok ? 'PASS' : 'FAIL', name, ...info]);
const tab = (id) => document.querySelector(`#codex-tabs [data-tab="${id}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const pick = (id) => document.querySelector(`#codex-grid [data-id="${id}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
G.hurtPlayer = () => false;
await start(); await wait(1500); await skip();
X.jump('camp'); await wait(1200); await skip();
const stone = G.interactables.find((it) => it.kind === 'codex');
X.jump([stone.pos.x + 1.8, stone.pos.z + 1.8]); await wait(600);
G.interact(); await wait(600);
if (!G.codex.isOpen) stone.action();
await wait(400);
check('the codex stone opens the book (the world holds still)', G.codex.isOpen && G.mode === 'menu', G.mode);
const total = Number($('codex-count').textContent.split('/')[1]);
check('24 entries: 7 animals, 4 bosses, 8 items, 5 secrets', total === 24, $('codex-count').textContent);
check('five tabs', document.querySelectorAll('#codex-tabs button').length === 5, $('codex-tabs').textContent);
check('half of it seen already: the first codex star', S.milestones.half && $('codex-stars').querySelectorAll('.got').length === 1);
const cards = [...document.querySelectorAll('#codex-grid .entry')];
check('the animals page: 7, every one a picture of its model', cards.length === 7 && cards.every((c) => c.querySelector('img')), cards.map((c) => c.dataset.id + (c.querySelector('img') ? '' : '(icon)')).join(','));
pick('wolf'); await wait(200);
check('the wolf\'s page: where, what, its weakness (the vine)', /이끼 계곡/.test($('codex-detail').textContent) && /약점/.test($('codex-detail').textContent) && /덩굴/.test($('codex-detail').textContent), $('codex-detail').textContent.slice(0, 90));
pick('bear'); await wait(200);
check('the bear\'s weakness: the water gun', /물총/.test($('codex-detail').textContent));
await shot('w5-codex-animals');
tab('bosses'); await wait(200);
check('the bosses page: three met, the Crystal King a silhouette', document.querySelectorAll('#codex-grid .entry.unknown').length === 1 && document.querySelector('#codex-grid [data-id="crystalKing"]').classList.contains('unknown'));
pick('iceBear'); await wait(200);
check('a boss\'s page says how to beat it', /💡/.test($('codex-detail').innerHTML) && /빙판/.test($('codex-detail').textContent), $('codex-detail').textContent.slice(0, 80));
pick('crystalKing'); await wait(200);
check('an unseen one: only "???"', /\?\?\?/.test($('codex-detail').textContent));
await shot('w5-codex-bosses');
tab('items'); await wait(200);
check('the items page: the mask still unseen (a silhouette with "?")', document.querySelector('#codex-grid [data-id="mask"]').classList.contains('unknown') && !!document.querySelector('#codex-grid [data-id="mask"] em'));
await shot('w5-codex-items');
tab('secrets'); await wait(200);
check('the secrets page: five shadows', document.querySelectorAll('#codex-grid .entry.unknown').length === 5);
tab('combos'); await wait(200);
check('the combos page: none yet', document.querySelectorAll('#codex-grid .combo.unknown').length === 5);
G.codex.close(); await wait(200);
check('closed', !G.codex.isOpen && G.mode === 'play');
// a combo goes off: it is written in
G.itemCombo('shieldCounter'); await wait(300);
check('a combo: "콤보!" pops up', document.getElementById('combo-pop').classList.contains('show') && /막고 쾅/.test($('combo-pop').textContent), $('combo-pop').textContent);
await shot('w5-combo-pop');
stone.action(); await wait(300); tab('combos'); await wait(200);
check('…and the codex lists it', document.querySelectorAll('#codex-grid .combo.unknown').length === 4);
await shot('w5-codex-combos');
G.codex.close();
// everything seen: the second codex star
const stars0 = S.stars;
for (const id of ['crystalKing', 'mask', 'herb', 'secret1', 'secret2', 'secret3', 'secret4']) G.discover(id);
check('all but one: no star yet', S.stars === stars0 && !S.milestones.all);
G.discover('purpleShard');
check('the whole codex: a star', S.milestones.all && S.stars === stars0 + 1, S.stars);
stone.action(); await wait(300); tab('secrets'); await wait(200); pick('secret4'); await wait(200);
check('a secret\'s page: its old letters', /옛 글자/.test($('codex-detail').textContent) && $('codex-count').textContent === '24 / 24', $('codex-count').textContent);
await shot('w5-codex-secrets');
G.codex.close();
return log;
