// The intro cutscene's schedule (GDD §2.1, tasks/20261105-intro-cutscene-todo.md):
// six scenes, the subtitle lines, the sound cues, and how a click or Space
// moves on. Pure (no three.js, no DOM), so it is unit-tested
// (test/intro.test.js); src/ui/intro.js plays it. Times are seconds from the
// start. Everything on screen is a function of this one clock, so moving on
// a line, or skipping, is just moving the clock.
import { sceneIn, lineIn, advanceIn, cuesIn } from './timeline.js';

export const INTRO_SCENES = [
  { id: 'forest', start: 0, end: 7 }, // 1. a sunny forest, the Maltese walking
  { id: 'tracks', start: 7, end: 13.5 }, // 2. strange glowing footprints: sniff, follow
  { id: 'cave', start: 13.5, end: 19.5 }, // 3. a huge cave mouth: "멍? 여기는 어디지?"
  { id: 'fall', start: 19.5, end: 26.5 }, // 4. 쿠구구궁! the ground gives way, the fall
  { id: 'dark', start: 26.5, end: 34 }, // 5. darkness, SOS, eyes in the dark
  { id: 'tools', start: 34, end: 42.5 }, // 6. the hammer and the water gun: "좋아!"
];
export const INTRO_LENGTH = 42.5;
export const FADE_OUT = 1.1; // s: the last stretch fades to black, then the game

// `say`: the dog speaks (a speech line, drawn warmer); otherwise narration.
export const INTRO_LINES = [
  { at: 0.6, end: 6.6, text: '아주 먼 지구 어딘가에… 용감한 몰티즈가 살고 있었어요.' },
  { at: 7.3, end: 10.6, text: '어느 날, 땅 위에서 이상한 발자국을 발견했어요.' },
  { at: 10.7, end: 13.4, text: '킁킁… 몰티즈는 발자국을 따라갔어요.' },
  { at: 13.8, end: 16.6, text: '발자국 끝에는 거대한 동굴 입구가 있었어요.' },
  { at: 16.8, end: 19.4, text: '멍? 여기는 어디지?', say: true },
  { at: 20.1, end: 22.6, text: '쿠구구궁!', say: true, big: true },
  { at: 22.7, end: 26.3, text: '땅이 무너지고, 몰티즈는 깊은 땅속으로 떨어졌어요!' },
  { at: 27.4, end: 30.0, text: '멍멍! 누구 없어요? 도와주세요!', say: true },
  { at: 30.2, end: 33.8, text: '…아무도 대답하지 않았어요. 어둠 속에서 눈들만 반짝였어요.' },
  { at: 34.3, end: 37.4, text: '그때, 바닥에 낡은 망치와 물총이 보였어요.' },
  { at: 37.6, end: 41.4, text: '좋아! 반드시 여기서 나갈 거야!', say: true },
];

// Sound cues (names in audio/sound.js `sfx`, or `music:<mood>`), by time.
export const INTRO_CUES = [
  { at: 0, cue: 'music:introDay' },
  { at: 1.2, cue: 'chirp' }, { at: 4.1, cue: 'chirp' },
  { at: 7.6, cue: 'glimmer' },
  { at: 8.4, cue: 'sniff' }, { at: 9.4, cue: 'sniff' },
  { at: 12.2, cue: 'chirp' },
  { at: 13.6, cue: 'music:introCave' },
  { at: 17.0, cue: 'bark' },
  { at: 19.9, cue: 'music:' }, { at: 20.0, cue: 'quake' }, { at: 20.9, cue: 'rumble' }, { at: 21.8, cue: 'quake' },
  { at: 22.4, cue: 'rockFall' }, { at: 22.5, cue: 'whoosh' }, { at: 23.6, cue: 'whoosh' },
  { at: 26.2, cue: 'land' },
  { at: 26.8, cue: 'music:introDark' },
  { at: 27.6, cue: 'bark' }, { at: 28.6, cue: 'bark' },
  { at: 30.6, cue: 'twinkle' }, { at: 31.8, cue: 'twinkle' }, { at: 33.0, cue: 'twinkle' },
  { at: 34.4, cue: 'glimmer' },
  { at: 36.1, cue: 'item' },
  { at: 37.7, cue: 'music:introBrave' }, { at: 37.8, cue: 'star' },
];

// (the shared rules: ui/timeline.js)
export { TYPE_RATE, typedCount, typedAt, ramp } from './timeline.js';

// The scene playing at time t (its index), clamped to the last.
export const sceneAt = (t) => sceneIn(INTRO_SCENES, t);

// The line on screen at time t (its index), or -1 between lines.
export const lineAt = (t, lines = INTRO_LINES) => lineIn(lines, t);

// A click or Space: a line still typing is finished at once; a typed line
// (or a gap) jumps to the start of the next line; after the last line, to
// the fade at the end. Returns the new time (never earlier than t).
export const advance = (t, lines = INTRO_LINES) => advanceIn(t, lines, INTRO_LENGTH - FADE_OUT);

// The cues between two times (t0, t1]. A jump forward (a click, Space)
// plays only the cues of the last moment, not every sound skipped over;
// a music cue is never lost (the latest one passed is kept).
export const cuesBetween = (t0, t1, cues = INTRO_CUES, stale = 0.35) => cuesIn(t0, t1, cues, stale);

// The whole schedule, for the player (ui/cutscene.js)
export const INTRO_TIMELINE = { scenes: INTRO_SCENES, lines: INTRO_LINES, cues: INTRO_CUES, length: INTRO_LENGTH, fadeOut: FADE_OUT };
