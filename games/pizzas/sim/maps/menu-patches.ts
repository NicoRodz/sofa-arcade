// menuV2 map patches (design pizzas-tanda2 §2): the one edit a map needs so its card can hold a third plate. These maps have no topping crate, so the patch swaps one
// tile for a cheese crate ('3'), which turns on the Pepperoni of their V2 card (recipes/cards.ts CARDS_V2). Kept apart from the hazard patches.
// The tile is the free counter nearest to the centroid of the existing crates ('1' dough, '2' tomato); a map with no counters (Taller 31-35) takes the floor tile
// against a wall nearest to it. Ties go by (y, x). The coordinates are stored (the metadata of the patch) and recipes.v2.test.ts re-derives the rule and runs
// every patched map through validateMap, so a layout change that breaks one fails there.

/** Map id -> [x, y] of the tile that becomes a cheese crate. */
export const MENU_CRATE_AT: Readonly<Record<string, readonly [number, number]>> = {
  '1': [4, 0],
  '2': [0, 3],
  '3': [3, 0],
  '4': [2, 0],
  '5': [3, 0],
  '6': [7, 2],
  '7': [4, 2],
  '8': [7, 1],
  '16': [4, 0],
  '17': [4, 0],
  '18': [4, 0],
  '19': [4, 0],
  '31': [2, 1],
  '32': [2, 1],
  '33': [2, 1],
  '34': [2, 1],
  '35': [2, 1],
};

/** The rows of a map as a menuV2 round plays them: the same rows, with the cheese crate where the patch says (unchanged if the map needs none or already has one). */
export function menuPatchRows(mapId: string | undefined, rows: readonly string[]): readonly string[] {
  const at = mapId === undefined ? undefined : MENU_CRATE_AT[mapId];
  if (!at || rows.some((r) => r.includes('3'))) return rows;
  const [x, y] = at;
  return rows.map((r, j) => (j === y ? r.slice(0, x) + '3' + r.slice(x + 1) : r));
}
