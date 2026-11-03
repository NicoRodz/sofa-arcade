// Playing one of the five F8a cards (button 2). 'spent': the hand is emptied; 'kept': the card stays in hand (the sponge, between its two presses); 'refused': nothing happened.
import { MAP_H, MAP_W, solidAt } from '../../map';
import { NONE } from '../grid/dir';
import { clearTile, paintTile } from '../match/board';
import type { ManchazoState } from '../match/state';
import { bodyTile } from '../match/tile';
import {
  DIZZY_CHARGE_TICKS,
  IMMUNE_TICKS,
  INK_TICKS,
  SPONGE_MAX,
  SPONGE_TICKS,
  SQUEEZE_FX_TICKS,
  SWAP_FX_TICKS,
  SWAP_RANGE,
  TAPE_TICKS,
  type SabotageKind,
} from './kinds';
import { nearestRival } from './near';

export type Played = 'spent' | 'kept' | 'refused';

/** Offsets of a square spiral from the centre, clockwise on the screen (y down), 5x5 worth. Team 1 reads it mirrored: a left-right mirror of a round stays a mirror. */
// biome-ignore format: a table
const SPIRAL: readonly (readonly [number, number])[] = [
  [0, 0], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
  [2, -1], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [-1, 2], [-2, 2], [-2, 1], [-2, 0], [-2, -1], [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2],
];

function absorb(s: ManchazoState, i: number): number {
  const m = s.match;
  const team = s.grid.bodies[i]!.team;
  const [cx, cy] = bodyTile(s.grid.bodies[i]!, m.bodies[i]!.face);
  let n = 0;
  for (let y = cy - 1; y <= cy + 1; y++)
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || m.paint[y * MAP_W + x] !== 1 - team) continue;
      clearTile(m, x, y, team);
      if (m.paint[y * MAP_W + x] === -1) n++; // a tape may have refused
    }
  return Math.min(n, SPONGE_MAX);
}

function squeeze(s: ManchazoState, i: number): void {
  const m = s.match;
  const plus = m.sab!.plus!;
  const team = s.grid.bodies[i]!.team;
  const [cx, cy] = bodyTile(s.grid.bodies[i]!, m.bodies[i]!.face);
  let left = plus.soaked[i]!;
  for (const [dx, dy] of SPIRAL) {
    if (left <= 0) break;
    const x = cx + (team === 0 ? dx : -dx),
      y = cy + dy;
    if (solidAt(s.grid.map, x, y)) continue;
    paintTile(m, x, y, team, s.grid.tick);
    left--;
  }
  plus.sponge[i] = 0;
  plus.soaked[i] = 0;
  plus.squeezeFx[i] = SQUEEZE_FX_TICKS;
}

/** Bodies i and j trade places (and headings); each lands standing and both are immune for IMMUNE_TICKS. */
export function swapBodies(s: ManchazoState, i: number, j: number): void {
  const plus = s.match.sab!.plus!;
  const [a, b] = [s.grid.bodies[i]!, s.grid.bodies[j]!];
  const [fa, fb] = [s.match.bodies[i]!.face, s.match.bodies[j]!.face];
  [a.x, b.x] = [b.x, a.x];
  [a.y, b.y] = [b.y, a.y];
  s.match.bodies[i]!.face = fb;
  s.match.bodies[j]!.face = fa;
  for (const body of [a, b]) {
    body.dir = NONE; // each lands standing: a stick still held reads as a new request
    body.q = NONE;
    body.req = null;
    body.moved = false;
  }
  for (const k of [i, j]) {
    plus.immune[k] = IMMUNE_TICKS;
    plus.swapFx[k] = SWAP_FX_TICKS;
  }
}

function swap(s: ManchazoState, i: number): Played {
  const j = nearestRival(s, i, SWAP_RANGE);
  if (j < 0) return 'refused'; // nobody within range: the card is not spent
  swapBodies(s, i, j);
  return 'spent';
}

export function playPlus(s: ManchazoState, i: number, kind: SabotageKind): Played {
  const plus = s.match.sab?.plus;
  if (!plus) return 'refused';
  const team = s.grid.bodies[i]!.team;
  if (kind === 'tape') {
    const [x, y] = bodyTile(s.grid.bodies[i]!, s.match.bodies[i]!.face);
    plus.tapes.push({ x, y, team, left: TAPE_TICKS });
    return 'spent';
  }
  if (kind === 'ink') {
    plus.veil[team] = INK_TICKS;
    return 'spent';
  }
  if (kind === 'sponge') {
    if (plus.sponge[i]! > 0) {
      squeeze(s, i);
      return 'spent';
    }
    const n = absorb(s, i);
    if (n === 0) return 'refused'; // no rival paint in the 3x3: the card is not spent
    plus.sponge[i] = SPONGE_TICKS;
    plus.soaked[i] = n;
    return 'kept';
  }
  if (kind === 'swap') return swap(s, i);
  plus.charge[i] = DIZZY_CHARGE_TICKS;
  return 'spent';
}
