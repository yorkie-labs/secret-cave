import { altarShelf, buyUnlock, toggleWear, applyGrowth, worn } from '../core/growth.js';
import { applyWear } from '../entities/cosmetics.js';
import { save } from '../core/state.js';
import { sfx } from '../audio/sound.js';
import { eul } from '../core/josa.js';
import { phrase } from './wording.js';

// W5: the star altar's panel at the camp (GDD §8.3 영구 성장): every unlock
// with its price in stars (data/unlocks.js); a tap opens it for good. The
// Maltese's cosmetics, once open, are put on and taken off here. The world
// holds still while it is open (like the shop); Esc or 닫기 closes it.
const $ = (id) => document.getElementById(id);
const SAY = {
  hello: '별로 영원히 남는 힘을 열어요. 쓰러져도 사라지지 않아요!',
  stars: '별이 모자라요… 대장을 재우고, 비밀 구역을 찾고, 도감을 채우면 별이 생겨요!',
  needs: '앞의 것을 먼저 열어요!',
  owned: '이미 열었어요!',
};

export function createAltar(G) {
  const el = $('altar');
  const altar = {
    get isOpen() { return !el.classList.contains('hidden'); },
    open() {
      if (G.mode !== 'play') return;
      G.pointer?.cancel();
      $('altar-say').textContent = SAY.hello;
      render();
      el.classList.remove('hidden');
      G.screens.altarOpen = true;
      G.settle();
      sfx.click();
      G.emit('altarOpen');
    },
    close() {
      if (!altar.isOpen) return;
      el.classList.add('hidden');
      G.screens.altarOpen = false;
      G.settle();
      G.emit('altarClose');
    },
    // a tap: open it (stars), or put a cosmetic on / take it off
    pick(id) {
      const u = altarShelf(G.state).find((q) => q.id === id);
      if (!u) return null;
      if (u.owned) {
        if (!u.wear) { sfx.empty?.(); $('altar-say').textContent = SAY.owned; render(); return { ok: false, reason: 'owned' }; }
        const on = toggleWear(G.state, id);
        applyWear(G.player.model, worn(G.state));
        sfx.click();
        $('altar-say').textContent = on ? `${u.icon} ${eul(u.name)} 썼어요!` : `${u.icon} ${eul(u.name)} 벗었어요`;
        save(G.state);
        render();
        G.emit('wear', { id, on });
        return { ok: true, wear: on };
      }
      const r = buyUnlock(G.state, id);
      if (!r.ok) { sfx.empty?.(); $('altar-say').textContent = SAY[r.reason] ?? '음…'; render(); G.emit('altarNo', { id, reason: r.reason }); return r; }
      sfx.necklace?.();
      applyGrowth(G.run, G.state);
      if (u.herbs) G.run.herbs = Math.max(G.run.herbs, u.herbs);
      if (u.wear) applyWear(G.player.model, worn(G.state));
      $('altar-say').textContent = phrase(`⭐ ${u.icon} ${u.name}! ${u.note}`);
      G.hud.healed?.();
      G.refresh();
      render();
      G.emit('unlock', { id });
      return r;
    },
  };
  function render() {
    $('altar-stars').textContent = `⭐ ${G.state.stars}`;
    $('altar-goods').innerHTML = altarShelf(G.state).map((u) => {
      const cls = ['unlock', u.owned ? 'owned' : u.ok ? '' : 'no', u.worn ? 'worn' : ''].filter(Boolean).join(' ');
      const tag = u.owned ? (u.wear ? (u.worn ? '✓ 입고 있어요 (벗기)' : '입기') : '✓ 열었어요') : `⭐ ${u.cost}`;
      return `<button class="${cls}" data-id="${u.id}" title="${phrase(u.note)}"><i>${u.icon}</i><b>${u.name}</b><small>${phrase(u.note)}</small><span>${tag}</span></button>`;
    }).join('');
  }
  $('altar-goods').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) altar.pick(b.dataset.id);
  });
  $('altar-close').onclick = () => { sfx.click(); altar.close(); };
  G.altar = altar;
  return altar;
}
