// The Derrame event ("¡DERRAME!", design section 3): six patches of oil appear on free floor tiles, chosen with the events' own stream (`m.rng`), the only draw the mechanics make.
// It joins the pool only when `flags.mech.oil` is on (midround.ts eventPool).
import type { Rng } from '@pichi/core/rng';
import type { Game } from '../../round/state';
import { OIL_TICKS, TILES, at, freeFloor } from './state';
import { oilOn } from './module';

export const SPILL_PATCHES = 6;

/** Throw the patches; returns the tiles (the event banner and the tests read them). */
export function spill(g: Game, rng: Rng): number[] {
  const free = Array.from({ length: TILES }, (_v, i) => i).filter((i) => freeFloor(g, i) && at(g, i) === 0 && !nearStation(g, i));
  const out: number[] = [];
  for (let n = 0; n < SPILL_PATCHES && free.length; n++) {
    const idx = free.splice(Math.floor(rng() * free.length), 1)[0]!;
    oilOn(g, idx, OIL_TICKS);
    out.push(idx);
  }
  return out;
}
const nearStation = (g: Game, idx: number) =>
  g.stations.some((s) => s.kind === 'window' && Math.abs(s.tx - (idx % 16)) + Math.abs(s.ty - Math.floor(idx / 16)) < 2); // not on the window: keep the serving lane open
