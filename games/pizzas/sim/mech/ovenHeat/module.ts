// Thermal oven (design section 3): each O has a temp 0..1000 that drops 300 for every ingredient put in and when the dish is taken out, recovers 4 a tick, and sets the baking speed to 400 + temp * 6 / 10 permil.
// The Ola de frío event takes 500 off every oven when it starts. Integers only. Implemented by T1b.
import type { MechModule } from '../types';
import { noopHooks } from '../noop';
import { ovenHeatValidate } from '../../validate/mech/ovenHeat';
import { ovenHeatStamp } from '../../gen/stamps/ovenHeat';
import type { Game } from '../../round/state';

export const HEAT_MAX = 1000;
export const HEAT_DROP = 300; // loading the oven or taking the dish out
export const FROST_DROP = 500;
export const HEAT_RECOVER = 4; // per tick

interface Prev {
  n: number; // chefs' ingredients in the pot last tick
  done: boolean;
  frost: boolean;
}
const prevOf = (g: Game) => g.mech!.ext!.heatPrev as Record<number, Prev>;
const ovens = (g: Game) => g.stations.flatMap((s, i) => (s.kind === 'pot' && !s.wood ? [i] : [])); // the W oven is the woodOven module's

export const ovenHeatModule: MechModule = {
  ...noopHooks,
  id: 'ovenHeat',
  tanda: 'T1b',
  validate: ovenHeatValidate,
  stamp: ovenHeatStamp,
  init(g) {
    g.mech!.heat = {};
    g.mech!.ext = { ...g.mech!.ext, heatPrev: {} };
    for (const i of ovens(g)) {
      g.mech!.heat[i] = HEAT_MAX;
      prevOf(g)[i] = { n: 0, done: false, frost: false };
    }
  },
  ovenRate(g, s) {
    const t = s.kind === 'pot' && !s.wood ? g.mech!.heat?.[g.stations.indexOf(s)] : undefined;
    return t === undefined ? 1000 : 400 + Math.trunc((t * 6) / 10);
  },
  tickStations(g) {
    const heat = g.mech!.heat!;
    const frost = !!g.mid?.frost;
    for (const i of ovens(g)) {
      const s = g.stations[i]!,
        p = prevOf(g)[i]!;
      let t = heat[i]!;
      t -= HEAT_DROP * Math.max(0, s.inputs.length - p.n); // every ingredient put in...
      if (p.done && !s.done) t -= HEAT_DROP; // ...and the dish taken out: each opens the door
      if (frost && !p.frost) t -= FROST_DROP;
      heat[i] = Math.min(HEAT_MAX, Math.max(0, t + HEAT_RECOVER));
      p.n = s.inputs.length;
      p.done = s.done;
      p.frost = frost;
    }
  },
  hashExtra: (g) => Object.keys(g.mech!.heat!).flatMap((k) => [Number(k), g.mech!.heat![Number(k)]!]),
};
