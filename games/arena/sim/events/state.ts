// What the events add to a round (F4). Everything random is drawn when the round is created (the program, the rows, the rain order, the Hourglass row), so
// the tick itself never consumes RNG: the same seed gives the same program, whatever the players do.
import { FOUNTAIN_TILE, solidAt, type LivingSpec, type TileMap } from '../../map';
import { CLOCK_X, EVENT_KINDS, FOUNTAIN_CLEAR, EVENT_PLUS_KINDS, type EventKind } from './config';
import { planProgram, type Planned } from './plan';
import { createPlusEvents, type PlusEvents } from './plus-state';
import { substream } from './rng';

// PR2: the acts of the round announce themselves in the same log (`warn*` 120 ticks before the change, `phase*` when it happens)
export type PhaseAnnounce = 'warnScramble' | 'phaseScramble' | 'warnFinal' | 'phaseFinal';
export type AnnounceKind = EventKind | 'comeback' | 'hidden' | 'clockWarn' | 'overtime' | 'clockBroken' | PhaseAnnounce;
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
  plus?: PlusEvents; // F8b: the five new events (flag `eventsPlus`); absent without it (the key is not even there: a serialised F4 state stays as it was)
}

const countFloor = (map: TileMap, cy: number) => {
  let n = 0;
  for (let y = cy - 1; y <= cy + 1; y++) for (let x = CLOCK_X - 1; x <= CLOCK_X + 1; x++) if (!solidAt(map, x, y)) n++;
  return n;
};

/** The Hourglass's row: among the rows whose 3x3 has the most floor (nine when the map allows), one drawn from `manchazo:clock:<seed>`. */
export function clockRow(map: TileMap, seed: number, fountain = false): number {
  const rows = Array.from({ length: map.h - 2 }, (_, k) => k + 1).filter(
    (y) => !fountain || Math.abs(y - FOUNTAIN_TILE[1]) > FOUNTAIN_CLEAR,
  );
  const best = Math.max(...rows.map((y) => countFloor(map, y)));
  const cands = rows.filter((y) => countFloor(map, y) === best);
  return cands[Math.floor(substream(`manchazo:clock:${seed}`)() * cands.length)]!;
}

/** `plus`: the F8b events join the pool (the living specs and the tiles to keep as they are come from the caller: Mudanza validates against them). */
export interface PlusOptions {
  living: readonly LivingSpec[];
  avoid: ReadonlySet<number>;
}

export function createEvents(map: TileMap, seed: number, base: number, fountain = false, opts?: PlusOptions, phased = false): EventsState {
  const plus = opts ? createPlusEvents(map, seed, opts.living, opts.avoid) : undefined;
  const pool: EventKind[] = plus
    ? [...EVENT_KINDS, ...EVENT_PLUS_KINDS.filter((k) => k !== 'move' || plus.moves.length > 0)]
    : [...EVENT_KINDS];
  return {
    base,
    program: planProgram(substream(`manchazo:events:${seed}`), map, base, fountain, pool, phased),
    next: 0,
    active: null,
    big: null,
    rain: null,
    vac: null,
    comeback: { team: -1, until: 0, cool: 0 },
    clock: { phase: 'idle', outcome: 'none', row: clockRow(map, seed, fountain), team: -1, liveAt: 0, endsAt: 0, charge: 0 },
    hiddenShown: false,
    log: [],
    ...(plus ? { plus } : {}),
  };
}

export const announce = (ev: EventsState, kind: AnnounceKind, tick: number, team = -1): void => void ev.log.push({ kind, tick, team });
