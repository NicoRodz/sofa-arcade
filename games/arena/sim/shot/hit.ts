// What a shot does when it lands, and who it can land on. Pure reads of the tick's snapshot: `step.ts` decides every hit first and applies them after, in shot order.
import { solidAt } from '../../map';
import { radiusOf } from '../events/comeback';
import { GLUE_FUSE_TICKS, SHOT_CLASH_UNITS, SHOT_HIT_UNITS } from './config';
import type { ManchazoState } from '../match/state';
import { bodyTile } from '../match/tile';
import { DIZZY_TICKS } from '../sabotage/kinds';
import { swapBodies } from '../sabotage/plus-use';
import { FUSE_TICKS } from '../match/config';
import type { Shot } from './state';

/** Can body j be hit by `shot` now? A rival that stands up (not stained) and is not immune (the Cambiazo's 0.5 s). Teammates and stained bodies are passed through. */
export const targetable = (s: ManchazoState, shot: Shot, j: number): boolean =>
  s.grid.bodies[j]!.team !== shot.team && s.match.bodies[j]!.stun === 0 && (s.match.sab?.plus?.immune[j] ?? 0) === 0;

/** The body a shot's point is inside of (its 16x16 square, strictly), lowest index first, or -1. */
export function bodyAt(s: ManchazoState, shot: Shot): number {
  return s.grid.bodies.findIndex(
    (b, j) => targetable(s, shot, j) && Math.abs(shot.x - b.x) < SHOT_HIT_UNITS && Math.abs(shot.y - b.y) < SHOT_HIT_UNITS,
  );
}

/** Two shots of different teams whose points are within SHOT_CLASH_UNITS on both axes. */
export const clash = (a: Shot, b: Shot): boolean =>
  a.team !== b.team && Math.abs(a.x - b.x) < SHOT_CLASH_UNITS && Math.abs(a.y - b.y) < SHOT_CLASH_UNITS;

/** A plain pinata (no card on it) where a missed Pegote stopped, unless the tile is shut or already holds one. Not counted against the owner's pinata limit: it is the card's payoff. */
export function land(s: ManchazoState, shot: Shot, x: number, y: number): void {
  const m = s.match;
  if (solidAt(s.grid.map, x, y) || m.pinatas.some((p) => p.x === x && p.y === y)) return;
  m.pinatas.push({ id: m.nextId++, x, y, team: shot.team, owner: shot.owner, fuse: FUSE_TICKS, radius: radiusOf(m, shot.team) });
}

/** The effect of `shot` on body j. Pegote: rides j with a fuse of at least 120 ticks, in the shooter's colour. Cambiazo: shooter and j trade places. Mareo: j's stick is inverted. */
export function apply(s: ManchazoState, shot: Shot, j: number): void {
  const m = s.match;
  if (shot.kind === 'glue') {
    const [x, y] = bodyTile(s.grid.bodies[j]!, m.bodies[j]!.face);
    m.pinatas.push({
      id: m.nextId++,
      x,
      y,
      team: shot.team,
      owner: shot.owner,
      fuse: GLUE_FUSE_TICKS,
      radius: radiusOf(m, shot.team),
      mod: 'glue',
      stuck: j,
      passes: 0,
      lock: 0,
    });
  } else if (shot.kind === 'swap') swapBodies(s, shot.owner, j);
  else if (m.sab?.plus) m.sab.plus.dizzy[j] = DIZZY_TICKS;
}
