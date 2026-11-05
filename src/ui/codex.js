import { CODEX_PAGES, CODEX_IDS, CODEX_ENTRY } from '../data/codex.js';
import { ITEMS } from '../data/items.js';
import { COMBOS } from '../combat/combos.js';
import { MILESTONES } from '../core/growth.js';
import { thumbOf, releaseThumbs } from './thumbs.js';
import { sfx } from '../audio/sound.js';

// W5: the codex book at the camp's codex stone (GDD §8.4 도감): a page each
// for the animals, the bosses, the items and the secrets (data/codex.js), and
// one for the item combos found (combat/combos.js). Every entry is a little
// picture of its own model (ui/thumbs.js); unseen ones are a dark silhouette
// with "?". Tapping one opens its page: what it is, where it lives, its
// weakness (animals) or how to beat it (bosses). The world holds still while
// the book is open; Esc or 닫기 closes it.
const $ = (id) => document.getElementById(id);
export { CODEX_IDS };

export function createCodex(G) {
  const el = $('codex');
  let tab = 'animals', pick = null;
  const codex = {
    get isOpen() { return !el.classList.contains('hidden'); },
    get tab() { return tab; },
    open() {
      if (G.mode !== 'play') return;
      G.pointer?.cancel();
      el.classList.remove('hidden');
      render();
      G.screens.codexOpen = true;
      G.settle();
      sfx.click();
      G.emit('codexOpen');
    },
    close() {
      if (!codex.isOpen) return;
      el.classList.add('hidden');
      G.screens.codexOpen = false;
      releaseThumbs();
      G.settle();
    },
    // (checks) a page, an entry
    show(t, id = null) { tab = t; pick = id; render(); },
  };
  const seen = (id) => !!G.state.seen?.[id];
  function render() {
    const S = G.state;
    const n = CODEX_IDS.filter(seen).length;
    $('codex-count').textContent = `${n} / ${CODEX_IDS.length}`;
    $('codex-bar').style.width = `${(n / CODEX_IDS.length) * 100}%`;
    $('codex-stars').innerHTML = MILESTONES.map(([id, part]) => `<span class="${S.milestones?.[id] ? 'got' : ''}" title="도감 ${Math.round(part * 100)} %: 별 하나">📖 ${Math.ceil(CODEX_IDS.length * part)}개 → ⭐${S.milestones?.[id] ? ' ✓' : ''}</span>`).join('');
    const tabs = [...CODEX_PAGES.map((p) => [p.id, p.icon, p.title, p.entries.filter((e) => seen(e.id)).length, p.entries.length]), ['combos', '🤝', '콤보', COMBOS.filter((c) => S.combos?.[c.id]).length, COMBOS.length]];
    $('codex-tabs').innerHTML = tabs.map(([id, icon, title, a, b]) => `<button class="${id === tab ? 'on' : ''}" data-tab="${id}">${icon} ${title} <small>${a}/${b}</small></button>`).join('');
    if (tab === 'combos') {
      $('codex-grid').innerHTML = COMBOS.map((c) => {
        const got = !!S.combos?.[c.id];
        return `<div class="combo${got ? '' : ' unknown'}"><i>${got ? c.icon : '❔'}</i><b>${got ? c.name : '???'}</b><small>${c.text}</small></div>`;
      }).join('');
      $('codex-detail').innerHTML = '<p class="hint">두 아이템을 함께 쓰면 생기는 힘이에요. 써 보면 여기에 적혀요!</p>';
      return;
    }
    const page = CODEX_PAGES.find((p) => p.id === tab) ?? CODEX_PAGES[0];
    $('codex-grid').innerHTML = page.entries.map((e) => {
      const known = seen(e.id);
      const img = thumbOf(e.id);
      const pic = img ? `<img src="${img}" alt="">` : `<i>${e.icon}</i>`;
      return `<button class="entry${known ? '' : ' unknown'}${pick === e.id ? ' on' : ''}" data-id="${e.id}">${pic}${known ? '' : '<em>?</em>'}<b>${known ? e.name : '???'}</b></button>`;
    }).join('');
    const e = pick && CODEX_ENTRY[pick]?.page === page.id ? CODEX_ENTRY[pick] : null;
    if (!e) { $('codex-detail').innerHTML = `<p class="hint">${page.icon} 그림을 눌러 보세요. 아직 못 본 것은 그림자예요.</p>`; return; }
    if (!seen(e.id)) { $('codex-detail').innerHTML = '<h3>❔ ???</h3><p class="hint">아직 만나지 못했어요. 동굴 어딘가에 있을 거예요!</p>'; return; }
    const img = thumbOf(e.id);
    const weak = e.weak ? `<p class="weak">약점: ${ITEMS[e.weak]?.icon ?? ''} <b>${ITEMS[e.weak]?.name ?? e.weak}</b> — ${e.hint}</p>` : e.hint ? `<p class="weak">💡 ${e.hint}</p>` : '';
    $('codex-detail').innerHTML = `${img ? `<img src="${img}" alt="">` : `<i class="big">${e.icon}</i>`}<h3>${e.icon} ${e.name}</h3>${e.where ? `<p class="where">📍 ${e.where}</p>` : ''}<p>${e.desc}</p>${weak}`;
  }
  el.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-tab]');
    if (t) { sfx.click(); tab = t.dataset.tab; pick = null; render(); return; }
    const b = ev.target.closest('[data-id]');
    if (b && el.contains(b)) { sfx.click(); pick = b.dataset.id; render(); G.emit('codexPick', pick); }
  });
  $('codex-close').onclick = () => { sfx.click(); codex.close(); };
  G.codex = codex;
  return codex;
}
