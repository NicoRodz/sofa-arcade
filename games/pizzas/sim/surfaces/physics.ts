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
  const ice = hazardParams(g.difficulty).ice; // HAZARD_V2: one tau to speed up, a longer one to brake (no stick, or against the slide)
  return Math.max(tau, braking ? ice.tauStopMs : ice.tauAccelMs);
}

/** The belt's drift (tiles/s) at the chef's centre, or null off a belt. */
export function beltPush(g: Game, p: Player): [number, number] | null {
  const s = surfaceAt(g, p.x, p.y);
  return s?.kind === 'belt' ? [s.dx * BELT_SPEED, s.dy * BELT_SPEED] : null;
}
