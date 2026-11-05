import * as THREE from 'three';
import { save, markSeen, recordFinalWin } from './state.js';
import { sfx } from '../audio/sound.js';
import { carryDamage, takeDamage } from '../combat/hits.js';
import { resetRun } from './run.js';
import { codexMilestones } from './growth.js';
import { CODEX_IDS } from '../data/codex.js';
import { COMBO } from '../combat/combos.js';

// The shared game context ("G"): registries for everything the player can
// touch, hit, pick up or walk into, plus events and dialogue. Room builders
// fill the registries; the main loop calls G.update.
//
// `state` is the persistent save (core/state.js); `run` is this run only
// (core/run.js: hearts, water, crystal shards).
export function createGame({ scene, camera, renderer, look, physics, state, run, input, hud }) {
  const listeners = new Map();
  let sayQueue = Promise.resolve();
  const G = {
    scene, camera, renderer, look, physics, state, run, input, hud,
    mode: 'title',
    time: 0,
    player: null,
    cam: null,
    spawn: null,
    interactables: [],
    pickups: [],
    hittables: [],
    triggers: [],
    enemies: [],
    updaters: [],
    poisonZones: [], // M6a: poison clouds and puddles (entities/mushrooms.js)
    washables: [], // M6a: what the water gun washes (poison)

    on(name, fn) { (listeners.get(name) ?? listeners.set(name, []).get(name)).push(fn); },
    emit(name, data) { for (const fn of listeners.get(name) ?? []) fn(data); },

    refresh() {
      save(state);
      hud.update(run);
      G.emit('progress');
    },

    addInteractable(o) { G.interactables.push({ radius: 1.8, enabled: () => true, ...o }); return o; },
    addHittable(o) { G.hittables.push({ radius: 0.8, ...o }); return o; },
    addTrigger(o) { G.triggers.push({ radius: 3, once: true, inside: false, ...o }); return o; },

    // Glows (crystals, mushrooms, the hero's own soft light). A fixed pool of
    // real lights follows the sources nearest the hero, so shaders never
    // recompile and the cave stays within 8 lights (GDD §10.5).
    lightSources: [],
    addLight({ pos, color = '#ffb062', intensity = 6, distance = 10, flicker = 0 }) {
      const src = { pos, color: new THREE.Color(color), intensity, distance, flicker, on: true };
      G.lightSources.push(src);
      return src;
    },
    addEnemy(e) { e.index = G.enemies.length; G.enemies.push(e); return e; },
    // the world runs in play and through dialogues and cutscenes; menus pause it
    running() { return G.mode === 'play' || G.mode === 'dialog' || G.mode === 'cutscene'; },
    ticking() { return G.mode === 'play'; },
    onUpdate(fn) { G.updaters.push(fn); },

    // Scopes: everything a build adds (scene objects, physics bodies,
    // lights, usable things, animals, per-frame updaters) is remembered, so
    // it can all be taken away again (world/expedition.js: a boss's arena,
    // an expedition's animals).
    beginScope() {
      const s = { before: new Set(scene.children), lists: {}, bodies: [] };
      for (const k of SCOPED) s.lists[k] = new Set(G[k]);
      physics.collect(s.bodies);
      return s;
    },
    endScope(s) {
      physics.collect(null);
      s.objects = scene.children.filter((o) => !s.before.has(o));
      s.added = Object.fromEntries(SCOPED.map((k) => [k, G[k].filter((x) => !s.lists[k].has(x))]));
      delete s.before; delete s.lists;
      return s;
    },
    // what scope `s` gathered, handed to `into` (release: an expedition's
    // animals made later, when their models have come, go with it)
    mergeScope(into, s) {
      into.objects.push(...s.objects);
      into.bodies.push(...s.bodies);
      for (const k of SCOPED) into.added[k].push(...s.added[k]);
      return into;
    },
    disposeScope(s) {
      for (const k of SCOPED) {
        const gone = new Set(s.added[k]);
        const keep = G[k].filter((x) => !gone.has(x));
        G[k].length = 0; G[k].push(...keep); // in place: others hold the arrays
      }
      G.enemies.forEach((e, i) => { e.index = i; });
      // lights switched off for good (picked-up shards, taken loot) go too
      const lit = G.lightSources.filter((l) => l.on || l.keep);
      G.lightSources.length = 0; G.lightSources.push(...lit);
      poolTimer = 0; // hand the real lights out again on the next frame
      for (const o of s.objects) {
        scene.remove(o);
        // (re-uploaded if a shared one is drawn again; W7: an animal's
        // skeleton holds a bone texture of its own, which leaked every
        // expedition: ~50 textures a round trip)
        o.traverse((m) => { m.geometry?.dispose(); m.skeleton?.dispose(); });
      }
      for (const b of s.bodies) for (const h of physics.remove(b)) G.invisibleColliders?.delete(h);
      s.objects = []; s.bodies = []; s.added = {};
    },

    // A floating collectible. `canCollect()`: may it be taken now (else
    // `onBlocked()` while the hero stands on it); `step(dt)`: moves it (loot
    // flying out of a chest).
    addPickup({ model, pos, radius = 0.9, hidden = false, onCollect, onRemove, onBlocked, canCollect, step, float = 0.5, name = '???', kind = 'item' }) {
      const p = { model, pos: pos.clone(), radius, hidden, onCollect, onRemove, onBlocked, canCollect, step, float, alive: true, t: Math.random() * 6, name, kind };
      model.position.copy(pos).setY(pos.y + float);
      scene.add(model);
      look.shadows(model);
      G.pickups.push(p);
      return p;
    },

    // Take a pickup without walking onto it (a cleared room's leftovers when
    // the hero leaves: M4 review). Returns false if it may not be taken now.
    collectPickup(p) {
      if (!p.alive || (p.canCollect && !p.canCollect())) return false;
      p.alive = false;
      scene.remove(p.model);
      p.onCollect?.(p);
      return true;
    },

    // Pickups that go away without being taken (a new run clears the shards).
    removePickups(test) {
      for (const p of G.pickups) if (p.alive && test(p)) { p.alive = false; scene.remove(p.model); p.onRemove?.(p); }
      G.pickups = G.pickups.filter((p) => p.alive);
    },

    // The hammer lands (combat/items/hammer.js: a cone in front of the hero).
    hammerHit() { return G.hammer.strike(); },

    hurtPlayer(from, amount = 0.5) {
      if (!G.ticking()) return false;
      return G.player.hurt(from, amount);
    },

    // Dialogues queue up: one that starts while another is open waits its
    // turn instead of replacing it (and leaving the first one hanging).
    say(lines) {
      const go = () => new Promise((resolve) => {
        G.mode = 'dialog';
        input.enabled = false;
        hud.dialog(lines, () => { G.settle(); resolve(); });
      });
      sayQueue = sayQueue.then(go, go);
      return sayQueue;
    },
    toast(text, ms) { hud.toast(text, ms); },

    // One place decides the mode after anything ends (a dialogue, a menu, a
    // cutscene): an open dialogue wins, then a running cutscene, then a menu,
    // else play. Nothing restores a remembered mode, so nothing gets stuck.
    cutscenes: 0,
    beginCutscene() { G.cutscenes++; G.settle(); },
    endCutscene() { G.cutscenes = Math.max(0, G.cutscenes - 1); G.settle(); },
    settle() {
      if (G.mode === 'title' || G.mode === 'ending' || G.mode === 'result') return;
      G.mode = hud.inDialog ? 'dialog' : G.cutscenes > 0 ? 'cutscene' : G.screens?.menuOpen || G.screens?.shopOpen || G.screens?.codexOpen || G.screens?.altarOpen ? 'menu' : 'play';
      input.enabled = G.mode === 'play';
    },

    sniff(origin) {
      // GDD §4.1 (1): a scent wave rolls out from the hero; each collectible
      // (even a hidden one) and each usable thing it reaches sparkles and
      // shows its name tag for a while (ui/labels.js).
      sniffRings(origin);
      const now = G.time;
      const targets = [];
      for (const p of G.pickups) {
        const d = p.model.position.distanceTo(origin);
        if (p.alive && d <= SNIFF_RANGE) targets.push({ pickup: p, at: now + (d / SNIFF_RANGE) * SNIFF_TIME });
      }
      for (const it of G.interactables) {
        if (!it.enabled()) continue;
        const ip = typeof it.pos === 'function' ? it.pos() : it.pos;
        const d = ip.distanceTo(origin);
        if (d <= SNIFF_RANGE) targets.push({ it, at: now + (d / SNIFF_RANGE) * SNIFF_TIME });
      }
      G.scent = { targets, until: now + SNIFF_TIME + 7 };
      const found = targets.length;
      setTimeout(() => G.toast(found ? `킁킁… 근처에 ${found}개의 냄새가 나요!` : '킁킁… 근처엔 아무것도 없어요'), SNIFF_TIME * 1000);
    },

    update(dt) {
      G.time += dt;
      if (G.mode === 'play') run.time += dt;
      const pp = G.player.position;

      // pickups: bob, spin, collect on touch
      for (const p of G.pickups) {
        if (!p.alive) continue;
        p.t += dt;
        p.step?.(dt);
        p.model.visible = !p.hidden;
        // (x, z follow pos too: a chest's loot arcs out, the magnet pulls shards in)
        p.model.position.set(p.pos.x, p.pos.y + p.float + Math.sin(p.t * 2.5) * 0.08, p.pos.z);
        p.model.rotation.y += dt * 1.6;
        // the scent wave reaches it: uncover it
        const scentHit = G.scent?.targets.find((t) => t.pickup === p);
        if (scentHit && !scentHit.done && G.time >= scentHit.at) { scentHit.done = true; p.hidden = false; }
        if (G.mode === 'play' && Math.hypot(pp.x - p.model.position.x, pp.z - p.model.position.z) < p.radius
          && Math.abs(pp.y + 0.4 - p.model.position.y) < 2.6) {
          if (p.canCollect && !p.canCollect()) { p.onBlocked?.(p); continue; }
          p.alive = false;
          scene.remove(p.model);
          G.player.act('pickup');
          p.onCollect?.(p);
          G.refresh();
        }
      }
      G.pickups = G.pickups.filter((p) => p.alive);

      // triggers
      for (const t of G.triggers) {
        if (t.done) continue;
        // a disabled trigger counts as "outside", so enabling it while the
        // hero stands in it fires straight away
        const on = !t.enabled || t.enabled();
        const inside = on && (t.test ? t.test(pp) : Math.hypot(pp.x - t.pos.x, pp.z - t.pos.z) < t.radius);
        if (inside && !t.inside && G.mode === 'play') {
          t.onEnter?.();
          if (t.once) t.done = true;
        }
        t.inside = inside && G.mode === 'play' ? true : inside && t.inside;
      }

      // nearest interactable shows a prompt
      let near = null, nd = Infinity;
      if (G.mode === 'play') {
        for (const it of G.interactables) {
          if (!it.enabled()) continue;
          const ip = typeof it.pos === 'function' ? it.pos() : it.pos;
          const d = Math.hypot(pp.x - ip.x, pp.z - ip.z);
          if (d < it.radius && d < nd && Math.abs(pp.y - ip.y) < 3) { near = it; nd = d; }
        }
      }
      G.nearInteractable = near;
      hud.prompt(near ? `${G.touch ? '✋' : 'Space'} ${typeof near.label === 'function' ? near.label() : near.label}` : null);

      // far-away animals doze (the open cave map: dungeon.js wakes them)
      if (G.mode === 'play') for (const e of G.enemies) { if (e.dormant) e.doze?.(dt); else e.update(dt); }
      updateLightPool(dt);
      for (const fn of G.updaters) fn(dt);
    },

    interact() {
      const it = G.nearInteractable;
      if (!it || G.mode !== 'play') return;
      G.player.act('interact');
      it.action();
    },

    // Called on 'hurt' events: lose hearts (half-heart steps), maybe faint.
    // M6a: an area's damage × (GDD §8.5) can leave less than half a heart
    // over; it is carried to the next hit (combat/hits.js carryDamage).
    onHurt(amount) {
      const r = carryDamage(amount, run.hurtCarry ?? 0);
      run.hurtCarry = r.carry;
      // W3: armour's blue hearts go first
      const t = takeDamage(run.hearts, run.armor ?? 0, r.hearts);
      if (t.armor < (run.armor ?? 0)) G.emit('armorHit', { left: t.armor });
      run.hearts = t.hearts; run.armor = t.armor;
      hud.update(run);
      if (run.hearts === 0) G.faint();
    },

    // Out of hearts (GDD §8.2, §12): the hero topples over and falls asleep,
    // then the result screen: how the run went and what was new.
    fainted: false,
    async faint() {
      if (G.fainted) return;
      G.fainted = true;
      if (G.screens?.menuOpen) G.screens.closeMenu();
      G.beginCutscene();
      G.emit('faint');
      await new Promise((r) => setTimeout(r, 1600));
      if (!G.fainted) return;
      G.showResult(false);
    },

    // Out of the cave (M5: after the ending): the win goes in the save once,
    // with a star the first time the boss is beaten (core/state.js).
    winRun() {
      if (run.won) return run.won;
      // (W4: in the big world, out into the sunlight after the Crystal King)
      run.won = recordFinalWin(state);
      save(state);
      return run.won;
    },

    // The run is won: the result screen (M5: after the escape and the ending).
    victory() {
      if (G.mode === 'result') return;
      if (G.screens?.menuOpen) G.screens.closeMenu();
      G.winRun();
      G.player.act('victory');
      sfx.fanfare();
      G.emit('victory');
      G.showResult(true);
    },

    showResult(victory) {
      G.mode = 'result'; // the world holds still behind the screen
      G.map?.toggle(false);
      input.enabled = false;
      save(state); // the codex stays; the run's items and shards are gone (GDD §8.2)
      G.screens?.showResult(run, { victory });
    },

    // The codex (GDD §8.4): the first time ever the hero meets an animal or
    // gets an item, it goes in the save and on this run's "새로 발견한 것".
    discover(id) {
      if (!markSeen(state, id)) return false;
      run.found.push(id);
      // W5: half of the codex, and all of it: a star each (core/growth.js)
      for (const m of codexMilestones(state, CODEX_IDS)) {
        setTimeout(() => G.toast(m === 'all' ? '📖 도감을 모두 채웠어요! 별 하나! ⭐' : '📖 도감을 반이나 채웠어요! 별 하나! ⭐', 3200), 1400);
        G.emit('codexMilestone', m);
      }
      save(state);
      G.emit('discovered', id);
      return true;
    },

    // W5: an item combo went off (combat/combos.js, GDD §6.6): "콤보!" over
    // the hero, a jingle, the codex remembers it (state.combos)
    itemCombo(id) {
      const c = COMBO[id];
      if (!c) return;
      const first = !state.combos?.[id];
      state.combos = { ...state.combos, [id]: true };
      sfx.combo?.();
      hud.comboPop?.(`콤보! ${c.icon} ${c.name}`);
      if (first) G.toast(`✨ 새 콤보: ${c.name} — ${c.text}`, 3600);
      G.emit('combo', { id, first, at: G.time });
    },

    // 다시 하기: a fresh run in place: a new seed (or the given one: 같은
    // 동굴 다시, checks), the starting bag, from the cave's entrance (M4's
    // generated cave) or the first room (M1's fixed layout, ?layout=m1).
    restartRun({ seed } = {}) {
      resetRun(run, seed ?? G.fixedSeed);
      state.runs++;
      G.fainted = false;
      G.cutscenes = 0;
      G.removePickups((p) => p.kind === 'shard' || p.kind === 'loot');
      G.hammer?.reset();
      for (const t of Object.values(G.tools ?? {})) t.reset?.();
      G.shield?.reset();
      const s = G.player.state;
      s.action = null; s.cooldown = 0; s.invulnerable = 0; s.swingWait = 0; s.shield = false;
      G.pointer?.cancel();
      // (the test world: its animals and chests as they were, from its start)
      for (const e of G.enemies) e.reset?.();
      for (const c of G.chests ?? []) c.reset();
      if (G.spawn) G.player.teleport(G.spawn, Math.PI / 4);
      G.screens?.hideResult();
      G.hud.fade(false);
      G.mode = 'play';
      G.settle();
      G.cam?.snap(G.player.position);
      G.startRun?.();
      G.refresh();
    },
  };
  const pool = Array.from({ length: 8 }, () => {
    const l = new THREE.PointLight('#ffffff', 0, 10, 2);
    scene.add(l);
    return l;
  });
  let poolTimer = 0, assigned = [];
  function updateLightPool(dt) {
    poolTimer -= dt;
    const pp = G.player.position;
    const at = (src) => (typeof src.pos === 'function' ? src.pos() : src.pos);
    if (poolTimer <= 0) {
      poolTimer = 0.25;
      assigned = G.lightSources.filter((s) => s.on)
        .map((s) => [s, at(s).distanceToSquared(pp)])
        .sort((a, b) => a[1] - b[1]).slice(0, pool.length).map(([s]) => s);
    }
    pool.forEach((l, i) => {
      const s = assigned[i];
      if (!s || !s.on) { l.intensity = 0; return; }
      l.position.copy(at(s));
      l.color.copy(s.color);
      l.distance = s.distance;
      l.intensity = s.intensity * (1 + (s.flicker ? Math.sin(G.time * 13 + i) * s.flicker + Math.sin(G.time * 7.3) * s.flicker * 0.7 : 0));
    });
  }

  // Two soft scent rings roll out from the hero to the edge of the sniffing
  // range and fade, so a child sees how far the nose reaches.
  const rings = [];
  function sniffRings(origin) {
    for (let k = 0; k < 2; k++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.975, 1, 96).rotateX(-Math.PI / 2), // a thin line, even at full size
        new THREE.MeshBasicMaterial({ color: '#fff27a', transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }),
      );
      ring.renderOrder = 6;
      ring.position.copy(origin).setY(origin.y + 0.15);
      scene.add(ring);
      rings.push({ ring, t: -k * 0.35, echo: k > 0 });
    }
  }
  G.onUpdate((dt) => {
    for (const r of rings) {
      r.t += dt;
      // the first ring moves at an even pace, so things light up exactly as it
      // passes them; the second trails behind as a softer echo
      const k = Math.min(1, Math.max(0, r.t) / SNIFF_TIME);
      r.ring.scale.setScalar(0.5 + k * (SNIFF_RANGE - 0.5));
      r.ring.material.opacity = r.t < 0 ? 0 : (r.echo ? 0.4 : 0.8) * (1 - k * k);
      if (k >= 1) { scene.remove(r.ring); r.ring.geometry.dispose(); r.ring.material.dispose(); r.done = true; }
    }
    for (let i = rings.length - 1; i >= 0; i--) if (rings[i].done) rings.splice(i, 1);
  });

  G.on('hurt', ({ amount }) => G.onHurt(amount));
  G.on('sniff', ({ pos }) => G.sniff(pos));
  return G;
}

// What a room scope keeps track of (G.beginScope).
const SCOPED = ['interactables', 'hittables', 'triggers', 'enemies', 'updaters', 'lightSources', 'groundMeshes', 'poisonZones', 'washables'];

// How far the nose reaches, and how long the scent wave takes to get there.
const SNIFF_RANGE = 10; // Island's final value (28 → 20 → 10 m at the director's request)
const SNIFF_TIME = 3.5;

export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
