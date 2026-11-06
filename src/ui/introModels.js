// The Polyfork models the cutscenes use (the intro, the ending). Plain data, kept apart from
// intro.js so the loader, main.js and tests can read it without pulling in
// the cutscene (and Polyfork's stage.mjs, which CI only fetches at build time).
export const INTRO_MODELS = [
  'introOak', 'introOak2', 'introBirch', 'introMaple', 'introPine', 'introYoungPine', 'introBush', 'stalactites',
  'grass', 'flower', 'fern', 'fernClump', 'toadstool', 'mossBoulder', 'boulder', 'stump', 'log', 'caveMouth',
  'crystalCluster', 'mushrooms', 'wolf', 'rabbit', 'fox', 'deer',
];
// The ending cutscene's set (ui/ending.js): the same forest and cave mouth
// (ui/cutsceneSet.js), and a dark tunnel. Fetched while the hero escapes
// (world/expedition.js, after the Crystal King) and let go after it.
export const ENDING_MODELS = [
  'introOak', 'introOak2', 'introBirch', 'introMaple', 'introPine', 'introYoungPine', 'introBush', 'stalactites',
  'grass', 'flower', 'fern', 'fernClump', 'toadstool', 'mossBoulder', 'boulder', 'stump', 'log', 'caveMouth',
  'crystalCluster', 'mushrooms',
];
