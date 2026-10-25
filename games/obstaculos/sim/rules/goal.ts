// Rules: checkpoints, stars, the goal, medals and the level score.
import { placeAtCell, progressOf, rankOf, steps } from './placement';
import {
  BUBBLE_INVULN_SEC,
  DT,
  RETRY_SCORE_MULT,
  SCORE_BASE,
  SCORE_PER_LIFE,
  SCORE_PER_SEC_UNDER_PAR,
  SCORE_PER_STAR,
  SILVER_PAR_MULT,
  TILE,
} from '../../constants';
import type { Difficulty } from '@pichi/core/difficulty';
import type { ParsedLevel } from '../../parse';
import { dropAll } from '../actions';
import { bodyRect, cellRect, overlaps } from '../collide';
import { freezeHazard } from '../entities';
import { emit, isActive, type LevelResult, type World } from '../state';
import { GOAL_PAD_X, GOAL_PAD_Y, REUNION_TILES, STAR_STREAK_SEC } from '../tuning';

// --- checkpoints, stars, goal
export function stepCheckpoints(w: World): void {
  w.ent.checkpoints.forEach((c, i) => {
    if (c.activated) return;
    const r = cellRect(c.cell.x, c.cell.y);
    const who = w.players.find((p) => isActive(p) && overlaps(r, bodyRect(p.body)));
    if (!who) return;
    c.activated = true;
    emit(w, 'obst.checkpoint', { player: who.slot, index: i });
    const best =
      w.activeCheckpoint < 0
        ? Infinity
        : w.progress[w.ent.checkpoints[w.activeCheckpoint]!.cell.y * w.level.w + w.ent.checkpoints[w.activeCheckpoint]!.cell.x]!;
    const here = w.progress[c.cell.y * w.level.w + c.cell.x]!;
    if (here < best) {
      w.activeCheckpoint = i;
      freezeHazard(w);
      const n = w.players.filter((q) => q.connected).length;
      for (const p of w.players) {
        // reunion: whoever is more than a screen behind appears here
        if (!isActive(p) || p.slot === who.slot) continue;
        if (progressOf(w, p) - here > REUNION_TILES) {
          dropAll(w, p);
          placeAtCell(w, p, c.cell, rankOf(w, p), n);
          p.invuln = steps(BUBBLE_INVULN_SEC);
          emit(w, 'obst.respawn', { player: p.slot, via: 'checkpoint' });
        }
      }
    }
  });
}

export function stepStars(w: World): void {
  w.ent.stars.forEach((s, i) => {
    if (s.taken) return;
    const r = cellRect(s.cell.x, s.cell.y);
    const who = w.players.find((p) => isActive(p) && overlaps(r, bodyRect(p.body)));
    if (!who) return;
    s.taken = true;
    w.ent.streak = w.tick - w.ent.lastStarTick <= steps(STAR_STREAK_SEC) ? w.ent.streak + 1 : 1;
    w.ent.lastStarTick = w.tick;
    who.stats.stars++;
    emit(w, 'obst.star', { player: who.slot, index: i, streak: w.ent.streak });
  });
}

export const goalZone = (p: ParsedLevel) => {
  const g = p.markers.goal[0];
  return g ? { x: g.x * TILE - GOAL_PAD_X, y: g.y * TILE - GOAL_PAD_Y, w: TILE + 2 * GOAL_PAD_X, h: TILE + GOAL_PAD_Y } : null;
};

export const medalFor = (timeSec: number, parSec: number): 'gold' | 'silver' | 'bronze' =>
  timeSec <= parSec ? 'gold' : timeSec <= SILVER_PAR_MULT * parSec ? 'silver' : 'bronze';
// Plan §8: 1000 x (1 / 1.5 / 2) + 10 per second under par + 100 per star + 50 per life left.
export function levelScore(o: {
  difficulty: Difficulty;
  parSec: number;
  timeSec: number;
  stars: number;
  livesLeft: number;
  retry?: boolean;
}): number {
  const raw =
    SCORE_BASE[o.difficulty] +
    SCORE_PER_SEC_UNDER_PAR * Math.max(0, Math.floor(o.parSec - o.timeSec)) +
    SCORE_PER_STAR * o.stars +
    (Number.isFinite(o.livesLeft) ? SCORE_PER_LIFE * o.livesLeft : 0);
  return Math.round(raw * (o.retry ? RETRY_SCORE_MULT : 1));
}

// Victory: every connected player is inside the goal at once.
export function stepGoal(w: World): void {
  const z = goalZone(w.level);
  if (!z) return;
  const conn = w.players.filter((p) => p.connected);
  let inside = 0;
  for (const p of w.players) {
    const now = isActive(p) && overlaps(z, bodyRect(p.body));
    if (now && !p.inGoal) {
      p.inGoal = true;
      inside = conn.filter((q) => q.inGoal).length;
      emit(w, 'obst.goalEnter', { player: p.slot, inside, total: conn.length });
    } else if (!now) p.inGoal = false;
  }
  if (conn.length > 0 && conn.every((p) => p.inGoal) && w.status === 'playing') {
    const timeSec = w.tick * DT;
    const stars = w.ent.stars.filter((s) => s.taken).length;
    const result: LevelResult = { timeSec, medal: medalFor(timeSec, w.level.def.parSec), stars, deaths: w.deaths, livesLeft: w.lives };
    if (w.camp) result.campaign = { heartsLost: w.heartsLost, refills: w.refills, perfect: w.heartsLost === 0 && w.refills === 0 };
    w.result = result;
    w.status = 'cleared';
    emit(w, 'obst.levelClear', { level: w.level.def.id, timeSec, medal: result.medal, stars, deaths: w.deaths });
  }
}
