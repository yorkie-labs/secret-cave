import { describe, it, expect } from 'vitest';
import {
  INTRO_SCENES, INTRO_LINES, INTRO_CUES, INTRO_LENGTH, FADE_OUT,
  sceneAt, lineAt, typedCount, typedAt, advance, cuesBetween, ramp,
} from '../src/ui/introTimeline.js';

describe('intro cutscene timeline (GDD §2.1)', () => {
  it('six scenes back to back, 30–45 s in all', () => {
    expect(INTRO_SCENES.map((s) => s.id)).toEqual(['forest', 'tracks', 'cave', 'fall', 'dark', 'tools']);
    INTRO_SCENES.forEach((s, i) => {
      expect(s.end).toBeGreaterThan(s.start);
      if (i) expect(s.start).toBe(INTRO_SCENES[i - 1].end);
    });
    expect(INTRO_SCENES[0].start).toBe(0);
    expect(INTRO_SCENES.at(-1).end).toBe(INTRO_LENGTH);
    expect(INTRO_LENGTH).toBeGreaterThanOrEqual(30);
    expect(INTRO_LENGTH).toBeLessThanOrEqual(45);
  });

  it('sceneAt walks through the scenes in order and clamps at the end', () => {
    expect(sceneAt(0)).toBe(0);
    expect(sceneAt(6.99)).toBe(0);
    expect(sceneAt(7)).toBe(1);
    expect(sceneAt(20)).toBe(3);
    expect(sceneAt(41)).toBe(5);
    expect(sceneAt(99)).toBe(5);
  });

  it('every line is on screen ≥ 2.5 s, typed well before it goes, lines never overlap', () => {
    INTRO_LINES.forEach((l, i) => {
      expect(l.end - l.at).toBeGreaterThanOrEqual(2.5);
      expect(typedAt(l)).toBeLessThan(l.end - 1); // a second at least to read it whole
      if (i) expect(l.at).toBeGreaterThanOrEqual(INTRO_LINES[i - 1].end);
      expect(l.end).toBeLessThanOrEqual(INTRO_LENGTH - FADE_OUT + 0.01);
    });
  });

  it('the lines tell the prologue: the forest, the footprints, the cave, the fall, SOS, the tools', () => {
    const all = INTRO_LINES.map((l) => l.text).join(' ');
    for (const w of ['몰티즈', '발자국', '동굴 입구', '멍? 여기는 어디지?', '쿠구구궁', '떨어졌', '아무도 대답하지 않았', '망치와 물총', '반드시 여기서 나갈 거야']) expect(all).toContain(w);
    // each scene has at least one line
    for (const s of INTRO_SCENES) expect(INTRO_LINES.some((l) => l.at >= s.start && l.at < s.end)).toBe(true);
  });

  it('lineAt: the line on screen, -1 in a gap', () => {
    expect(lineAt(0)).toBe(-1);
    expect(lineAt(1)).toBe(0);
    expect(lineAt(6.7)).toBe(-1);
    expect(lineAt(17)).toBe(4);
    expect(INTRO_LINES[4].say).toBe(true);
  });

  it('typedCount: a soft typewriter, whole characters (Hangul counts one each)', () => {
    const l = INTRO_LINES[4]; // 멍? 여기는 어디지?
    expect(typedCount(l, l.at)).toBe(0);
    expect(typedCount(l, l.at + 0.1)).toBe(2);
    expect(typedCount(l, l.at + 100)).toBe([...l.text].length);
    expect(typedCount(l, l.at - 1)).toBe(0);
  });

  it('advance: finishes a typing line, then jumps to the next line, then to the fade', () => {
    const l0 = INTRO_LINES[0];
    const t1 = advance(l0.at + 0.2);
    expect(t1).toBeCloseTo(typedAt(l0));
    expect(typedCount(l0, t1)).toBe([...l0.text].length);
    expect(advance(t1)).toBe(INTRO_LINES[1].at);
    expect(advance(0)).toBe(INTRO_LINES[0].at); // before the first line
    expect(advance(6.8)).toBe(INTRO_LINES[1].at); // in a gap
    const last = INTRO_LINES.at(-1);
    expect(advance(typedAt(last) + 0.1)).toBe(INTRO_LENGTH - FADE_OUT);
    // pressing on and on always moves forward and ends at the fade
    let t = 0, n = 0;
    while (t < INTRO_LENGTH - FADE_OUT && n < 100) { const nt = advance(t); expect(nt).toBeGreaterThan(t); t = nt; n++; }
    expect(t).toBe(INTRO_LENGTH - FADE_OUT);
    expect(n).toBeLessThanOrEqual(INTRO_LINES.length * 2 + 1);
  });

  it('cuesBetween: every cue once in normal play; a jump keeps only the latest music and fresh sounds', () => {
    let t = -1e-3, got = []; // (the player starts its clock just before 0)
    while (t < INTRO_LENGTH) { const nt = t + 1 / 60; got.push(...cuesBetween(t, nt)); t = nt; }
    expect(got.length).toBe(INTRO_CUES.length);
    const jump = cuesBetween(0, 30);
    expect(jump.filter((c) => c.cue.startsWith('music:')).map((c) => c.cue)).toEqual(['music:introDark']);
    expect(jump.every((c) => c.cue.startsWith('music:') || c.at > 29.65)).toBe(true);
    expect(cuesBetween(5, 5)).toEqual([]);
  });

  it('ramp: smooth 0 → 1', () => {
    expect(ramp(0, 1, 2)).toBe(0);
    expect(ramp(1.5, 1, 2)).toBe(0.5);
    expect(ramp(3, 1, 2)).toBe(1);
  });
});
