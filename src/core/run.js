// One run (GDD §10.3 core/run.js): what lasts until the hero escapes or falls
// asleep, never saved (GDD §14). M3 adds the bag: owned items, the selected
// right-click tool, herbs, and the seed chests roll their loot from.
import { START } from '../data/items.js';
import { randomSeed } from './rng.js';

export const MAX_HEARTS = 5; // GDD §14 #3: five hearts, half-heart steps

export function newRun(seed = randomSeed()) {
  return {
    hearts: MAX_HEARTS, maxHearts: MAX_HEARTS, water: 1, shards: 0, asleep: 0,
    owned: [...START.owned], tool: START.tool, herbs: START.herbs,
    seed,
    area: 0, // M6a: which area of the run (the chest dice read it: core/loot.js)
    areaId: null,
    hurtCarry: 0, // M6a: damage under half a heart, carried (combat/hits.js carryDamage)
    armor: 0, armorGrade: null, // W3: blue hearts left, and the armour worn (combat/hits.js)
    // W5: the hammer's and the water gun's grades (combat/grades.js: back to
    // common on a faint), and what the star altar gives (core/growth.js)
    grades: { hammer: 'common', waterGun: 'common' },
    tank: 1, maskBonus: 0,
    // M4: how the run went, for the result screen
    rooms: 0, // rooms cleared
    time: 0, // s of play
    found: [], // codex ids first seen in this run (core/state.js seen)
    won: null, // M5: out of the cave ({ first, stars } from state.recordFinalWin)
  };
}

// Start over in place: the same object (everything holds a reference to it).
export function resetRun(run, seed) {
  return Object.assign(run, newRun(seed));
}
