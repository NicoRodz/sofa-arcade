// "Obstaculos en cadena": every number of the design (plan §2, §4, §6, §8, §15) lives here. Physics tuning (F1) happens in this file only.
import type { Difficulty } from '../../difficulty';

// --- grid and body (plan §2)
export const TILE = 48; // px
export const PLAYER_W = 34; // hitbox
export const PLAYER_H = 46;
export const STEP_HZ = 60; // fixed simulation rate
export const DT = 1 / STEP_HZ;
export const STEP_MS = 1000 / STEP_HZ;
export const MAX_STEPS_PER_FRAME = 4; // accumulator cap: a long frame never spirals

// --- running
export const RUN_SPEED = 330; // px/s
export const ACCEL_SEC = 0.08; // 0 -> RUN_SPEED
export const DECEL_SEC = 0.06; // RUN_SPEED -> 0
export const AIR_ACCEL_MULT = 0.65;
export const AIR_DECEL_MULT = 0.3;

// --- jump: fixed height (A is a press counter, hold time is unusable with 45-370 ms of jitter)
export const JUMP_PEAK_PX = 173; // 3.6 tiles; the sim must measure 173 +- 2
export const JUMP_V0 = 911; // px/s
export const GRAVITY_UP = 2396; // px/s^2 while rising
export const GRAVITY_DOWN_MULT = 1.5;
export const APEX_G_MULT = 0.5; // hang time at the top
export const APEX_VY = 80; // px/s: hang while |vy| is under this
export const MAX_FALL = 960; // px/s (16 px per step: never tunnels through a 48 px tile)
export const ROPE_JUMP_MULT = 0.8; // dangling on a taut rope: one jump at 0.8 * v0
export const TRAMPOLINE_MULT = 1.45;
export const DROP_THROUGH_FRAMES = 10; // down + A: ignore one-way platforms this long

// --- forgiveness
export const CORNER_HEAD_PX = 8; // ceiling corner: nudge sideways up to this
export const LEDGE_PX = 12; // wall top within this of the feet: step up
export const COYOTE_FRAMES = 7; // Normal base
export const BUFFER_FRAMES = 9; // Normal
export const LATENCY_FRAME_MS = 16.7;

// --- input over the phones (plan §2 "Lag")
export const STICK_DEADZONE = 0.2;
export const STICK_HALF_MAX = 0.6; // |x| in [deadzone, this): half speed
export const STICK_HALF_SPEED = 0.45;
export const STICK_DOWN = 0.6; // |y| over this = down / up
export const STALE_MS = 300; // no packets for this long: x decays to 0...
export const STALE_DECAY_MS = 150; // ...over this long
export const GRAB_TOGGLES_MAX = 2; // B delta applied as at most this many toggles in consecutive frames

// --- rope (plan §4, F2a reads these)
export const ROPE_LEN = 3.5 * TILE; // 168 px
export const ROPE_CORDADA_MAX = 4;
export const ROPE_ITERATIONS = 4;
export const ROPE_MAX_CORRECTION = 24; // px per step
export const ROPE_VALVE_RATIO = 1.6; // x ROPE_LEN, for ROPE_VALVE_SEC
export const ROPE_VALVE_SEC = 1;
export const ROPE_RELINK_SEC = 0.5;
export const INV_MASS = { ground: 1 / 3, air: 1, planted: 1 / 8, anchored: 0 } as const;

// --- camera and stragglers (plan §6)
export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 1.0;
export const BUBBLE_SPEED_TILES = 9; // tiles/s
export const BUBBLE_POP_SEC = 0.4;
export const BUBBLE_INVULN_SEC = 1;
export const CRUMB_EVERY_SEC = 0.25;
export const CRUMB_MIN_AGE_SEC = 0.75;

// --- tiles that change (plan §9)
export const CRUMBLE_FALL_SEC = 0.5;
export const CRUMBLE_BACK_SEC = 3;

// --- scoring (plan §8)
export const SCORE_BASE: Record<Difficulty, number> = { easy: 1000, normal: 1500, hard: 2000 };
export const SCORE_PER_SEC_UNDER_PAR = 10;
export const SCORE_PER_STAR = 100;
export const SCORE_PER_LIFE = 50;
export const SILVER_PAR_MULT = 1.5;
export const RETRY_SCORE_MULT = 0.5;
export const EXPEDITION_LEVELS = 3;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS_OBST = 8;

// --- difficulty table (plan §15)
export interface DifficultyParams {
  coyoteBase: number;
  coyoteCap: number;
  bufferFrames: number;
  lives: number; // Infinity = unlimited
  bubbleSec: number; // time out of camera before the bubble
  bubbleCostsLife: boolean;
  hazardSpeed: number; // multiplier
  handZoneTiles: number;
  stickyEdges: boolean;
  band: readonly [number, number]; // generator difficulty D
}
export const DIFFICULTY_PARAMS: Record<Difficulty, DifficultyParams> = {
  easy: { coyoteBase: 9, coyoteCap: 14, bufferFrames: 12, lives: Infinity, bubbleSec: 1, bubbleCostsLife: false, hazardSpeed: 0.7, handZoneTiles: 3, stickyEdges: true, band: [10, 35] },
  normal: { coyoteBase: 7, coyoteCap: 12, bufferFrames: 9, lives: 12, bubbleSec: 2, bubbleCostsLife: false, hazardSpeed: 1, handZoneTiles: 2.5, stickyEdges: false, band: [35, 60] },
  hard: { coyoteBase: 6, coyoteCap: 10, bufferFrames: 8, lives: 6, bubbleSec: 3, bubbleCostsLife: true, hazardSpeed: 1.25, handZoneTiles: 2, stickyEdges: false, band: [60, 85] },
};

// Adaptive coyote (plan §2): base + ceil(p90 latency / one frame), capped. No rollback, it would break the rope.
export const adaptiveCoyote = (d: Difficulty, p90LatencyMs: number): number => {
  const p = DIFFICULTY_PARAMS[d];
  return Math.min(p.coyoteCap, p.coyoteBase + Math.ceil(Math.max(0, p90LatencyMs) / LATENCY_FRAME_MS));
};

export const GAME_ID = 'obstaculos';
