// Rules: the expedition (3 levels, retry at x0.5, run end) and the awards.
import { levelScore } from './goal';
import { EXPEDITION_LEVELS } from '../../constants';
import type { ObstEvent, PlayerStats, World } from '../state';

// --- the expedition: 3 levels; with 0 lives the level is retried at x0.5; the second failure ends the run (assumed: counted over the whole run)
export interface RunState {
  index: number;
  score: number;
  failures: number;
  retrying: boolean;
  cleared: number;
  ended: null | 'complete' | 'failed';
}
export const newRun = (): RunState => ({ index: 0, score: 0, failures: 0, retrying: false, cleared: 0, ended: null });
// Call once when w.status leaves 'playing'. Returns the events it generated (runEnd) and advances `run`; the caller builds the next world for run.index.
export function advanceRun(run: RunState, w: World): ObstEvent[] {
  const out: ObstEvent[] = [];
  if (run.ended || w.status === 'playing') return out;
  if (w.status === 'cleared' && w.result) {
    run.score += levelScore({
      difficulty: w.difficulty,
      parSec: w.level.def.parSec,
      timeSec: w.result.timeSec,
      stars: w.result.stars,
      livesLeft: w.result.livesLeft,
      retry: run.retrying,
    });
    run.cleared++;
    run.index++;
    run.retrying = false;
    if (run.index >= EXPEDITION_LEVELS) {
      run.ended = 'complete';
      out.push({ name: 'obst.runEnd', data: { score: run.score, levels: run.cleared, reason: 'complete' } });
    }
  } else {
    run.failures++;
    if (run.failures >= 2) {
      run.ended = 'failed';
      out.push({ name: 'obst.runEnd', data: { score: run.score, levels: run.cleared, reason: 'failed' } });
    } else run.retrying = true;
  }
  return out;
}

// Awards of plan §8 from the per-player stats of one level: the slot that wins each one, or null when nobody earned it.
export interface Awards {
  ancla: number | null;
  taxi: number | null;
  coleccionista: number | null;
  kamikaze: number | null;
  pegamento: number | null;
}
export function awardsOf(list: readonly { slot: number; stats: PlayerStats }[]): Awards {
  const top = (score: (s: PlayerStats) => number, lowest = false): number | null => {
    let best: { slot: number; stats: PlayerStats } | null = null;
    for (const p of list) {
      if (!best || (lowest ? score(p.stats) < score(best.stats) : score(p.stats) > score(best.stats))) best = p;
    }
    return best && (lowest || score(best.stats) > 0) ? best.slot : null;
  };
  return {
    ancla: top((s) => s.anchoredSteps),
    taxi: top((s) => s.throws + s.catches),
    coleccionista: top((s) => s.stars),
    kamikaze: top((s) => s.deaths),
    pegamento: list.length > 1 ? top((s) => s.offCameraSteps, true) : null,
  };
}
export const awards = (w: World): Awards => awardsOf(w.players.filter((p) => p.connected));
