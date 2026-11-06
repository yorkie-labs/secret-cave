// The ending cutscene's schedule (GDD §2.3, tasks/20261107-ending-cutscene-todo.md):
// seven scenes, the subtitle lines, the sound cues, what the scenes show of
// the save, and the choices the daughter (the game's director) may change.
// Pure (no three.js, no DOM), so it is unit-tested (test/ending.test.js);
// src/ui/ending.js plays it. The mirror of the intro (ui/introTimeline.js):
// the intro goes from the sunny forest down into the dark, the ending comes
// from the dark back out into the sun, at the same cave mouth.
import { sceneIn, lineIn, advanceIn, cuesIn } from './timeline.js';

// ---- [call] placeholders: the daughter may change these (only here).
// Scene 2, the first thing the Maltese does in the sunlight (a pose in
// ui/ending.js and its line): 'stretch' (기지개), 'roll' (풀밭에서 데굴데굴),
// 'shake' (몸을 부르르).
export const FIRST_ACTIONS = {
  stretch: '따뜻한 햇살 아래에서 기지개를 쭈욱 켰어요.',
  roll: '따뜻한 풀밭에서 데굴데굴 굴렀어요.',
  shake: '몸에 묻은 동굴 먼지를 부르르 털었어요.',
};
export const ENDING_CHOICES = {
  firstAction: 'stretch',
  // scene 5: where it sets off to. For now the hill path into the sunset
  // (the way the intro came, on past the forest); the line says it.
  destinationLine: '그리고 다시 새로운 모험을 찾아 떠났어요.',
};
// (the credit lines themselves: data/credits.js)

export const ENDING_SCENES = [
  { id: 'light', start: 0, end: 4 }, // 1. into the light: running out of the tunnel, the screen fills with light
  { id: 'sunlight', start: 4, end: 11.5 }, // 2. the same cave mouth as the intro: blinking at the sun, "멍멍! 드디어 탈출했다!"
  { id: 'cave', start: 11.5, end: 18 }, // 3. turning back: a soft rumble, the cave mouth's purple glow fades
  { id: 'gathered', start: 18, end: 27 }, // 4. the hammer, the water gun, the bag put down; shards sparkle, the stars rise
  { id: 'setoff', start: 27, end: 33.5 }, // 5. off along the hill path at sunset, the camera rises to the sky
  { id: 'credits', start: 33.5, end: 44.5 }, // 6. the credits roll over the sunset forest
  { id: 'tease', start: 44.5, end: 50.5 }, // 7. the dark cave: a tiny purple shard glints. "THE END…?"
];
export const ENDING_LENGTH = 50.5;
export const ENDING_FADE_OUT = 0.9; // s: the last stretch fades to black, then the result

// `say`: the dog speaks (drawn warmer); `title`: big in the middle of the picture.
export const ENDING_LINES = [
  { at: 0.5, end: 3.4, text: '저기 빛이 보여! 조금만 더!', say: true },
  { at: 5.4, end: 8.2, text: '멍멍! 드디어 탈출했다!', say: true },
  { at: 8.4, end: 11.3, text: FIRST_ACTIONS[ENDING_CHOICES.firstAction] ?? FIRST_ACTIONS.stretch },
  { at: 11.9, end: 14.6, text: '그때, 땅이 우르르… 살짝 울렸어요.' },
  { at: 14.8, end: 17.8, text: '동굴의 보랏빛이 스르르 꺼지고, 이제는 평범한 동굴이 되었어요.' },
  { at: 18.4, end: 21.2, text: '몰티즈는 망치와 물총, 가방을 내려놓았어요.' },
  { at: 21.4, end: 26.6, text: '모은 수정 조각이 반짝반짝, 얻은 별들이 하늘로 올라갔어요!' },
  { at: 27.6, end: 32.8, text: ENDING_CHOICES.destinationLine },
  { at: 46.0, end: 49.6, text: 'THE END…?', title: true },
];
// moments without words that a click lands on (the credits, the tease)
export const ENDING_STOPS = [33.5, 44.5];

// Sound cues (names in audio/sound.js `sfx`, or `music:<mood>`), by time.
// The music: the escape's hush in the tunnel, a bright free theme in the
// sun, quiet while the cave changes, bright again for what was gathered,
// the calm credits theme (`ending`, also the result screen's) from the
// sunset on, a mysterious hush in the dark at the very end.
export const ENDING_CUES = [
  { at: 0, cue: 'music:' }, { at: 0.2, cue: 'whoosh' }, { at: 2.4, cue: 'sunrise' },
  { at: 4.0, cue: 'music:endingFree' },
  { at: 4.5, cue: 'chirp' }, { at: 5.95, cue: 'bark' }, { at: 6.8, cue: 'chirp' },
  { at: 8.6, cue: 'yawn' }, { at: 10.4, cue: 'chirp' },
  { at: 11.5, cue: 'music:' }, { at: 12.0, cue: 'rumble' }, { at: 12.4, cue: 'quake' },
  { at: 14.9, cue: 'dim' }, { at: 15.6, cue: 'music:calm' },
  { at: 18.2, cue: 'music:endingFree' }, { at: 18.9, cue: 'clink' }, { at: 19.6, cue: 'land' },
  { at: 20.4, cue: 'shard' }, { at: 21.2, cue: 'twinkle' }, { at: 22.4, cue: 'star' }, { at: 23.6, cue: 'star' }, { at: 24.4, cue: 'fanfare' },
  { at: 27.0, cue: 'music:ending' }, { at: 28.4, cue: 'chirp' },
  { at: 44.5, cue: 'music:endingTease' }, { at: 45.4, cue: 'twinkle' }, { at: 46.1, cue: 'glimmer' },
];

// The whole schedule, for the player (ui/cutscene.js)
export const ENDING_TIMELINE = { scenes: ENDING_SCENES, lines: ENDING_LINES, cues: ENDING_CUES, length: ENDING_LENGTH, fadeOut: ENDING_FADE_OUT, stops: ENDING_STOPS };

export const sceneAt = (t) => sceneIn(ENDING_SCENES, t);
export const lineAt = (t) => lineIn(ENDING_LINES, t);
export const advance = (t) => advanceIn(t, ENDING_LINES, ENDING_LENGTH - ENDING_FADE_OUT, ENDING_STOPS);
export const cuesBetween = (t0, t1, stale = 0.35) => cuesIn(t0, t1, ENDING_CUES, stale);

// ---- what the scenes show of the save (scene 4): the stars ever earned
// (`starsEarned`, core/growth.js: spent ones counted back in), the bosses
// put to sleep, the crystal shards in the bag, the whole game's play time.
export const BOSS_IDS = ['rabbitChief', 'mushroomQueen', 'iceBear', 'crystalKing'];
export const MAX_SHOWN = { stars: 14, shards: 12 }; // (3D pieces at most; the numbers say the rest)
export function endingStats(state, run, starsEarned) {
  const W = state.world ?? {};
  return {
    stars: starsEarned(state),
    bosses: BOSS_IDS.filter((id) => W.bosses?.[id]),
    shards: run?.shards ?? 0,
    time: Math.max(0, Math.floor(state.playTime ?? 0)),
  };
}
// How many of each the 3D scene shows: every boss a big star of its own, the
// rest small golden ones; a few shards always sparkle out of the bag (a bag
// that came home empty still holds a little light).
export function shownPieces({ stars, bosses, shards }) {
  const big = Math.min(bosses.length, MAX_SHOWN.stars);
  return { big, small: Math.max(0, Math.min(stars, MAX_SHOWN.stars) - big), shards: Math.max(3, Math.min(shards, MAX_SHOWN.shards)) };
}
// "1시간 2분" / "12분 30초": the time, in words a child reads
export function playTimeText(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h ? `${h}시간 ${m}분` : m ? `${m}분 ${s}초` : `${s}초`;
}
