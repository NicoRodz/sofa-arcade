// The grid prototype's world: bodies on the 27x15 map. Integers only (1/16 tile), no randomness yet (F2 brings the seeded generator).
import { spawnTile } from '../../map';
import { DEFAULT_CONTROL, HALF, MATCH_TICKS, TILE, type ControlPlan } from './config';
import { NONE, type Dir } from './dir';

/** A turn the player asked for and the sim has not executed yet. `failed` is set once, at 300 ms without execution. */
export interface TurnRequest {
  dir: Dir;
  age: number; // ticks since the request
  failed: boolean;
}

export interface TurnStats {
  requested: number;
  executed: number; // executed within 300 ms
  failed: number; // not executed within 300 ms (even if executed later)
  cancelled: number; // released or replaced before 300 ms, never executed
}

export interface GridBody {
  slot: number;
  team: number;
  x: number; // centre, 1/16 tile
  y: number;
  dir: Dir; // heading (NONE = standing)
  q: Dir; // stick quantized last tick (hysteresis memory)
  frac: number; // sub-unit movement carry, in units * TICK_HZ
  moved: boolean; // advanced during the last tick
  req: TurnRequest | null;
  stats: TurnStats;
}

export interface GridState {
  tick: number;
  control: ControlPlan;
  durationTicks: number;
  over: boolean;
  bodies: GridBody[]; // in slot order: the fixed order of the tick
}

/** What a phone asks of its body in one tick: the stick in milli units (-1000..1000, y down). The buttons are unused in F0. */
export interface GridInput {
  sx: number;
  sy: number;
}
export const NO_GRID_INPUT: GridInput = { sx: 0, sy: 0 };

export interface GridConfig {
  slots: readonly number[]; // up to 8
  teams?: readonly number[]; // team of each slot, same order (default: alternating 0, 1, 0, 1...)
  control?: ControlPlan;
  durationTicks?: number;
}

export function createGrid(cfg: GridConfig): GridState {
  const slots = [...cfg.slots].sort((a, b) => a - b);
  if (slots.length < 1 || slots.length > 8) throw new Error(`grid: 1 to 8 bodies, got ${slots.length}`);
  const taken = [0, 0];
  const bodies = slots.map((slot, i): GridBody => {
    const team = cfg.teams ? (cfg.teams[cfg.slots.indexOf(slot)] ?? 0) : i % 2;
    const [tx, ty] = spawnTile(team, taken[team]!++);
    return {
      slot,
      team,
      x: tx * TILE + HALF,
      y: ty * TILE + HALF,
      dir: NONE,
      q: NONE,
      frac: 0,
      moved: false,
      req: null,
      stats: { requested: 0, executed: 0, failed: 0, cancelled: 0 },
    };
  });
  return {
    tick: 0,
    control: cfg.control ?? DEFAULT_CONTROL,
    durationTicks: cfg.durationTicks ?? MATCH_TICKS,
    over: false,
    bodies,
  };
}
