import { sfx } from '../audio/sound.js';
import { heartsText } from '../combat/hits.js';
import { otherTools, maxArmor } from '../combat/loadout.js';
import { ITEMS } from '../data/items.js';
import { gradeOf, gradeName } from '../combat/grades.js';

const $ = (id) => document.getElementById(id);

// The hotbar (GDD §5.2, §4.1): 1 sniff, 2 roll, 3 shield (held), 4 herb.
// The shield's slot is dim until a chest gives it; the herb's shows how many
// are in the belt.
export const ACTIONS = [
  { key: 'Digit1', icon: '👃', ko: '냄새 맡기' },
  { key: 'Digit2', icon: '🌀', ko: '구르기' },
  { key: 'Digit3', icon: ITEMS.shield.icon, ko: '방패 (누르고 있기)', item: 'shield' },
  { key: 'Digit4', icon: ITEMS.herb.icon, ko: '약초 먹기', item: 'herb' },
];

// A cooldown: the icon darkens and lights up again clockwise (style.css .cd).
function setSweep(el, p) {
  if (!el) return;
  const v = p > 0.001 ? p.toFixed(3) : '0';
  if (el.dataset.p !== v) { el.dataset.p = v; el.style.setProperty('--p', v); }
}

export function createHud() {
  // clicking a hotbar slot or a skill icon presses its key
  let pressed = null;
  document.getElementById('bar')?.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    const slot = e.target.closest('[data-key]');
    if (slot) { pressed = slot.dataset.key; hud.onKey?.(pressed); }
  });
  // a held slot (the shield) lets go with the button
  addEventListener('mouseup', () => { if (pressed) { hud.onKeyUp?.(pressed); pressed = null; } });
  let slotsKey = '';
  let toastTimer = 0;
  let dialogQueue = null;

  const hud = {
    show(v) { $('hud').classList.toggle('hidden', !v); document.body.classList.toggle('playing', v); },

    // run: { hearts, maxHearts, water, shards } (hearts in half-heart steps)
    update(run) {
      // heart orb: drains from the top like Diablo's life globe
      const orb = $('heart-orb');
      if (orb.dataset.hearts !== String(run.hearts)) {
        if (orb.dataset.hearts && Number(orb.dataset.hearts) > run.hearts) { orb.classList.remove('hit'); void orb.offsetWidth; orb.classList.add('hit'); }
        orb.dataset.hearts = String(run.hearts);
      }
      orb.querySelector('.fill').style.height = `${(Math.max(0, run.hearts) / run.maxHearts) * 100}%`;
      $('heart-num').textContent = `${heartsText(run.hearts)}/${run.maxHearts}`;
      // W3: armour: a blue heart (or a half) per point over the orb, the spent ones dim
      const maxBlue = maxArmor(run), blue = run.armor ?? 0;
      const pips = $('armor-pips');
      const pkey = `${blue}|${maxBlue}`;
      if (pips && pips.dataset.k !== pkey) {
        if (pips.dataset.k && Number(pips.dataset.k.split('|')[0]) > blue) { orb.classList.remove('armor-hit'); void orb.offsetWidth; orb.classList.add('armor-hit'); }
        pips.dataset.k = pkey;
        pips.innerHTML = Array.from({ length: maxBlue }, (_, i) => `<i class="${blue >= i + 1 ? '' : blue > i ? 'half' : 'gone'}">💙</i>`).join('');
        pips.classList.toggle('hidden', maxBlue <= 0);
        pips.classList.toggle('legend', run.armorGrade === 'legend');
        orb.classList.toggle('armored', maxBlue > 0);
        orb.title = maxBlue > 0 ? `하트 · 갑옷 파란 하트 ${blue}/${maxBlue}` : '하트';
      }
      orb.classList.toggle('low', run.hearts > 0 && run.hearts <= 1);
      // crystal shards, the run's coins, next to the heart orb
      const shards = $('shards');
      if (Number(shards.dataset.n ?? 0) < run.shards) { shards.classList.remove('got'); void shards.offsetWidth; shards.classList.add('got'); }
      shards.dataset.n = String(run.shards ?? 0);
      $('shard-num').textContent = String(run.shards ?? 0);
      hud.water(run.water ?? 1);

      // skills: left click the hammer, right click the selected tool; the
      // other owned tools wait beside it, Q brings the next one
      const owned = run.owned ?? [], tool = ITEMS[run.tool] ?? ITEMS.waterGun;
      $('skill-left').querySelector('span').textContent = ITEMS.hammer.icon;
      $('skill-right').querySelector('span').textContent = tool.icon;
      $('skill-left').title = '왼쪽 클릭: 이동 · 망치';
      $('skill-right').title = `오른쪽 클릭: ${tool.name} (Q 바꾸기)`;
      const others = otherTools(run.tool, owned);
      const row = $('tool-others');
      row.innerHTML = others.length ? `<small>Q</small>${others.map((k) => `<span title="${ITEMS[k].name}">${ITEMS[k].icon}</span>`).join('')}` : '';
      row.classList.toggle('hidden', !others.length);
      const touchTool = document.querySelector('#touch-buttons [data-key="Tool"]');
      if (touchTool) touchTool.querySelector('.ico').textContent = tool.icon; // (its label stays: 도구)
      // W5: the hammer's and the water gun's grades: the slot's border colour
      const gH = gradeOf(run, 'hammer'), gT = run.tool === 'waterGun' ? gradeOf(run, 'waterGun') : 'common';
      const touchHammer = document.querySelector('#touch-buttons [data-key="Hammer"]');
      for (const [el, g, what] of [[$('skill-left'), gH, '망치'], [$('skill-right'), gT, tool.name], [touchHammer, gH], [touchTool, gT]]) {
        if (!el) continue;
        el.classList.toggle('grade-rare', g === 'rare');
        el.classList.toggle('grade-legend', g === 'legend');
        el.dataset.grade = g;
        if (what && el.classList.contains('skill')) {
          let tag = el.querySelector('b.grade');
          if (!tag) { tag = document.createElement('b'); tag.className = 'grade'; el.appendChild(tag); }
          tag.textContent = g === 'common' ? '' : gradeName(g);
          el.title = `${el.title}${g === 'common' ? '' : ` · ${gradeName(g)}`}`;
        }
      }
      const touchQ = document.querySelector('#touch-buttons [data-key="KeyQ"]');
      if (touchQ) touchQ.classList.toggle('dim', !others.length);
      // the hotbar, redrawn only when what it shows changes
      const herbs = run.herbs ?? 0, hasShield = owned.includes('shield');
      const key = `${hasShield}|${herbs}`;
      if (key !== slotsKey) {
        slotsKey = key;
        $('slots').innerHTML = ACTIONS.map((a, i) => {
          const locked = a.item === 'shield' && !hasShield;
          const empty = a.item === 'herb' && herbs === 0;
          const cls = ['slot', locked && 'locked', empty && 'empty'].filter(Boolean).join(' ');
          const count = a.item === 'herb' ? `<b>x${herbs}</b>` : '';
          const tip = locked ? `${a.ko}: 아직 없어요` : `${a.ko} (${i + 1})`;
          return `<div class="${cls}" id="slot-${i + 1}" data-key="${a.key}" title="${tip}"><small>${i + 1}</small>${a.icon}${count}<i class="cd"></i></div>`;
        }).join('');
      }
      const touchHerb = document.querySelector('#touch-buttons [data-key="Digit4"]');
      if (touchHerb) touchHerb.dataset.count = String(herbs);
      const touchShield = document.querySelector('#touch-buttons [data-key="Digit3"]');
      if (touchShield) touchShield.classList.toggle('dim', !hasShield);
    },

    // every frame: the cooldown sweep on the tool, and the shield's slot lit
    // while it is up (the shield has no cooldown: no sweep)
    cooldowns({ tool = 0, shieldUp = false }) {
      setSweep($('skill-right')?.querySelector('.cd'), tool);
      const s3 = $('slot-3');
      if (s3 && s3.classList.contains('up') !== shieldUp) s3.classList.toggle('up', shieldUp);
    },
    // the tool is still cooling down: a little shake
    toolBusy() {
      const el = $('skill-right');
      el.classList.remove('busy'); void el.offsetWidth; el.classList.add('busy');
      sfx.empty();
    },
    toolSwitched() {
      const el = $('skill-right');
      el.classList.remove('switched'); void el.offsetWidth; el.classList.add('switched');
    },
    // W5: "콤보!" over the bar for a moment
    comboPop(text) {
      const el = $('combo-pop');
      if (!el) return;
      el.textContent = text;
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    },
    healed() {
      const orb = $('heart-orb');
      orb.classList.remove('healed'); void orb.offsetWidth; orb.classList.add('healed');
    },

    // water orb: the water gun's tank (refills every frame, so kept cheap)
    water(v) {
      const fill = $('water-orb').querySelector('.fill');
      const h = `${Math.round(v * 1000) / 10}%`;
      if (fill.style.height !== h) fill.style.height = h;
    },
    // an empty tank: the orb flashes
    waterEmpty() {
      const orb = $('water-orb');
      orb.classList.remove('dry'); void orb.offsetWidth; orb.classList.add('dry');
    },

    // M5: the boss plate up top (null hides it): name, hp (with the phase
    // lines at 66 % and 33 %), the stun gauge, and what to do now
    bossPlate(b) {
      const el = $('boss-plate');
      if (!b) { if (!el.classList.contains('hidden')) { el.classList.add('hidden'); document.body.classList.remove('boss'); } return; }
      if (el.classList.contains('hidden')) { el.classList.remove('hidden'); document.body.classList.add('boss'); }
      const key = `${b.name}|${b.hp.toFixed(2)}|${b.stun.toFixed(2)}|${b.hint}|${b.phase}|${b.dazed}`;
      if (el.dataset.key === key) return;
      el.dataset.key = key;
      $('boss-name').textContent = b.name;
      el.querySelector('.hp span').style.width = `${Math.max(0, b.hp / b.maxHp) * 100}%`;
      el.querySelector('.stun span').style.width = `${Math.min(1, b.stun) * 100}%`;
      $('boss-hint').textContent = b.hint ?? '';
      el.dataset.phase = String(b.phase);
      el.classList.toggle('dazed', !!b.dazed);
    },
    // M5: the golden necklace, once found (GDD §6.4)
    necklace(on) { $('necklace-badge').classList.toggle('hidden', !on); },
    // W4: the necklace glows while a crystal door opens to it
    necklaceGlow(on) { $('necklace-badge').classList.toggle('glow', !!on); },
    necklaceGlow() {
      const el = $('necklace-badge');
      el.classList.remove('glow'); void el.offsetWidth; el.classList.add('glow');
    },

    // top left: the area and how far through it (GDD §5.2)
    area(text) { $('area-name').textContent = text; },

    prompt(text) {
      const el = $('prompt');
      el.classList.toggle('hidden', !text);
      if (text && el.textContent !== text) el.textContent = text;
    },

    toast(text, ms = 2200) {
      const el = $('toast');
      el.textContent = text;
      el.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove('show'), ms);
    },

    // lines: [{ name, text }] or strings
    dialog(lines, done) {
      dialogQueue = { lines: lines.map((l) => (typeof l === 'string' ? { text: l } : l)), i: 0, done };
      $('dialog').classList.remove('hidden');
      showLine();
    },
    advanceDialog() {
      if (!dialogQueue) return false;
      sfx.click();
      dialogQueue.i++;
      if (dialogQueue.i >= dialogQueue.lines.length) {
        const done = dialogQueue.done;
        dialogQueue = null;
        $('dialog').classList.add('hidden');
        done?.();
      } else showLine();
      return true;
    },
    get inDialog() { return !!dialogQueue; },

    fade(on) {
      $('fade').classList.toggle('on', on);
      return new Promise((r) => setTimeout(r, 650));
    },

    card(html, ms = 2600) {
      const el = $('card');
      el.innerHTML = html;
      el.classList.remove('hidden', 'show'); void el.offsetWidth; el.classList.add('show');
      return new Promise((r) => setTimeout(() => { el.classList.add('hidden'); r(); }, ms));
    },
  };

  function showLine() {
    const l = dialogQueue.lines[dialogQueue.i];
    $('dialog-name').textContent = l.name ?? '';
    $('dialog-text').textContent = l.text;
  }

  return hud;
}
