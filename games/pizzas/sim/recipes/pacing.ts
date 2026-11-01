// Adaptive pacing (design pizzas-mapas-platos-diseno.md §D; coop rounds with `adaptive` on, the Carta larga series): the playtest of 25-oct found a fixed order clock too
// slack for a good team and too heavy for a slow one. Here an order comes when the LOAD of the queue (the sum of the effort of the open orders) is under a target
// that grows with the team, and at least a minimum gap after the last one. A fast team empties the queue and gets orders sooner; a slow team is never buried.
// Pure: it reads the state of the round only and draws nothing from any stream, so the order of the recipes (one draw per admitted order) is the same as ever.
import type { Difficulty } from '@pichi/core';
import type { Game, TeamState } from '../round/state';
import { RECIPE_DEFS, type Recipe } from './defs';

/** Target load of the queue: base + per-chef share of effort (design table D). */
const TARGET: Record<Difficulty, { base: number; perChef: number }> = {
  easy: { base: 1, perChef: 0.7 },
  normal: { base: 1.5, perChef: 1.0 },
  hard: { base: 2, perChef: 1.3 },
};
export const MIN_GAP_MS: Record<Difficulty, number> = { easy: 14_000, normal: 9000, hard: 6000 };

export const targetLoad = (d: Difficulty, chefs: number) => TARGET[d].base + TARGET[d].perChef * chefs;
export const loadOf = (team: Pick<TeamState, 'orders'>): number => team.orders.reduce((n, o) => n + RECIPE_DEFS[o.recipe].effort, 0);

/** The patience of an order: the difficulty's own, longer for the plates that take more work (a Marinara is the base). */
export const patienceMs = (g: Pick<Game, 'adaptive' | 'params'>, recipe: Recipe): number =>
  g.adaptive ? g.params.orderTtlMs * RECIPE_DEFS[recipe].effort : g.params.orderTtlMs;

/** The gap to wait after a new order when one is due now (adaptive rounds), else null. */
export function adaptiveDue(g: Pick<Game, 'time' | 'difficulty' | 'players'>, team: TeamState & { nextOrderAt: number }): number | null {
  if (g.time < team.nextOrderAt) return null;
  const chefs = [...g.players.values()].filter((p) => p.team === team.id).length || 1;
  return loadOf(team) < targetLoad(g.difficulty, chefs) ? MIN_GAP_MS[g.difficulty] : null;
}
