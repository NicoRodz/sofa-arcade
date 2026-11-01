// Cache of simulated plans shared by the graphs of one validation, keyed by the terrain around the segment.
import { TILE } from '../../constants';
import type { PhysicsParams } from '../../sim/player/player';
import type { TileGrid } from '../../sim/world/tiles';
import { simPlan, type Landing, type Plan } from '../sim';
import type { Seg, SimCache } from './types';

export const newSimCache = (): SimCache => new Map();
const CACHE_COLS = 26;
const planSig = (p: Plan, s: Seg): string =>
  `${p.boost ?? ''}|${p.boostDelay ?? ''}|${p.trigger}|${p.dir}|${p.x - s.x0 * TILE}|${p.feetY - s.row * TILE}|${p.k}|${p.lead ?? ''}|${p.endX === undefined ? '' : p.endX - s.x0 * TILE}|${p.air}|${p.f}|${p.vx0 ?? ''}|${p.vy0 ?? ''}`;
export function windowKey(g: TileGrid, cols: string[], s: Seg, params: PhysicsParams): string {
  let k = `${s.row}:${s.x1 - s.x0}:${params.coyote}:${params.buffer}:${params.stickyEdges ? 1 : 0}:${g.h}:`;
  for (let x = s.x0 - CACHE_COLS; x <= s.x1 + CACHE_COLS; x++) k += (x < 0 || x >= g.w ? 'W' : cols[x]!) + '/';
  return k;
}
export function simCached(
  grid: TileGrid,
  params: PhysicsParams,
  s: Seg,
  plan: Plan,
  bucket: Map<string, (Omit<Landing, 'cx' | 'ty'> & { dcx: number; dty: number }) | null>,
): Landing | null {
  const sig = planSig(plan, s);
  let hit = bucket.get(sig);
  if (hit === undefined) {
    const l = simPlan(grid, params, plan);
    hit = l
      ? {
          dcx: l.cx - s.x0,
          dty: l.ty - s.row,
          takeoffX: l.takeoffX - s.x0 * TILE,
          landX: l.landX - s.x0 * TILE,
          steps: l.steps,
          viaHand: false,
          apexRise: l.apexRise,
        }
      : null;
    bucket.set(sig, hit);
  }
  return hit
    ? {
        cx: hit.dcx + s.x0,
        ty: hit.dty + s.row,
        takeoffX: hit.takeoffX + s.x0 * TILE,
        landX: hit.landX + s.x0 * TILE,
        steps: hit.steps,
        viaHand: false,
        apexRise: hit.apexRise,
      }
    : null;
}
