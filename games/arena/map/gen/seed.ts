// The map seed: 25 bits written as 5 Crockford base32 characters (no I, L, O or U: they read well from the couch) behind the generator's version,
// for example `2·7KQ2M`. A seed of another version is not the same map, so the screen says so instead of drawing a different one.
import { mulberry32 } from '@pichi/core';
import { ARCHETYPE_NAMES, archetypeOf, type MapKind } from './archetypes/kinds';

/** 1 was F0's hand-made map; 2 was the single generator; 3 drew the seed's archetype (Pasillos, Islas, Plaza, Ocho); 4 redraws Islas as a floor plan of sealed rooms (and Pasillos refuses a floor plan). Any change to how a seed becomes a map bumps it. */
export const GENERATOR_VERSION = 4;
export const SEED_CHARS = 5;
export const SEED_SPACE = 32 ** SEED_CHARS; // 33,554,432 maps
export const MAP_SEED_TAG = 0x4d41505f; // substream of the lobby seed that hands out one map seed per round
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** The 5-character code of a map seed. */
export function encodeSeed(seed: number): string {
  let n = Math.floor(seed) % SEED_SPACE;
  let out = '';
  for (let i = 0; i < SEED_CHARS; i++, n = Math.floor(n / 32)) out = ALPHABET[n % 32]! + out;
  return out;
}

/** `2·7KQ2M` (what the screen shows after "MAPA "). */
export const formatSeed = (seed: number, version = GENERATOR_VERSION): string => `${version}·${encodeSeed(seed)}`;

/** What the TV writes next to the map: `MAPA 3·7KQ2M · ISLAS`. */
export const mapCaption = (seed: number, kind: MapKind | null): string =>
  `MAPA ${formatSeed(seed)}${kind ? ` · ${ARCHETYPE_NAMES[kind]}` : ''}`;

/** Reads `2·7KQ2M` (also `2-7kq2m` or the bare code, version = current). Crockford's look-alikes read as their digit: O -> 0, I and L -> 1. Null when it is not a seed. */
export function parseSeed(text: string): { version: number; seed: number } | null {
  const m = /^(?:(\d{1,3})[·\-.\s])?([0-9A-Z]{5})$/.exec(text.trim().toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1'));
  if (!m) return null;
  let seed = 0;
  for (const c of m[2]!) {
    const v = ALPHABET.indexOf(c);
    if (v < 0) return null; // U
    seed = seed * 32 + v;
  }
  return { version: m[1] ? Number(m[1]) : GENERATOR_VERSION, seed };
}

const REDRAWS = 16; // a round whose archetype repeats the last round's draws again at most this many times (then it keeps the repeat: the bound keeps the walk finite)

/**
 * The map seed of round `round` (0, 1, 2...) of a lobby: draws of the substream `lobbySeed ^ MAP_SEED_TAG`, one per round, plus a redraw (the next draw of the
 * stream) while the seed's archetype is the one the round before played, so the same archetype never comes twice in a row (up to REDRAWS redraws).
 * Same lobby seed and round, same map. Outside the sim: the lobby hands the seed to the round.
 */
export function mapSeedFor(lobbySeed: number, round: number): number {
  const rng = mulberry32((lobbySeed ^ MAP_SEED_TAG) >>> 0);
  const draw = () => Math.floor(rng() * SEED_SPACE);
  let seed = draw();
  for (let k = 1; k <= round; k++) {
    const last = archetypeOf(seed);
    seed = draw();
    for (let n = 0; n < REDRAWS && archetypeOf(seed) === last; n++) seed = draw();
  }
  return seed;
}
