// Difficulty table and the scaling of the order flow by team size N (design 15-mapas §1.1 and §5).
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
  cheesePct: number; // % of Margarita orders (only used on maps with a cheese crate)
  plates: number; // plates in circulation (only used on maps with a sink)
  cutMs: number;
  cookMs: number;
  reward: number;
  tipMax: number;
  penalty: number; // applied per expired order, negative or 0
}

// Order interval, queue and starting orders do not live here: they come from the team size (see params).
type Base = Omit<Params, 'orderEveryMs' | 'maxOrders' | 'initialOrders' | 'cheesePct' | 'plates'>;
const BASE: Record<Difficulty, Base> = {
  easy: { roundMs: ROUND_MS, orderTtlMs: 90_000, cutMs: 1500, cookMs: 6000, reward: 20, tipMax: 10, penalty: 0 },
  normal: { roundMs: ROUND_MS, orderTtlMs: 70_000, cutMs: 2000, cookMs: 8000, reward: 20, tipMax: 8, penalty: -10 },
  hard: { roundMs: ROUND_MS, orderTtlMs: 55_000, cutMs: 2500, cookMs: 10_000, reward: 20, tipMax: 6, penalty: -20 },
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
    orderEveryMs: orderEveryMs(d, n),
    maxOrders: maxOrders(n),
    initialOrders: band(n, [1, 2, 2, 3]),
    cheesePct: band(n, [30, 40, 50, 60]),
    plates: band(n, [3, 4, 5, 6]),
  };
}

// Score needed for 1, 2 and 3 stars: k * 25 * (180 / order interval in s), k = 0.40 / 0.65 / 0.85.
export function starThresholds(d: Difficulty, n: number): [number, number, number] {
  const p = params(d, n);
  const base = 25 * (p.roundMs / p.orderEveryMs);
  return [Math.round(0.4 * base), Math.round(0.65 * base), Math.round(0.85 * base)];
}
export const stars = (d: Difficulty, n: number, score: number) => starThresholds(d, n).filter((t) => score >= t).length;
