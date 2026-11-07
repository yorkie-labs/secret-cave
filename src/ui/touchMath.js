// The touch controls' arithmetic (GDD §4.2), kept apart from the DOM so it
// can be tested (test/touch.test.js): the floating joystick, the pinch zoom,
// the phone's starting distance and the cooldown sweeps on the thumb buttons.

export const STICK_REACH = 50; // px from the stick's base to the knob's rim
export const DRAG_START = 12; // px a thumb moves before a touch is a drag (less: a tap)
export const PHONE_SIDE = 500; // css px: a touch screen with a shorter side is a phone

// The floating stick: its base stays where the thumb first came down for the
// whole drag; the knob follows the thumb and stops at the rim. Returns the
// knob's offset and what the stick says (right / forward in -1..1, run near
// the rim), the same shape as G.input.virtual.
export function stickAt(origin, x, y, reach = STICK_REACH) {
  let dx = x - origin.x, dy = y - origin.y;
  const d = Math.hypot(dx, dy);
  if (d > reach) { dx = (dx / d) * reach; dy = (dy / d) * reach; }
  return { dx, dy, right: dx / reach, forward: -dy / reach, run: d > reach * 0.9 };
}

// a thumb that has not gone DRAG_START px from where it came down is still a tap
export const isDrag = (origin, x, y, min = DRAG_START) => Math.hypot(x - origin.x, y - origin.y) >= min;

// Two fingers: spreading them brings the lens closer (factor < 1), pinching
// them sends it back; the distance stays in the wheel's range.
export const pinchFactor = (before, now) => (before > 0 && now > 0 ? before / now : 1);
export const zoomed = (distance, factor, min, max) => Math.min(max, Math.max(min, distance * factor));

// Where the lens starts: a phone closer than a desktop (the hero must read on
// a small screen), a tablet like a desktop.
export const startDistance = ({ touch = false, shortSide = Infinity, desktop, phone }) => (touch && shortSide < PHONE_SIDE ? phone : desktop);

// A thumb button's cooldown sweep, 0 (ready) to 1 (just used): the hero's
// action for that button while it runs, then the short wait after it (the
// player's `cooldown`, which belongs to the action that ended last).
// `s` = { action: { name, t, duration } | null, cooldown, last }, `table` =
// player/movement.js ACTIONS.
export function actionSweep(name, s, table) {
  const def = table[name];
  if (!def) return 0;
  const total = def.duration + def.cooldown;
  if (total <= 0) return 0;
  if (s.action?.name === name) return Math.min(1, Math.max(0, (def.duration - s.action.t + def.cooldown) / total));
  if (!s.action && s.last === name && s.cooldown > 0) return Math.min(1, s.cooldown / total);
  return 0;
}
