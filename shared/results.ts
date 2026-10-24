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

// Versus: the same numbers per team (stars by the team's own size, on the score with k). The verdict (ranking, winner) is game.result once the round is over.
export interface TeamSummary extends Summary { teamId: number; k: number; gross: number; vips: number; reachedAt: number }
export function summarizeTeam(g: Game, teamId: number): TeamSummary {
  const t = g.teams[teamId]!;
  const thresholds = starThresholds(g.mapId, g.difficulty, t.n);
  const st = stars(g.mapId, g.difficulty, t.n, t.score);
  return {
    score: t.score, stars: st, thresholds, next: st >= 3 ? null : thresholds[st]! - t.score,
    delivered: t.delivered, expired: t.expired, rejected: t.rejected, tips: t.tips, bestStreak: t.bestStreak,
    teamId, k: t.k, gross: t.gross, vips: t.vips, reachedAt: t.reachedAt,
  };
}
