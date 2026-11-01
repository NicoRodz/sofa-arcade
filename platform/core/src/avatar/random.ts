import { APPEARANCE_VERSION, CLOTHES_BY_GENDER, FIELD_SIZE } from './catalog';
import { pick, randInt, type Rng } from '../rng';
import type { Appearance } from './appearance-type';

/** A random look; `cl` always comes from the gender's list. Deterministic for a given rng. */
export function randomAppearance(rng: Rng): Appearance {
  const g = randInt(rng, 0, FIELD_SIZE.g - 1);
  return {
    v: APPEARANCE_VERSION,
    g,
    s: randInt(rng, 0, FIELD_SIZE.s - 1),
    hc: randInt(rng, 0, FIELD_SIZE.hc - 1),
    sk: randInt(rng, 0, FIELD_SIZE.sk - 1),
    hat: randInt(rng, 0, FIELD_SIZE.hat - 1),
    gl: randInt(rng, 0, FIELD_SIZE.gl - 1),
    bk: randInt(rng, 0, FIELD_SIZE.bk - 1),
    cl: pick(rng, CLOTHES_BY_GENDER[g]!),
  };
}
