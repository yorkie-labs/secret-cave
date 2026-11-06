// Every sound is synthesised with WebAudio: no files to load or license.
// GDD §9: cute footsteps, the hammer on rock, rumbles, item jingles, a tense
// chase loop and a bright fanfare (drips, echoes and animal calls to come).
// Sounds stay soft so young players are not startled.

import { storage } from '../core/storage.js';

let ctx = null, master = null, musicGain = null, sfxGain = null;
const SFX_LEVEL = 0.9, MUSIC_LEVEL = 0.32;
let muted = false;

export function initAudio() {
  if (ctx) return ctx;
  const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
  sfxGain = ctx.createGain(); sfxGain.gain.value = SFX_LEVEL * vol.sfx; sfxGain.connect(master);
  musicGain = ctx.createGain(); musicGain.gain.value = MUSIC_LEVEL * vol.music; musicGain.connect(master);
  return ctx;
}

export function resumeAudio() { initAudio(); if (ctx?.state === 'suspended') ctx.resume(); }
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.8; }
export const isMuted = () => muted;

function tone({ freq = 440, to = null, type = 'sine', dur = 0.15, vol = 0.3, attack = 0.005, delay = 0, dest = sfxGain }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
}

let noiseBuf = null;
function noise({ dur = 0.2, vol = 0.3, filter = 1200, q = 1, type = 'lowpass', to = null, delay = 0, dest = sfxGain }) {
  if (!ctx || muted) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const bq = ctx.createBiquadFilter(); bq.type = type; bq.Q.value = q; bq.frequency.setValueAtTime(filter, t);
  if (to) bq.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bq); bq.connect(g); g.connect(dest);
  src.start(t); src.stop(t + dur + 0.05);
}

export const sfx = {
  step: () => noise({ dur: 0.06, vol: 0.05, filter: 900 + Math.random() * 400 }),
  jump: () => tone({ freq: 300, to: 620, type: 'triangle', dur: 0.18, vol: 0.15 }),
  land: () => noise({ dur: 0.08, vol: 0.1, filter: 500 }),
  roll: () => noise({ dur: 0.3, vol: 0.12, filter: 2000, to: 400 }),
  swing: () => noise({ dur: 0.18, vol: 0.12, filter: 3000, to: 800, type: 'bandpass', q: 2 }),
  bonk: () => { tone({ freq: 220, to: 90, type: 'square', dur: 0.12, vol: 0.15 }); noise({ dur: 0.12, vol: 0.2, filter: 1500 }); },
  clink: () => { tone({ freq: 1800, to: 1500, type: 'triangle', dur: 0.25, vol: 0.12 }); noise({ dur: 0.08, vol: 0.15, filter: 4000, type: 'highpass' }); },
  ting: () => tone({ freq: 2400, to: 2200, type: 'sine', dur: 0.4, vol: 0.12 }),
  shard: () => [0, 4, 7, 12].forEach((s, i) => tone({ freq: 880 * 2 ** (s / 12), type: 'triangle', dur: 0.18, vol: 0.12, delay: i * 0.06 })),
  pickup: () => [0, 7, 12].forEach((s, i) => tone({ freq: 660 * 2 ** (s / 12), type: 'sine', dur: 0.2, vol: 0.15, delay: i * 0.07 })),
  item: () => [0, 4, 7, 12, 16].forEach((s, i) => tone({ freq: 523 * 2 ** (s / 12), type: 'triangle', dur: 0.3, vol: 0.14, delay: i * 0.09 })),
  hurt: () => { tone({ freq: 900, to: 500, type: 'sawtooth', dur: 0.18, vol: 0.08 }); tone({ freq: 700, to: 380, type: 'sine', dur: 0.25, vol: 0.12, delay: 0.05 }); },
  bark: () => { tone({ freq: 520, to: 260, type: 'sawtooth', dur: 0.11, vol: 0.12 }); noise({ dur: 0.1, vol: 0.12, filter: 1400, type: 'bandpass', q: 3 }); tone({ freq: 560, to: 280, type: 'sawtooth', dur: 0.11, vol: 0.1, delay: 0.17 }); },
  sniff: () => [0, 0.12, 0.24].forEach((d) => noise({ dur: 0.07, vol: 0.08, filter: 3000, type: 'highpass', delay: d })),
  rumble: () => { tone({ freq: 70, to: 45, type: 'sawtooth', dur: 0.9, vol: 0.12, attack: 0.1 }); noise({ dur: 0.8, vol: 0.12, filter: 200 }); },
  stomp: () => { tone({ freq: 90, to: 50, type: 'sine', dur: 0.3, vol: 0.25 }); noise({ dur: 0.2, vol: 0.15, filter: 300 }); },
  grind: () => noise({ dur: 1.2, vol: 0.15, filter: 400, to: 250, type: 'bandpass', q: 1.5 }),
  stun: () => [0, 1, 2].forEach((i) => tone({ freq: 1400 + i * 300, to: 1100, type: 'sine', dur: 0.12, vol: 0.06, delay: i * 0.1 })),
  snip: () => { noise({ dur: 0.05, vol: 0.18, filter: 5000, type: 'highpass' }); noise({ dur: 0.05, vol: 0.18, filter: 5000, type: 'highpass', delay: 0.1 }); },
  click: () => tone({ freq: 1200, type: 'square', dur: 0.04, vol: 0.05 }),
  whoosh: () => noise({ dur: 0.6, vol: 0.15, filter: 600, to: 3000, type: 'bandpass', q: 0.8 }),
  growl: () => { tone({ freq: 95, to: 70, type: 'sawtooth', dur: 0.45, vol: 0.09, attack: 0.08 }); noise({ dur: 0.4, vol: 0.06, filter: 300, type: 'bandpass', q: 2 }); },
  snap: () => { noise({ dur: 0.07, vol: 0.22, filter: 2500, type: 'bandpass', q: 1.5 }); tone({ freq: 380, to: 180, type: 'square', dur: 0.06, vol: 0.08 }); },
  squirt: () => noise({ dur: 0.16, vol: 0.12, filter: 3500, to: 1200, type: 'bandpass', q: 1.2 }),
  empty: () => { tone({ freq: 240, to: 160, type: 'square', dur: 0.07, vol: 0.06 }); noise({ dur: 0.05, vol: 0.05, filter: 1800, type: 'highpass', delay: 0.06 }); },
  splash: () => noise({ dur: 0.5, vol: 0.25, filter: 2500, to: 300 }),
  // M3 items
  clang: () => { tone({ freq: 1250, to: 1150, type: 'square', dur: 0.08, vol: 0.08 }); tone({ freq: 1870, to: 1800, type: 'triangle', dur: 0.45, vol: 0.12 }); tone({ freq: 2650, type: 'sine', dur: 0.3, vol: 0.06, delay: 0.01 }); noise({ dur: 0.07, vol: 0.18, filter: 5000, type: 'highpass' }); },
  shieldUp: () => noise({ dur: 0.12, vol: 0.1, filter: 1400, to: 700, type: 'bandpass', q: 1.5 }),
  whip: () => noise({ dur: 0.25, vol: 0.14, filter: 1200, to: 4000, type: 'bandpass', q: 2.5 }),
  bind: () => { noise({ dur: 0.35, vol: 0.12, filter: 700, to: 300, type: 'bandpass', q: 3 }); [0, 0.09, 0.18].forEach((d) => tone({ freq: 330 - d * 300, type: 'triangle', dur: 0.08, vol: 0.06, delay: d })); },
  munch: () => [0, 0.16, 0.32, 0.5].forEach((d) => noise({ dur: 0.06, vol: 0.1, filter: 1800, type: 'bandpass', q: 2, delay: d })),
  creak: () => { tone({ freq: 160, to: 230, type: 'sawtooth', dur: 0.35, vol: 0.05, attack: 0.05 }); noise({ dur: 0.3, vol: 0.06, filter: 600, type: 'bandpass', q: 4 }); },
  heal: () => [0, 4, 7].forEach((s, i) => tone({ freq: 660 * 2 ** (s / 12), type: 'sine', dur: 0.35, vol: 0.12, delay: i * 0.1 })),
  ghost: () => tone({ freq: 380, to: 520, type: 'sine', dur: 0.6, vol: 0.06, attack: 0.2 }),
  puff: () => noise({ dur: 0.35, vol: 0.12, filter: 900, to: 300 }),
  power: () => { tone({ freq: 110, to: 440, type: 'sawtooth', dur: 0.8, vol: 0.08 }); tone({ freq: 220, to: 880, type: 'sine', dur: 0.8, vol: 0.08 }); },
  // M5: rabbits, the chief, the necklace, the escape
  hop: () => { tone({ freq: 380, to: 760, type: 'triangle', dur: 0.14, vol: 0.09 }); noise({ dur: 0.06, vol: 0.06, filter: 2000, type: 'bandpass', q: 2 }); },
  dash: () => noise({ dur: 0.35, vol: 0.13, filter: 900, to: 2600, type: 'bandpass', q: 1.2 }),
  slam: () => { tone({ freq: 70, to: 32, type: 'sine', dur: 0.7, vol: 0.32 }); noise({ dur: 0.6, vol: 0.26, filter: 380, to: 90 }); tone({ freq: 140, to: 60, type: 'triangle', dur: 0.35, vol: 0.12 }); },
  flap: () => [0, 0.14, 0.28].forEach((d) => noise({ dur: 0.1, vol: 0.09, filter: 700, type: 'bandpass', q: 2, delay: d })),
  gust: () => noise({ dur: 1.0, vol: 0.18, filter: 500, to: 1800, type: 'bandpass', q: 0.7 }),
  roar: () => { tone({ freq: 160, to: 90, type: 'sawtooth', dur: 0.9, vol: 0.09, attack: 0.08 }); tone({ freq: 240, to: 130, type: 'square', dur: 0.8, vol: 0.04, attack: 0.1 }); noise({ dur: 0.8, vol: 0.08, filter: 600, type: 'bandpass', q: 1.5 }); },
  necklace: () => [0, 4, 7, 11, 14, 19].forEach((s, i) => tone({ freq: 784 * 2 ** (s / 12), type: 'sine', dur: 0.6, vol: 0.09, delay: i * 0.08 })),
  quake: () => { tone({ freq: 48, to: 36, type: 'sawtooth', dur: 1.2, vol: 0.08, attack: 0.2 }); noise({ dur: 1.2, vol: 0.12, filter: 160 }); },
  rockFall: () => { noise({ dur: 0.35, vol: 0.22, filter: 600, to: 150 }); tone({ freq: 110, to: 55, type: 'triangle', dur: 0.25, vol: 0.12 }); },
  sunrise: () => [[0, 0], [7, 0.2], [12, 0.4], [16, 0.6], [19, 0.8], [24, 1.0]].forEach(([s, d]) => tone({ freq: 392 * 2 ** (s / 12), type: 'sine', dur: 1.2, vol: 0.1, attack: 0.15, delay: d })),
  // the intro: birdsong in the forest, the footprints' glow, eyes in the dark
  chirp: () => [0, 0.09, 0.3, 0.38].forEach((d, i) => tone({ freq: 2600 + (i % 2) * 500, to: 3400 + (i % 2) * 300, type: 'sine', dur: 0.07, vol: 0.035, delay: d })),
  glimmer: () => [0, 5, 9, 12].forEach((st, i) => tone({ freq: 988 * 2 ** (st / 12), type: 'sine', dur: 0.7, vol: 0.05, attack: 0.08, delay: i * 0.12 })),
  twinkle: () => [0, 7].forEach((st, i) => tone({ freq: 1320 * 2 ** (st / 12), type: 'sine', dur: 0.5, vol: 0.04, attack: 0.05, delay: i * 0.16 })),
  // the ending: a happy stretch in the sun (a little rising-falling "아우~"),
  // the cave's purple glow going out (a soft falling shimmer)
  yawn: () => { tone({ freq: 520, to: 760, type: 'sine', dur: 0.45, vol: 0.06, attack: 0.08 }); tone({ freq: 760, to: 430, type: 'sine', dur: 0.7, vol: 0.06, attack: 0.05, delay: 0.42 }); },
  dim: () => [12, 9, 5, 0, -3].forEach((st, i) => tone({ freq: 880 * 2 ** (st / 12), type: 'sine', dur: 0.8, vol: 0.045, attack: 0.06, delay: i * 0.16 })),
  // W5: a combo, a star, a secret door's glimmer
  combo: () => [0, 4, 7, 11, 14].forEach((st, i) => tone({ freq: 659 * 2 ** (st / 12), type: 'triangle', dur: 0.22, vol: 0.1, delay: i * 0.05 })),
  star: () => [0, 7, 12, 16, 19, 24].forEach((st, i) => tone({ freq: 523 * 2 ** (st / 12), type: 'sine', dur: 0.5, vol: 0.1, delay: i * 0.07 })),
  fanfare: () => [[0, 0], [4, 0.15], [7, 0.3], [12, 0.45], [7, 0.65], [12, 0.8]].forEach(([s, d]) => tone({ freq: 523 * 2 ** (s / 12), type: 'triangle', dur: 0.35, vol: 0.15, delay: d })),
};

// Music: a tiny step sequencer (8th-note steps). W5 (GDD §9 "지역별 배경
// 음악"): a gentle loop for every place — the camp, each of the four regions
// — a theme for each boss, the escape and the ending. A mood is data: tempo,
// a scale, a chord progression (scale degrees from the root, one a bar), a
// soft pad, an arpeggio pattern, a lead's voice and how busy it is, drums.
const MOODS = {
  // the old caves' moods (kept)
  explore: { bpm: 96, scale: [0, 2, 4, 7, 9], root: 60, bass: [0, 0, 5, 7], lead: 'triangle', density: 0.55 },
  chase: { bpm: 150, scale: [0, 3, 5, 7, 10], root: 57, bass: [0, 0, 3, 5], lead: 'square', density: 0.75, hat: 2 },
  cave: { bpm: 80, scale: [0, 3, 5, 7, 10], root: 55, bass: [0, 5, 3, 7], lead: 'sine', density: 0.35 },
  calm: { bpm: 84, scale: [0, 2, 4, 7, 9], root: 65, bass: [0, 5, 7, 5], lead: 'sine', density: 0.4, pad: 0.05 },
  boss: { bpm: 132, scale: [0, 3, 5, 6, 7, 10], root: 52, bass: [0, 0, 6, 5], lead: 'square', density: 0.6, hat: 2, kick: 4 },
  escape: { bpm: 168, scale: [0, 2, 3, 5, 7], root: 57, bass: [0, 3, 5, 7], lead: 'triangle', density: 0.8, hat: 2, kick: 4 },
  // W5: the places of the big world
  camp: { bpm: 80, scale: [0, 2, 4, 7, 9], root: 62, bass: [0, 5, 9, 7], lead: 'sine', density: 0.3, pad: 0.06, arp: [0, 2, 1, 2], arpVol: 0.035 },
  moss: { bpm: 92, scale: [0, 2, 4, 7, 9], root: 60, bass: [0, 9, 5, 7], lead: 'triangle', density: 0.42, pad: 0.04, arp: [0, 1, 2, 1], arpVol: 0.03 },
  mushroom: { bpm: 104, scale: [0, 2, 3, 5, 7, 9, 10], root: 58, bass: [0, 5, 3, 10], lead: 'square', leadVol: 0.028, density: 0.45, pad: 0.035, arp: [0, 2, 0, 1, 0, 2, 1, 2], arpVol: 0.03, staccato: true },
  ice: { bpm: 70, scale: [0, 2, 4, 6, 7, 11], root: 64, bass: [0, 7, 4, 2], lead: 'sine', density: 0.32, octave: 12, pad: 0.05, arp: [2, 1, 0, 1], arpVol: 0.04, bell: true },
  heart: { bpm: 76, scale: [0, 2, 3, 7, 8], root: 57, bass: [0, 8, 3, 7], lead: 'sine', density: 0.3, pad: 0.06, arp: [0, 2, 1, 2], arpVol: 0.03 },
  // boss themes
  rabbitChief: { bpm: 138, scale: [0, 2, 4, 5, 7, 9], root: 55, bass: [0, 0, 5, 7], lead: 'square', leadVol: 0.035, density: 0.62, hat: 2, kick: 4, arp: [0, 1, 2, 1], arpVol: 0.025 },
  mushroomQueen: { bpm: 122, scale: [0, 1, 3, 5, 6, 8, 10], root: 53, bass: [0, 6, 3, 1], lead: 'square', leadVol: 0.03, density: 0.55, hat: 2, kick: 4, staccato: true },
  iceBear: { bpm: 108, scale: [0, 2, 3, 5, 7, 8], root: 50, bass: [0, 0, 8, 7], lead: 'triangle', density: 0.5, hat: 4, kick: 4, pad: 0.05, octave: 12, bell: true },
  crystalKing: { bpm: 132, scale: [0, 2, 3, 5, 7, 8, 11], root: 50, bass: [0, 8, 5, 7], lead: 'sawtooth', leadVol: 0.022, density: 0.6, hat: 2, kick: 4, pad: 0.05, arp: [0, 1, 2, 3, 2, 1], arpVol: 0.03 },
  // the intro cutscene (ui/intro.js): a sunny stroll, the cave's hush, the
  // dark below (slow, soft, mysterious, not scary), and a brave little lift
  introDay: { bpm: 96, scale: [0, 2, 4, 7, 9], root: 67, bass: [0, 5, 7, 5], lead: 'triangle', leadVol: 0.06, density: 0.4, pad: 0.04, arp: [0, 1, 2, 1], arpVol: 0.03 },
  introCave: { bpm: 72, scale: [0, 2, 3, 7, 8], root: 60, bass: [0, 8, 5, 7], lead: 'sine', leadVol: 0.06, density: 0.25, pad: 0.05 },
  introDark: { bpm: 60, scale: [0, 2, 3, 7, 10], root: 57, bass: [0, 3, 8, 7], lead: 'sine', leadVol: 0.05, density: 0.18, octave: 12, pad: 0.06, bell: true },
  introBrave: { bpm: 100, scale: [0, 2, 4, 7, 9], root: 62, bass: [0, 5, 7, 7], lead: 'triangle', leadVol: 0.07, density: 0.5, pad: 0.05, arp: [0, 1, 2, 3], arpVol: 0.035 },
  // the ending cutscene (ui/ending.js): out in the sun, bright and free; the
  // dark at the very end (THE END…?), a curious hush. `ending` itself is the
  // calm credits theme (the sunset, the credits, the result screen)
  endingFree: { bpm: 116, scale: [0, 2, 4, 7, 9], root: 67, bass: [0, 5, 9, 7], lead: 'triangle', leadVol: 0.075, density: 0.55, pad: 0.05, arp: [0, 1, 2, 3, 2, 1], arpVol: 0.035, kick: 8 },
  endingTease: { bpm: 64, scale: [0, 2, 3, 7, 8], root: 62, bass: [0, 8], lead: 'sine', leadVol: 0.045, density: 0.2, octave: 12, pad: 0.05, bell: true },
  ending: { bpm: 88, scale: [0, 2, 4, 7, 9], root: 67, bass: [0, 7, 9, 5], lead: 'triangle', density: 0.5, pad: 0.07, arp: [0, 1, 2, 3], arpVol: 0.035 },
};
export const MUSIC_MOODS = Object.keys(MOODS);
let mood = null, timer = null, stepIndex = 0, seed = 1;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
export const currentMusic = () => mood;

// a chord on scale degree `deg` of the mood's scale: root, third, fifth (in semitones)
function chord(m, deg) {
  const sc = m.scale, i = sc.indexOf(deg % 12) >= 0 ? sc.indexOf(deg % 12) : 0;
  const at = (k) => sc[(i + k) % sc.length] + 12 * Math.floor((i + k) / sc.length) + (deg - (deg % 12));
  return [at(0), at(2), at(4)];
}

export function setMusic(name) {
  if (mood === name) return;
  mood = name;
  clearInterval(timer);
  if (!name || !ctx) return;
  const m = MOODS[name] ?? MOODS.cave;
  const beat = 60 / m.bpm / 2;
  stepIndex = 0; seed = 7;
  timer = setInterval(() => {
    if (muted || !ctx) return;
    const bar = Math.floor(stepIndex / 8) % m.bass.length;
    const deg = m.bass[bar], tones = chord(m, deg);
    if (stepIndex % 4 === 0) tone({ freq: midi(m.root - 24 + deg), type: 'triangle', dur: beat * 3, vol: 0.18, dest: musicGain });
    // a soft pad: the bar's chord, held, a slow swell
    if (m.pad && stepIndex % 8 === 0) for (const t of tones) tone({ freq: midi(m.root - 12 + t), type: 'sine', dur: beat * 8, vol: m.pad, attack: beat * 2, dest: musicGain });
    // an arpeggio up and down the chord
    if (m.arp) { const k = m.arp[stepIndex % m.arp.length]; tone({ freq: midi(m.root + (tones[k % 3] ?? 0) + (k >= 3 ? 12 : 0)), type: m.bell ? 'sine' : 'triangle', dur: beat * (m.bell ? 2.5 : 1.2), vol: m.arpVol ?? 0.03, dest: musicGain }); }
    if (rnd() < m.density) {
      const n = m.scale[Math.floor(rnd() * m.scale.length)] + (rnd() < 0.3 ? 12 : 0) + (m.octave ?? 0);
      const v = m.leadVol ?? (m.lead === 'square' ? 0.04 : 0.09);
      tone({ freq: midi(m.root + deg + n), type: m.lead, dur: beat * (m.staccato ? 0.7 : 1.6), vol: v, dest: musicGain });
      if (m.bell) tone({ freq: midi(m.root + deg + n + 12), type: 'sine', dur: beat * 3, vol: v * 0.35, dest: musicGain });
    }
    if (m.hat && stepIndex % m.hat === 0) noise({ dur: 0.04, vol: 0.05, filter: 6000, type: 'highpass', dest: musicGain });
    if (m.kick && stepIndex % m.kick === 0) tone({ freq: 120, to: 45, type: 'sine', dur: 0.18, vol: 0.16, dest: musicGain });
    stepIndex++;
  }, beat * 1000);
}
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// W5: the menu's volume sliders (0..1 each), kept in this browser
const VOL_KEY = 'secret-cave-volume';
const vol = { music: 1, sfx: 1 };
try { Object.assign(vol, JSON.parse(storage.getItem(VOL_KEY) ?? '{}')); } catch { /* a broken value */ }
export const getVolume = (kind) => vol[kind];
export function setVolume(kind, v) {
  vol[kind] = Math.max(0, Math.min(1, v));
  if (musicGain) musicGain.gain.value = MUSIC_LEVEL * vol.music;
  if (sfxGain) sfxGain.gain.value = SFX_LEVEL * vol.sfx;
  try { storage.setItem(VOL_KEY, JSON.stringify(vol)); } catch { /* full */ }
}

// W1: the roar of the nearest waterfall, a looped filtered noise whose
// loudness follows how close the hero is (0 silent … 1 right under it).
let amb = null;
export function setAmbience(level) {
  if (!ctx) return;
  if (!amb) {
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = last * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = last; } // a little browner than white
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 0.4;
    const gain = ctx.createGain(); gain.gain.value = 0;
    src.connect(lp); lp.connect(gain); gain.connect(sfxGain);
    src.start();
    amb = { gain, lp };
  }
  const v = muted ? 0 : Math.max(0, Math.min(1, level)) * 0.32;
  amb.gain.gain.setTargetAtTime(v, ctx.currentTime, 0.4);
  amb.lp.frequency.setTargetAtTime(700 + level * 900, ctx.currentTime, 0.4);
}
