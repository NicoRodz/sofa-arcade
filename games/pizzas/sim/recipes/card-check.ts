// The validator's side of the Carta del día: a card against the map (or the kitchen, in versus) it is for. Every station a recipe of the card needs must
// be on the grid AND reachable: some floor tile next to it must belong to a zone (floor regions joined by passing counters) that holds a spawn.
// validate.ts calls it from validateMap and validateVersus (per kitchen, with the other kitchen walled off); a map with no card is not checked.
import type { Grid } from '../maps';
import { accessTiles, analyze, stationsOf, type StationKey } from '../validate';
import { DIFFICULTIES } from '@pichi/core/difficulty';
import { cardForV2, cardShapeProblems, type Card } from './cards';
import { menuRecipes } from './menu';
import { RECIPE_DEFS } from './defs';

export function cardProblems(card: Card, g: Grid): string[] {
  const errors = cardShapeProblems(card);
  const a = analyze(g);
  const manned = new Set(a.zone.filter((_z, c) => a.spawns[c]! > 0)); // zones where a chef starts
  const reach = (key: StationKey) =>
    stationsOf(g, key).some(([x, y]) => accessTiles(g, x, y).some(([ax, ay]) => manned.has(a.zone[a.comp[ay]![ax]!]!)));
  const seen = new Set<string>();
  for (const r of card.recipes) {
    const def = RECIPE_DEFS[r];
    if (!def) continue; // unknown recipe: cardShapeProblems said so
    for (const key of def.needs) {
      const present = stationsOf(g, key).length > 0;
      if (seen.has(`${r}${key}`) || (present && reach(key))) continue;
      seen.add(`${r}${key}`);
      errors.push(`recipe ${r} (${def.name}) needs station ${key}: ${present ? 'no chef can reach it' : 'it is not on the map'}`);
    }
  }
  return errors;
}

/**
 * menuV2: the card a round plays (sorted by effort and cut to the difficulty) against the map as the round plays it: `g` is the grid with the menu patch applied
 * (in versus: each kitchen). Every difficulty is checked, so a cut that leaves out a plate cannot hide a station that the full card needs. Empty for a map with no card.
 */
export function menuCardProblems(mapId: string, g: Grid): string[] {
  const card = cardForV2(mapId);
  if (!card) return [];
  const errors = new Set<string>();
  for (const d of DIFFICULTIES)
    for (const e of cardProblems({ ...card, recipes: menuRecipes(card.recipes, d) }, g)) errors.add(`menuV2 ${d}: ${e}`);
  return [...errors];
}
