import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { stickAt, isDrag, pinchFactor, zoomed, startDistance, actionSweep, STICK_REACH, DRAG_START } from '../src/ui/touchMath.js';
import { phrase, KEY_WORDS } from '../src/ui/wording.js';
import { ITEMS, SHOP } from '../src/data/items.js';
import { COMBOS } from '../src/combat/combos.js';
import { CODEX_PAGES } from '../src/data/codex.js';
import { ACTIONS } from '../src/player/movement.js';
import { DIST_MIN, DIST_MAX } from '../src/player/isoCamera.js';

// Phones (tasks/20261107-mobile-todo.md): the floating stick, the pinch zoom,
// the thumb buttons' sweeps and the touch wording.
describe('the floating joystick', () => {
  const origin = { x: 100, y: 300 };
  it('its base stays where the thumb came down; the knob stops at the rim', () => {
    const near = stickAt(origin, 120, 300);
    expect(near.dx).toBe(20);
    expect(near.right).toBeCloseTo(20 / STICK_REACH);
    expect(near.forward).toBeCloseTo(0);
    expect(near.run).toBe(false);
    // far past the rim and back: measured from the same base every time
    const far = stickAt(origin, 100, 100);
    expect(Math.hypot(far.dx, far.dy)).toBeCloseTo(STICK_REACH);
    expect(far.forward).toBeCloseTo(1);
    expect(far.run).toBe(true);
    const back = stickAt(origin, 90, 310);
    expect(back.dx).toBe(-10);
    expect(back.dy).toBe(10);
  });
  it('up on the screen is forward, right is right', () => {
    const s = stickAt(origin, 100 + 30, 300 - 30);
    expect(s.right).toBeGreaterThan(0);
    expect(s.forward).toBeGreaterThan(0);
  });
  it('a small wiggle is still a tap (it walks there)', () => {
    expect(isDrag(origin, 105, 305)).toBe(false);
    expect(isDrag(origin, 100 + DRAG_START, 300)).toBe(true);
  });
});

describe('pinch zoom', () => {
  it('spreading the fingers comes closer, pinching goes back', () => {
    expect(pinchFactor(100, 200)).toBe(0.5);
    expect(pinchFactor(200, 100)).toBe(2);
    expect(pinchFactor(0, 100)).toBe(1); // (no spread yet: nothing)
  });
  it('stays in the wheel\'s range', () => {
    expect(zoomed(23, 0.5, DIST_MIN, DIST_MAX)).toBe(DIST_MIN);
    expect(zoomed(23, 3, DIST_MIN, DIST_MAX)).toBe(DIST_MAX);
    expect(zoomed(30, 0.9, DIST_MIN, DIST_MAX)).toBeCloseTo(27);
  });
  it('a phone starts closer than a desktop; a tablet like a desktop', () => {
    const d = { desktop: 30, phone: 21 };
    expect(startDistance({ touch: true, shortSide: 390, ...d })).toBe(21);
    expect(startDistance({ touch: true, shortSide: 768, ...d })).toBe(30);
    expect(startDistance({ touch: false, shortSide: 390, ...d })).toBe(30);
  });
});

describe('the thumb buttons\' cooldown sweeps', () => {
  it('runs from 1 down to 0 over the action and the wait after it', () => {
    const roll = ACTIONS.roll, total = roll.duration + roll.cooldown;
    expect(actionSweep('roll', { action: { name: 'roll', t: 0 }, cooldown: 0 }, ACTIONS)).toBeCloseTo(1);
    expect(actionSweep('roll', { action: { name: 'roll', t: roll.duration }, cooldown: 0 }, ACTIONS)).toBeCloseTo(roll.cooldown / total);
    expect(actionSweep('roll', { action: null, cooldown: roll.cooldown / 2, last: 'roll' }, ACTIONS)).toBeCloseTo(roll.cooldown / 2 / total);
    expect(actionSweep('roll', { action: null, cooldown: 0, last: 'roll' }, ACTIONS)).toBe(0);
  });
  it('only on the button whose action it is', () => {
    expect(actionSweep('sniff', { action: { name: 'roll', t: 0 }, cooldown: 0 }, ACTIONS)).toBe(0);
    expect(actionSweep('sniff', { action: null, cooldown: 0.2, last: 'roll' }, ACTIONS)).toBe(0);
    expect(actionSweep('nothing', { action: null, cooldown: 0 }, ACTIONS)).toBe(0);
  });
});

// every string literal with Korean in it, from the source files
function sources(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'vendor' ? [] : sources(p);
    return p.endsWith('.js') ? [p] : [];
  });
}
// (line by line: a string literal never spans lines here, but a template
// literal may; its lines are then read one by one)
const literals = (code) => code.split('\n').flatMap((l) => [...l.matchAll(/(['`"])((?:\\.|(?!\1).)*?)\1/g)].map((m) => m[2]).filter((s) => /[가-힣]/.test(s)));

describe('touch wording', () => {
  it('phrase() keeps the desktop words on a desktop and the touch words on a touch screen', () => {
    const t = '방패를 얻었어요! [[3을|🛡️ 방패 버튼을]] 누르고 있으면 앞을 막아요';
    expect(phrase(t, false)).toBe('방패를 얻었어요! 3을 누르고 있으면 앞을 막아요');
    expect(phrase(t, true)).toBe('방패를 얻었어요! 🛡️ 방패 버튼을 누르고 있으면 앞을 막아요');
    expect(phrase('하트 2칸 회복[[ (4)|]]', true)).toBe('하트 2칸 회복');
    expect(phrase('plain', true)).toBe('plain');
    expect(phrase(undefined, true)).toBe(undefined);
  });
  it('the item, shop, combo and codex texts name no key or click on a touch screen', () => {
    const texts = [
      ...Object.values(ITEMS).flatMap((i) => [i.got, i.desc, i.name]),
      ...SHOP.flatMap((g) => [g.note, g.name]),
      ...COMBOS.flatMap((c) => [c.text, c.name]),
      ...CODEX_PAGES.flatMap((p) => p.entries.flatMap((e) => [e.desc, e.hint, e.where])),
    ].filter((s) => typeof s === 'string');
    const bad = texts.map((s) => phrase(s, true)).filter((s) => KEY_WORDS.test(s));
    expect(bad).toEqual([]);
  });
  it('no text a player reads on a touch screen names a key (desktop-only places aside)', () => {
    // (the desktop's controls list and the bar's tooltips are not shown on a
    // touch screen: style.css hides the bar's skills and slots)
    const DESKTOP_ONLY = ['ui/screens.js', 'ui/hud.js', 'ui/touch.js', 'ui/wording.js', 'perfOverlay.js'];
    const root = join(__dirname, '..', 'src');
    const bad = [];
    for (const f of sources(root)) {
      if (DESKTOP_ONLY.some((d) => f.endsWith(d))) continue;
      const code = readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).map((l) => l.replace(/\s\/\/ .*$/, '')).join('\n');
      for (const s of literals(code)) if (KEY_WORDS.test(phrase(s, true))) bad.push(`${f.slice(root.length + 1)}: ${s}`);
    }
    expect(bad).toEqual([]);
  });
});
