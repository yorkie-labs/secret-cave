import * as THREE from 'three';

// Name tags from the nose: when the hero sniffs, every pickup and usable thing
// the scent wave reaches gets a name tag for a few seconds (Diablo II's item
// labels, earned by sniffing). Click a tag to walk there and take or use it.
const RANGE = 30;

export function setupLabels(G) {
  const root = document.createElement('div');
  root.id = 'labels';
  document.body.appendChild(root);
  const pool = [];
  const v = new THREE.Vector3();

  function tag(i) {
    if (!pool[i]) {
      const el = document.createElement('button');
      el.className = 'label';
      root.appendChild(el);
      pool[i] = el;
    }
    return pool[i];
  }

  G.onUpdate(() => {
    let n = 0;
    const scent = G.scent;
    if (scent && G.mode === 'play' && G.time < scent.until) {
      const pp = G.player.position;
      const put = (pos, text, cls, onClick) => {
        if (pos.distanceTo(pp) > RANGE) return;
        v.copy(pos).project(G.camera);
        if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return;
        const el = tag(n++);
        el.textContent = text;
        el.className = `label ${cls}`;
        el.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
        el.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
        el.style.display = '';
        el.onmousedown = (e) => { e.stopPropagation(); onClick(); };
      };
      for (const t of scent.targets) {
        if (G.time < t.at) continue; // the wave has not reached it yet
        if (t.pickup) {
          const p = t.pickup;
          if (!p.alive) continue;
          put(p.model.position.clone().setY(p.model.position.y + 0.6), p.name, 'item', () => G.pointer.goTo(p.model.position));
        } else if (t.it.enabled()) {
          const ip = typeof t.it.pos === 'function' ? t.it.pos() : t.it.pos;
          const text = typeof t.it.label === 'function' ? t.it.label() : t.it.label;
          if (text) put(ip.clone().setY(ip.y + 1.6), text, 'use', () => G.pointer.useIt(t.it));
        }
      }
    }
    for (let i = n; i < pool.length; i++) pool[i].style.display = 'none';
  });
}
