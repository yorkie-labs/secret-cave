// The Polyfork models the intro cutscene uses. Plain data, kept apart from
// intro.js so the loader, main.js and tests can read it without pulling in
// the cutscene (and Polyfork's stage.mjs, which CI only fetches at build time).
export const INTRO_MODELS = [
  'introOak', 'introOak2', 'introBirch', 'introMaple', 'introPine', 'introYoungPine', 'introBush', 'stalactites',
  'grass', 'flower', 'fern', 'fernClump', 'toadstool', 'mossBoulder', 'boulder', 'stump', 'log', 'caveMouth',
  'crystalCluster', 'mushrooms', 'wolf', 'rabbit', 'fox', 'deer',
];
