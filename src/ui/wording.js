// Words for the controls (GDD §4.2): on a phone or tablet a hint names taps
// and the thumb buttons, never keys or clicks. A text carries both ways of
// saying it as "[[desktop|touch]]" (either side may be empty); phrase() keeps
// the one this screen uses. ui/touch.js switches it to touch; the HUD (toasts,
// cards, talk, the boss plate) and the shop, codex and altar pass their texts
// through it, so data files write the pair once where the sentence lives.
let touchScreen = false;
export const setTouchWording = (on) => { touchScreen = !!on; };

const PAIR = /\[\[([^|\]]*)\|([^\]]*)\]\]/g;
export function phrase(text, touch = touchScreen) {
  if (typeof text !== 'string' || !text.includes('[[')) return text;
  return text.replace(PAIR, (_, desk, tap) => (touch ? tap : desk));
}

// What a text on a touch screen must never say (test/wording.test.js): mouse
// buttons, the keyboard's keys, the hotbar's numbers.
export const KEY_WORDS = /클릭|마우스|휠|Space|Esc|Tab|Shift|Enter|\bQ\b|\b[1-4]번(?!째)|\([1-4]\)|\b[1-4](을|를)/;
