// The rat of HAZARD_V2 (only with `game.magnet`, i.e. the gentle rat): faster and harder to touch, it alerts when a chef closes in, and it DODGES a dash aimed at it.
// Dodge rule: a chef starts a dash with the rat within `dodgeRange` tiles, inside a frontal cone, and the dodge is off cooldown -> the rat jumps `dodgeTiles` sideways in
// `dodgeMs` (untouchable meanwhile) and then PANTS for `pantMs` at half speed: that is the window for a second chef (or the same one, once its dash is back). No RNG: the side is
// the one with more free floor beyond the landing point, the left of the chef's heading on a tie.
import type { Game } from '../round/state';
import type { Rat } from '../midround';
import { hazardParams, type RatParams } from '../hazards/hazard-v2';

export const ratParams = (g: Game): RatParams => (g.hz ? hazardParams(g.difficulty, g.players.size).rat : RAT_V1);

/** The first gentle rat (feel/rat.ts RAT_GENTLE) as a row, for a round with `hazards: false`. */
const RAT_V1: RatParams = {
  walk: 1.68,
  alert: 1.68,
  alertTiles: 0,
  alertTurnDps: 360,
  runMs: 1600,
  pauseMs: 700,
  touchRadius: 0.6,
  touchSpeed: 1.2,
  scareRadius: 1.5,
  afterDashMs: 250,
  afterRadius: 1.9,
  dodgeCdMs: 0,
  dodgeRange: 0,
  dodgeConeDeg: 0,
  dodgeTiles: 0,
  dodgeMs: 0,
  pantMs: 0,
  pantSpeed: 1,
};

const free = (g: Game, floor: (g: Game, x: number, y: number) => boolean, x: number, y: number) => floor(g, Math.floor(x), Math.floor(y));
// How many half-tiles of floor lie from (x, y) along (ux, uy), up to 4.
const clearance = (g: Game, floor: (g: Game, x: number, y: number) => boolean, x: number, y: number, ux: number, uy: number) => {
  let n = 0;
  while (n < 4 && free(g, floor, x + ux * 0.5 * (n + 1), y + uy * 0.5 * (n + 1))) n++;
  return n;
};

/** One tick of the dodge machinery. Returns true while the rat is mid-jump (it cannot be scared then). */
export function dodgeStep(g: Game, r: Rat, dtMs: number, floor: (g: Game, x: number, y: number) => boolean): boolean {
  if (!g.hz) return false;
  const rp = ratParams(g);
  r.dodgeCd = Math.max(0, (r.dodgeCd ?? 0) - dtMs);
  r.pantMs = Math.max(0, (r.pantMs ?? 0) - dtMs);
  const before = r.dashers ?? [];
  r.dashers = [];
  for (const p of g.players.values()) {
    if (p.ghost || !(p.dashMs > 0)) continue;
    r.dashers.push(p.id);
    if (before.includes(p.id) || r.dodgeCd > 0 || (r.dodgeMs ?? 0) > 0) continue;
    const dx = r.x - p.x,
      dy = r.y - p.y,
      d = Math.hypot(dx, dy);
    const hl = Math.hypot(p.dashDx, p.dashDy) || 1,
      hx = p.dashDx / hl,
      hy = p.dashDy / hl;
    if (d > rp.dodgeRange || (d > 1e-6 && (dx * hx + dy * hy) / d < Math.cos((rp.dodgeConeDeg / 2) * (Math.PI / 180)))) continue;
    // left of the heading (screen y points down) first; the right only when it has strictly more room
    const sides: [number, number][] = [
      [hy, -hx],
      [-hy, hx],
    ];
    let best: [number, number] | null = null,
      bestRoom = -1;
    for (const [ux, uy] of sides) {
      const tx = r.x + ux * rp.dodgeTiles,
        ty = r.y + uy * rp.dodgeTiles;
      if (!free(g, floor, tx, ty) || !free(g, floor, r.x + ux * rp.dodgeTiles * 0.5, r.y + uy * rp.dodgeTiles * 0.5)) continue;
      const room = clearance(g, floor, tx, ty, ux, uy);
      if (room > bestRoom) {
        best = [tx, ty];
        bestRoom = room;
      }
    }
    if (!best) continue; // boxed in: no dodge, the dash lands
    r.dodgeFrom = [r.x, r.y];
    r.dodgeTo = best;
    r.dodgeMs = rp.dodgeMs;
    r.dodgeCd = rp.dodgeCdMs;
    g.bus.emit('rat:dodge', { player: p.id });
  }
  if ((r.dodgeMs ?? 0) <= 0) return false;
  r.dodgeMs = Math.max(0, r.dodgeMs! - dtMs);
  const k = 1 - r.dodgeMs / rp.dodgeMs;
  r.x = r.dodgeFrom![0] + (r.dodgeTo![0] - r.dodgeFrom![0]) * k;
  r.y = r.dodgeFrom![1] + (r.dodgeTo![1] - r.dodgeFrom![1]) * k;
  if (r.dodgeMs === 0) r.pantMs = rp.pantMs; // the jump is over: it pants
  return true;
}

/** Walking speed and turn rate now: panting halves it, a chef closing in within `alertTiles` is the alert speed. */
export function ratGait(g: Game, r: Rat, rp: RatParams): { speed: number; turnDps: number } {
  if (!g.hz) return { speed: rp.walk, turnDps: rp.alertTurnDps };
  if ((r.pantMs ?? 0) > 0) return { speed: rp.walk * rp.pantSpeed, turnDps: rp.alertTurnDps };
  for (const p of g.players.values()) {
    if (p.ghost) continue;
    const dx = r.x - p.x,
      dy = r.y - p.y,
      d = Math.hypot(dx, dy);
    if (d <= rp.alertTiles && (p.vx * dx + p.vy * dy) / (d || 1) > 0.5) return { speed: rp.alert, turnDps: rp.alertTurnDps };
  }
  return { speed: rp.walk, turnDps: 360 };
}
