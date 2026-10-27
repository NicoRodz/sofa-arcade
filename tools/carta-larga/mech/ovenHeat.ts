// Bot job of 'ovenHeat', implemented by T1b: the golden chefs each keep their own oven (rank mod ovens), which is already the best use of the heat (an oven recovers while the other works).
// `wants` is true when some oven is under 400 (the chef should go and do something else); `heatAssist` only measures: the lowest temperature seen and the loads made on a cold oven.
import type { MechBot } from '@pichi/game-pizzas/sim/mech/types';
import type { Controls, Game } from '@pichi/game-pizzas/sim/overcooked';

export const ovenHeatBot: MechBot = { wants: (g) => Object.values(g.mech?.heat ?? {}).some((t) => t < 400) };

export interface HeatBotState {
  minTemp: number;
  coldLoads: number;
  inputs: Record<number, number>;
}
export const newHeatBot = (): HeatBotState => ({ minTemp: 1000, coldLoads: 0, inputs: {} });
export function heatAssist(g: Game, _base: Map<number, Controls>, st: HeatBotState) {
  for (const [k, t] of Object.entries(g.mech?.heat ?? {})) {
    const i = Number(k),
      n = g.stations[i]!.inputs.length;
    st.minTemp = Math.min(st.minTemp, t);
    if ((st.inputs[i] ?? 0) === 0 && n > 0 && t < 700) st.coldLoads++;
    st.inputs[i] = n;
  }
}
