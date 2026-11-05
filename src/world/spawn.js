import { createWolf } from '../entities/wolf.js';
import { createRabbit, createHare } from '../entities/rabbit.js';
import { createDeer } from '../entities/deer.js';
import { createBear } from '../entities/bear.js';
import { createIceBear } from '../entities/bosses/iceBear.js';
import { createRabbitChief } from '../entities/bosses/rabbitChief.js';
import { createFox } from '../entities/fox.js';
import { createMole } from '../entities/mole.js';
import { createMushroomQueen } from '../entities/bosses/mushroomQueen.js';

// who builds each kind of animal and boss
const SPAWNERS = { wolf: createWolf, rabbit: createRabbit, rabbitChief: createRabbitChief, fox: createFox, mole: createMole, mushroomQueen: createMushroomQueen, deer: createDeer, bear: createBear, hare: createHare, iceBear: createIceBear };

// the Polyfork model each kind is drawn with (procedural ones: none). The
// expedition makes an animal only once its model is here (release: the
// later regions' animals stream in after the title).
const KIND_MODEL = { wolf: 'wolf', rabbit: 'rabbit', rabbitChief: 'rabbit', fox: 'fox', deer: 'deer', bear: 'bear', hare: 'hare', iceBear: 'bear' };
export const modelsOfKinds = (specs) => [...new Set(specs.map((e) => KIND_MODEL[e.kind ?? e]).filter(Boolean))];

// One animal, `spec` ({ kind, x, z, heading, …its own extras }) in metres
// from `origin`.
export function spawnEnemy(G, spec, origin = { x: 0, z: 0 }) {
  return SPAWNERS[spec.kind](G, { ...spec, x: origin.x + spec.x, z: origin.z + spec.z, heading: spec.heading ?? 0 });
}
