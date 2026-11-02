// Tunables of the grid prototype (F0). Positions are integers in 1/16 of a tile; time is in 60 Hz ticks. Seconds are written once and converted here.
export const TICK_HZ = 60;
export const TILE = 16; // units per tile: the body is exactly one tile wide
export const HALF = TILE / 2;
export const ms2ticks = (ms: number): number => Math.round((ms * TICK_HZ) / 1000);

export const SPEED_UPS = 64; // units per second (4 tiles/s)
export const DEADZONE = 300; // stick magnitude (milli) under which the cross rests
export const HYSTERESIS_TAN = 1732; // tan(60 deg) * 1000: a quantized axis flips only 15 deg past the diagonal
export const TURN_BUFFER_TICKS = ms2ticks(150); // a requested turn is kept this long
export const FAIL_TICKS = ms2ticks(300); // a turn not executed within this is a failed turn
export const ASSIST_UNITS = 5; // 0.35 tile (5.6) rounded down: within it the body aligns to the tile centre and turns
export const MATCH_TICKS = 75 * TICK_HZ; // F0 round: the F1 base for 2-4 players

export type ControlPlan = 'A' | 'B';
/** Plan A (default): the cross quantizes the stick, the body goes where it points and stops on release. Plan B: auto-advance, the stick only asks for turns. */
export const DEFAULT_CONTROL: ControlPlan = 'A';
