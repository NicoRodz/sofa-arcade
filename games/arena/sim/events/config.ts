// The F4 events: what each one lasts, where the program puts them, the numbers of the Hourglass and the come-back. Seconds are written once and converted to 60 Hz ticks here.
import { TICK_HZ, ms2ticks } from '../grid/config';

/** The events the program draws from (3 of these 4 per round). The come-back, the hidden scoreboard and the Hourglass are not scheduled: they check the round. */
export type EventKind = 'bigPinata' | 'rain' | 'gold' | 'vacuum' | PlusEventKind;
export const EVENT_KINDS: readonly EventKind[] = ['bigPinata', 'rain', 'gold', 'vacuum'];
/** F8b: the five new scheduled events (flag `eventsPlus`: they join the pool, 3 of the 9 per round). */
export type PlusEventKind = 'blackout' | 'contagion' | 'happyHour' | 'move' | 'balloons';
export const EVENT_PLUS_KINDS: readonly PlusEventKind[] = ['blackout', 'contagion', 'happyHour', 'move', 'balloons'];
export const ALL_EVENT_KINDS: readonly EventKind[] = [...EVENT_KINDS, ...EVENT_PLUS_KINDS]; // hash order: the F4 four keep their indexes

export const SLOT_FRACTIONS = [0.25, 0.46, 0.67] as const; // of the BASE duration (the Hourglass's extra time never moves them)
export const JITTER = 0.04; // +-4 % of the base around each slot
export const NO_START_TICKS = 12 * TICK_HZ; // no scheduled event starts in the last 12 s of the base

export const BIG_WARN_TICKS = 3 * TICK_HZ; // the big pinata is announced 3 s before it lands
export const BIG_WAIT_TICKS = 9 * TICK_HZ; // then it waits this long to be taken before it is gone
export const BIG_FUSE_TICKS = ms2ticks(500);
export const BIG_RADIUS = 5;
export const RAIN_TICKS = 8 * TICK_HZ; // the band is washed out over this long
export const RAIN_ROWS = 3;
export const GOLD_TICKS = 15 * TICK_HZ;
export const GOLD_COLS: readonly [number, number] = [10, 16]; // the double-value zone: 7 columns around the middle line, 3 rows
export const GOLD_ROWS = 3;
export const GOLD_FACTOR = 2;
export const VACUUM_TICKS = 10 * TICK_HZ;
export const VACUUM_STEP_TICKS = 20; // one tile every 20 ticks (3 tiles/s)
export const VACUUM_WIDTH = 3; // columns it cleans, centred on its own

// F8b. Apagon: only the render changes. Contagio: warning, then one pass over a copy of the board. Hora feliz: reach +1 and no per-player cap. Mudanza: warning,
// then two mirrored pairs of lone pieces of furniture jump to alternatives drawn and validated at creation (a pair whose destination holds a body or a pinata waits).
// Globos: three mirrored pairs of balloons, a shadow first; each paints 3x3 for the team with more bodies within 2 tiles when it lands (a tie lands neutral).
export const BLACKOUT_TICKS = 6 * TICK_HZ;
export const BLACKOUT_LIGHT = 2.5; // tiles: the circle of light around each player (render only)
export const CONTAGION_WARN_TICKS = 3 * TICK_HZ;
export const CONTAGION_SHOW_TICKS = 1 * TICK_HZ; // the TV keeps the result up this long
export const CONTAGION_MIN = 3; // rival tiles among the 4 orthogonal neighbours that turn a painted tile
export const HAPPY_TICKS = 8 * TICK_HZ;
export const HAPPY_BONUS = 1;
export const MOVE_WARN_TICKS = 2 * TICK_HZ;
export const MOVE_WINDOW_TICKS = 3 * TICK_HZ; // a pair that cannot land (a body or a pinata on its destination) keeps trying this long, then stays put
export const MOVE_PAIRS = 2;
export const BALLOON_WARN_TICKS = 3 * TICK_HZ;
export const BALLOON_SHOW_TICKS = 1 * TICK_HZ;
export const BALLOON_PAIRS = 3;
export const BALLOON_AROUND = 2; // Chebyshev tiles: who counts as "around" a balloon

export const DURATION: Record<EventKind, number> = {
  bigPinata: BIG_WARN_TICKS + BIG_WAIT_TICKS,
  rain: RAIN_TICKS,
  gold: GOLD_TICKS,
  vacuum: VACUUM_TICKS,
  blackout: BLACKOUT_TICKS,
  contagion: CONTAGION_WARN_TICKS + CONTAGION_SHOW_TICKS,
  happyHour: HAPPY_TICKS,
  move: MOVE_WARN_TICKS + MOVE_WINDOW_TICKS,
  balloons: BALLOON_WARN_TICKS + BALLOON_SHOW_TICKS,
};

export const GAP_PERCENT = 15; // "losing by more than 15 points of area" (come-back and Hourglass)
export const COMEBACK_BONUS = 1; // the losing team's pinatas: radius +1
export const COMEBACK_TICKS = 10 * TICK_HZ;
export const COMEBACK_COOLDOWN_TICKS = 20 * TICK_HZ;

export const HIDDEN_TICKS = 10 * TICK_HZ; // the scoreboard is hidden in the last 10 s of the round (counted from its current end)

export const CLOCK_FROM_TICKS = 30 * TICK_HZ; // from 30 s left the round checks, every second, whether the Hourglass falls
export const CLOCK_WARN_TICKS = 3 * TICK_HZ;
export const CLOCK_LIVE_TICKS = 12 * TICK_HZ;
export const CLOCK_X = 13; // the middle line; the circle is 3x3 around (13, row)
export const CLOCK_FULL_TICKS = 4 * TICK_HZ; // nine painted tiles fill it in 4 s: the charge gains one unit per painted tile per tick, full at 9 * this
export const CLOCK_CIRCLE = 9;
export const CLOCK_FULL = CLOCK_CIRCLE * CLOCK_FULL_TICKS;
export const CLOCK_MIN_PAINT = 3; // under this many tiles of the loser's colour in the circle the bar goes back
export const CLOCK_RETREAT = CLOCK_CIRCLE; // units lost per tick while it goes back
export const CLOCK_EXTRA_TICKS = 15 * TICK_HZ;

export const BANNER_TICKS = 3 * TICK_HZ; // the TV keeps an announcement up this long

// F5, the fountain stands on the middle line at (13, 7) and splashes the tiles within 2 of it. The Hourglass's circle and the golden zone are also on the
// middle line, so with a fountain in the round they keep out of its splash: the circle's centre row is at least FOUNTAIN_CLEAR + 1 rows from row 7 (rows 1-3
// and 11-13), and the golden zone starts on one of GOLD_ROWS_CLEAR (it is 3 rows tall, so it ends 3 or more rows from row 7). Without a fountain nothing changes.
export const FOUNTAIN_CLEAR = 3;
export const GOLD_ROWS_CLEAR: readonly number[] = [0, 1, 2, 10, 11, 12];

/** The F8b events that act in the tick (Apagon only darkens the TV and Hora feliz is read by the pinatas, so neither is here). */
export type ActingPlusKind = 'contagion' | 'move' | 'balloons';
export const isActingPlus = (k: EventKind): k is ActingPlusKind => k === 'contagion' || k === 'move' || k === 'balloons';
