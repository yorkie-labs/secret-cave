// What the game remembers between runs (GDD §8, §10.5): the codex of things
// seen, stars, unlocks and the golden necklace. In the old caves (?world=open)
// a run itself is never saved; in the big world (W1) the world's progress and
// the hero's bag are (`world`, below).
// Plain data so it saves as JSON.

import { armorHearts } from '../combat/hits.js';
import { storage as defaultStorage } from './storage.js';

export const SAVE_KEY = 'secret-cave-save-v1';

export function newState() {
  return {
    version: 1,
    seen: {}, // codex: enemy / item / boss id -> true once met
    stars: 0, // spent on unlocks
    unlocks: {}, // unlock id -> true
    necklace: false, // the golden necklace (GDD §6.4), kept once found
    runs: 0,
    wins: 0, // runs that made it out of the cave (M5: through the ending)
    beaten: {}, // boss id -> times beaten (the first time gives a star, GDD §8.3)
    prologue: false, // the opening story has been shown once (W6: it plays on every new game; the menu has it too)
    playTime: 0,
    world: newWorldProgress(), // W1: the big world's progress (below)
    // W5 (core/growth.js): the cosmetics worn, the secret pockets found, the
    // codex milestones reached, faints in a row against each boss
    wear: { head: null, neck: null, feet: null },
    secrets: {},
    milestones: {},
    bossLosses: {},
    combos: {}, // combo id -> true once it went off (the codex lists them)
  };
}

// W1 (tasks/20261102-world-redesign-todo.md §2): the big underground world
// remembers where the hero has been and what is open. A faint never takes
// any of this; only 처음부터 (resetWorld) does.
//   started     the hero has dropped into the cave (then a new page goes on)
//   camp        the camp has been found (a faint wakes there; else at the entrance)
//   gates       gate id -> true once opened for good (the shortcut too)
//   bosses      boss id -> true once beaten in this world (it stays asleep;
//               `beaten` above counts every win for the codex and stars)
//   expedition  how many times the hero has set out (each re-rolls the spots)
//   seed        the save's base seed (expedition n rolls from it)
//   fog         the map seen so far (ui/worldMap.js, a base64 bit grid)
//   bag         what the hero carries between expeditions: { owned, tool,
//               herbs, shards } (hearts refill at the camp)
//   departShards  shards in the bag when this expedition set out (the faint
//               penalty only takes from what was found since)
//   won         W4: times the hero got out into the sunlight (the ending);
//               after it the world stays open (이어 하기: the post-game)
//   wonAt       play time (s) of the first escape (the result's clock)
//   asleep      animals put to sleep in this world, all told (the result)
//   shard       W5: the purple shard after the ending was taken
export function newWorldProgress() {
  return { started: false, camp: false, gates: {}, bosses: {}, expedition: 0, seed: null, fog: '', bag: null, departShards: 0, won: 0, wonAt: null, asleep: 0, shard: false };
}
export const gateOpen = (s, id) => !!s.world?.gates?.[id];
// Returns true the first time.
export function openGate(s, id) {
  s.world ??= newWorldProgress();
  if (s.world.gates[id]) return false;
  s.world.gates[id] = true;
  return true;
}
export function findCamp(s) {
  s.world ??= newWorldProgress();
  if (s.world.camp) return false;
  s.world.camp = true;
  return true;
}
// the run's bag into the save, and back
export function keepBag(s, run) {
  s.world ??= newWorldProgress();
  s.world.bag = { owned: [...run.owned], tool: run.tool, herbs: run.herbs, shards: run.shards, armorGrade: run.armorGrade ?? null, grades: { ...run.grades } };
}
export function restoreBag(s, run) {
  const b = s.world?.bag;
  if (!b) return false;
  Object.assign(run, { owned: [...b.owned], tool: b.tool, herbs: b.herbs, shards: b.shards, armorGrade: b.armorGrade ?? null, grades: { hammer: 'common', waterGun: 'common', ...b.grades } });
  run.armor = armorHearts(run.armorGrade); // (full again: a new page)
  return true;
}
// 처음부터: the world starts over (the codex, stars, wins and the necklace,
// which is kept for good, stay)
export function resetWorld(s) {
  s.world = newWorldProgress();
}

// W2 (checks: ?start=mushroom): the progress of a hero who has just put the
// rabbit chief to sleep — the prologue seen, the necklace, the camp found,
// the chief asleep (a star), region 2's gate and the shortcut open, a few
// shards and a herb in the bag. `seed`: the world's base seed.
// W3 (?start=ice): further on — the Poison Mushroom Queen asleep too (a
// second star), the mushroom lift and the ice door open, the shield and the
// vine in the bag (the deer's and the wolf's weaknesses), two herbs.
// W4 (?start=heart): further still — the Ice Bear asleep too (a third
// star), the rope lift, the ice walls broken, rare armour, three herbs and a
// pocket of shards: a hero ready for the Crystal Heart, at its lake door.
export function presetProgress(s, { start = 'mushroom', seed = null, owned, tool = 'waterGun' } = {}) {
  if (start !== 'mushroom' && start !== 'ice' && start !== 'heart') return false;
  const heart = start === 'heart';
  const ice = start === 'ice' || heart;
  owned ??= ice ? ['hammer', 'waterGun', 'vine', 'shield'] : ['hammer', 'waterGun'];
  s.prologue = true;
  s.necklace = true;
  s.beaten = { ...s.beaten, rabbitChief: Math.max(1, s.beaten?.rabbitChief ?? 0), ...(ice ? { mushroomQueen: Math.max(1, s.beaten?.mushroomQueen ?? 0) } : {}), ...(heart ? { iceBear: Math.max(1, s.beaten?.iceBear ?? 0) } : {}) };
  s.stars = Math.max(heart ? 3 : ice ? 2 : 1, s.stars ?? 0);
  s.seen = { ...s.seen, wolf: true, rabbit: true, rabbitChief: true, necklace: true, ...(ice ? { fox: true, mole: true, mushroomQueen: true, vine: true, shield: true } : {}), ...(heart ? { deer: true, bear: true, hare: true, iceBear: true, armor: true } : {}) };
  s.world = { ...newWorldProgress(), ...s.world, started: true, camp: true, seed: s.world?.seed ?? seed, expedition: Math.max(1, s.world?.expedition ?? 0) };
  s.world.bosses = { ...s.world.bosses, rabbitChief: true, ...(ice ? { mushroomQueen: true } : {}), ...(heart ? { iceBear: true } : {}) };
  s.world.gates = { ...s.world.gates, region2: true, shortcut: true, ...(ice ? { lift: true, ice: true } : {}), ...(heart ? { lift3: true, iceWall1: true, iceWall2: true } : {}) };
  s.world.areas = [...new Set([...(s.world.areas ?? []), 'entrance', 'valley', 'camp', 'meadow', 'gorge', 'mine', ...(ice ? ['mush', 'mushLow', 'mushDeep', 'ring', 'web'] : []), ...(heart ? ['ice', 'iceShelf', 'bearRing', 'grotto', 'nook'] : [])])];
  s.world.bag ??= { owned: [...owned], tool, herbs: heart ? 3 : ice ? 2 : 1, shards: heart ? 16 : ice ? 10 : 4, armorGrade: heart ? 'rare' : null };
  return true;
}

// M5: the golden necklace (GDD §6.4) is found once and kept for good.
// Returns true the first time.
export function takeNecklace(s) {
  if (s.necklace) return false;
  s.necklace = true;
  return true;
}

// W4: the Crystal Heart's crystal doors open to the golden necklace once
// the Ice Bear sleeps (GDD §6.4: the necklace glows at them)
export const heartDoorReady = (s) => !!s.world?.bosses?.iceBear && !!s.necklace;

// W4: out into the sunlight in the big world (GDD §2.3): a win (`wins`, the
// title's 🏁), the world remembers it (`world.won`, the first one's play
// time). The Crystal King's star came when he fell asleep (beatBoss).
// Returns { first, wins }.
export function recordFinalWin(s) {
  s.world ??= newWorldProgress();
  const first = !s.world.won;
  s.wins = (s.wins ?? 0) + 1;
  s.world.won = (s.world.won ?? 0) + 1;
  if (first) s.world.wonAt = Math.round(s.playTime ?? 0);
  return { first, wins: s.wins };
}
// M6a: a boss on the way down beaten: counted, a star the first time.
export function beatBoss(s, bossId) {
  s.beaten ??= {};
  const first = !s.beaten[bossId];
  s.beaten[bossId] = (s.beaten[bossId] ?? 0) + 1;
  if (first) addStars(s, 1);
  if (s.bossLosses) delete s.bossLosses[bossId]; // (W5: the extra-herb help ends)
  return { first, stars: s.stars };
}

export function markSeen(s, id) {
  if (s.seen[id]) return false;
  s.seen[id] = true;
  return true;
}

export function addStars(s, n) { s.stars = Math.max(0, s.stars + n); }

// Returns false when there are not enough stars (or it is already unlocked).
export function unlock(s, id, cost) {
  if (s.unlocks[id] || s.stars < cost) return false;
  s.stars -= cost;
  s.unlocks[id] = true;
  return true;
}

// Where the save goes: the game's safe storage (core/storage.js: the
// browser's localStorage, or memory when it is blocked) under SAVE_KEY. A
// production page opened with a debug link (?start=, ?seed=, ?world=) or
// driven from outside (window.G) saves to the sandbox slot instead
// (`useSandbox`), so a shared test link never touches a child's real save.
export const SANDBOX_KEY = 'secret-cave-sandbox-save-v1';
const slot = { storage: defaultStorage, key: SAVE_KEY };
/** Points every later save/load/clearSave at the sandbox slot (or back). */
export function useSandbox(on = true) { slot.key = on ? SANDBOX_KEY : SAVE_KEY; }
/** The key saves go under now (checks read the save back with it). */
export const saveKey = () => slot.key;

export function save(s, storage = slot.storage) {
  try { storage.setItem(slot.key, JSON.stringify(s)); } catch { /* full, or blocked mid-game */ }
}

export function load(storage = slot.storage) {
  try {
    const raw = storage.getItem(slot.key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.version !== 1) return null;
    // fill fields added after the save was written
    const base = newState();
    return { ...base, ...data, seen: { ...data.seen }, unlocks: { ...data.unlocks }, beaten: { ...data.beaten }, wear: { ...base.wear, ...data.wear }, secrets: { ...data.secrets }, milestones: { ...data.milestones }, bossLosses: { ...data.bossLosses }, combos: { ...data.combos }, world: { ...newWorldProgress(), ...data.world, gates: { ...data.world?.gates }, bosses: { ...data.world?.bosses } } };
  } catch {
    return null;
  }
}

export function clearSave(storage = slot.storage) {
  try { storage.removeItem(slot.key); } catch { /* ignore */ }
}
