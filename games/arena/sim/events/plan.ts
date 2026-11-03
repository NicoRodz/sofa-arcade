// The program of a round: 3 of the 4 scheduled events in the slots at 25 %, 46 % and 67 % of the base, each moved by up to +-4 % of the base, never
// overlapping the one before and never starting in the last 12 s. All the draws come from the `manchazo:events:<seed>` substream, in a fixed order.
import type { Rng } from '@pichi/core';
import { MAP_W, solidAt, type TileMap } from '../../map';
import { GOLD_ROWS_CLEAR, DURATION, EVENT_KINDS, type EventKind, JITTER, NO_START_TICKS, RAIN_ROWS, SLOT_FRACTIONS } from './config';
import { TICK_HZ } from '../grid/config';
import { rawPhase } from '../phase/config';
import { eligiblePhases } from '../phase/eligible';

export interface Planned {
  kind: EventKind;
  at: number; // tick it starts
  row: number; // first row of the rain band / the gold zone
  order: number[]; // rain: tiles (y * MAP_W + x) of the left half and the middle column, in the order they wash out (each takes its mirror with it)
  down: boolean; // vacuum: starts at the top going down (else the bottom, going up)
}

/**
 * `pool`: the kinds the program draws from (the F4 four; with `eventsPlus`, up to nine). `phased` (PR2): a slot only takes a kind its act allows (`eligiblePhases`): the first one of the
 * shuffle that fits; none fits (a pool of only big events at the 25 % slot, which falls in the Opening): the slot is spent and nothing starts. Every draw is made either way.
 */
export function planProgram(
  rng: Rng,
  map: TileMap,
  base: number,
  fountain = false,
  pool: readonly EventKind[] = EVENT_KINDS,
  phased = false,
): Planned[] {
  const kinds = [...pool];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j]!, kinds[i]!];
  }
  let prevEnd = 0;
  const program: Planned[] = [];
  for (const frac of SLOT_FRACTIONS) {
    const nominal = Math.round(frac * base + (rng() * 2 - 1) * JITTER * base);
    const at = Math.min(Math.max(nominal, prevEnd + TICK_HZ), base - NO_START_TICKS - 1);
    const fit = phased ? kinds.findIndex((k) => eligiblePhases(k).includes(rawPhase(at, base, base))) : 0; // not phased: the next of the shuffle, as always
    const kind = fit >= 0 ? kinds.splice(fit, 1)[0]! : null;
    const drawn = Math.floor(rng() * (map.h - RAIN_ROWS + 1));
    const row = kind === 'gold' && fountain ? GOLD_ROWS_CLEAR[drawn % GOLD_ROWS_CLEAR.length]! : drawn; // the draw is spent either way
    const down = rng() < 0.5;
    if (kind === null) continue;
    prevEnd = at + DURATION[kind];
    const order: number[] = [];
    if (kind === 'rain') {
      for (let y = row; y < row + RAIN_ROWS; y++)
        for (let x = 0; x <= (MAP_W - 1) / 2; x++) if (!solidAt(map, x, y)) order.push(y * MAP_W + x);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
    }
    program.push({ kind, at, row, order, down });
  }
  return program;
}
