// W2: world.sample() (the 1 m grid every part of the world reads, ~0.4 s for
// the 700 m world) worked out in a Web Worker while the main thread loads the
// models and the physics; world.useSample() takes it back. The worlds are
// plain data, so the worker builds the very same grid.
import { createWorld } from './world.js';
import { MAIN_WORLD } from './worlds/main.js';
import { TEST_WORLD } from './worlds/test.js';

const WORLDS = { main: MAIN_WORLD, test: TEST_WORLD };

self.onmessage = (e) => {
  const def = WORLDS[e.data];
  if (!def) { self.postMessage(null); return; }
  const t0 = performance.now();
  const g = createWorld(def).sample();
  self.postMessage({ ...g, ms: Math.round(performance.now() - t0) }, [g.h.buffer, g.deck.buffer, g.open.buffer, g.water.buffer, g.region.buffer]);
};
