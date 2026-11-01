// One step of an Arena round (the screen calls it at a fixed 60 Hz). Mutates the state in place; same state + same inputs = same result.
import { FIGHTER_R, MATCH_MS, RING_MIN, SHRINK_AFTER_MS, SHRINK_PER_S, NO_INPUT } from './state';
import type { ArenaInput, ArenaState, Fighter } from './state';

export const ACCEL = 2600; // px/s^2 at full stick
export const DRAG = 3.2; // 1/s
export const PUSH_RANGE = FIGHTER_R * 3.2;
export const PUSH_SPEED = 900;
export const DASH_SPEED = 1100;
export const PUSH_CD_MS = 700;
export const DASH_CD_MS = 1600;

const len = (x: number, y: number) => Math.hypot(x, y);

function control(f: Fighter, inp: ArenaInput, dt: number) {
  const m = len(inp.x, inp.y);
  if (m > 0.05) {
    const k = Math.min(1, m) / m;
    f.vx += inp.x * k * ACCEL * dt;
    f.vy += inp.y * k * ACCEL * dt;
    f.fx = inp.x / m;
    f.fy = inp.y / m;
  }
  if (inp.dash && f.dashCd <= 0) {
    f.vx = f.fx * DASH_SPEED;
    f.vy = f.fy * DASH_SPEED;
    f.dashCd = DASH_CD_MS;
  }
}

/** A push throws every other living fighter in range away from the pusher; it costs a cooldown even when nobody is near. */
function push(s: ArenaState, f: Fighter) {
  f.pushCd = PUSH_CD_MS;
  for (const o of s.fighters) {
    if (o === f || !o.alive) continue;
    const dx = o.x - f.x,
      dy = o.y - f.y,
      d = len(dx, dy);
    if (d > PUSH_RANGE || d === 0) continue;
    o.vx += (dx / d) * PUSH_SPEED;
    o.vy += (dy / d) * PUSH_SPEED;
  }
}

/** Two bodies that overlap are pulled apart and trade the speed along the line between them (equal masses). */
function collide(a: Fighter, b: Fighter) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    d = len(dx, dy);
  const min = FIGHTER_R * 2;
  if (d >= min) return;
  const nx = d === 0 ? 1 : dx / d,
    ny = d === 0 ? 0 : dy / d;
  const half = (min - d) / 2;
  a.x -= nx * half;
  a.y -= ny * half;
  b.x += nx * half;
  b.y += ny * half;
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel >= 0) return; // already moving apart
  a.vx += nx * rel;
  a.vy += ny * rel;
  b.vx -= nx * rel;
  b.vy -= ny * rel;
}

export function step(s: ArenaState, inputs: ReadonlyMap<number, ArenaInput>, dtMs: number): void {
  if (s.over) return;
  const dt = dtMs / 1000;
  s.t += dtMs;
  if (s.t > SHRINK_AFTER_MS) s.ringR = Math.max(RING_MIN, s.ringR - SHRINK_PER_S * dt);
  const alive = s.fighters.filter((f) => f.alive);
  for (const f of alive) {
    const inp = inputs.get(f.slot) ?? NO_INPUT;
    f.pushCd = Math.max(0, f.pushCd - dtMs);
    f.dashCd = Math.max(0, f.dashCd - dtMs);
    control(f, inp, dt);
    if (inp.push && f.pushCd <= 0) push(s, f);
  }
  for (const f of alive) {
    const drag = Math.max(0, 1 - DRAG * dt);
    f.vx *= drag;
    f.vy *= drag;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
  }
  for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) collide(alive[i]!, alive[j]!);
  for (const f of alive)
    if (len(f.x, f.y) > s.ringR) {
      f.alive = false;
      f.fellAt = s.t;
    }
  finish(s);
}

function finish(s: ArenaState) {
  const left = s.fighters.filter((f) => f.alive);
  if (left.length > 1 && s.t < MATCH_MS) return;
  s.over = true;
  if (left.length === 1) s.winner = left[0]!.slot;
  else if (left.length > 1)
    s.winner = left.reduce((a, b) => (len(b.x, b.y) < len(a.x, a.y) ? b : a)).slot; // time up: the closest to the centre
  else {
    // everybody fell: the last one to wins; falling in the same step is a draw
    const last = Math.max(...s.fighters.map((f) => f.fellAt ?? 0));
    const tied = s.fighters.filter((f) => f.fellAt === last);
    s.winner = tied.length === 1 ? tied[0]!.slot : null;
  }
}
