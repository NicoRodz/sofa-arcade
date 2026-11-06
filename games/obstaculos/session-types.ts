// Public shapes of an Obstaculos session (options, per-level and per-run summaries). Types only; session.ts re-exports them.
import type { Difficulty } from '@pichi/core';
import type { Awards } from './sim/rules';
import type { WorldId } from './sim/rules/campaign';
import type { GameMode, LevelDef } from './types';

export type SessionStatus = 'countdown' | 'playing' | 'between' | 'over';

export interface SessionOpts {
  mode: GameMode;
  difficulty: Difficulty;
  level: number; // RANDOM_LEVEL (0) or 1..15
  seed: number;
  slots: readonly number[]; // connected phones at the start
  p90LatencyMs?: number;
  levels?: readonly LevelDef[]; // tests and tools: an explicit list of levels (skips the lobby's choice)
  campaign?: { world: WorldId; n?: number }; // campaign layer for 2 (sim/campaign.ts); absent = quick match, unchanged
}

export interface LevelSummary {
  id: string;
  name: string;
  biome: LevelDef['biome'];
  index: number;
  cleared: boolean; // false: the lives ran out
  retry: boolean; // played again after running out of lives (score x0.5)
  timeSec: number;
  parSec: number;
  medal: 'gold' | 'silver' | 'bronze' | null;
  stars: number;
  starsMax: number; // the collectible stars
  deaths: number;
  livesLeft: number; // Infinity when unlimited
  checkpoints: number;
  checkpointsMax: number;
  score: number; // what this level added to the run
}
export interface RunSummary {
  reason: 'complete' | 'failed';
  score: number;
  levels: LevelSummary[];
  expedition: number; // levels in the expedition (3, or fewer when it starts near the end of the list)
  cleared: number;
  awards: Awards;
  mode: GameMode;
  difficulty: Difficulty;
  random: boolean;
  seed: number;
  totals: { deaths: number; stars: number; starsMax: number; timeSec: number };
}
