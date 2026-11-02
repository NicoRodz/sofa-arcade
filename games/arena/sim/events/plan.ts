// The program of a round: 3 of the 4 scheduled events in the slots at 25 %, 46 % and 67 % of the base, each moved by up to +-4 % of the base, never
// overlapping the one before and never starting in the last 12 s. All the draws come from the `manchazo:events:<seed>` substream, in a fixed order.
import type { Rng } from '@pichi/core';
import { MAP_W, solidAt, type TileMap } from '../../map';
import { GOLD_ROWS_CLEAR, DURATION, EVENT_KINDS, type EventKind, JITTER, NO_START_TICKS, RAIN_ROWS, SLOT_FRACTIONS } from './config';
import { TICK_HZ } from '../grid/config';

export interface Planned {
  kind: EventKind;
  at: number; // tick it starts
  row: number; // first row of the rain band / the gold zone
  order: number[]; // rain: tiles (y * MAP_W + x) of the left half and the middle column, in the order they wash out (each takes its mirror with it)
  down: boolean; // vacuum: starts at the top going down (else the bottom, going up)
}

export function planProgram(rng: Rng, map: TileMap, base: number, fountain = false): Planned[] {
  const kinds = [...EVENT_KINDS];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j]!, kinds[i]!];
  }
  let prevEnd = 0;
  return SLOT_FRACTIONS.map((frac, k): Planned => {
    const kind = kinds[k]!;
    const nominal = Math.round(frac * base + (rng() * 2 - 1) * JITTER * base);
    const at = Math.min(Math.max(nominal, prevEnd + TICK_HZ), base - NO_START_TICKS - 1);
    prevEnd = at + DURATION[kind];
    const drawn = Math.floor(rng() * (map.h - RAIN_ROWS + 1));
    const row = kind === 'gold' && fountain ? GOLD_ROWS_CLEAR[drawn % GOLD_ROWS_CLEAR.length]! : drawn; // the draw is spent either way
    const down = rng() < 0.5;
    const order: number[] = [];
    if (kind === 'rain') {
      for (let y = row; y < row + RAIN_ROWS; y++)
        for (let x = 0; x <= (MAP_W - 1) / 2; x++) if (!solidAt(map, x, y)) order.push(y * MAP_W + x);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
    }
    return { kind, at, row, order, down };
  });
}
