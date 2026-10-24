// Rules of plan §6 (stragglers, bubble, reunion) and §8 (lives, checkpoints, score, victory), plus the expedition (3 levels).
import {
  BUBBLE_INVULN_SEC, BUBBLE_POP_SEC, BUBBLE_SPEED_TILES, CRUMB_EVERY_SEC, CRUMB_MIN_AGE_SEC, DT, EXPEDITION_LEVELS, PLAYER_H, PLAYER_W, RETRY_SCORE_MULT, SCORE_BASE,
  SCORE_PER_LIFE, SCORE_PER_SEC_UNDER_PAR, SCORE_PER_STAR, SILVER_PAR_MULT, TILE,
} from '../constants';
import { T, isHazardKind, isSolidKind } from '../legend';
import type { Difficulty } from '../../../difficulty';
import type { ParsedLevel } from '../parse';
import { dropAll } from './actions';
import { bodyRect, cellRect, overlaps } from './collide';
import { freezeHazard, hazardKills } from './entities';
import { emit, isActive, type LevelResult, type ObstEvent, type PlayerState, type PlayerStats, type World } from './state';
import { boxHitsSolid, boxTouches, tileAt } from './tiles';
import { CRUMB_KEEP, CRUSH_STEPS, GOAL_PAD_X, GOAL_PAD_Y, REUNION_TILES, RESPAWN_DELAY_SEC, SPAWN_SPREAD, STAR_STREAK_SEC, VOID_MARGIN } from './tuning';

const steps = (sec: number) => Math.round(sec / DT);

// --- progress: BFS distance to the goal through every non-solid cell (doors, gates and crumbles count as open: they will open)
export function progressField(p: ParsedLevel): Int32Array {
  const dist = new Int32Array(p.w * p.h).fill(-1);
  const goal = p.markers.goal[0];
  if (!goal) return dist.fill(1_000_000);
  const solid = (i: number) => p.tiles[i] === T.Solid || p.tiles[i] === T.BeltL || p.tiles[i] === T.BeltR || p.tiles[i] === T.FreeSolid;
  const queue: number[] = [goal.y * p.w + goal.x];
  dist[queue[0]!] = 0;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!, x = i % p.w, y = Math.floor(i / p.w);
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
      if (nx < 0 || ny < 0 || nx >= p.w || ny >= p.h) continue;
      const j = ny * p.w + nx;
      if (dist[j] !== -1 || solid(j)) continue;
      dist[j] = dist[i]! + 1;
      queue.push(j);
    }
  }
  for (let i = 0; i < dist.length; i++) if (dist[i] === -1) dist[i] = 100_000; // enclosed: farther than anything reachable
  return dist;
}
// Distance to the goal of the cell under the body's centre (clamped into the grid).
export function progressOf(w: World, p: PlayerState): number {
  const x = Math.max(0, Math.min(w.level.w - 1, Math.floor((p.body.x + PLAYER_W / 2) / TILE)));
  const y = Math.max(0, Math.min(w.level.h - 1, Math.floor((p.body.y + PLAYER_H / 2) / TILE)));
  return w.progress[y * w.level.w + x]!;
}
// Median player in progress (the one the camera follows and the bubble flies to): of the active ones sorted by distance, the middle.
export function medianPlayer(w: World, among: readonly PlayerState[] = w.players.filter(isActive)): PlayerState | null {
  const act = [...among].sort((a, b) => progressOf(w, a) - progressOf(w, b) || a.slot - b.slot);
  return act.length ? act[Math.floor((act.length - 1) / 2)]! : null;
}

// --- spawn and checkpoints
export function respawnCell(w: World): { x: number; y: number } {
  const c = w.activeCheckpoint >= 0 ? w.ent.checkpoints[w.activeCheckpoint]!.cell : w.level.markers.spawn[0]!;
  return { x: c.x, y: c.y };
}
// Puts the body on the cell (feet on its bottom edge), spread sideways by its rank so nobody stacks exactly; falls back to the centre if the spread hits a wall.
export function placeAtCell(w: World, p: PlayerState, cell: { x: number; y: number }, rank: number, n: number): void {
  const b = p.body;
  const baseX = cell.x * TILE + TILE / 2 - PLAYER_W / 2, y = (cell.y + 1) * TILE - PLAYER_H;
  let x = baseX + (rank - (n - 1) / 2) * SPAWN_SPREAD;
  if (boxHitsSolid(w.grid, x, y, PLAYER_W, PLAYER_H)) x = baseX;
  b.x = x; b.y = y; b.vx = 0; b.vy = 0; b.grounded = false; b.supportId = -1; b.air = 255; b.jumpAge = 255; b.dropFrames = 0; b.dx = 0; b.dy = 0;
}
const rankOf = (w: World, p: PlayerState) => w.players.filter((q) => q.connected).findIndex((q) => q.slot === p.slot);

export function revive(w: World, p: PlayerState, via: 'checkpoint' | 'bubble' | 'team', at?: { x: number; y: number }): void {
  const n = w.players.filter((q) => q.connected).length;
  if (at) { p.body.x = at.x; p.body.y = at.y; p.body.vx = 0; p.body.vy = 0; p.body.grounded = false; p.body.supportId = -1; p.body.air = 255; p.body.dx = 0; p.body.dy = 0; }
  else placeAtCell(w, p, respawnCell(w), rankOf(w, p), n);
  p.mode = 'active'; p.bubble = null; p.timer = 0; p.invuln = steps(BUBBLE_INVULN_SEC); p.offCamera = 0; p.crushed = 0; p.ropeJump = true;
  emit(w, 'obst.respawn', { player: p.slot, via });
}

// --- death and lives
export function killPlayer(w: World, p: PlayerState, cause: 'spikes' | 'liquid' | 'crush' | 'fall' | 'hazard'): void {
  dropAll(w, p);
  p.mode = 'dead';
  p.timer = steps(RESPAWN_DELAY_SEC);
  p.body.vx = 0; p.body.vy = 0;
  p.stats.deaths++;
  w.deaths++;
  p.deathGroup = w.tick;
  emit(w, 'obst.death', { player: p.slot, cause });
}
const spendLife = (w: World): void => { if (Number.isFinite(w.lives)) { w.lives = Math.max(0, w.lives - 1); if (w.lives === 0 && w.status === 'playing') w.status = 'failed'; } };

function hazardCause(w: World, p: PlayerState): 'spikes' | 'liquid' | 'crush' | 'fall' | 'hazard' | null {
  const b = p.body;
  if (b.y > w.level.h * TILE + VOID_MARGIN) return 'fall';
  if (p.invuln === 0) {
    const hz = hazardKills(w, p);
    if (hz) return hz;
    if (boxTouches(w.grid, b.x + 4, b.y + 4, PLAYER_W - 8, PLAYER_H - 8, (k) => k === T.Spikes)) return 'spikes';
    if (boxTouches(w.grid, b.x + 4, b.y + 4, PLAYER_W - 8, PLAYER_H - 8, (k) => k === T.Liquid)) return 'liquid';
  }
  p.crushed = boxTouches(w.grid, b.x, b.y, PLAYER_W, PLAYER_H, isSolidKind) ? p.crushed + 1 : 0;
  return p.crushed >= CRUSH_STEPS ? 'crush' : null;
}

// Deaths of this step cost one life together; a dead player waits RESPAWN_DELAY and returns at the checkpoint; if nobody is left active the team returns at once.
export function stepDeaths(w: World): void {
  let died = 0;
  for (const p of w.players) {
    if (!isActive(p)) continue;
    const c = hazardCause(w, p);
    if (c) { killPlayer(w, p, c); died++; }
  }
  if (died) spendLife(w);
  for (const p of w.players) if (p.connected && p.mode === 'dead' && p.timer > 0) p.timer--;
  const anyActive = w.players.some(isActive);
  const anyPending = w.players.some((p) => p.connected && p.mode !== 'active');
  if (!anyActive && anyPending && w.players.some((p) => p.connected)) {
    for (const p of w.players) if (p.connected && p.mode !== 'active') { dropAll(w, p); revive(w, p, 'team'); }
    return;
  }
  for (const p of w.players) if (p.connected && p.mode === 'dead' && p.timer === 0) revive(w, p, 'checkpoint');
}

// --- stragglers and bubbles
export function sendToBubble(w: World, p: PlayerState, reason: 'offscreen' | 'stray' | 'rope'): void {
  dropAll(w, p);
  p.mode = 'bubble';
  p.bubble = { tx: p.body.x, ty: p.body.y, arrived: false };
  p.timer = 0;
  p.body.vx = 0; p.body.vy = 0; p.body.grounded = false; p.body.supportId = -1;
  emit(w, 'obst.bubble', { player: p.slot, reason });
  if (w.dparams.bubbleCostsLife) spendLife(w);
}

export function stepStragglers(w: World, offCamera: readonly boolean[] | undefined): void {
  const limit = steps(w.dparams.bubbleSec);
  for (const p of w.players) {
    if (!isActive(p)) { p.offCamera = 0; continue; }
    if (offCamera?.[p.slot]) { p.offCamera++; p.stats.offCameraSteps++; } else p.offCamera = 0;
  }
  // The reference is the median of those the camera shows (the majority): whoever is out of frame too long, behind or ahead of it, goes back in a bubble.
  const med = medianPlayer(w, w.players.filter((p) => isActive(p) && !offCamera?.[p.slot]));
  if (!med) return;
  for (const p of w.players) {
    if (isActive(p) && p.slot !== med.slot && p.offCamera >= limit) sendToBubble(w, p, progressOf(w, p) < progressOf(w, med) ? 'stray' : 'offscreen');
  }
}

// A safe crumb every 0.25 s: on static ground, not crumbling or belt, no hazard within a tile.
export function dropCrumbs(w: World): void {
  for (const p of w.players) {
    if (!isActive(p)) continue;
    if (p.crumbCool > 0) { p.crumbCool--; continue; }
    const b = p.body;
    if (!b.grounded || b.supportId !== -1 || p.carriedBy >= 0 || p.lift || p.thrown) continue;
    const row = Math.round((b.y + PLAYER_H) / TILE), col = Math.floor((b.x + PLAYER_W / 2) / TILE);
    const under = tileAt(w.grid, col, row);
    if (under === T.Crumble || under === T.BeltL || under === T.BeltR) continue;
    if (boxTouches(w.grid, b.x - TILE, b.y - TILE, PLAYER_W + 2 * TILE, PLAYER_H + 2 * TILE, isHazardKind)) continue;
    p.crumbs.push({ x: b.x, y: b.y, tick: w.tick });
    if (p.crumbs.length > CRUMB_KEEP) p.crumbs.shift();
    p.crumbCool = steps(CRUMB_EVERY_SEC) - 1;
  }
}

function bubbleTarget(w: World, p: PlayerState): { x: number; y: number } {
  const med = medianPlayer(w);
  const src = med && med.slot !== p.slot ? med : null;
  if (!src) { const c = respawnCell(w); return { x: c.x * TILE + TILE / 2 - PLAYER_W / 2, y: (c.y + 1) * TILE - PLAYER_H }; }
  const minAge = steps(CRUMB_MIN_AGE_SEC);
  for (let i = src.crumbs.length - 1; i >= 0; i--) if (w.tick - src.crumbs[i]!.tick >= minAge) return { x: src.crumbs[i]!.x, y: src.crumbs[i]!.y };
  return { x: src.body.x, y: src.body.y };
}

// Bubbles fly through everything at 9 tiles/s to the median's latest safe crumb, pop 0.4 s after arriving and leave 1 s of invulnerability.
export function stepBubbles(w: World): void {
  const speed = BUBBLE_SPEED_TILES * TILE * DT;
  for (const p of w.players) {
    if (!p.connected || p.mode !== 'bubble' || !p.bubble) continue;
    if (!p.bubble.arrived) {
      const t = bubbleTarget(w, p);
      p.bubble.tx = t.x; p.bubble.ty = t.y;
      const dx = t.x - p.body.x, dy = t.y - p.body.y, d = Math.hypot(dx, dy);
      if (d <= speed) { p.body.x = t.x; p.body.y = t.y; p.bubble.arrived = true; p.timer = 0; }
      else { p.body.x += (dx / d) * speed; p.body.y += (dy / d) * speed; }
    } else if (++p.timer >= steps(BUBBLE_POP_SEC)) revive(w, p, 'bubble', { x: p.bubble.tx, y: p.bubble.ty });
  }
}

// --- checkpoints, stars, goal
export function stepCheckpoints(w: World): void {
  w.ent.checkpoints.forEach((c, i) => {
    if (c.activated) return;
    const r = cellRect(c.cell.x, c.cell.y);
    const who = w.players.find((p) => isActive(p) && overlaps(r, bodyRect(p.body)));
    if (!who) return;
    c.activated = true;
    emit(w, 'obst.checkpoint', { player: who.slot, index: i });
    const best = w.activeCheckpoint < 0 ? Infinity : w.progress[w.ent.checkpoints[w.activeCheckpoint]!.cell.y * w.level.w + w.ent.checkpoints[w.activeCheckpoint]!.cell.x]!;
    const here = w.progress[c.cell.y * w.level.w + c.cell.x]!;
    if (here < best) {
      w.activeCheckpoint = i;
      freezeHazard(w);
      const n = w.players.filter((q) => q.connected).length;
      for (const p of w.players) { // reunion: whoever is more than a screen behind appears here
        if (!isActive(p) || p.slot === who.slot) continue;
        if (progressOf(w, p) - here > REUNION_TILES) { dropAll(w, p); placeAtCell(w, p, c.cell, rankOf(w, p), n); p.invuln = steps(BUBBLE_INVULN_SEC); emit(w, 'obst.respawn', { player: p.slot, via: 'checkpoint' }); }
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

export const medalFor = (timeSec: number, parSec: number): 'gold' | 'silver' | 'bronze' => (timeSec <= parSec ? 'gold' : timeSec <= SILVER_PAR_MULT * parSec ? 'silver' : 'bronze');
// Plan §8: 1000 x (1 / 1.5 / 2) + 10 per second under par + 100 per star + 50 per life left.
export function levelScore(o: { difficulty: Difficulty; parSec: number; timeSec: number; stars: number; livesLeft: number; retry?: boolean }): number {
  const raw = SCORE_BASE[o.difficulty] + SCORE_PER_SEC_UNDER_PAR * Math.max(0, Math.floor(o.parSec - o.timeSec)) + SCORE_PER_STAR * o.stars + (Number.isFinite(o.livesLeft) ? SCORE_PER_LIFE * o.livesLeft : 0);
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
    if (now && !p.inGoal) { p.inGoal = true; inside = conn.filter((q) => q.inGoal).length; emit(w, 'obst.goalEnter', { player: p.slot, inside, total: conn.length }); }
    else if (!now) p.inGoal = false;
  }
  if (conn.length > 0 && conn.every((p) => p.inGoal) && w.status === 'playing') {
    const timeSec = w.tick * DT;
    const stars = w.ent.stars.filter((s) => s.taken).length;
    const result: LevelResult = { timeSec, medal: medalFor(timeSec, w.level.def.parSec), stars, deaths: w.deaths, livesLeft: w.lives };
    w.result = result;
    w.status = 'cleared';
    emit(w, 'obst.levelClear', { level: w.level.def.id, timeSec, medal: result.medal, stars, deaths: w.deaths });
  }
}

// --- the expedition: 3 levels; with 0 lives the level is retried at x0.5; the second failure ends the run (assumed: counted over the whole run)
export interface RunState { index: number; score: number; failures: number; retrying: boolean; cleared: number; ended: null | 'complete' | 'failed' }
export const newRun = (): RunState => ({ index: 0, score: 0, failures: 0, retrying: false, cleared: 0, ended: null });
// Call once when w.status leaves 'playing'. Returns the events it generated (runEnd) and advances `run`; the caller builds the next world for run.index.
export function advanceRun(run: RunState, w: World): ObstEvent[] {
  const out: ObstEvent[] = [];
  if (run.ended || w.status === 'playing') return out;
  if (w.status === 'cleared' && w.result) {
    run.score += levelScore({ difficulty: w.difficulty, parSec: w.level.def.parSec, timeSec: w.result.timeSec, stars: w.result.stars, livesLeft: w.result.livesLeft, retry: run.retrying });
    run.cleared++; run.index++; run.retrying = false;
    if (run.index >= EXPEDITION_LEVELS) { run.ended = 'complete'; out.push({ name: 'obst.runEnd', data: { score: run.score, levels: run.cleared, reason: 'complete' } }); }
  } else {
    run.failures++;
    if (run.failures >= 2) { run.ended = 'failed'; out.push({ name: 'obst.runEnd', data: { score: run.score, levels: run.cleared, reason: 'failed' } }); }
    else run.retrying = true;
  }
  return out;
}

// Awards of plan §8 from the per-player stats of one level: the slot that wins each one, or null when nobody earned it.
export interface Awards { ancla: number | null; taxi: number | null; coleccionista: number | null; kamikaze: number | null; pegamento: number | null }
export function awardsOf(list: readonly { slot: number; stats: PlayerStats }[]): Awards {
  const top = (score: (s: PlayerStats) => number, lowest = false): number | null => {
    let best: { slot: number; stats: PlayerStats } | null = null;
    for (const p of list) {
      if (!best || (lowest ? score(p.stats) < score(best.stats) : score(p.stats) > score(best.stats))) best = p;
    }
    return best && (lowest || score(best.stats) > 0) ? best.slot : null;
  };
  return {
    ancla: top((s) => s.anchoredSteps), taxi: top((s) => s.throws + s.catches), coleccionista: top((s) => s.stars),
    kamikaze: top((s) => s.deaths), pegamento: list.length > 1 ? top((s) => s.offCameraSteps, true) : null,
  };
}
export const awards = (w: World): Awards => awardsOf(w.players.filter((p) => p.connected));
