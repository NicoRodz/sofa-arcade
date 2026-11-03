export { MAX_ATTEMPTS, attemptRng, draw, generateMap, type GeneratedMap } from './generate';
export { MAX_LIVING_PAIRS, mapStates, type LivingElement, type MapState } from './living';
export { placeLiving, holdsEverywhere, v9LivingConnection } from './living-place';
export { ARCHETYPES, ARCHETYPE_NAMES, archetypeOf, type Archetype, type MapKind } from './archetypes/kinds';
export { PLAZA_H, plazaRect, v8Signature } from './archetypes/signature';
export {
  BRUSH_REACH,
  FOUNTAIN_TILE,
  LIVING_MAX_X,
  SOFA_RAIL,
  closedTiles,
  closing,
  elementsOf,
  footprint,
  pivotsOf,
  statesOf,
  swept,
  toElement,
  type Closing,
  type LivingKind,
  type LivingSpec,
} from './living-shapes';
export { GENERATOR_VERSION, MAP_SEED_TAG, SEED_SPACE, encodeSeed, formatSeed, mapCaption, mapSeedFor, parseSeed } from './seed';
export { BASE_CHECKS, STATE_CHECKS, isValidMap, validateMap, type Check, type Violation } from './validate';
export { v4Equidistance, v5EvenArea, v6DeadEnds, v7Density } from './validate-base';
export { v1Connection, v2Crossings, v3Exits } from './validate-state';
