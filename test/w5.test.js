import { describe, it, expect } from 'vitest';
import { createWorld, gateBlocks } from '../src/world/world.js';
import { buildNavGrid } from '../src/world/navGrid.js';
import { MAIN_WORLD } from '../src/world/worlds/main.js';
import { newState, newWorldProgress, beatBoss, keepBag, restoreBag, load, save } from '../src/core/state.js';
import { newRun } from '../src/core/run.js';
import { ALTAR, ALTAR_BY_ID } from '../src/data/unlocks.js';
import { canUnlock, buyUnlock, altarShelf, toggleWear, worn, growthOf, applyGrowth, pouchHerbs, findSecret, codexMilestones, shardWaiting, takePurpleShard, bossLost, bossWon, lossHerb, ASSIST_LOSSES } from '../src/core/growth.js';
import { CODEX_IDS, CODEX_PAGES, CODEX_ENTRY, SECRET_PAGES } from '../src/data/codex.js';
import { gradeOf, nextGrade, gradeUp, resetGrades, upgradeTarget, hammerStats, waterStats, streamHeadings } from '../src/combat/grades.js';
import { COMBOS, armorMend, maskKeptByVine, counterDamage, eatTwoHerbs } from '../src/combat/combos.js';
import { bindTime, grant, eatHerb } from '../src/combat/loadout.js';
import { lootChoices, rollLoot } from '../src/core/loot.js';
import { canBuy, buy, shelf } from '../src/core/shop.js';
import { ITEMS, CHEST_LOOT, SHOP } from '../src/data/items.js';
import { BOSSES } from '../src/data/bosses.js';
import { crystalKingSteps } from '../src/entities/bosses/crystalKingAI.js';
import { rng } from '../src/core/rng.js';

// W5 (tasks/20261102-world-redesign-todo.md): growth for good (the star
// altar), the codex book and its stars, item grades, combos, the secret
// pockets, the purple shard, and the help for kids who keep losing.
const starred = (n) => { const s = newState(); s.stars = n; return s; };

describe('the star altar (GDD §8.3)', () => {
  it('costs exactly the stars there are to earn (4 bosses + 4 secrets + 2 codex + the shard)', () => {
    expect(ALTAR.reduce((t, u) => t + u.cost, 0)).toBe(11);
    expect(ALTAR.filter((u) => u.wear).length).toBeGreaterThanOrEqual(3);
  });
  it('buys with stars, never twice, the second heart after the first', () => {
    const s = starred(3);
    expect(canUnlock(s, 'heart2').reason).toBe('needs');
    expect(buyUnlock(s, 'heart1').ok).toBe(true);
    expect(s.stars).toBe(1);
    expect(buyUnlock(s, 'heart1').reason).toBe('owned');
    expect(buyUnlock(s, 'heart2').reason).toBe('stars');
    expect(buyUnlock(s, 'nope').reason).toBe('gone');
    expect(s.unlocks).toEqual({ heart1: true });
  });
  it('the shelf says what is open, what can be bought and what is worn', () => {
    const s = starred(2);
    buyUnlock(s, 'hat');
    const sh = Object.fromEntries(altarShelf(s).map((u) => [u.id, u]));
    expect(sh.hat).toMatchObject({ owned: true, worn: true });
    expect(sh.crown).toMatchObject({ owned: false, ok: true });
    expect(sh.heart2).toMatchObject({ ok: false, reason: 'needs' });
  });
  it('cosmetics: a slot each, the newest worn, on and off at will', () => {
    const s = starred(3);
    buyUnlock(s, 'hat'); buyUnlock(s, 'crown'); buyUnlock(s, 'boots');
    expect(worn(s)).toMatchObject({ head: 'crown', feet: 'boots', neck: null });
    expect(toggleWear(s, 'hat')).toBe(true);
    expect(worn(s).head).toBe('hat');
    expect(toggleWear(s, 'hat')).toBe(false);
    expect(worn(s).head).toBe(null);
    expect(toggleWear(s, 'scarf')).toBe(false); // (not bought)
  });
  it('applies at the start of an expedition: hearts, the tank, the mask, the herb pouch', () => {
    const s = starred(11);
    const run = newRun(1);
    expect(applyGrowth(run, s)).toMatchObject({ hearts: 5, tank: 1, mask: 0 });
    for (const id of ['heart1', 'heart2', 'bigTank', 'rabbitMask', 'herbPouch']) expect(buyUnlock(s, id).ok).toBe(true);
    run.hearts = 5;
    applyGrowth(run, s);
    expect(run).toMatchObject({ maxHearts: 7, hearts: 7, tank: 1.5, maskBonus: 2 }); // (the new hearts come filled)
    applyGrowth(run, s);
    expect(run.hearts).toBe(7);
    run.herbs = 0;
    expect(pouchHerbs(run, s)).toBe(1);
    expect(pouchHerbs(run, s)).toBe(0);
    expect(growthOf(starred(0))).toMatchObject({ hearts: 5, herbs: 0 });
  });
  it('is saved and loaded with the rest', () => {
    const store = new Map();
    const storage = { setItem: (k, v) => store.set(k, v), getItem: (k) => store.get(k) ?? null };
    const s = starred(4);
    buyUnlock(s, 'heart1'); buyUnlock(s, 'scarf');
    findSecret(s, 'secret2');
    save(s, storage);
    const back = load(storage);
    expect(back.unlocks).toEqual({ heart1: true, scarf: true });
    expect(back.wear.neck).toBe('scarf');
    expect(back.secrets).toEqual({ secret2: true });
    expect(back.stars).toBe(2);
  });
});

describe('the codex book and its stars (GDD §8.4)', () => {
  it('has animals, bosses, items and secrets, every entry described, animals with a weakness', () => {
    expect(CODEX_PAGES.map((p) => p.id)).toEqual(['animals', 'bosses', 'items', 'secrets']);
    expect(CODEX_IDS.length).toBe(7 + 4 + 8 + 5);
    expect(new Set(CODEX_IDS).size).toBe(CODEX_IDS.length);
    for (const id of CODEX_IDS) expect(CODEX_ENTRY[id].desc?.length, id).toBeGreaterThan(8);
    for (const e of CODEX_PAGES[0].entries) expect(ITEMS[e.weak], e.id).toBeTruthy();
    expect(Object.keys(SECRET_PAGES)).toEqual(['secret1', 'secret2', 'secret3', 'secret4', 'purpleShard']);
  });
  it('gives a star at half and at all of it, once each', () => {
    const s = newState();
    const half = Math.ceil(CODEX_IDS.length / 2);
    for (const id of CODEX_IDS.slice(0, half - 1)) s.seen[id] = true;
    expect(codexMilestones(s, CODEX_IDS)).toEqual([]);
    s.seen[CODEX_IDS[half - 1]] = true;
    expect(codexMilestones(s, CODEX_IDS)).toEqual(['half']);
    expect(codexMilestones(s, CODEX_IDS)).toEqual([]);
    for (const id of CODEX_IDS) s.seen[id] = true;
    expect(codexMilestones(s, CODEX_IDS)).toEqual(['all']);
    expect(s.stars).toBe(2);
  });
});

describe('item grades (GDD §6.5)', () => {
  it('common → rare → legend, the hammer first, and back to common on a faint', () => {
    const run = newRun(1);
    expect(gradeOf(run, 'hammer')).toBe('common');
    expect(nextGrade('rare')).toBe('legend');
    expect(nextGrade('legend')).toBe(null);
    expect(gradeUp(run)).toEqual({ item: 'hammer', grade: 'rare' });
    expect(gradeUp(run)).toEqual({ item: 'waterGun', grade: 'rare' });
    expect(gradeUp(run, 'waterGun')).toEqual({ item: 'waterGun', grade: 'legend' });
    expect(gradeUp(run, 'waterGun')).toEqual({ item: 'hammer', grade: 'legend' }); // (water is top: the other one)
    expect(upgradeTarget(run)).toBe(null);
    expect(gradeUp(run)).toBe(null);
    resetGrades(run);
    expect(run.grades).toEqual({ hammer: 'common', waterGun: 'common' });
  });
  it('rare reaches half as far again, legend shakes the ground; the water gun splits and bombs', () => {
    expect(hammerStats('common').range).toBe(ITEMS.hammer.range);
    expect(hammerStats('rare').range).toBeCloseTo(ITEMS.hammer.range * 1.5);
    expect(hammerStats('rare').wave).toBe(null);
    expect(hammerStats('legend').wave.radius).toBeGreaterThan(1);
    expect(waterStats('common')).toEqual({ streams: 1, spread: 0, bomb: null });
    expect(waterStats('rare').streams).toBe(2);
    expect(waterStats('legend').bomb.radius).toBeGreaterThan(2);
    const h = streamHeadings(0, waterStats('rare'));
    expect(h.length).toBe(2);
    expect(h[0]).toBeCloseTo(-h[1]);
  });
  it('the bag keeps them between pages; a new run starts common', () => {
    const s = newState(), run = newRun(1);
    gradeUp(run, 'waterGun');
    keepBag(s, run);
    const again = newRun(2);
    restoreBag(s, again);
    expect(again.grades).toEqual({ hammer: 'common', waterGun: 'rare' });
  });
  it('chests: a grade-up gem only in the big world, likelier the deeper, never past legend', () => {
    const run = newRun(1);
    expect(lootChoices(run).some((e) => e.item === 'gradeUp')).toBe(false); // (the old caves keep their dice)
    run.bigWorld = true;
    const w = (area) => { run.area = area; return lootChoices(run).find((e) => e.item === 'gradeUp').weight; };
    expect(w(0)).toBeLessThan(w(1));
    expect(w(1)).toBeLessThan(w(3));
    run.grades = { hammer: 'legend', waterGun: 'legend' };
    expect(lootChoices(run).some((e) => e.item === 'gradeUp')).toBe(false);
    run.grades = { hammer: 'common', waterGun: 'common' };
    let ups = 0;
    for (let i = 0; i < 400; i++) if (rollLoot(run, rng(i)).item === 'gradeUp') ups++;
    expect(ups).toBeGreaterThan(20);
    expect(grant(run, 'gradeUp', 1, { target: 'waterGun' })).toBe(true);
    expect(run.grades.waterGun).toBe('rare');
  });
  it('the merchant sells the next grade, priced by it, until legend', () => {
    const run = newRun(1);
    run.shards = 30;
    const up = () => shelf(run).find((g) => g.id === 'hammerUp');
    expect(up()).toMatchObject({ price: 8, ok: true, grade: 'rare' });
    expect(buy(run, 'hammerUp').ok).toBe(true);
    expect(run.grades.hammer).toBe('rare');
    expect(up()).toMatchObject({ price: 14, grade: 'legend' });
    buy(run, 'hammerUp');
    expect(run.shards).toBe(8);
    expect(canBuy(run, 'hammerUp').reason).toBe('top');
    expect(SHOP.find((g) => g.id === 'waterUp')).toBeTruthy();
  });
});

describe('item combos (GDD §6.6)', () => {
  it('lists the five', () => {
    expect(COMBOS.map((c) => c.id)).toEqual(['wetBind', 'hammerArmor', 'maskVine', 'shieldCounter', 'herbHerb']);
  });
  it('water gun + vine: wet animals are bound 5 s', () => {
    expect(bindTime(10, 9)).toBe(ITEMS.vine.bindWet);
    expect(bindTime(10, 11)).toBe(ITEMS.vine.bind);
  });
  it('hammer + armour: half a blue heart, once a fight, never over the most', () => {
    const run = newRun(1);
    const used = new Set();
    expect(armorMend(run, used, 'a')).toBe(0); // (no armour)
    grant(run, 'armor', 1, { grade: 'rare' });
    run.armor = 1;
    expect(armorMend(run, used, 'a')).toBe(0.5);
    expect(armorMend(run, used, 'a')).toBe(0);
    run.armor = 2;
    expect(armorMend(run, used, 'b')).toBe(0);
    expect(used.has('b')).toBe(false); // (full: the fight's chance is kept)
  });
  it('mask + vine: the vine keeps the mask on', () => {
    expect(maskKeptByVine(['mask', 'vine'])).toBe(true);
    expect(maskKeptByVine(['mask'])).toBe(false);
  });
  it('shield + hammer: twice as hard within a second of a block', () => {
    expect(counterDamage(1, 10, 10.6)).toEqual({ damage: 2, combo: true });
    expect(counterDamage(1, 10, 11.2)).toEqual({ damage: 1, combo: false });
    expect(counterDamage(1, null, 11)).toEqual({ damage: 1, combo: false });
  });
  it('herb + herb: two at once mend five hearts', () => {
    expect(eatTwoHerbs({ hearts: 1, maxHearts: 7, herbs: 2 })).toEqual({ ok: true, hearts: 6, herbs: 0 });
    expect(eatTwoHerbs({ hearts: 1, maxHearts: 5, herbs: 3 })).toMatchObject({ hearts: 5, herbs: 1 });
    expect(eatTwoHerbs({ hearts: 1, maxHearts: 5, herbs: 1 }).ok).toBe(false);
    expect(eatHerb({ hearts: 1, maxHearts: 5, herbs: 1 }).hearts).toBe(3);
  });
});

describe('the secret pockets (W5)', () => {
  const world = createWorld(MAIN_WORLD);
  const nav = buildNavGrid(world);
  const D = MAIN_WORLD;
  const near = (p, r = 3) => nav.nearest({ x: p[0], z: p[1] }, r);
  function flood(from, closed = []) {
    const gates = closed.map((id) => world.gate(id));
    const shut = (n) => { const p = nav.posOf(n); return gates.some((g) => gateBlocks(g, p.x, p.z)); };
    const seen = new Uint8Array(nav.y.length);
    const stack = [from], nb = [];
    seen[from] = 1;
    while (stack.length) {
      const n = stack.pop();
      nav.neighbours(n, nb);
      for (let q = 0; q < nb.length; q += 2) { const m = nb[q]; if (seen[m] || shut(m)) continue; seen[m] = 1; stack.push(m); }
    }
    return (p, r = 3) => { const n = near(p, r); return n >= 0 && seen[n] === 1; };
  }
  const camp = near(D.camp.at);
  const ids = D.secrets.map((s) => s.gate);
  it('one in each region, each behind its own crystal door', () => {
    expect(D.secrets.map((s) => s.region)).toEqual([1, 2, 3, 4]);
    for (const s of D.secrets) {
      const g = D.gates.find((q) => q.id === s.gate);
      expect(g).toMatchObject({ kind: 'crystal', opens: 'secret', secret: true });
      expect(world.areaAt(...s.at).id).toBe(s.id);
    }
  });
  it('shut: no way in; open: walkable inside, the chest on the floor', () => {
    const open = flood(camp, []);
    const shut = flood(camp, ids);
    for (const s of D.secrets) {
      expect(shut(s.at), s.id).toBe(false);
      expect(open(s.at), s.id).toBe(true);
      expect(open(s.chest, 1.5), `${s.id} chest`).toBe(true);
      expect(world.heightAt(...s.chest), s.id).toBeCloseTo(world.heightAt(...s.at), 0);
    }
  });
  it('their pockets do not change the rest of the world (every region still joined to the camp)', () => {
    const shut = flood(camp, ids);
    for (const p of [D.spawn, D.arena.at, D.queen.at, D.iceBear.at, D.king.at]) expect(near(p) >= 0).toBe(true);
    expect(shut(D.spawn)).toBe(true);
  });
  it('the first find is a star, once', () => {
    const s = newState();
    expect(findSecret(s, 'secret3')).toBe(true);
    expect(findSecret(s, 'secret3')).toBe(false);
    expect(s.stars).toBe(1);
  });
});

describe('the purple shard after the ending (W5)', () => {
  it('waits only after the escape, gives a star once', () => {
    const s = newState();
    expect(shardWaiting(s)).toBe(false);
    expect(takePurpleShard(s)).toBe(false);
    s.world.won = 1;
    expect(shardWaiting(s)).toBe(true);
    expect(takePurpleShard(s)).toBe(true);
    expect(takePurpleShard(s)).toBe(false);
    expect(s.stars).toBe(1);
    expect(newWorldProgress().shard).toBe(false);
  });
});

describe('help for kids (GDD §8.5)', () => {
  it('a herb more from the second faint in a row to the same boss, until it sleeps', () => {
    const s = newState(), run = newRun(1);
    run.herbs = 0;
    expect(bossLost(s, 'iceBear')).toBe(1);
    expect(lossHerb(run, s, 'iceBear')).toBe(0);
    expect(bossLost(s, 'iceBear')).toBe(ASSIST_LOSSES);
    expect(lossHerb(run, s, 'iceBear')).toBe(1);
    run.herbs = ITEMS.herb.max;
    expect(lossHerb(run, s, 'iceBear')).toBe(0); // (a full belt)
    beatBoss(s, 'iceBear');
    run.herbs = 0;
    expect(lossHerb(run, s, 'iceBear')).toBe(0);
    bossLost(s, 'crystalKing'); bossLost(s, 'crystalKing'); bossWon(s, 'crystalKing');
    expect(s.bossLosses.crystalKing).toBeUndefined();
  });
  it('low hearts still make herbs likelier in chests', () => {
    const run = newRun(1);
    const herbW = () => lootChoices(run).find((e) => e.item === 'herb').weight;
    const normal = herbW();
    run.hearts = 1;
    expect(herbW()).toBe(normal * 3);
    expect(CHEST_LOOT.find((e) => e.item === 'herb')).toBeTruthy();
  });
  it('the Crystal King: 50 hp, the laser warns 1.6 s (never under the minimum)', () => {
    expect(BOSSES.crystalKing.hp).toBe(50);
    for (const phase of [1, 2, 3]) {
      const aim = crystalKingSteps('laser', phase, BOSSES.crystalKing)[0];
      expect(aim.name).toBe('aim');
      expect(aim.dur).toBeGreaterThanOrEqual(1.28 - 1e-9);
    }
    expect(crystalKingSteps('laser', 1, BOSSES.crystalKing)[0].dur).toBeCloseTo(1.6);
  });
});
