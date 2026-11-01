// HAZARD_V2 rat, second defence (the first is the dodge of a dash in rat-v2.ts): it does not wait to be touched. Outside its panting, a chef that closes in within `evadeTiles`
// makes it BOLT: a short burst (`evadeLen` tiles in `evadeMs`, faster than a chef walks) at an angle to the line away from the chef, then it PANTS `evadePantMs` standing still: in that
// window any touch or dash catches it, hands full or not. A burst has a cooldown. It is not unbeatable: with no room to run (wall, corner) or with chefs closing from opposite sides it
// does not bolt and the touch lands. Deterministic: the direction is the best clearance among a fixed list of angles (the left one first on a tie); no RNG.
import type { Game } from '../round/state';
import type { Rat } from '../rules/midround';
import { ratParams } from './rat-v2';

const MIN_ROOM = 1; // tiles of free run below which it is cornered
type Floor = (g: Game, x: number, y: number) => boolean;
const ANGLES = [30, -30, 60, -60, 90, -90, 120, -120, 0] as const; // degrees from straight away; screen y points down so +30 is the clockwise side
const rotate = (x: number, y: number, deg: number): [number, number] => {
  const t = (deg * Math.PI) / 180;
  return [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)];
};
/** One step of `step` tiles along (ux, uy); against a wall it slides along the free axis at full step. Returns the new position and whether it moved at all. */
function advance(g: Game, floor: Floor, x: number, y: number, ux: number, uy: number, step: number): [number, number, boolean] {
  const nx = x + ux * step,
    ny = y + uy * step;
  if (floor(g, Math.floor(nx), Math.floor(ny))) return [nx, ny, true];
  if (Math.abs(ux) > 1e-9 && floor(g, Math.floor(x + Math.sign(ux) * step), Math.floor(y))) return [x + Math.sign(ux) * step, y, true];
  if (Math.abs(uy) > 1e-9 && floor(g, Math.floor(x), Math.floor(y + Math.sign(uy) * step))) return [x, y + Math.sign(uy) * step, true];
  return [x, y, false];
}
/** How far a burst of `len` tiles along (ux, uy) from (x, y) gets (it stops at a corner, slides along a wall); 0 when its path comes within a tile of a chef (never into one's arms). */
function runLength(g: Game, floor: Floor, x: number, y: number, ux: number, uy: number, len: number, chefs: [number, number][]): number {
  let cx = x,
    cy = y,
    d = 0;
  while (d < len - 1e-9) {
    const [nx, ny, ok] = advance(g, floor, cx, cy, ux, uy, 0.1);
    if (!ok) break;
    cx = nx;
    cy = ny;
    d += 0.1;
    if (chefs.some(([tx, ty]) => Math.hypot(cx - tx, cy - ty) < 1)) return 0;
  }
  return d;
}

/** One tick of the evasion. Returns true while the rat is mid-burst (it moved this tick). */
export function evadeStep(g: Game, r: Rat, dtMs: number, floor: Floor): boolean {
  if (!g.hz) return false;
  const rp = ratParams(g);
  if (rp.evadeLen <= 0) return false;
  r.evadeCd = Math.max(0, (r.evadeCd ?? 0) - dtMs);
  if ((r.evadeMs ?? 0) <= 0) {
    if (r.evadeCd > 0 || (r.pantMs ?? 0) > 0 || (r.dodgeMs ?? 0) > 0) return false;
    let ax = 0,
      ay = 0,
      n = 0;
    const threats: [number, number][] = [];
    for (const p of g.players.values()) {
      if (p.ghost) continue;
      const dx = r.x - p.x,
        dy = r.y - p.y,
        d = Math.hypot(dx, dy) || 1e-6;
      if (d > rp.evadeTiles || (p.vx * dx + p.vy * dy) / d < 1) continue; // only a chef that is closing in
      ax += dx / d;
      ay += dy / d;
      n++;
      threats.push([p.x, p.y]);
    }
    const al = Math.hypot(ax, ay);
    if (n === 0 || al < 0.5) return false; // nobody closing, or chefs from opposite sides: it is pinned
    let best: [number, number] | null = null,
      bestRoom = MIN_ROOM; // less room than this and it is cornered: no burst
    for (const a of ANGLES) {
      const [ux, uy] = rotate(ax / al, ay / al, g.ratFrame?.flip ? -a : a); // VERSUS_V3: the canonical clockwise side is counter-clockwise under a reflection
      const rm = runLength(g, floor, r.x, r.y, ux, uy, rp.evadeLen, threats);
      if (rm > bestRoom) {
        best = [ux, uy];
        bestRoom = rm;
      }
    }
    if (!best) return false; // cornered
    r.evadeDx = best[0];
    r.evadeDy = best[1];
    r.evadeMs = rp.evadeMs;
    r.evadeCd = rp.evadeCdMs;
    r.heading = Math.atan2(best[1], best[0]);
  }
  const k = Math.min(dtMs, r.evadeMs!);
  const [nx, ny, ok] = advance(g, floor, r.x, r.y, r.evadeDx!, r.evadeDy!, (rp.evadeLen * k) / rp.evadeMs);
  r.x = nx;
  r.y = ny;
  r.evadeMs = ok ? r.evadeMs! - k : 0; // a corner: the burst ends here
  if (r.evadeMs <= 0) r.pantMs = rp.evadePantMs;
  return true;
}
