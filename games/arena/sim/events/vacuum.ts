// The vacuum robot: walks the middle column from one end of the map to the other (a tile every 20 ticks), washing out the 3 columns around it, and turns
// back at furniture or at the edge. A pinata blast that reaches it deflects it one tile away from the blast (the longer axis; a tie goes vertical, so the
// left-right mirror agrees): the players can steer it out of their own paint.
import { solidAt } from '../../map';
import { clearTile } from '../match/board';
import type { ManchazoState } from '../match/state';
import { CLOCK_X, VACUUM_STEP_TICKS, VACUUM_WIDTH } from './config';
import type { Planned } from './plan';

export function startVacuum(s: ManchazoState, p: Planned): void {
  const ev = s.match.ev!;
  ev.vac = { x: CLOCK_X, y: p.down ? 0 : s.grid.map.h - 1, dy: p.down ? 1 : -1, wait: 0 };
  sweep(s);
}

function sweep(s: ManchazoState): void {
  const v = s.match.ev!.vac!;
  const half = (VACUUM_WIDTH - 1) / 2;
  for (let x = v.x - half; x <= v.x + half; x++) if (!solidAt(s.grid.map, x, v.y)) clearTile(s.match, x, v.y, -2);
}

export function stepVacuum(s: ManchazoState): void {
  const v = s.match.ev!.vac;
  if (!v || ++v.wait < VACUUM_STEP_TICKS) return;
  v.wait = 0;
  if (solidAt(s.grid.map, v.x, v.y + v.dy)) v.dy = -v.dy;
  else v.y += v.dy;
  sweep(s);
}

/** Called by a blast over `hit` (keys "x,y") centred on (ox, oy). */
export function deflectVacuum(s: ManchazoState, ox: number, oy: number, hit: ReadonlySet<string>): void {
  const v = s.match.ev?.vac;
  if (!v || !hit.has(`${v.x},${v.y}`)) return;
  const dx = v.x - ox,
    dy = v.y - oy;
  const alongX = Math.abs(dx) > Math.abs(dy);
  const step = alongX ? Math.sign(dx) : dy === 0 ? v.dy : Math.sign(dy);
  const [nx, ny] = alongX ? [v.x + step, v.y] : [v.x, v.y + step];
  if (solidAt(s.grid.map, nx, ny)) return;
  v.x = nx;
  v.y = ny;
  if (!alongX) v.dy = step;
}
