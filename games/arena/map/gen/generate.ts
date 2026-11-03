// The seeded map generator: the left half and the centre column are drawn, the right half is their mirror image, the result is validated (V1-V7) and, if it
// fails (V1-V7, then V8, the signature of the seed's archetype), the next attempt (`attempt k` of the substream) is tried, up to 64 times. After that the Clasico
// generator of F2 gets 64 attempts, and after that the F0 hand-made map stands in. Same seed, same map: bit for bit.
import { mulberry32, type Rng } from '@pichi/core';
import { MAP_W, MAP_H } from '../layout';
import { emptyMap, f0Map, mirrorTile, type TileMap } from '../tile-map';
import { bandsOf, exitsOf, keepAround, quotaOf } from './exits';
import { furnish } from './furniture';
import { drawArchetype } from './archetypes/draw';
import { archetypeOf, type MapKind } from './archetypes/kinds';
import { livingPlan } from './archetypes/living-for';
import { v8Signature } from './archetypes/signature';
import { placeLiving, v9LivingConnection } from './living-place';
import { elementsOf, type LivingSpec } from './living-shapes';
import { MAP_SEED_TAG } from './seed';
import { isValidMap } from './validate';
import { v1Connection } from './validate-state';

export const MAX_ATTEMPTS = 64;
const TARGET_LOW = 0.19; // furniture share aimed at (the validator accepts 18-24 %)
const TARGET_SPAN = 0.02;
const TRIES = 600;

export interface GeneratedMap {
  map: TileMap;
  seed: number;
  attempts: number; // 1..64 for the seed's archetype, 65..128 for Clasico; 128 when the F0 map stands in
  fallback: boolean; // the F0 map stands in (a seed whose archetype did not validate gets 'clasico', which is not this)
  archetype: MapKind; // what the TV calls the map: the seed's archetype, or 'clasico' when it fell back
  living: LivingSpec[]; // F5: the pairs and the fountain placed on it (empty unless asked for, and on the fallback)
}

/** The random stream of attempt k of a seed: its own substream, so a retry shares nothing with the attempt before. */
export function attemptRng(seed: number, k: number): Rng {
  const rng = mulberry32((Math.imul(seed ^ MAP_SEED_TAG, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b)) >>> 0);
  rng(); // the first draws of two close seeds are alike: drop one
  return rng;
}

/** One Clasico attempt, not yet validated: the exits' lanes and furniture drawn evenly over the half. */
export function draw(rng: Rng): TileMap {
  const exits = exitsOf(rng);
  const m = emptyMap([exits, exits.map(mirrorTile)]);
  const keep = keepAround(exits, rng);
  const { band, cells } = bandsOf(exits);
  const quota = quotaOf(cells, TARGET_LOW + rng() * TARGET_SPAN);
  furnish({ solid: m.solid, keep, band, quota, w: MAP_W, h: MAP_H }, rng, () => v1Connection(m) === null, TRIES);
  return m;
}

/** `accept` is the validator of the base map (injectable so a test can force the fallback); it defaults to V1-V7. With `withLiving` the living map is placed on a valid map (F5). `archetypes: false` skips the seed's archetype and draws Clasico, the generator of
 * F2 as it was (a test that pins a hash from before the archetypes asks for it). */
export function generateMap(
  seed: number,
  accept: (m: TileMap) => boolean = isValidMap,
  withLiving = false,
  archetypes = true,
): GeneratedMap {
  const chosen = archetypeOf(seed);
  const done = (map: TileMap, kind: MapKind, attempts: number, rng: Rng): GeneratedMap | null => {
    const living = withLiving ? placeLiving(map, rng, livingPlan(kind, map)) : [];
    if (withLiving && v9LivingConnection(map, elementsOf(living)) !== null) return null; // V9: a combination of the movers shuts the map
    return { map, seed, attempts, fallback: false, archetype: kind, living };
  };
  for (let k = 0; archetypes && k < MAX_ATTEMPTS; k++) {
    const rng = attemptRng(seed, k);
    const map = drawArchetype(chosen, rng);
    if (!accept(map) || v8Signature(chosen, map) !== null) continue;
    const g = done(map, chosen, k + 1, rng);
    if (g) return g;
  }
  for (let k = 0; k < MAX_ATTEMPTS; k++) {
    const rng = attemptRng(seed, k);
    const map = draw(rng);
    const g = accept(map) ? done(map, 'clasico', (archetypes ? MAX_ATTEMPTS : 0) + k + 1, rng) : null;
    if (g) return g;
  }
  return { map: f0Map(), seed, attempts: (archetypes ? 2 : 1) * MAX_ATTEMPTS, fallback: true, archetype: 'clasico', living: [] };
}
