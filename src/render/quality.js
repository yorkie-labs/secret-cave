// Perf pass (tasks/20261107-perf-todo.md): the three quality levels, how a
// page picks one, and the adaptive step down. Pure (no three.js): the tests
// read it directly (test/quality.test.js).
//
//   높음 high    the whole cozy look: AO (half res) + bloom + grade +
//                vignette, MSAA, a 2048 shadow map, at most 1.5 device
//                pixels per css pixel (a Retina screen drew 2 × 2 = 4 × the
//                pixels before: that, not the effects, was most of the cost)
//   중간 medium  no AO; bloom, grade, vignette; a 1024 shadow map; 1.25
//   낮음 low     grade + vignette only; a 1024 shadow map; 1 pixel per css pixel
//
// What the levels set (render/post.js `configure`, render/light.js, main.js):
// `pixelRatio` the most device pixels per css pixel, `msaa` samples, `ao`,
// `bloom`, `shadowMap` (texels a side), `shadows` (the key light casts).
export const LEVELS = ['high', 'medium', 'low'];
// (`msaa: 'auto'`: 4 samples on a 1× screen, 2 on a denser one — the
// pixels are smaller there, and it halves the multisampled buffer: msaaFor)
export const PRESETS = {
  high: { pixelRatio: 1.5, msaa: 'auto', ao: true, bloom: true, shadowMap: 2048, shadows: true },
  medium: { pixelRatio: 1.25, msaa: 'auto', ao: false, bloom: true, shadowMap: 1024, shadows: true },
  low: { pixelRatio: 1, msaa: 2, ao: false, bloom: false, shadowMap: 1024, shadows: true },
};

/** MSAA samples for a level's `msaa` at the pixel ratio drawn ('auto': 4 at 1×, 2 above). */
export function msaaFor(msaa, pixelRatio) {
  return msaa === 'auto' ? (pixelRatio > 1.01 ? 2 : 4) : msaa;
}
export const LABEL = { high: '높음', medium: '중간', low: '낮음' };

/** The pixel ratio a level draws at on a screen of `dpr` device pixels per css pixel. */
export function pixelRatioFor(level, dpr = 1, preset = PRESETS[level] ?? PRESETS.high) {
  return Math.max(0.5, Math.min(dpr || 1, preset.pixelRatio));
}

/** The level below (low stays low). */
export function lowerLevel(level) {
  const i = LEVELS.indexOf(level);
  return LEVELS[Math.min(LEVELS.length - 1, i < 0 ? 0 : i + 1)];
}

export const QUALITY_KEY = 'secret-cave-quality';
export const SMALL = 820; // css px: a touch screen whose short side is at most this is a phone / small tablet
const AUTO = 'auto:'; // (what the adaptive step down saved: not the player's own pick)

/**
 * The level a page starts with, and whether someone chose it (then the
 * adaptive step down leaves it alone):
 *   1. `?q=high|medium|low` in the address (checks, shared links): chosen
 *   2. what the menu's 화질 button saved in this browser: chosen
 *      (release saved 'high' / 'low' there already: still read)
 *   3. what the adaptive step down saved (`auto:medium`): a start, not chosen
 *   4. low on a phone or a small tablet (a touch screen whose short side is
 *      at most SMALL css px), else high: not chosen
 */
export function chooseQuality({ search = '', saved = null, touch = false, shortSide = Infinity } = {}) {
  const q = new URLSearchParams(search).get('q');
  if (LEVELS.includes(q)) return { level: q, chosen: true };
  if (LEVELS.includes(saved)) return { level: saved, chosen: true };
  if (typeof saved === 'string' && saved.startsWith(AUTO) && LEVELS.includes(saved.slice(AUTO.length))) return { level: saved.slice(AUTO.length), chosen: false };
  return { level: touch && shortSide <= SMALL ? 'low' : 'high', chosen: false };
}

/** What to keep in the browser for a level: the player's pick as is, the adaptive one marked. */
export function savedValue(level, chosen) {
  return chosen ? level : AUTO + level;
}

/**
 * The adaptive step down: after `warmup` s of play, the frame times of the
 * next `window` s; if their median is over `limitMs` (under ~50 fps), one
 * level down (then the same again at the new level, so a slow machine may
 * go high → medium → low); never up. Only play time counts: the title,
 * loading, menus, cutscenes and a hidden tab do not (`active` false), and
 * a frame longer than `gapMs` (a hitch, a tab coming back) is not a sample.
 * `frame(ms, active)` → 'down' when it is time to step down, else null.
 * Once a level runs well (or low is reached) it stops for good.
 */
export const ADAPT = { warmup: 5, window: 4, limitMs: 20, gapMs: 250, minSamples: 60 };
export function createAdaptive(level, opts = {}) {
  const o = { ...ADAPT, ...opts };
  const a = {
    level, done: level === LEVELS.at(-1), played: 0, samples: [],
    /** One frame: its time in ms and whether it counts (playing, tab shown). */
    frame(ms, active) {
      if (a.done || !active || !(ms > 0) || ms > o.gapMs) return null;
      a.played += ms / 1000;
      if (a.played <= o.warmup) return null;
      a.samples.push(ms);
      if (a.played < o.warmup + o.window || a.samples.length < o.minSamples) return null;
      const p50 = median(a.samples);
      a.samples = []; a.played = 0;
      if (p50 <= o.limitMs) { a.done = true; return null; }
      a.level = lowerLevel(a.level);
      if (a.level === LEVELS.at(-1)) a.done = true;
      a.last = p50;
      return 'down';
    },
    /** The player picked a level: the adaptive step down is over. */
    stop() { a.done = true; },
  };
  return a;
}

export function median(list) {
  const s = [...list].sort((x, y) => x - y);
  const n = s.length;
  if (!n) return 0;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
