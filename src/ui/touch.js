// Mobile controls (GDD §4.2, after Scary Island's iPhone playtest): a
// floating joystick under the left thumb, an arc of thumb buttons on the
// right, pinch to zoom; shown only on touch screens (a coarse pointer: a
// phone or tablet, not a touch laptop). They feed the same input as the keys.
import { stickAt, isDrag, pinchFactor } from './touchMath.js';
import { setTouchWording } from './wording.js';

export function setupTouch(G) {
  if (!matchMedia('(pointer: coarse)').matches) return;
  const $ = (id) => document.getElementById(id);
  $('touch').classList.remove('hidden');
  // the layout and wording switch to touch (style.css: body.touch, ui/wording.js)
  document.body.classList.add('touch');
  G.touch = true;
  setTouchWording(true);
  // the words on screen that name keys say taps and buttons instead
  $('dialog-next').textContent = '▼ 화면을 톡';
  document.querySelector('#intro .hint').textContent = '화면을 톡: 다음';
  document.querySelector('#map .hint').textContent = '🗺️ 한 번 더 누르면 닫혀요';
  $('shop-close').textContent = '그만 보기';
  $('codex-close').textContent = '닫기';
  $('altar-close').textContent = '닫기';
  // no page zoom from a pinch or a double tap, no long-press menu (Safari)
  for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  // the "✋ use" prompt is a button too
  $('prompt').addEventListener('touchstart', (e) => { e.preventDefault(); G.input.trigger('Space', e); });

  // The joystick floats: put a thumb down anywhere on the left half of the
  // world and drag, and the stick appears where the thumb first touched and
  // stays there until the thumb lifts (the knob stops at its rim). A quick
  // tap (no drag) is still "tap the ground to walk" (or tap an animal, a chest,
  // the merchant: a left click): nothing is cancelled until the finger moves,
  // so the browser's tap reaches systems/pointer.js as a click.
  const stick = $('stick'), knob = $('knob');
  const canvas = G.renderer.domElement;
  canvas.style.touchAction = 'none';
  const v = G.input.virtual;
  let id = null, active = false;
  const origin = { x: 0, y: 0 };
  const touchOf = (e) => [...e.changedTouches].find((t) => t.identifier === id);
  const place = () => {
    stick.style.left = `${origin.x - stick.offsetWidth / 2}px`;
    stick.style.top = `${origin.y - stick.offsetHeight / 2}px`;
    stick.style.bottom = 'auto';
  };
  const release = () => {
    id = null; active = false;
    v.forward = v.right = 0; v.run = false;
    knob.style.transform = '';
    stick.classList.remove('held');
    stick.style.left = stick.style.top = stick.style.bottom = ''; // back to its resting spot (a hint)
  };

  // Two fingers on the world pinch the lens closer or farther (the mouse
  // wheel of a phone). A pinch is never a tap or a stick.
  let pinch = null; // { d } while two fingers are down; 'done' until they all lift
  const spread = (e) => { const [a, b] = e.targetTouches; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); };
  canvas.addEventListener('touchstart', (e) => {
    if (e.targetTouches.length === 2 && !active && G.mode === 'play') { pinch = { d: spread(e) }; release(); }
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    if (!pinch?.d || e.targetTouches.length < 2) return;
    e.preventDefault();
    const d = spread(e);
    G.cam.zoom(pinchFactor(pinch.d, d));
    pinch.d = d;
  }, { passive: false });
  canvas.addEventListener('touchend', (e) => {
    if (!pinch) return;
    e.preventDefault(); // no walk order from a pinching finger
    pinch = e.targetTouches.length ? 'done' : null;
  }, { passive: false });

  canvas.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    if (pinch || id !== null || G.mode !== 'play' || t.clientX > innerWidth / 2) return;
    id = t.identifier; active = false;
    origin.x = t.clientX; origin.y = t.clientY; // where the stick will sit
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    const t = touchOf(e);
    if (!t) return;
    if (!active && !isDrag(origin, t.clientX, t.clientY)) return;
    if (!active) { active = true; stick.classList.add('held'); place(); G.pointer.cancel(); }
    e.preventDefault();
    const s = stickAt(origin, t.clientX, t.clientY);
    knob.style.transform = `translate(${s.dx}px, ${s.dy}px)`;
    v.right = s.right; v.forward = s.forward; v.run = s.run;
  }, { passive: false });
  const end = (e) => {
    if (!touchOf(e)) return;
    if (active) e.preventDefault(); // a drag is not a tap: no walk order after it
    release();
  };
  canvas.addEventListener('touchend', end, { passive: false });
  canvas.addEventListener('touchcancel', end, { passive: false });

  // the thumb buttons press their keys; held ones (the shield) let go with the thumb
  for (const b of document.querySelectorAll('#touch button[data-key]')) {
    b.addEventListener('touchstart', (e) => { e.preventDefault(); G.input.trigger(b.dataset.key, e); });
    const up = (e) => { e.preventDefault(); G.input.release(b.dataset.key, e); };
    b.addEventListener('touchend', up);
    b.addEventListener('touchcancel', up);
  }
  G.hud.relayout();
}
