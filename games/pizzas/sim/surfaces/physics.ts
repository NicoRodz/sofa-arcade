// What the surface under a chef does to it: ice stretches the velocity tau, a belt adds a constant drift.
import type { Surface } from '../maps/types';
import type { Game, Player } from '../round/state';
import { BELT_SPEED, ICE_TAU_MS } from './config';
import { hazardParams } from '../hazard-v2';

const ICE: Surface = { kind: 'ice' };
export function surfaceAt(g: Game, x: number, y: number): Surface | null {
  const t = g.grid[Math.floor(y)]?.[Math.floor(x)];
  if (t?.kind !== 'floor') return null;
  return g.mid?.frost ? ICE : (t.surface ?? null); // the frost event freezes every floor tile, belts included
}

/** Velocity time constant (ms) under the chef: on ice never shorter than ICE_TAU_MS, in or out of the stick (Ayudante keeps 0: no inertia). */
export function iceTau(g: Game, p: Player, tau: number, braking = false): number {
  if (p.assist) return tau;
  if (surfaceAt(g, p.x, p.y)?.kind !== 'ice') return tau;
  if (!g.hz) return Math.max(tau, ICE_TAU_MS);
  if (!g.hz) return Math.max(tau, ICE_TAU_MS);
  const ice = hazardParams(g.difficulty).ice; // HAZARD_V2: one tau to speed up, a longer one to brake (no stick, or against the slide)
  return Math.max(tau, braking ? ice.tauStopMs : ice.tauAccelMs);
}

/** HAZARD_V2: on ice the velocity vector turns at most `turnDps`; the slide is steered, it does not corner. Keeps the speed `p.vx/p.vy` now has, bends its direction from (ovx, ovy). */
export function iceTurnLimit(g: Game, p: Player, ovx: number, ovy: number, dtMs: number) {
  if (!g.hz || p.assist || surfaceAt(g, p.x, p.y)?.kind !== 'ice') return;
  const s0 = Math.hypot(ovx, ovy),
    s1 = Math.hypot(p.vx, p.vy);
  if (s0 < 0.3 || s1 < 0.3) return; // nearly stopped: the vector may point anywhere
  const a0 = Math.atan2(ovy, ovx);
  let d = Math.atan2(p.vy, p.vx) - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const lim = (hazardParams(g.difficulty).ice.turnDps * Math.PI * dtMs) / 180_000;
  if (Math.abs(d) <= lim) return;
  const a = a0 + Math.sign(d) * lim;
  p.vx = Math.cos(a) * s1;
  p.vy = Math.sin(a) * s1;
}

/** The belt's drift (tiles/s) at the chef's centre, or null off a belt. */
export function beltPush(g: Game, p: Player): [number, number] | null {
  const s = surfaceAt(g, p.x, p.y);
  return s?.kind === 'belt' ? [s.dx * BELT_SPEED, s.dy * BELT_SPEED] : null;
}
