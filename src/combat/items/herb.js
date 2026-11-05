import { ITEMS } from '../../data/items.js';
import { eatHerb } from '../loadout.js';
import { eatTwoHerbs } from '../combos.js';
import { textSprite } from '../../entities/enemy.js';
import { sfx } from '../../audio/sound.js';

// Herbs (GDD §6.3): 4 eats one, `useTime` s standing still (the 'eat'
// action), then `heal` hearts, never past the maximum. A bite before the
// herb is eaten up spoils nothing: the herb stays in the belt. Green crosses
// float up from the hero when it works.
export function createHerbs(G) {
  const def = ITEMS.herb;
  const pluses = [];
  let double = false; // W5: herb + herb (GDD §6.6): 4 again while eating

  function eat() {
    // W5: a second press while the first herb is going down: two at once
    if (G.player.state.action?.name === 'eat') {
      if (double || !eatTwoHerbs(G.run).ok) return false;
      double = true;
      sfx.munch();
      G.emit('herbDouble');
      return true;
    }
    double = false;
    const check = eatHerb(G.run, def);
    if (!check.ok) {
      G.toast(check.reason === 'none' ? '약초가 없어요. 보물 상자를 찾아봐요!' : '하트가 가득해요!');
      return false;
    }
    if (!G.player.act('eat')) return false;
    sfx.munch();
    G.emit('eatStart');
    return true;
  }

  G.on('ate', () => {
    const two = double && eatTwoHerbs(G.run).ok;
    double = false;
    const res = two ? eatTwoHerbs(G.run) : eatHerb(G.run, def);
    if (!res.ok) return;
    if (two) G.itemCombo?.('herbHerb');
    const before = G.run.hearts;
    G.run.hearts = res.hearts; G.run.herbs = res.herbs;
    sfx.heal();
    G.refresh();
    G.hud.healed?.();
    const pp = G.player.position;
    for (let i = 0; i < (two ? 8 : 4); i++) {
      const s = textSprite('+', 0.55, '#7dff8a');
      s.visible = true;
      s.position.set(pp.x + ((i % 4) - 1.5) * 0.25, pp.y + 1.0 + (i >= 4 ? 0.3 : 0), pp.z);
      G.scene.add(s);
      pluses.push({ s, t: -i * 0.08 });
    }
    G.emit('healed', { from: before, to: res.hearts, two });
  });

  G.onUpdate((dt) => {
    for (const p of pluses) {
      p.t += dt;
      const k = Math.max(0, p.t) / 0.9;
      p.s.position.y += dt * 1.2;
      p.s.material.opacity = Math.max(0, 1 - k);
      p.s.visible = p.t >= 0;
      if (k >= 1) { G.scene.remove(p.s); p.s.material.dispose(); p.done = true; }
    }
    for (let i = pluses.length - 1; i >= 0; i--) if (pluses[i].done) pluses.splice(i, 1);
  });

  G.on('hurt', () => { double = false; });
  return { eat, get double() { return double; } };
}
