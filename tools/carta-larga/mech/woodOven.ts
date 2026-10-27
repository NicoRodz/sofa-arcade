// Bot job of 'woodOven': the fogonero. It has to play when a W holds a pizza and its fuel is nearly out (a chef goes to Q and holds B).
import { fuelOf, loaded, ovens } from '@pichi/game-pizzas/sim/mech/woodOven/state';
import type { MechBot } from '@pichi/game-pizzas/sim/mech/types';

export const woodOvenBot: MechBot = {
  wants: (g) => (g.mech?.wood ? ovens(g).some((w) => loaded(g.stations[w]!) && fuelOf(g, w) < 100) : false),
};
