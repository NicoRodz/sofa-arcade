// Difficulty table (base values are for 2 players) and the scaling by team size.
export const ROUND_MS = 180_000;
export const MIN_TEAM = 2;
export const MAX_TEAM = 8;

export const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const DEFAULT_DIFFICULTY: Difficulty = 'normal';
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil' };
export const isDifficulty = (v: unknown): v is Difficulty => DIFFICULTIES.includes(v as Difficulty);

export interface Params {
  roundMs: number;
  orderTtlMs: number; // patience
  orderEveryMs: number;
  maxOrders: number;
  initialOrders: number;
  cutMs: number;
  cookMs: number;
  reward: number;
  tipMax: number;
  penalty: number; // applied per expired order, negative or 0
}

const BASE: Record<Difficulty, Params> = {
  easy: { roundMs: ROUND_MS, orderTtlMs: 90_000, orderEveryMs: 30_000, maxOrders: 3, initialOrders: 1, cutMs: 1500, cookMs: 6000, reward: 20, tipMax: 10, penalty: 0 },
  normal: { roundMs: ROUND_MS, orderTtlMs: 70_000, orderEveryMs: 22_000, maxOrders: 4, initialOrders: 1, cutMs: 2000, cookMs: 8000, reward: 20, tipMax: 8, penalty: -10 },
  hard: { roundMs: ROUND_MS, orderTtlMs: 55_000, orderEveryMs: 16_000, maxOrders: 5, initialOrders: 2, cutMs: 2500, cookMs: 10_000, reward: 20, tipMax: 6, penalty: -20 },
};

export const teamSize = (n: number) => Math.max(MIN_TEAM, Math.min(MAX_TEAM, Math.floor(n) || MIN_TEAM));

// f(N) = min(1 + 0.2 (N - 2), 2): 1.0 with 2 players, 1.4 with 4, 1.8 with 6, 2.0 from 7.
export const pressure = (n: number) => Math.min(1 + 0.2 * (teamSize(n) - MIN_TEAM), 2);

export function params(d: Difficulty, n: number): Params {
  const b = BASE[d];
  const t = teamSize(n);
  return { ...b, orderEveryMs: b.orderEveryMs / pressure(t), maxOrders: b.maxOrders + Math.floor((t - MIN_TEAM) / 2) };
}

// Score needed for 1, 2 and 3 stars: k * 25 * (180 / order interval in s), k = 0.40 / 0.65 / 0.85.
export function starThresholds(d: Difficulty, n: number): [number, number, number] {
  const p = params(d, n);
  const base = 25 * (p.roundMs / p.orderEveryMs);
  return [Math.round(0.4 * base), Math.round(0.65 * base), Math.round(0.85 * base)];
}
export const stars = (d: Difficulty, n: number, score: number) => starThresholds(d, n).filter((t) => score >= t).length;
