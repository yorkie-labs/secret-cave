import { shelf, buy, SAY_NO } from '../core/shop.js';
import { ITEMS } from '../data/items.js';
import { gradeName } from '../combat/grades.js';
import { ga } from '../core/josa.js';
import { sfx } from '../audio/sound.js';
import { phrase } from './wording.js';

// M6a: the shop panel (GDD §7.3 상점 방): the bat merchant's goods with their
// prices in crystal shards, the hero's shards, a line from the merchant.
// The world holds still while it is open (like the menu); Esc or 그만 보기
// closes it. The rules are core/shop.js.
const $ = (id) => document.getElementById(id);
const HELLO = ['어서 와요, 작은 모험가! 수정 조각으로 바꿔 줄게요.', '또 왔네요! 오늘은 뭐가 필요해요?'];

export function createShop(G) {
  const el = $('shop');
  let merchant = null;
  const shop = {
    get isOpen() { return !el.classList.contains('hidden'); },
    open(m) {
      if (G.mode !== 'play') return;
      merchant = m;
      G.pointer?.cancel();
      $('shop-say').textContent = HELLO[Math.min(HELLO.length - 1, (m?.visits ?? 1) - 1)];
      render();
      el.classList.remove('hidden');
      G.screens.shopOpen = true;
      G.settle();
      sfx.click();
      G.emit('shopOpen');
    },
    close() {
      if (!shop.isOpen) return;
      el.classList.add('hidden');
      G.screens.shopOpen = false;
      G.settle();
      G.emit('shopClose');
    },
    // buy by id (the buttons; checks)
    buy(id) {
      const r = buy(G.run, id);
      if (r.ok) {
        sfx.item?.();
        const g = r.good;
        $('shop-say').textContent = `${g.icon} ${g.name}, 여기 있어요! 고마워요!`;
        if (g.item) { G.discover(g.item); if (ITEMS[g.item]?.got && g.once) G.toast(ITEMS[g.item].got, 3200); }
        if (g.heal) G.hud.healed?.();
        // W5: a grade-up: the item's slot changes colour (kept until a faint)
        if (r.up) { $('shop-say').textContent = `${ITEMS[r.up.item].icon} ${ga(ITEMS[r.up.item].name)} ${gradeName(r.up.grade)} 등급이 되었어요! 쓰러지면 처음으로 돌아가요.`; G.emit('gradeUp', r.up); }
        G.refresh();
        G.emit('shopBuy', { id, shards: G.run.shards });
      } else {
        sfx.empty?.();
        $('shop-say').textContent = SAY_NO[r.reason] ?? '음…';
        G.emit('shopNo', { id, reason: r.reason });
      }
      render();
      return r;
    },
  };
  function render() {
    $('shop-shards').textContent = `💎 ${G.run.shards}`;
    $('shop-goods').innerHTML = shelf(G.run).map((g) => `
      <button class="good${g.ok ? '' : ' no'}" data-id="${g.id}" title="${phrase(g.note)}">
        <i>${g.icon}</i><b>${g.name}</b><small>${phrase(g.note)}</small><span>💎 ${g.price}</span>
      </button>`).join('');
  }
  $('shop-goods').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) shop.buy(b.dataset.id);
  });
  $('shop-close').onclick = () => { sfx.click(); shop.close(); };
  G.shop = shop;
  void merchant;
  return shop;
}
