// Keys and touch behind one interface (GDD §4). Kept simple: no keyboard
// movement; the mouse moves the hero and the number keys are abilities.

export function createInput() {
  const handlers = new Map(); // code -> fn
  const upHandlers = new Map(); // code -> fn, for keys that are held (3: the shield)
  const down = new Set();
  const virtual = { forward: 0, right: 0, run: false }; // the touch joystick writes here
  let enabled = true;
  let muffled = false; // a cutscene owns the keys (ui/intro.js): none reach the game

  // Handlers always fire; the game decides what a key means in each mode.
  const fire = (code, e) => { down.add(code); handlers.get(code)?.(e); };
  const release = (code, e) => { if (!down.delete(code)) return; upHandlers.get(code)?.(e); };

  // the right button uses a tool: never open the browser's menu
  addEventListener('contextmenu', (e) => e.preventDefault());

  addEventListener('keydown', (e) => {
    if (muffled) return;
    if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    fire(e.code, e);
  });
  addEventListener('keyup', (e) => release(e.code, e));
  // the window loses focus mid-hold: let go of everything
  addEventListener('blur', () => { for (const code of [...down]) release(code); });

  return {
    // keyboard movement is gone (click to move); only the touch stick moves
    get move() {
      if (!enabled) return { forward: 0, right: 0, run: false };
      return { forward: virtual.forward, right: virtual.right, run: virtual.run };
    },
    on(code, fn) { handlers.set(code, fn); },
    onUp(code, fn) { upHandlers.set(code, fn); },
    trigger: fire,
    release,
    held: (code) => down.has(code),
    virtual,
    set enabled(v) { enabled = v; },
    set muffled(v) { muffled = v; if (v) for (const code of [...down]) release(code); },
    get muffled() { return muffled; },
    get enabled() { return enabled; },
  };
}
