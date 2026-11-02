// What the events add to a round (F4). Everything random is drawn when the round is created (the program, the rows, the rain order, the Hourglass row), so
// the tick itself never consumes RNG: the same seed gives the same program, whatever the players do.
import { solidAt, type TileMap } from '../../map';
import { CLOCK_X, type EventKind } from './config';
import { planProgram, type Planned } from './plan';
import { substream } from './rng';

export type AnnounceKind = EventKind | 'comeback' | 'hidden' | 'clockWarn' | 'overtime' | 'clockBroken';
export interface Announcement {
  kind: AnnounceKind;
  tick: number;
  team: number; // the team it is about (-1: none)
}

export interface ClockState {
  phase: 'idle' | 'warn' | 'live' | 'done'; // one per round: `done` stays done
  outcome: 'none' | 'filled' | 'broken' | 'gone'; // gone: the hidden scoreboard started before anyone filled it
  row: number; // the circle's centre row (drawn at creation from the clock substream)
  team: number; // the team losing when it fell: the one that charges it
  liveAt: number;
  endsAt: number;
  charge: number; // 0..CLOCK_FULL
}

export interface EventsState {
  base: number; // the round's base ticks (the schedule never moves with the extra time)
  program: Planned[];
  next: number; // index of the next planned event
  active: { kind: EventKind; start: number; end: number } | null; // never two at once
  big: { x: number; y: number; landAt: number } | null;
  rain: { done: number } | null; // washed-out tiles so far
  vac: { x: number; y: number; dy: number; wait: number } | null;
  comeback: { team: number; until: number; cool: number }; // team -1: not active
  clock: ClockState;
  hiddenShown: boolean;
  log: Announcement[];
}

const countFloor = (map: TileMap, cy: number) => {
  let n = 0;
  for (let y = cy - 1; y <= cy + 1; y++) for (let x = CLOCK_X - 1; x <= CLOCK_X + 1; x++) if (!solidAt(map, x, y)) n++;
  return n;
};

/** The Hourglass's row: among the rows whose 3x3 has the most floor (nine when the map allows), one drawn from `manchazo:clock:<seed>`. */
export function clockRow(map: TileMap, seed: number): number {
  const rows = Array.from({ length: map.h - 2 }, (_, k) => k + 1);
  const best = Math.max(...rows.map((y) => countFloor(map, y)));
  const cands = rows.filter((y) => countFloor(map, y) === best);
  return cands[Math.floor(substream(`manchazo:clock:${seed}`)() * cands.length)]!;
}

export function createEvents(map: TileMap, seed: number, base: number): EventsState {
  return {
    base,
    program: planProgram(substream(`manchazo:events:${seed}`), map, base),
    next: 0,
    active: null,
    big: null,
    rain: null,
    vac: null,
    comeback: { team: -1, until: 0, cool: 0 },
    clock: { phase: 'idle', outcome: 'none', row: clockRow(map, seed), team: -1, liveAt: 0, endsAt: 0, charge: 0 },
    hiddenShown: false,
    log: [],
  };
}

export const announce = (ev: EventsState, kind: AnnounceKind, tick: number, team = -1): void => void ev.log.push({ kind, tick, team });
