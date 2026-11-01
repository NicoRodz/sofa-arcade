// The createGame options a coop lobby round plays by (screen/match/round.ts startCoop), shared by stars-calibrate.ts and its test.
import { fixedMap } from '@pichi/game-pizzas/sim/maps';
import { patchMap } from '@pichi/game-pizzas/sim/maps/hazard-patches';
import { mechFlagsOf } from '@pichi/game-pizzas/sim/mech/ids';
import { usesSurfaces } from '@pichi/game-pizzas/sim/surfaces/legend';
import { roundRules } from '@pichi/game-pizzas/sim/midround';
import { eventsV2Of } from '@pichi/game-pizzas/sim/ev2/state';
import type { Difficulty } from '@pichi/core/difficulty';

/** The createGame options of a lobby coop round on map `id` (startCoop), minus what seriesRound already sets. */
export function lobbyExtra(id: string, d: Difficulty, series: boolean, eventsSeed: number) {
  const pm = patchMap(fixedMap(id)!, d);
  const s = { adaptive: series, upgradeOrders: series, sliceAfterBake: series, compoundOrders: series };
  return {
    pm,
    extra: {
      ...roundRules(undefined, d),
      ...s,
      hazardsV3: true,
      eventsV2: eventsV2Of(undefined),
      menuV2: true,
      eventsSeed,
      rows: pm.rows,
      mech: mechFlagsOf(pm.mechanics),
      surfaces: usesSurfaces(pm.rows),
      mutation: pm.mutation,
    },
  };
}
