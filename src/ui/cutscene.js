import * as THREE from 'three';
import { loadModels, isKept } from '../world/models.js';
import { sfx, setMusic } from '../audio/sound.js';
import { PRESETS } from '../render/quality.js';
import { sceneIn, lineIn, typedCount, advanceIn, cuesIn } from './timeline.js';
import { disposeSet } from './cutsceneSet.js';

// The cutscene player both stories share (the intro, ui/intro.js; the
// ending, ui/ending.js): a set of its own drawn by the game's renderer while
// the world waits (the main loop hands its frames to `story.view`), letterbox
// bars, subtitles in Jua with a soft typewriter, 건너뛰기 ▶▶ (and Esc) at any
// time, a click / tap / Space / Enter moving on a line. Everything on screen
// is a function of one clock `t` (the cutscene's timeline, ui/timeline.js),
// so a click and skipping are just moves of the clock. When it ends the set
// is let go of entirely (cutsceneSet.js disposeSet).
//
// `opts`:
//   hook      the debug controller's name on G (G.intro, G.outro)
//   timeline  { scenes, lines, cues, length, fadeOut, stops? }
//   models    the Polyfork models the set needs (fetched now if not here)
//   build(renderer, keep, { shadowMap })  → the set (cutsceneSet.js createKit's kit and more)
//   pose(set, t, dt, camera)   the set and the camera at time t
//   fade(t)   black over the picture (0..1): in, between shots, out
//   walking(t)  true while footsteps should sound
//   frame(set, t, ui)  anything else on the page at time t (the ending's
//             light, credits, numbers); `ui` holds the overlay's elements
//   where(set)  extra debug numbers for the controller
//   className a class on #intro while it plays (its own look)
const $ = (id) => document.getElementById(id);
let hideTimer = 0, lastClass = null; // (the overlay hides a moment after one ends: not over the next one)

export function playCutscene(G, story, opts) {
  const { hook, timeline: tl, models, build, pose, fade, walking = () => false, frame = null, where = null, className = null } = opts;
  const el = $('intro'), line = $('intro-line'), title = $('intro-title'), black = $('intro-black'), skipBtn = $('intro-skip');
  const ui = { el, line, title, black, white: $('intro-white'), credits: $('intro-credits'), stats: $('intro-stats') };
  const renderer = G.renderer;
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 400);
  const end0 = tl.length - tl.fadeOut; // (where the last click lands: the fade out)
  let set = null, t = -1e-3, prevT = -1e-3, ended = false, finishing = 0, lastLine = -2, stepTimer = 0;
  const seen = { scenes: [], lines: [] };
  let resolve;
  const done = new Promise((r) => { resolve = r; });

  // the letterbox: a wide picture in landscape, a tall one on an upright phone
  let barPx = -1;
  const layout = () => {
    const W = innerWidth, H = innerHeight;
    const aspect = W > H ? 2.1 : 0.82;
    const bar = Math.round(Math.max(H * 0.085, 42, (H - W / aspect) / 2)); // (≥ 42 px: room for 건너뛰기 on a phone lying down)
    if (bar !== barPx) { barPx = bar; el.style.setProperty('--bar', `${bar}px`); }
    return { W, H, bar };
  };
  const frameCamera = () => {
    const { W, H, bar } = layout();
    const picH = H - bar * 2, a = W / picH;
    // keep about 64° across in landscape; upright, at least 50° across (more of the sky and the floor)
    const hf = THREE.MathUtils.degToRad(a >= 1 ? 64 : 52);
    let vf = 2 * Math.atan(Math.tan(hf / 2) / a);
    vf = Math.min(vf, THREE.MathUtils.degToRad(78));
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(vf / 2) * H / picH));
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  };

  const v3 = (o) => o.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2));
  const controller = {
    get t() { return t; },
    get scene() { return tl.scenes[sceneIn(tl.scenes, Math.max(0, t))].id; },
    get sceneIndex() { return sceneIn(tl.scenes, Math.max(0, t)); },
    get line() { return lineIn(tl.lines, t); },
    get text() { const l = tl.lines[lineIn(tl.lines, t)]; return l ? (l.title ? title : line).textContent : ''; },
    get ready() { return !!set; },
    get playing() { return !ended; },
    seen,
    hold: false, // (checks: freeze the clock for a screenshot)
    next() { if (set && !finishing) { t = Math.min(tl.length, advanceIn(t, tl.lines, end0, tl.stops)); sfx.click(); } },
    skip() { if (!finishing) finish(0.35); },
    seek(to) { if (set && !finishing) t = Math.max(0, Math.min(tl.length - 0.01, to)); }, // (checks, screenshots)
    info() { return G.renderer.info.memory; },
    where() {
      return set && { cam: camera.position.toArray().map((v) => +v.toFixed(2)), dog: set.dog.position.toArray().map((v) => +v.toFixed(2)), heading: +set.dog.rotation.y.toFixed(2), action: set.action, hand: v3(set.rig.hand), handL: v3(set.rig.gun), hammer: v3(set.rig.hammer), head: v3(set.rig.head), ...where?.(set) };
    },
    done,
  };

  function finish(fadeS) {
    if (finishing) return;
    finishing = performance.now() + fadeS * 1000;
    black.style.transition = `opacity ${fadeS}s`;
    black.style.opacity = '1';
  }

  // input: Esc skips; Space, Enter, → or a click/tap moves on a line
  const onKey = (e) => {
    if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); controller.skip(); }
    else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) controller.next(); }
    else e.stopImmediatePropagation(); // (no game keys underneath: 1–4, Tab, Q…)
  };
  const onClick = (e) => { if (e.target === skipBtn || e.target.closest?.('a')) return; controller.next(); };
  skipBtn.onclick = (e) => { e.stopPropagation(); sfx.click(); controller.skip(); };
  addEventListener('keydown', onKey, true);
  el.addEventListener('click', onClick);
  clearTimeout(hideTimer);
  G.input.muffled = true; // (Esc must not also open or close the menu underneath)
  document.body.classList.add('intro-on');
  el.classList.remove('hidden', 'leaving', ...(lastClass ? [lastClass] : []));
  if (className) el.classList.add(className);
  lastClass = className;
  el.classList.add('loading');
  black.style.transition = 'none';
  black.style.opacity = '1';
  line.textContent = ''; line.className = 'gone';
  title.textContent = ''; title.className = 'gone';
  layout();
  story.playing = true;
  G[hook] = controller;

  // the set needs a handful of Polyfork models: fetched now (they were
  // asked for ahead, so usually already here). The ones the game does not
  // keep for itself are this cutscene's own: let go of when it ends.
  const fresh = models.filter((k) => !isKept(k));
  loadModels(models).then(() => {
    if (ended) return;
    const q = PRESETS[G.quality] ?? PRESETS.high;
    set = build(renderer, fresh, { shadowMap: q.shadowMap });
    el.classList.remove('loading');
    renderer.compile(set.scene, camera);
  }).catch((err) => { console.warn(`${hook}: models did not load, straight on`, err); finish(0.2); });

  // one frame of the cutscene (called by the main loop instead of the game's)
  story.view = (dt) => {
    if (finishing && performance.now() >= finishing) { end(); return; }
    frameCamera();
    if (!set) { renderer.setClearColor('#000'); renderer.clear(); return; }
    if (!finishing && !controller.hold) t = Math.min(tl.length, t + dt);
    if (t >= tl.length && !finishing) finish(0.05);
    // sounds and music
    for (const c of cuesIn(prevT, t, tl.cues)) {
      if (c.cue.startsWith('music:')) setMusic(c.cue.slice(6) || null);
      else sfx[c.cue]?.();
    }
    const dtScene = Math.max(0, Math.min(0.1, t - prevT)) || dt;
    prevT = t;
    const sc = sceneIn(tl.scenes, t);
    if (seen.scenes.at(-1) !== tl.scenes[sc].id) { seen.scenes.push(tl.scenes[sc].id); G.emit?.(`${hook}Scene`, tl.scenes[sc].id); }
    subtitles();
    if (!finishing) black.style.opacity = String(fade(t));
    pose(set, t, dtScene, camera);
    frame?.(set, t, ui);
    // footsteps while walking
    stepTimer -= dtScene;
    if (walking(t) && stepTimer <= 0) { stepTimer = 0.32; sfx.step(); }
    set.look.update();
    // (K1: the game's post chain in its `plain` mode, render/post.js: the
    // same multisampled render, no AO, bloom, grade or vignette. With them
    // the sunny forest was a touch richer, but the dark room's spotlight
    // bloomed into a wide haze and the lifted blacks hid the watching
    // animals' silhouettes)
    if (G.post) G.post.render(dtScene, set.scene, camera, true);
    else renderer.render(set.scene, camera);
  };

  // the line on screen: typed part, then the rest kept invisible (the line
  // never jumps about); a `title` line sits big in the middle of the picture
  function subtitles() {
    const i = lineIn(tl.lines, t), l = tl.lines[i];
    if (i !== lastLine) {
      lastLine = i;
      line.className = i < 0 || l.title ? 'gone' : `${l.say ? 'say' : 'tell'}${l.big ? ' big' : ''}`;
      title.className = i >= 0 && l.title ? 'on' : 'gone';
      if (i >= 0 && !seen.lines.includes(i)) seen.lines.push(i);
      line.dataset.line = String(i);
    }
    if (i < 0) return;
    const out = l.title ? title : line, chars = [...l.text], n = typedCount(l, t);
    if (out.dataset.n !== String(n) || out.dataset.at !== String(i)) {
      out.dataset.n = String(n); out.dataset.at = String(i);
      out.innerHTML = `<span>${esc(chars.slice(0, n).join(''))}</span><i>${esc(chars.slice(n).join(''))}</i>`;
    }
  }

  function end() {
    if (ended) return;
    ended = true;
    removeEventListener('keydown', onKey, true);
    el.removeEventListener('click', onClick);
    skipBtn.onclick = null;
    G.input.muffled = false;
    story.view = null;
    setMusic(null);
    if (set) disposeSet(set, renderer);
    set = null;
    G[hook] = { ...controller, playing: false, seen, t, done };
    document.body.classList.remove('intro-on');
    story.playing = false;
    resolve();
    // the black lifts over whatever comes next (the cave, the menu, the result)
    line.className = 'gone'; title.className = 'gone';
    for (const k of ['white', 'credits', 'stats']) ui[k]?.classList.remove('on');
    el.classList.add('leaving');
    black.style.transition = 'opacity 0.7s';
    requestAnimationFrame(() => requestAnimationFrame(() => { black.style.opacity = '0'; }));
    hideTimer = setTimeout(() => { el.classList.add('hidden'); el.classList.remove('leaving', ...(className ? [className] : [])); }, 750);
  }
  return done;
}

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
