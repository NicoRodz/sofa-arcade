// What the results screen shows, as plain data (R17 + the numbers that explain the score).
import type { Game } from './overcooked';
import { starThresholds, stars } from './stars';

export interface Summary {
  score: number;
  stars: number; // 0..3
  thresholds: [number, number, number];
  next: number | null; // points still missing for the next star (null: all three)
  delivered: number;
  expired: number;
  rejected: number;
  tips: number;
  bestStreak: number;
}

export function summarize(g: Game): Summary {
  const thresholds = starThresholds(g.mapId, g.difficulty, g.n);
  const st = stars(g.mapId, g.difficulty, g.n, g.score);
  return {
    score: g.score, stars: st, thresholds, next: st >= 3 ? null : thresholds[st]! - g.score,
    delivered: g.delivered, expired: g.expired, rejected: g.rejected, tips: g.tips, bestStreak: g.bestStreak,
  };
}
