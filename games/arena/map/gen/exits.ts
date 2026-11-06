// What every draw shares: where the 4 exits of a team are, the floor kept free around and ahead of them, and the bands the half is split in (the area each exit owns).
import type { Rng } from '@pichi/core';
import { MAP_H, MAP_W } from '../layout';
import type { Tile } from '../tile-map';

export const CENTRE = (MAP_W - 1) / 2;
const EXIT_ROWS = [1, 5, 9, 13]; // the 4 exits of a team, in column 1; each moves up to 1 row with the seed
const EXIT_COLUMN = 1;
const EXIT_RADIUS = 2; // Manhattan radius kept free around each exit
const MAX_JOGS = 2; // vertical steps of a lane

export const exitsOf = (rng: Rng): Tile[] =>
  EXIT_ROWS.map((r) => [EXIT_COLUMN, Math.min(MAP_H - 1, Math.max(0, r + Math.floor(rng() * 3) - 1))]);

/** The lane of an exit: a staircase of floor from its tile to the centre column with at most 2 jogs, so every walk to the centre is 12 to 14 steps (V4 by construction). */
function lane(rng: Rng, [ex, ey]: Tile): Tile[] {
  const jogs = new Set<number>();
  for (let n = Math.floor(rng() * (MAX_JOGS + 1)); jogs.size < n; )
    jogs.add(EXIT_COLUMN + 2 + Math.floor(rng() * (CENTRE - EXIT_COLUMN - 3)));
  const cells: Tile[] = [];
  let y = ey;
  for (let x = ex; x <= CENTRE; x++) {
    cells.push([x, y]);
    if (jogs.has(x)) {
      const next = y + (rng() < 0.5 ? -1 : 1);
      y = next < 0 || next >= MAP_H ? y - (next - y) : next;
      cells.push([x, y]);
    }
  }
  return cells;
}

/** 1 where the tile must stay floor: the free radius of each exit and, with `lanes`, its lane. Lanes draw from `rng`; without them nothing is consumed. */
export function keepAround(exits: readonly Tile[], rng: Rng, lanes = true): Uint8Array {
  const keep = new Uint8Array(MAP_W * MAP_H);
  for (const [ex, ey] of exits) {
    for (let y = ey - EXIT_RADIUS; y <= ey + EXIT_RADIUS; y++)
      for (let x = ex - EXIT_RADIUS; x <= ex + EXIT_RADIUS; x++)
        if (x >= 0 && y >= 0 && y < MAP_H && Math.abs(x - ex) + Math.abs(y - ey) <= EXIT_RADIUS) keep[y * MAP_W + x] = 1;
    if (lanes) for (const [x, y] of lane(rng, [ex, ey])) keep[y * MAP_W + x] = 1;
  }
  return keep;
}

/** The half split by the nearest exit's row. Each band takes the same floor, so the regions V5 compares come out even. `cells`: tiles of each band (columns 0-12). */
export function bandsOf(exits: readonly Tile[]): { band: Int8Array; cells: number[] } {
  const band = new Int8Array(MAP_W * MAP_H).fill(-1);
  const cells = exits.map(() => 0);
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < CENTRE; x++) {
      let best = 0;
      exits.forEach(([, ey], k) => {
        if (Math.abs(y - ey) < Math.abs(y - exits[best]![1])) best = k;
      });
      band[y * MAP_W + x] = best;
      cells[best]!++;
    }
  return { band, cells };
}

/** Furniture tiles each band may take so that the whole map holds `density` of furniture (the centre column belongs to no band). */
export function quotaOf(cells: readonly number[], density: number): number[] {
  const share = (MAP_W * MAP_H * density) / 2 / cells.length;
  const floor = (CENTRE * MAP_H) / cells.length - share;
  return cells.map((c) => Math.max(0, Math.round(c - floor)));
}
