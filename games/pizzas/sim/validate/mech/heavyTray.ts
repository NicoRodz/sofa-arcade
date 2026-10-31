// Static validator of 'heavyTray' (design section 2). Implemented by T2. Returns the problems of a map (rows) for a team of n chefs, [] when it is fine.
// The tray walks from the oven to the window: that route must exist without a single bridge (a worn bridge breaks under the tray: 3 wear a step) or raft. And a map that declares the mechanic must
// have the Bandeja on its card (`heavyTrayCardProblems`: the rows do not know the card, so the map-level check takes the map).
import type { MechValidator } from '../../mech/types';
import { DIRS, at, find, reach, touches } from '../../mech/grid';
import { cardFor } from '../../recipes/cards';

export const heavyTrayValidate: MechValidator = (rows) => {
  const ovens = find(rows, 'O'),
    windows = find(rows, 'E');
  if (!ovens.length || !windows.length) return [];
  const free = (x: number, y: number) =>
    at(rows, x, y) !== undefined && !'#~b=O'.includes(at(rows, x, y)!) && !/[A-Z0-9*]/.test(at(rows, x, y)!);
  const starts = ovens.flatMap(([x, y]) => DIRS.map(([dx, dy]) => [x + dx, y + dy] as [number, number])).filter(([x, y]) => free(x, y));
  const seen = reach(rows, starts, (c) => c !== 'b' && c !== '=');
  return touches(rows, seen, 'E')
    ? []
    : ['heavyTray: no route from an oven O to the window E without a bridge b or a raft (the tray would wear the bridge out)'];
};

/** A map that declares `heavyTray` needs the Bandeja on its card (it is the tray that is heavy). */
export function heavyTrayCardProblems(map: { id: string; mechanics?: readonly string[] }): string[] {
  if (!map.mechanics?.includes('heavyTray')) return [];
  return cardFor(map.id)?.recipes.includes('bandeja') ? [] : [`heavyTray: map ${map.id} declares it but its card has no Bandeja familiar`];
}
