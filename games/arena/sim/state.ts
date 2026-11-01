// Arena's world: fighters on a round platform that shrinks. Pure and deterministic: the only randomness is the seeded start angle (mulberry32).
import { mulberry32 } from '@pichi/core';

export const RING_R0 = 420; // starting platform radius
export const RING_MIN = 120;
export const FIGHTER_R = 28;
export const SHRINK_AFTER_MS = 12_000; // the platform holds this long, then shrinks
export const SHRINK_PER_S = 9;
export const MATCH_MS = 90_000; // hard stop: the closest to the centre wins

export interface Fighter {
  slot: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number; // facing (unit): where the dash goes when the stick rests
  fy: number;
  pushCd: number; // ms until the next push
  dashCd: number;
  alive: boolean;
  fellAt: number | null; // ms of the match when it left the platform
}

export interface ArenaState {
  t: number; // ms since the start
  ringR: number;
  fighters: Fighter[];
  over: boolean;
  winner: number | null; // slot, null on a draw
}

/** What a phone asks of its fighter in one step: the stick (-1..1) and whether a button was pressed since the last step. */
export interface ArenaInput {
  x: number;
  y: number;
  push: boolean;
  dash: boolean;
}
export const NO_INPUT: ArenaInput = { x: 0, y: 0, push: false, dash: false };

/** Fighters evenly spaced on a circle of radius ring/2, rotated by the seed so every round does not start the same. */
export function createArena(slots: readonly number[], seed: number): ArenaState {
  const spin = mulberry32(seed)() * Math.PI * 2;
  const n = slots.length;
  return {
    t: 0,
    ringR: RING_R0,
    over: false,
    winner: null,
    fighters: slots.map((slot, i) => {
      const a = spin + (i / n) * Math.PI * 2;
      return {
        slot,
        x: Math.cos(a) * RING_R0 * 0.5,
        y: Math.sin(a) * RING_R0 * 0.5,
        vx: 0,
        vy: 0,
        fx: -Math.cos(a),
        fy: -Math.sin(a),
        pushCd: 0,
        dashCd: 0,
        alive: true,
        fellAt: null,
      };
    }),
  };
}
