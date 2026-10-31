// EVENTS_V2 (design pizzas-tanda2 section 4): the state of the events with presence. Exists only in a cooperative round whose config asked for `eventsV2` and has events on:
// without it `game.ev2` is absent, no hook below runs and the round is bit for bit the round of before. Everything here is integers and tick time: no stream, no wall clock.
import type { Difficulty } from '@pichi/core/difficulty';
import { isFloor } from '../maps';
import type { Game, Station } from '../round/state';

export const EVENTS_V2_OPTION = 'eventsV2';
/** The lobby option: the events with presence. Missing = on (Nico wants them in the juntada); `eventsV2: false` turns them off. The sim itself stays off unless the config asks (createGame). */
export const eventsV2Of = (modeOptions: Readonly<Record<string, boolean | number | string>> | undefined): boolean =>
  modeOptions?.[EVENTS_V2_OPTION] !== false;
export const BOARD_RADIUS = 1.5; // tiles: a chef this close to the board (or the candle drawer) is "at" it
export const HOLD_MS: Record<Difficulty, number> = { easy: 2000, normal: 2000, hard: 1500 }; // B held at the board
export const HOLD_CHEFS: Record<Difficulty, number> = { easy: 1, normal: 1, hard: 2 }; // chefs it takes (capped by the chefs in the kitchen)
export const FAST_MS = 5000; // back before this: +60, else +30
export const BLACKOUT_PRIZE = { fast: 60, slow: 30 } as const;
export const RED_PRIZE = 20; // per red ticket served on time
export const PERFECT_PRIZE = 100; // all of them
export const CAKE_TTL_MS: Record<Difficulty, number> = { easy: 75_000, normal: 75_000, hard: 60_000 };
export const CAKE_PRIZE: Record<Difficulty, number> = { easy: 250, normal: 250, hard: 350 };
export const CAKE_PENALTY: Record<Difficulty, number> = { easy: -50, normal: -50, hard: -100 };

export interface Spot {
  tx: number;
  ty: number;
  station: number; // index in game.stations of the counter it sits on
}
export interface Ev2 {
  board: Spot | null; // the light board of the blackout (set when the blackout starts)
  hold: number; // ms of B held at the board by enough chefs
  holders: number[]; // chefs holding it this tick (for the view)
  restoredAt: number | null; // match time a chef brought the light back (null: it came back by itself)
  rush: { total: number; ok: number; late: number; closed: boolean } | null;
  cake: { drawer: Spot; candled: boolean; by: number | null; order: number; closed: boolean } | null;
}
export const createEv2 = (): Ev2 => ({ board: null, hold: 0, holders: [], restoredAt: null, rush: null, cake: null });

/** The free counter nearest to `to` (default: the centroid of the floor), ties by (y, x). Null when the map has no free counter. */
export function pickSpot(g: Game, to?: { x: number; y: number }, skip?: number): Spot | null {
  let cx = 0,
    cy = 0,
    n = 0;
  if (!to)
    g.grid.forEach((row, y) =>
      row.forEach((_t, x) => {
        if (isFloor(g.grid, x, y)) {
          cx += x + 0.5;
          cy += y + 0.5;
          n++;
        }
      }),
    );
  const at = to ?? { x: cx / Math.max(1, n), y: cy / Math.max(1, n) };
  let best: Spot | null = null,
    bestD = Infinity;
  g.stations.forEach((s: Station, i) => {
    if (s.kind !== 'counter' || s.item !== null || i === skip) return;
    const d = Math.hypot(s.tx + 0.5 - at.x, s.ty + 0.5 - at.y);
    if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && best && (s.ty < best.ty || (s.ty === best.ty && s.tx < best.tx)))) {
      best = { tx: s.tx, ty: s.ty, station: i };
      bestD = d;
    }
  });
  return best;
}

export const near = (p: { x: number; y: number }, s: Spot, r = BOARD_RADIUS) => Math.hypot(p.x - (s.tx + 0.5), p.y - (s.ty + 0.5)) <= r;
