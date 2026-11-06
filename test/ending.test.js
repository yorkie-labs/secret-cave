import { describe, it, expect } from 'vitest';
import {
  ENDING_SCENES, ENDING_LINES, ENDING_CUES, ENDING_LENGTH, ENDING_FADE_OUT, ENDING_STOPS, ENDING_CHOICES, FIRST_ACTIONS,
  sceneAt, lineAt, advance, cuesBetween, endingStats, shownPieces, playTimeText, BOSS_IDS,
} from '../src/ui/endingTimeline.js';
import { typedAt, typedCount } from '../src/ui/timeline.js';
import { starsEarned } from '../src/core/growth.js';
import { CREDITS } from '../src/data/credits.js';
import { MUSIC_MOODS, sfx } from '../src/audio/sound.js';
import { ENDING_MODELS, INTRO_MODELS } from '../src/ui/introModels.js';

describe('ending cutscene timeline (GDD §2.3)', () => {
  it('seven scenes back to back, 40–52 s in all', () => {
    expect(ENDING_SCENES.map((s) => s.id)).toEqual(['light', 'sunlight', 'cave', 'gathered', 'setoff', 'credits', 'tease']);
    ENDING_SCENES.forEach((s, i) => {
      expect(s.end).toBeGreaterThan(s.start);
      if (i) expect(s.start).toBe(ENDING_SCENES[i - 1].end);
    });
    expect(ENDING_SCENES[0].start).toBe(0);
    expect(ENDING_SCENES.at(-1).end).toBe(ENDING_LENGTH);
    expect(ENDING_LENGTH).toBeGreaterThanOrEqual(40);
    expect(ENDING_LENGTH).toBeLessThanOrEqual(52);
  });

  it('sceneAt walks through the scenes in order and clamps at the end', () => {
    expect(sceneAt(0)).toBe(0);
    expect(sceneAt(4)).toBe(1);
    expect(sceneAt(30)).toBe(4);
    expect(sceneAt(40)).toBe(5);
    expect(sceneAt(99)).toBe(6);
  });

  it('every line is on screen ≥ 2.5 s, typed a second before it goes, no overlaps, inside its scene', () => {
    ENDING_LINES.forEach((l, i) => {
      expect(l.end - l.at).toBeGreaterThanOrEqual(2.5);
      expect(typedAt(l)).toBeLessThan(l.end - 1);
      if (i) expect(l.at).toBeGreaterThanOrEqual(ENDING_LINES[i - 1].end);
      expect(l.end).toBeLessThanOrEqual(ENDING_LENGTH - ENDING_FADE_OUT + 0.01);
      expect(sceneAt(l.at)).toBe(sceneAt(l.end - 0.01)); // (a line never runs over a cut)
    });
  });

  it('the lines tell the ending; every scene but the credits has words', () => {
    const all = ENDING_LINES.map((l) => l.text).join(' ');
    for (const w of ['빛', '멍멍! 드디어 탈출했다!', '보랏빛', '망치와 물총', '별', '새로운 모험을 찾아 떠났어요', 'THE END…?']) expect(all).toContain(w);
    for (const s of ENDING_SCENES) if (s.id !== 'credits') expect(ENDING_LINES.some((l) => l.at >= s.start && l.at < s.end), s.id).toBe(true);
    expect(ENDING_LINES.at(-1).title).toBe(true);
    expect(ENDING_LINES.find((l) => l.text.includes('탈출했다')).say).toBe(true);
  });

  it('the placeholders: the first action has its line, the destination line is used', () => {
    expect(Object.keys(FIRST_ACTIONS)).toContain(ENDING_CHOICES.firstAction);
    expect(ENDING_LINES.map((l) => l.text)).toContain(FIRST_ACTIONS[ENDING_CHOICES.firstAction]);
    expect(ENDING_LINES.map((l) => l.text)).toContain(ENDING_CHOICES.destinationLine);
  });

  it('lineAt and typedCount', () => {
    expect(lineAt(0)).toBe(-1);
    expect(lineAt(6)).toBe(1);
    expect(lineAt(40)).toBe(-1); // (the credits: no subtitle)
    const l = ENDING_LINES.at(-1);
    expect(typedCount(l, l.at + 100)).toBe([...l.text].length);
  });

  it('advance: lines, then the credits and the tease (stops), then the fade', () => {
    const last = ENDING_LINES.findLast((l) => l.at < ENDING_STOPS[0]);
    expect(advance(typedAt(last) + 0.1)).toBe(ENDING_STOPS[0]); // after the last line: the credits
    expect(advance(ENDING_STOPS[0] + 1)).toBe(ENDING_STOPS[1]); // in the credits: the tease
    expect(advance(ENDING_STOPS[1] + 0.2)).toBe(ENDING_LINES.at(-1).at); // the tease: THE END…?
    expect(advance(typedAt(ENDING_LINES.at(-1)) + 0.1)).toBe(ENDING_LENGTH - ENDING_FADE_OUT);
    let t = 0, n = 0;
    const scenes = new Set();
    while (t < ENDING_LENGTH - ENDING_FADE_OUT && n < 100) { const nt = advance(t); expect(nt).toBeGreaterThan(t); t = nt; scenes.add(sceneAt(t)); n++; }
    expect(t).toBe(ENDING_LENGTH - ENDING_FADE_OUT);
    expect(scenes.size).toBe(ENDING_SCENES.length); // (pressing on and on still visits every scene)
  });

  it('cues: every one once in normal play, real sounds and moods only', () => {
    let t = -1e-3, got = [];
    while (t < ENDING_LENGTH) { const nt = t + 1 / 60; got.push(...cuesBetween(t, nt)); t = nt; }
    expect(got.length).toBe(ENDING_CUES.length);
    for (const c of ENDING_CUES) {
      if (c.cue.startsWith('music:')) { const m = c.cue.slice(6); if (m) expect(MUSIC_MOODS, m).toContain(m); }
      else expect(typeof sfx[c.cue], c.cue).toBe('function');
    }
    // the bright theme in the sun, the calm credits theme from the sunset on
    const musicAt = (at) => ENDING_CUES.filter((c) => c.cue.startsWith('music:') && c.at <= at).at(-1)?.cue;
    expect(musicAt(6)).toBe('music:endingFree');
    expect(musicAt(40)).toBe('music:ending');
  });

  it('the credits name the makers and what it is made with', () => {
    const all = CREDITS.flat().join(' ');
    for (const w of ['Jiyu', 'Hackerwins', 'Polyfork', 'three.js', 'Rapier', 'postprocessing', 'N8AO', 'Jua', 'THIRD_PARTY_LICENSES.txt']) expect(all).toContain(w);
  });

  it('the stats come from the save: stars ever earned, bosses, shards, play time', () => {
    const s = { stars: 3, unlocks: { heart1: true, hat: true }, playTime: 3725.6, world: { bosses: { rabbitChief: 1, iceBear: 1, crystalKing: 1 } } };
    expect(starsEarned(s)).toBe(3 + 2 + 1);
    const st = endingStats(s, { shards: 23 }, starsEarned);
    expect(st).toEqual({ stars: 6, bosses: ['rabbitChief', 'iceBear', 'crystalKing'], shards: 23, time: 3725 });
    expect(BOSS_IDS).toHaveLength(4);
    expect(shownPieces(st)).toEqual({ big: 3, small: 3, shards: 12 });
    expect(shownPieces({ stars: 0, bosses: [], shards: 0 })).toEqual({ big: 0, small: 0, shards: 3 });
    expect(shownPieces({ stars: 40, bosses: BOSS_IDS, shards: 5 }).big + shownPieces({ stars: 40, bosses: BOSS_IDS, shards: 5 }).small).toBe(14);
    expect(playTimeText(3725)).toBe('1시간 2분');
    expect(playTimeText(750)).toBe('12분 30초');
    expect(playTimeText(9)).toBe('9초');
  });

  it('the ending set reuses the intro\'s forest models', () => {
    for (const k of ['introOak', 'introPine', 'caveMouth', 'grass', 'flower']) expect(ENDING_MODELS).toContain(k);
    expect(ENDING_MODELS.filter((k) => k.startsWith('intro')).every((k) => INTRO_MODELS.includes(k))).toBe(true);
  });
});
