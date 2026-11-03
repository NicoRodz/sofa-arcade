// What the F8b events add to a round. The random part (balloon spots, the furniture moves) is drawn when the round is created from its own substreams
// (`manchazo:move:<seed>`, `manchazo:balloons:<seed>`), so the tick never draws and the program of the F4 events keeps its draws.
import type { Tile } from '../../map';
import type { TileMap } from '../../map';
import { BALLOON_PAIRS } from './config';
import { drawBalloons, drawMoves, type MovePair } from './plus-draw';
import type { LivingSpec } from '../../map';

export interface PlusEvents {
  moves: readonly MovePair[]; // MOVE_PAIRS validated pairs of the left half (each also moves its mirror image); empty: no Mudanza in the pool
  balloons: readonly Tile[]; // BALLOON_PAIRS tiles of the left half (each also falls on its mirror image)
  contagion: { fireAt: number; flipped: number } | null; // flipped: tiles that turned (-1 until it fires)
  move: { at: number; done: number[] } | null; // done[k]: tick pair k landed (0: not yet)
  balloon: { landAt: number; owner: number[] } | null; // owner per balloon (left ones then their mirrors): -2 not landed, -1 neutral, else the team
  fx: number; // effects that hit so far (a contagion pass, a landing, a jump): the phones buzz when it grows
}

export function createPlusEvents(map: TileMap, seed: number, living: readonly LivingSpec[], avoid: ReadonlySet<number>): PlusEvents {
  return {
    moves: drawMoves(map, seed, living, avoid),
    balloons: drawBalloons(map, seed, BALLOON_PAIRS),
    contagion: null,
    move: null,
    balloon: null,
    fx: 0,
  };
}

/** The part of the round's hash that F8b adds (mixed only with the flag on). */
export function plusEventWords(p: PlusEvents): number[] {
  return [
    ...p.moves.flatMap((m) => [m.from[0], m.from[1], m.to[0], m.to[1]]),
    ...p.balloons.flatMap(([x, y]) => [x, y]),
    p.contagion ? p.contagion.fireAt : -1,
    p.contagion?.flipped ?? -2,
    p.move ? p.move.at : -1,
    ...(p.move?.done ?? []),
    p.balloon ? p.balloon.landAt : -1,
    ...(p.balloon?.owner.map((o) => o + 3) ?? []),
    p.fx,
  ];
}
