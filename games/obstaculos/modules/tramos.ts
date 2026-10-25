// Tramos: the generated stretches between modules. Jumps are sampled inside the validated envelope: a fraction (70, 85 or 100 %)
// of the largest gap / step the validator accepts (4 tiles tied, 5 free; steps of 3).
import { pick, randInt, type Rng } from '@pichi/core/rng';
import { Canvas } from './dsl';
import { GROUND_ROW } from './types';
import type { Piece } from '../generate/assemble';
import type { Tether } from '../types';

export const FRACTIONS = [0.7, 0.85, 1.0] as const;
export const maxGap = (tether: Tether): number => (tether === 'freeOnly' ? 5 : 4); // chain mode: the rope keeps a single jump under ~5 tiles
const G = GROUND_ROW;

const piece = (c: Canvas): Piece => ({ w: c.w, rows: c.rows() });

export function flat(w: number, withCheckpoint = false): Piece {
  const c = new Canvas(w);
  if (withCheckpoint) c.set(Math.min(2, w - 1), G, 'P');
  return piece(c);
}

export function gap(frac: number, tether: Tether, rng: Rng): Piece {
  const g = Math.max(2, Math.min(maxGap(tether), Math.round(frac * maxGap(tether))));
  const c = new Canvas(g + 6);
  const kind = randInt(rng, 0, 2);
  if (kind === 0) c.pit(3, 2 + g, '~');
  else if (kind === 1) c.pit(3, 2 + g, '~', G + 2);
  else {
    c.pit(3, 2 + g, '^', G + 1);
    c.rect(3, 16, 2 + g, 17, '#');
  }
  return piece(c);
}

export function hill(frac: number, rng: Rng): Piece {
  const r = Math.max(1, Math.min(3, Math.round(frac * 3)));
  const p = randInt(rng, 2, 4);
  const c = new Canvas(p + 6);
  c.rect(3, G - r + 1, 2 + p, G, '#');
  return piece(c);
}

export function strip(frac: number, tether: Tether, rng: Rng): Piece {
  const s = frac >= 0.85 && tether === 'freeOnly' ? 3 : 2; // tied, 3 spikes would need a flight longer than the rope allows
  const c = new Canvas(s + 8);
  c.rect(4, G, 3 + s, G, '^');
  if (rng() < 0.5) c.set(5 + s, G - 1, '.');
  return piece(c);
}

export function hops(frac: number, tether: Tether, rng: Rng): Piece {
  const g = Math.max(2, Math.min(maxGap(tether), Math.round(frac * maxGap(tether))));
  const n = randInt(rng, 2, 3);
  const w = 4 + n * (g + 2);
  const c = new Canvas(w);
  c.pit(3, w - 4, rng() < 0.5 ? '~' : '^', G + 1);
  if (c.g[16]![3] === '^') c.rect(3, 16, w - 4, 17, '#');
  for (let i = 0; i < n - 1; i++) {
    const x = 3 + g + i * (g + 2);
    c.rect(x, G + 1, x + 1, G + 1, '#');
  }
  return piece(c);
}

export const TRAMOS = ['gap', 'hill', 'strip', 'hops', 'flat'] as const;
export type TramoKind = (typeof TRAMOS)[number];

export function tramo(kind: TramoKind, frac: number, tether: Tether, rng: Rng): Piece {
  switch (kind) {
    case 'gap':
      return gap(frac, tether, rng);
    case 'hill':
      return hill(frac, rng);
    case 'strip':
      return strip(frac, tether, rng);
    case 'hops':
      return hops(frac, tether, rng);
    default:
      return flat(randInt(rng, 4, 8));
  }
}
export const randomFraction = (rng: Rng, allowed: readonly number[]): number => pick(rng, allowed);
