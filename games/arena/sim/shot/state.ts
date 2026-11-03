// The projectiles' state: per body the aim countdown, the shots in the air and a log the TV reads (cues, splashes). `null` in the sabotage state when the flag is off.
import { ALL_KINDS, type SabotageKind } from '../sabotage/kinds';
import type { Dir } from '../grid/dir';

export interface Shot {
  id: number;
  kind: SabotageKind; // glue | swap | dizzy
  owner: number; // index in grid.bodies
  team: number;
  x: number; // units (1/16 tile), the point
  y: number;
  dir: Dir;
  left: number; // units of range left
  tx: number; // tile it is in now (the wall rule decides it: on an edge, the tile it is heading into)
  ty: number;
  lx: number; // the tile before: where a shot lands if its tile shuts (a living part closed on it)
  ly: number;
}

export type ShotLogKind = 'launch' | 'hit' | 'miss' | 'clash' | 'pass' | 'cancel';
export const SHOT_LOG_KINDS: readonly ShotLogKind[] = ['launch', 'hit', 'miss', 'clash', 'pass', 'cancel'];
export interface ShotEntry {
  kind: ShotLogKind;
  tick: number;
  body: number; // launch, miss, clash, cancel: the shooter; hit: the shooter; pass: the carrier that passed it
  target: number; // hit: the body hit; pass: the receiver; otherwise -1
  x: number; // tile
  y: number;
  card: SabotageKind;
}

export interface ShotState {
  prep: number[]; // per body: ticks of aim left (0: not aiming). The card stays in hand until the shot leaves.
  shots: Shot[];
  nextId: number;
  log: ShotEntry[];
}

export const createShots = (bodies: number): ShotState => ({
  prep: Array.from({ length: bodies }, () => 0),
  shots: [],
  nextId: 0,
  log: [],
});

const code = (k: SabotageKind) => ALL_KINDS.indexOf(k) + 1;

/** The part of the round's hash that PR4 adds (mixed only when the flag is on). */
export const shotWords = (s: ShotState): number[] => [
  ...s.prep,
  s.nextId,
  ...s.shots.flatMap((p) => [p.id, code(p.kind), p.owner, p.team, p.x, p.y, p.dir, p.left, p.tx, p.ty, p.lx, p.ly]),
  ...s.log.flatMap((e) => [SHOT_LOG_KINDS.indexOf(e.kind), e.tick, e.body, e.target, e.x, e.y, code(e.card)]),
];
