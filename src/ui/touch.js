// Mobile controls (GDD §4.2): a virtual joystick and action buttons, shown
// only on touch screens. They feed the same input as the keyboard.
export function setupTouch(G) {
  if (!matchMedia('(pointer: coarse)').matches) return; // a phone or tablet, not a touch laptop
  const root = document.getElementById('touch');
  root.classList.remove('hidden');
  // the layout and wording switch to touch (style.css: body.touch)
  document.body.classList.add('touch');
  G.touch = true;
  document.getElementById('dialog-next').textContent = '▼ 화면을 톡';
  // the "✋ use" prompt is a button too
  const prompt = document.getElementById('prompt');
  prompt.addEventListener('touchstart', (e) => { e.preventDefault(); G.input.trigger('Space', e); });
  const stick = document.getElementById('stick'), knob = document.getElementById('knob');
  const v = G.input.virtual;
  let id = null;
  const R = 50;
  const move = (t) => {
    const r = stick.getBoundingClientRect();
    let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    v.right = dx / R; v.forward = -dy / R; v.run = d > R * 0.9;
  };
  stick.addEventListener('touchstart', (e) => { id = e.changedTouches[0].identifier; move(e.changedTouches[0]); e.preventDefault(); });
  stick.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === id) move(t); e.preventDefault(); });
  const end = () => { id = null; v.forward = v.right = 0; v.run = false; knob.style.transform = ''; };
  stick.addEventListener('touchend', end);
  stick.addEventListener('touchcancel', end);
  for (const b of document.querySelectorAll('#touch-buttons button')) {
    b.addEventListener('touchstart', (e) => { e.preventDefault(); G.input.trigger(b.dataset.key, e); });
    // held buttons (the shield) let go when the thumb lifts
    const up = (e) => { e.preventDefault(); G.input.release(b.dataset.key, e); };
    b.addEventListener('touchend', up);
    b.addEventListener('touchcancel', up);
  }
}
