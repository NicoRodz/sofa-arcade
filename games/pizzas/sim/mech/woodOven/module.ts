// Wood oven W + bellows Q, implemented by T1e (design section 2). W is an oven of the sim (a `pot`, `wood`): it bakes at x1.6 while it has fuel and is frozen without it (it neither bakes nor
// burns). B held on Q adds 3 fuel per tick (cap 900) and the fuel falls 1 per tick, so a chef blows, runs to the oven, and the fire is still there.
import type { MechModule } from '../types';
import { noopHooks } from '../noop';
import { woodOvenValidate } from '../../validate/mech/woodOven';
import { woodOvenStamp } from '../../gen/stamps/woodOven';
import { callOther } from '../kneader/call';
import { BLOW, DECAY, FAST, woodCap, blowers, bellows, dryFlag, feedOf, loaded, ovens, start } from './state';

export const woodOvenModule: MechModule = {
  ...noopHooks,
  id: 'woodOven',
  tanda: 'T1e',
  validate: woodOvenValidate,
  stamp: woodOvenStamp,
  init: start,
  beforeMove(g) {
    for (const q of bellows(g)) delete blowers(g)[q]; // refilled by this tick's chefs; the art reads it after the tick
  },
  claimsB: (_g, _p, target) => !!target && target.kind === 'bellows',
  onInteract(g, p, c, target) {
    if (!c.b || !target || target.kind !== 'bellows') return false;
    const q = g.stations.indexOf(target);
    const w = feedOf(g, q);
    if (w === undefined) return false;
    g.mech!.wood![w] = Math.min(woodCap(g), (g.mech!.wood![w] ?? 0) + BLOW);
    blowers(g)[q] = p.id;
    return false; // A is not touched
  },
  tickStations(g) {
    for (const w of ovens(g)) {
      const fuel = g.mech!.wood![w] ?? 0;
      const next = Math.max(0, fuel - DECAY);
      g.mech!.wood![w] = next;
      const s = g.stations[w]!;
      if (next > 0) dryFlag(g)[w] = false;
      else if (fuel > 0 && loaded(s) && s.fire === undefined && !dryFlag(g)[w]) {
        dryFlag(g)[w] = true; // the fire went out with a pizza inside: whoever is free must blow
        const blowing = Object.values(blowers(g));
        callOther(g, 'woodOven', w, blowing);
      }
    }
  },
  ovenRate(g, s) {
    if (!s.wood || !g.mech?.wood) return 1000;
    return (g.mech.wood[g.stations.indexOf(s)] ?? 0) > 0 ? FAST : 0;
  },
  hashExtra: (g) => ovens(g).map((w) => g.mech!.wood![w] ?? 0),
};
