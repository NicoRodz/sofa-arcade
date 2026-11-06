// The packing tape (PR6): a line of TAPE_LEN tiles across the heading, centred TAPE_AHEAD tiles ahead. For both teams it cuts every blast diamond like a wall and keeps
// the floor under it as it is; bodies walk over it, so it never shuts anyone in. At most one per body: a new one takes the old one away.
import { MAP_H, MAP_W, solidAt } from '../../map';
import { DX, DY, type Dir } from '../grid/dir';
import type { ManchazoState } from '../match/state';
import { bodyTile } from '../match/tile';
import { TAPE_AHEAD, TAPE_LEN, TAPE_LIFE_TICKS, TAPE_WINDUP_TICKS, WRAP_FX_TICKS } from './config';
import type { WrapState } from './state';

/** The tile indices of a line centred on (cx, cy) across `dir`, minus walls and the edge of the board. A left-right mirror of the round mirrors it exactly. */
export function lineTiles(s: ManchazoState, cx: number, cy: number, dir: Dir): number[] {
  const horizontal = DX[dir as 0 | 1 | 2 | 3] === 0; // heading up or down: the line runs left-right
  const out: number[] = [];
  for (let k = -(TAPE_LEN - 1) / 2; k <= (TAPE_LEN - 1) / 2; k++) {
    const [x, y] = horizontal ? [cx + k, cy] : [cx, cy + k];
    if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && !solidAt(s.grid.map, x, y)) out.push(y * MAP_W + x);
  }
  return out;
}

/** Is the tile under a strip of tape? Then nobody paints, repaints or erases it. */
export const underTape = (w: WrapState, x: number, y: number): boolean => {
  const i = y * MAP_W + x;
  return w.strips.some((t) => t.tiles.includes(i));
};

/** The wall-like cut for `blastTiles`, or undefined when no tape is down (so nothing changes in a round without tape). */
export const tapeCut = (s: ManchazoState): ((x: number, y: number) => boolean) | undefined => {
  const w = s.match.sab?.plus?.wrap;
  return w?.strips.length ? (x, y) => underTape(w, x, y) : undefined;
};

/** Button B with the tape: the line is fixed now (where the body stands and faces), lands TAPE_WINDUP_TICKS later. */
export function startTape(s: ManchazoState, i: number): boolean {
  const w = s.match.sab!.plus!.wrap!;
  if (w.prep[i]! > 0) return false; // one at a time
  const dir = s.match.bodies[i]!.face;
  const [bx, by] = bodyTile(s.grid.bodies[i]!, dir);
  w.aim[i] = { x: bx + DX[dir as 0 | 1 | 2 | 3] * TAPE_AHEAD, y: by + DY[dir as 0 | 1 | 2 | 3] * TAPE_AHEAD, dir };
  w.prep[i] = TAPE_WINDUP_TICKS;
  return true;
}

/** A stain cuts the wind-up (the card is already spent). */
export const cancelTape = (s: ManchazoState, i: number): void => {
  const w = s.match.sab?.plus?.wrap;
  if (w) w.prep[i] = 0;
};

/** Clocks of the tape, once per tick: wind-ups land, strips wear off. */
export function stepTape(s: ManchazoState): void {
  const w = s.match.sab!.plus!.wrap!;
  for (const t of w.strips) t.left--;
  w.strips = w.strips.filter((t) => t.left > 0);
  w.fx.forEach((v, i) => v > 0 && w.fx[i]!--);
  s.grid.bodies.forEach((b, i) => {
    if (w.prep[i]! === 0 || --w.prep[i]! > 0) return;
    const { x, y, dir } = w.aim[i]!;
    const tiles = lineTiles(s, x, y, dir);
    w.strips = w.strips.filter((t) => t.owner !== i);
    w.strips.push({ owner: i, team: b.team, tiles, left: TAPE_LIFE_TICKS });
    w.fx[i] = WRAP_FX_TICKS;
    w.log.push({ kind: 'tape', tick: s.grid.tick, body: i, x, y, n: tiles.length });
  });
}
