// PR6's state (flag `sabotageV2`): per body the soak clock and the tape's wind-up, the strips of tape on the floor and a log the TV reads (cues). `null` without the flag.
import type { Dir } from '../grid/dir';

export interface Strip {
  owner: number; // body that put it (max one per body)
  team: number;
  tiles: number[]; // tile indices (y * MAP_W + x); never a wall
  left: number; // ticks
}

export type WrapLogKind = 'tape' | 'squeeze' | 'burst';
export const WRAP_LOG_KINDS: readonly WrapLogKind[] = ['tape', 'squeeze', 'burst'];
export interface WrapEntry {
  kind: WrapLogKind;
  tick: number;
  body: number;
  x: number; // tile
  y: number;
  n: number; // squeeze: tiles it had soaked; burst: same; tape: tiles of the line
}

export interface WrapState {
  soak: number[]; // per body: ticks left of the soaking phase (0: not soaking; the sponge may still be held: `plus.sponge`)
  taken: number[][]; // per body: the DISTINCT tiles (y * MAP_W + x, ascending) this sponge has soaked since its first B; `plus.soaked` is its length
  prep: number[]; // per body: ticks left of the tape's wind-up (0: none)
  aim: { x: number; y: number; dir: Dir }[]; // per body: where its tape's line is centred and which way it was facing when it was pressed (read while `prep` > 0)
  strips: Strip[];
  fx: number[]; // per body: ticks the TV still flashes the tape it just put (display only)
  log: WrapEntry[];
}

export const createWrap = (bodies: number): WrapState => ({
  soak: Array.from({ length: bodies }, () => 0),
  taken: Array.from({ length: bodies }, () => []),
  prep: Array.from({ length: bodies }, () => 0),
  aim: Array.from({ length: bodies }, () => ({ x: 0, y: 0, dir: 0 as Dir })),
  strips: [],
  fx: Array.from({ length: bodies }, () => 0),
  log: [],
});

/** The part of the round's hash that PR6 adds (mixed only when the flag is on). */
export const wrapWords = (w: WrapState): number[] => [
  ...w.soak,
  ...w.taken.flatMap((a) => [a.length, ...a]),
  ...w.prep,
  ...w.aim.flatMap((a) => [a.x, a.y, a.dir]),
  ...w.fx,
  ...w.strips.flatMap((t) => [t.owner, t.team, t.left, t.tiles.length, ...t.tiles]),
  ...w.log.flatMap((e) => [WRAP_LOG_KINDS.indexOf(e.kind), e.tick, e.body, e.x, e.y, e.n]),
];
