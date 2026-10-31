// State of the wood oven (W) and its bellows (Q): the fuel of each W (0..900, `game.mech.wood[idx]`), which W each Q feeds, who is blowing.
import type { Game, Station } from '../../round/state';
import { hz3Params } from '../../hazards/hazard-v3';

export const BLOW = 3; // fuel per tick while a chef holds B on Q
export const DECAY = 1; // fuel lost per tick
export const CAP = 900;
/** The tank of one oven: HAZARD_V3 sizes it so that a full load burns for 40 s Normal / 30 s Hard (fuel decays by DECAY per tick). */
export const woodCap = (g: Game): number => hz3Params(g).wood.cap;
export const FAST = 1600; // permil of the normal speed while there is fuel; with none the oven is frozen (it neither bakes nor burns)

interface Ext {
  feeds: Record<number, number>; // bellows station index -> the W station index it feeds (the nearest)
  blowing: Record<number, number>; // bellows station index -> chef id that blew this tick
  dry: Record<number, boolean>; // W station index -> the fuel ran out with a pizza inside and the call was made
}
const ext = (g: Game) => g.mech!.ext!.woodOven as Ext;

export const ovens = (g: Game) => g.stations.flatMap((s, i) => (s.kind === 'pot' && s.wood ? [i] : []));
export const bellows = (g: Game) => g.stations.flatMap((s, i) => (s.kind === 'bellows' ? [i] : []));

export function start(g: Game) {
  g.mech!.ext = { ...g.mech!.ext, woodOven: { feeds: {}, blowing: {}, dry: {} } satisfies Ext };
  g.mech!.wood = {};
  for (const w of ovens(g)) g.mech!.wood[w] = 0;
  const w = ovens(g);
  for (const q of bellows(g)) {
    const s = g.stations[q]!;
    const d = (i: number) => Math.abs(g.stations[i]!.tx - s.tx) + Math.abs(g.stations[i]!.ty - s.ty);
    const near = [...w].sort((a, b) => d(a) - d(b) || a - b)[0];
    if (near !== undefined) ext(g).feeds[q] = near;
  }
}
export const feedOf = (g: Game, q: number): number | undefined => ext(g).feeds[q];
export const fuelOf = (g: Game, w: number): number => g.mech?.wood?.[w] ?? 0;
export const blowers = (g: Game) => ext(g).blowing;
export const dryFlag = (g: Game) => ext(g).dry;
/** Is the W oven holding something that needs heat (dough or pizza inside, ready or not)? */
export const loaded = (s: Station) => s.inputs.length > 0 || s.done;

/** After a station moved (the v2 mutation): each bellows feeds the nearest W again. The fuel stays where it is. */
export function refeed(g: Game) {
  const w = ovens(g);
  for (const q of bellows(g)) {
    const s = g.stations[q]!;
    const d = (i: number) => Math.abs(g.stations[i]!.tx - s.tx) + Math.abs(g.stations[i]!.ty - s.ty);
    const near = [...w].sort((a, b) => d(a) - d(b) || a - b)[0];
    if (near !== undefined) ext(g).feeds[q] = near;
  }
}
