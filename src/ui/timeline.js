// What every cutscene's schedule shares (the intro, GDD §2.1; the ending,
// GDD §2.3): scenes back to back, subtitle lines typed out softly, sound
// cues, and how a click or Space moves on. Pure (no three.js, no DOM): each
// cutscene's own timeline (ui/introTimeline.js, ui/endingTimeline.js) is
// data plus these, unit-tested (test/intro.test.js, test/ending.test.js).
// Times are seconds from the start; everything on screen is a function of
// one clock, so moving on a line, or skipping, is just moving the clock.

export const TYPE_RATE = 22; // characters a second: a soft typewriter

// The scene playing at time t (its index), clamped to the last.
export function sceneIn(scenes, t) {
  let i = 0;
  while (i < scenes.length - 1 && t >= scenes[i].end) i++;
  return i;
}

// The line on screen at time t (its index), or -1 between lines.
export function lineIn(lines, t) {
  return lines.findIndex((l) => t >= l.at && t < l.end);
}

// How many characters of a line the typewriter shows at time t.
export function typedCount(line, t) {
  const n = [...line.text].length;
  return Math.max(0, Math.min(n, Math.floor((t - line.at) * TYPE_RATE + 1e-9)));
}

// The time when a line is fully typed.
export const typedAt = (line) => line.at + [...line.text].length / TYPE_RATE;

// A click or Space: a line still typing is finished at once; a typed line
// (or a gap) jumps to the start of the next line, or of the next `stop` (a
// moment without words worth landing on: the ending's credits); after the
// last, to `end` (where the fade out begins). Never earlier than t.
export function advanceIn(t, lines, end, stops = []) {
  const i = lineIn(lines, t);
  if (i >= 0 && t < typedAt(lines[i]) - 1e-6) return typedAt(lines[i]);
  const next = [...lines.map((l) => l.at), ...stops].filter((at) => at > t + 1e-6 && at < end);
  return next.length ? Math.min(...next) : Math.max(t, end);
}

// The cues between two times (t0, t1]. A jump forward (a click, Space)
// plays only the cues of the last moment, not every sound skipped over;
// a music cue is never lost (the latest one passed is kept).
export function cuesIn(t0, t1, cues, stale = 0.35) {
  const passed = cues.filter((c) => c.at > t0 && c.at <= t1);
  if (t1 - t0 <= stale) return passed;
  const music = passed.filter((c) => c.cue.startsWith('music:')).at(-1);
  const fresh = passed.filter((c) => !c.cue.startsWith('music:') && c.at > t1 - stale);
  return music ? [music, ...fresh] : fresh;
}

// A smooth 0→1 between two times (for the 3D side: walks, fades, camera moves).
export function ramp(t, a, b) {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
}
