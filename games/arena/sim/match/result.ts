// The result of a round: tiles and percent per team, and the winner. More tiles wins; on equal tiles the team that got there first; the same tick is a draw.
import { rankTeams, type TeamResult } from '@pichi/core/lobby';
import { percentOf } from './board';
import type { ManchazoState } from './state';

export interface TeamScore {
  team: number;
  tiles: number;
  percent: number;
}
export interface MatchResult {
  order: TeamScore[]; // best first
  winner: number | null; // null: a draw
}

export function matchResult(s: ManchazoState): MatchResult {
  const m = s.match;
  const rows: TeamResult[] = m.counts.map((tiles, team) => ({
    teamId: team,
    score: tiles,
    delivered: 0,
    vip: 0,
    reachedAt: m.reachedAt[team]!,
  }));
  const { order, winner } = rankTeams(rows);
  return {
    order: order.map((r) => ({ team: r.teamId, tiles: r.score, percent: percentOf(m, r.teamId) })),
    winner,
  };
}
