// Rules: progress along the level, spawn cells and reviving at a checkpoint or a bubble.
import { BUBBLE_INVULN_SEC, DT, PLAYER_H, PLAYER_W, TILE } from '../../constants';
import { T } from '../../legend';
import type { ParsedLevel } from '../../parse';
import { emit, isActive, type PlayerState, type World } from '../state';
import { boxHitsSolid } from '../tiles';
import { SPAWN_SPREAD } from '../tuning';

export const steps = (sec: number) => Math.round(sec / DT);

// --- progress: BFS distance to the goal through every non-solid cell (doors, gates and crumbles count as open: they will open)
export function progressField(p: ParsedLevel): Int32Array {
  const dist = new Int32Array(p.w * p.h).fill(-1);
  const goal = p.markers.goal[0];
  if (!goal) return dist.fill(1_000_000);
  const solid = (i: number) =>
    p.tiles[i] === T.Solid || p.tiles[i] === T.BeltL || p.tiles[i] === T.BeltR || p.tiles[i] === T.FreeSolid || p.tiles[i] === T.Ice;
  const queue: number[] = [goal.y * p.w + goal.x];
  dist[queue[0]!] = 0;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!,
      x = i % p.w,
      y = Math.floor(i / p.w);
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ] as const) {
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
  const baseX = cell.x * TILE + TILE / 2 - PLAYER_W / 2,
    y = (cell.y + 1) * TILE - PLAYER_H;
  let x = baseX + (rank - (n - 1) / 2) * SPAWN_SPREAD;
  if (boxHitsSolid(w.grid, x, y, PLAYER_W, PLAYER_H)) x = baseX;
  b.x = x;
  b.y = y;
  b.vx = 0;
  b.vy = 0;
  b.grounded = false;
  b.supportId = -1;
  b.air = 255;
  b.jumpAge = 255;
  b.dropFrames = 0;
  b.dx = 0;
  b.dy = 0;
}
export const rankOf = (w: World, p: PlayerState) => w.players.filter((q) => q.connected).findIndex((q) => q.slot === p.slot);

export function revive(w: World, p: PlayerState, via: 'checkpoint' | 'bubble' | 'team', at?: { x: number; y: number }): void {
  const n = w.players.filter((q) => q.connected).length;
  if (at) {
    p.body.x = at.x;
    p.body.y = at.y;
    p.body.vx = 0;
    p.body.vy = 0;
    p.body.grounded = false;
    p.body.supportId = -1;
    p.body.air = 255;
    p.body.dx = 0;
    p.body.dy = 0;
  } else placeAtCell(w, p, respawnCell(w), rankOf(w, p), n);
  p.mode = 'active';
  p.bubble = null;
  p.timer = 0;
  p.invuln = steps(BUBBLE_INVULN_SEC);
  p.offCamera = 0;
  p.crushed = 0;
  p.ropeJump = true;
  p.camp.mash = 0;
  p.camp.mashCool = 0;
  p.camp.assist = 0;
  p.camp.jumpTick = -1000;
  p.camp.pick = 0;
  p.camp.onIce = false;
  emit(w, 'obst.respawn', { player: p.slot, via });
}
