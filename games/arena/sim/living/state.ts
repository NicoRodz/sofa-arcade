// What the living map adds to a round (F5). All the randomness was spent when the map was generated (the specs carry the phase of each element), so a tick
// never draws: the same seed gives the same map life whatever the players do. `null` in the match when the round plays without it.
import { closedTiles, type LivingSpec, type TileMap } from '../../map';
import { offsetOf, periodOf } from './config';

export interface LivePair {
  spec: LivingSpec; // a brush or a sofa: one state for its two mirrored members
  period: number;
  offset: number;
  state: number;
  pending: boolean; // its change is due but a body or a pinata is in the way: it waits and tries again every tick
  owner: [number, number]; // brush: the team that last stood on each member's pivot (-1: neutral, paints nothing); left member, right member
  movedAt: number; // tick of its last change (-1: none yet): the TV flashes it
  waited: number; // ticks it spent waiting
}

export interface Fountain {
  x: number;
  y: number;
  period: number;
  offset: number;
  last: { tick: number; team: number } | null; // its last splash: team -1 = washed the tiles clean (a tie)
}

export interface LiveState {
  base: Uint8Array; // the furniture with every living tile open: a state shuts its tiles on top of this
  pairs: LivePair[];
  fountain: Fountain | null;
}

export function createLive(map: TileMap, specs: readonly LivingSpec[]): LiveState {
  const live: LiveState = { base: map.solid.slice(), pairs: [], fountain: null };
  for (const spec of specs) {
    const period = periodOf(spec.kind);
    const offset = offsetOf(spec.kind, spec.phase);
    if (spec.kind === 'fountain') live.fountain = { x: spec.x, y: spec.y, period, offset, last: null };
    else live.pairs.push({ spec, period, offset, state: 0, pending: false, owner: [-1, -1], movedAt: -1, waited: 0 });
  }
  for (const p of live.pairs) for (const [x, y] of closedTiles(p.spec, 0)) map.solid[y * map.w + x] = 1; // state 0 stands from the first tick
  return live;
}

/** Ticks left to the pair's next change (counted from the regular schedule), and whether it is inside its 1 s warning (or already waiting). */
export function nextChange(
  p: Pick<LivePair, 'period' | 'offset' | 'pending'>,
  tick: number,
  warn: number,
): { in: number; warning: boolean } {
  const left = p.period - ((tick + p.offset) % p.period);
  return { in: left, warning: p.pending || left <= warn };
}
