// The calendar of HAZARD_V2: several events per round instead of one. Normal 2, Hard 3 (Easy, when switched on by hand: one). Each event starts inside a window given as a fraction of the round,
// no kind repeats, and at least `gapMs` pass between the end of one and the announce of the next. The kinds and instants come from a stream of their own (seed ^ EVENT_SCHEDULE_TAG):
// versus has ONE global Mid, so both kitchens get the same event on the same tick. The sim keeps the rest of the list in `Mid.queue` and loads the next one when an event ends.
import type { Planned } from '../rules/types';
export type { Planned } from '../rules/types';
import { mulberry32 } from '@pichi/core';
import { ANNOUNCE_MS, type EventKind } from '../rules/midround';
import { EVENT_SCHEDULE_TAG, hazardParams } from './hazard-v2';
import type { Difficulty } from '@pichi/core';

/** The planned events of a round, in time order. `pool` = the kinds this round can have; `activeMs` how long each lasts (for the gap). */
export function planEvents(
  seed: number,
  d: Difficulty,
  roundMs: number,
  pool: readonly EventKind[],
  activeMs: (k: EventKind) => number,
): Planned[] {
  const rng = mulberry32((seed ^ EVENT_SCHEDULE_TAG) >>> 0);
  const { windows, gapMs } = hazardParams(d).events;
  const left = [...pool];
  const out: Planned[] = [];
  let freeAt = 0; // the earliest announce of the next event
  for (const [from, to] of windows) {
    if (!left.length) break;
    const kind = left.splice(Math.floor(rng() * left.length), 1)[0]!;
    let startAt = Math.floor((from + rng() * (to - from)) * roundMs);
    if (startAt - ANNOUNCE_MS < freeAt) startAt = freeAt + ANNOUNCE_MS;
    out.push({ kind, startAt });
    freeAt = startAt + activeMs(kind) + gapMs;
  }
  return out;
}

/** Orders a rush adds to each queue: 3 + one per three chefs of the team, at most 6. */
export const rushOrdersV2 = (chefs: number): number => Math.min(6, 3 + Math.floor(chefs / 3));
