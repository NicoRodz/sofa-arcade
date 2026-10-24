// Difficulty table and the scaling of the order flow by team size N (design 15-mapas §1.1 and §5).
export const ROUND_MS = 180_000;
export const MIN_TEAM = 2;
export const MAX_TEAM = 8;

export const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const DEFAULT_DIFFICULTY: Difficulty = 'normal';
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil' };
export const isDifficulty = (v: unknown): v is Difficulty => DIFFICULTIES.includes(v as Difficulty);

// Feel and scoring knobs per difficulty (overcooked2 plan, phase 1). One table, so a later phase tunes Easy or Hard without
// touching the rules. tauMs = 0 means "instant", which is the pre-R1 feel: R1 is only on for Normal for now.
export interface Tuning {
  tauMs: number; // R1: velocity smoothing while the stick is held
  tauStopMs: number; // R1: smoothing once the stick is released
  dashMult: number; // R2: dash speed as a multiple of the walking speed
  dashMs: number; // R2: dash duration
  dashCdMs: number; // R2: cooldown, counted from the dash start
  bufferMs: number; // R6: how long an early A or B press is remembered
  pushSpeed: number; // R5: tiles/s given to a chef hit by a dash (never drops the item)
  yieldAfterMs: number; // R4: opposed pushing this long and the two chefs cross each other
  yieldSpeed: number; // R4: speed multiplier while crossing
  baseComponent: number; // R13: points per ingredient in the recipe
  baseProcess: number; // R13: points per process (cut, grate, stretch, bake)
  tipPct: number; // R14: tip at the very start of the order's patience, as a share of the base
  streakMax: number; // R15: top of the tip multiplier
  starPct: readonly [number, number, number]; // R17: share of the expected score for 1, 2 and 3 stars
}
const COMMON: Omit<Tuning, 'tauMs' | 'tauStopMs'> = {
  dashMult: 2.6, dashMs: 180, dashCdMs: 600, bufferMs: 150, pushSpeed: 1.5, yieldAfterMs: 400, yieldSpeed: 0.4,
  baseComponent: 20, baseProcess: 10, tipPct: 0.5, streakMax: 4, starPct: [0.35, 0.6, 0.85],
};
export const TUNING: Record<Difficulty, Tuning> = {
  easy: { ...COMMON, tauMs: 0, tauStopMs: 0 },
  normal: { ...COMMON, tauMs: 60, tauStopMs: 50 },
  hard: { ...COMMON, tauMs: 0, tauStopMs: 0 },
};

export interface Params {
  roundMs: number;
  orderTtlMs: number; // patience
  orderEveryMs: number;
  maxOrders: number;
  initialOrders: number;
  cheesePct: number; // % of Margarita orders (only used on maps with a cheese crate)
  plates: number; // plates in circulation (only used on maps with a sink)
  cutMs: number;
  cookMs: number;
  penalty: number; // applied per expired order, negative or 0
  tune: Tuning;
}

// Order interval, queue and starting orders do not live here: they come from the team size (see params).
type Base = Omit<Params, 'orderEveryMs' | 'maxOrders' | 'initialOrders' | 'cheesePct' | 'plates' | 'tune'>;
const BASE: Record<Difficulty, Base> = {
  easy: { roundMs: ROUND_MS, orderTtlMs: 90_000, cutMs: 1500, cookMs: 6000, penalty: 0 },
  normal: { roundMs: ROUND_MS, orderTtlMs: 70_000, cutMs: 2000, cookMs: 8000, penalty: -10 },
  hard: { roundMs: ROUND_MS, orderTtlMs: 55_000, cutMs: 2500, cookMs: 10_000, penalty: -20 },
};
export const ORDER_BASE_MS = 40_000; // Normal: interval = 40 s / (0.6 + 0.2 N)
const INTERVAL_K: Record<Difficulty, number> = { easy: 1.25, normal: 1, hard: 0.8 };
export const DIRTY_MS = 6000; // a dirty plate shows up this long after each delivery
export const WASH_MS = 1500; // hold B this long per plate at the sink

export const teamSize = (n: number) => Math.max(MIN_TEAM, Math.min(MAX_TEAM, Math.floor(n) || MIN_TEAM));

export const orderEveryMs = (d: Difficulty, n: number) => (ORDER_BASE_MS * INTERVAL_K[d]) / (0.6 + 0.2 * teamSize(n));
export const maxOrders = (n: number) => 2 + Math.ceil(teamSize(n) / 2);
const band = <T>(n: number, v: [T, T, T, T]): T => { const t = teamSize(n); return t <= 2 ? v[0] : t <= 4 ? v[1] : t <= 6 ? v[2] : v[3]; };

export function params(d: Difficulty, n: number): Params {
  return {
    ...BASE[d],
    tune: TUNING[d],
    orderEveryMs: orderEveryMs(d, n),
    maxOrders: maxOrders(n),
    initialOrders: band(n, [1, 2, 2, 3]),
    cheesePct: band(n, [30, 40, 50, 60]),
    plates: band(n, [3, 4, 5, 6]),
  };
}
