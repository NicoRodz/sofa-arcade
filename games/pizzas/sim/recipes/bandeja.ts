// The Bandeja familiar (Carta larga, tanda 3; `compoundOrders` on, coop rounds with a team of 4 or more): ONE ticket that asks for three plates of the card. Each plate that
// reaches the window takes a slot of the ticket; the third pays the whole tray: the sum of the three plates times 1.3, or only the plain sum when the first and the last
// were more than the margin apart (Easy 35 s, Normal 25 s, Difficult 18 s). At most one is open per team; in the adaptive load it counts as 3; its patience is twice a plate's.
// The parts are drawn from the team's own stream ONLY when a Bandeja comes up, so with the flag off nothing is ever drawn.
import type { Tuning, Difficulty } from '@pichi/core/difficulty';
import type { Rng } from '@pichi/core/rng';
import type { Game, Item, Order, Player, TeamState } from '../round/state';
import { DIRTY_MS } from '@pichi/core/difficulty';
import { RECIPE_DEFS, dishRecipe, recipeBase, servesRecipe, type Recipe } from './defs';

export const BANDEJA_BONUS = 1.3;
export const BANDEJA_MIN_N = 4;
export const BANDEJA_PARTS = 3;
export const MARGIN_MS: Record<Difficulty, number> = { easy: 35_000, normal: 25_000, hard: 18_000 };

/** May a new Bandeja be opened for this team: the flag is on, the team has 4 or more chefs and none is open already. */
export const bandejaAllowed = (g: Pick<Game, 'compound' | 'n'>, team: Pick<TeamState, 'orders'>): boolean =>
  g.compound && g.n >= BANDEJA_MIN_N && !team.orders.some((o) => o.recipe === 'bandeja');

/** The three plates of a new Bandeja: different ones while the card has three to choose from, else repeating. Draws from `rng`: three times. */
export function pickParts(g: Pick<Game, 'rec'>, rng: Rng): Recipe[] {
  const pool = (g.rec?.recipes ?? ['marinara']).filter((r) => r !== 'bandeja');
  const left = [...pool];
  return Array.from({ length: BANDEJA_PARTS }, () => {
    const i = Math.floor(rng() * left.length);
    const r = left[i]!;
    if (pool.length >= BANDEJA_PARTS) left.splice(i, 1);
    return r;
  });
}

/** The patience of a Bandeja: twice that of a plate (a plate of the card is worth `effort` Marinaras in an adaptive round). */
export const bandejaPatienceMs = (g: Pick<Game, 'adaptive' | 'params'>, parts: readonly Recipe[]): number =>
  g.params.orderTtlMs * 2 * (g.adaptive ? parts.reduce((n, r) => n + RECIPE_DEFS[r].effort, 0) / parts.length : 1);

/** The slot of an open Bandeja this plate fills (its own recipe first, then a Marinara a topped plate may serve), or -1. */
export function partSlot(o: Order, item: Item): number {
  if (o.recipe !== 'bandeja' || !o.parts) return -1;
  const free = (i: number) => !o.served?.[i];
  const exact = o.parts.findIndex((r, i) => free(i) && r === dishRecipe(item));
  return exact >= 0 ? exact : o.parts.findIndex((r, i) => free(i) && servesRecipe(item, r));
}

/** The plate goes into its slot; true when that was the last one (the tray is complete and the caller pays it). */
export function takePart(g: Game, team: TeamState, o: Order, p: Player): boolean {
  const slot = partSlot(o, p.item!);
  o.served = o.served ?? o.parts!.map(() => false);
  o.served[slot] = true;
  o.firstAt = o.firstAt ?? g.time;
  if (g.finitePlates) team.dirtyDue.push(g.time + DIRTY_MS);
  p.item = null;
  return o.served.every(Boolean);
}

/** What the finished tray is worth before the tip: the sum of its plates, times 1.3 when the last came inside the margin. */
export function bandejaBase(g: Game, o: Order, t: Tuning): number {
  const sum = o.parts!.reduce((n, r) => n + recipeBase(r, t), 0);
  return g.time - (o.firstAt ?? g.time) > MARGIN_MS[g.difficulty] ? sum : Math.round(sum * BANDEJA_BONUS);
}
