// The Derrame event ("¡DERRAME!", design section 3): six patches of oil appear on free floor tiles, chosen with the events' own stream (`m.rng`), the only draw the mechanics make.
// It joins the pool only when `flags.mech.oil` is on (midround.ts eventPool).
import type { Rng } from '@pichi/core/rng';
import type { Game } from '../../round/state';
import { TILES, at, freeFloor } from './state';
import { hz3Params } from '../../hazards/hazard-v3';
import { oilOn } from './module';

export const SPILL_PATCHES = 6; // HAZARD_V3 raises it (hz3Params(g).oil.spillPatches)

/** Throw the patches; returns the tiles (the event banner and the tests read them). */
export function spill(g: Game, rng: Rng): number[] {
  const free = Array.from({ length: TILES }, (_v, i) => i).filter((i) => freeFloor(g, i) && at(g, i) === 0 && !nearStation(g, i));
  const out: number[] = [];
  const o = hz3Params(g).oil;
  for (let n = 0; n < o.spillPatches && free.length; n++) {
    const idx = free.splice(Math.floor(rng() * free.length), 1)[0]!;
    oilOn(g, idx, o.spillDry);
    out.push(idx);
  }
  return out;
}
const nearStation = (g: Game, idx: number) =>
  g.stations.some((s) => s.kind === 'window' && Math.abs(s.tx - (idx % 16)) + Math.abs(s.ty - Math.floor(idx / 16)) < 2); // not on the window: keep the serving lane open
