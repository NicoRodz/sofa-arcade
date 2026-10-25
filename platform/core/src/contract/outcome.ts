// How any game ends, for the generic results screen (and the stats). EXPERIMENTAL (F4a): no game produces it yet; F4c/F4d wire the results to it.
export interface GameOutcome {
  kind: 'coop' | 'teams' | 'ffa';
  headline: string;
  stars?: 0 | 1 | 2 | 3;
  rows: { playerId?: string; teamId?: string; label: string; score: number; badges?: string[] }[];
  stats?: Record<string, number>;
}
