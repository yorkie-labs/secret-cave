// W5: the star altar at the camp (GDD §8.3 영구 성장): what stars open for
// good. Stars come from first deeds (core/state.js): each boss the first
// time, each secret pocket the first time, half and all of the codex, and
// the purple shard after the ending — 11 in all, and everything here costs
// 11, so a hero who has done everything has opened everything.
//   heart    +1 to the most hearts (the second needs the first)
//   herbs    every expedition sets out with at least this many herbs
//   tank     × the water tank (more shots before it runs dry)
//   mask     the rabbit mask: + seconds in disguise (a new look)
//   wear     cosmetic (no power): the slot it goes in on the Maltese
// `needs`: another unlock that must come first.
export const ALTAR = [
  { id: 'heart1', icon: '❤️', name: '하트 +1', note: '최대 하트 5 → 6칸', cost: 2, heart: 1 },
  { id: 'heart2', icon: '💖', name: '하트 +1 (두 번째)', note: '최대 하트 6 → 7칸', cost: 2, heart: 1, needs: 'heart1' },
  { id: 'herbPouch', icon: '🌱', name: '약초 주머니', note: '탐험마다 약초 1개를 가지고 나가요', cost: 1, herbs: 1 },
  { id: 'bigTank', icon: '🪣', name: '큰 물통', note: '물통 +50 % (물총 12발)', cost: 1, tank: 1.5 },
  { id: 'rabbitMask', icon: '🐰', name: '토끼 탈', note: '새 탈: 변장 시간 +2초', cost: 1, mask: 2 },
  { id: 'hat', icon: '🤠', name: '탐험가 모자', note: '꾸미기 (머리)', cost: 1, wear: 'head' },
  { id: 'crown', icon: '🌼', name: '꽃 왕관', note: '꾸미기 (머리)', cost: 1, wear: 'head' },
  { id: 'scarf', icon: '🧣', name: '빨간 목도리', note: '꾸미기 (목)', cost: 1, wear: 'neck' },
  { id: 'boots', icon: '🥾', name: '노란 장화', note: '꾸미기 (발)', cost: 1, wear: 'feet' },
];
export const ALTAR_BY_ID = Object.fromEntries(ALTAR.map((u) => [u.id, u]));
export const BASE_HEARTS = 5;
