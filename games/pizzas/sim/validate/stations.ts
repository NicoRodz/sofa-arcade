// Recipe stations on a grid: the keys, the legs of the recipe between them, where each station is and which floor tiles touch it.
import { DIRS, isFloor, type Grid, type Pos } from '../maps';

export type StationKey = '1' | '2' | '3' | '4' | 'K' | 'O' | 'P' | 'E' | 'U' | 'L';
// 1 -> K, 2 -> K, K -> O (once per ingredient), P -> O, O -> E
export const RECIPE_LEGS: readonly (readonly [StationKey, StationKey])[] = [
  ['1', 'K'],
  ['K', 'O'],
  ['2', 'K'],
  ['K', 'O'],
  ['P', 'O'],
  ['O', 'E'],
];
export const STATION_KEYS: readonly StationKey[] = ['1', '2', 'K', 'O', 'P', 'E']; // every map has these
// A map with a cheese crate ('3') also needs the cheese route: 3 -> K, then K -> O (already a leg).
// A map with a dirty-plate return (U) or a sink (L) needs both and the washing loop: U -> L (dirty plates), L -> O (clean plates to the ovens).
export const hasCheese = (g: Grid) => stationsOf(g, '3').length > 0;
export const hasTopping2 = (g: Grid) => stationsOf(g, '4').length > 0;
export const hasSink = (g: Grid) => stationsOf(g, 'U').length > 0 || stationsOf(g, 'L').length > 0;
export const keysOf = (g: Grid): StationKey[] => [
  ...STATION_KEYS,
  ...(hasCheese(g) ? (['3'] as const) : []),
  ...(hasTopping2(g) ? (['4'] as const) : []),
  ...(hasSink(g) ? (['U', 'L'] as const) : []),
];
export const legsOf = (g: Grid): (readonly [StationKey, StationKey])[] => [
  ...RECIPE_LEGS,
  ...(hasCheese(g) ? ([['3', 'K']] as const) : []),
  ...(hasTopping2(g) ? ([['4', 'K']] as const) : []),
  ...(hasSink(g)
    ? ([
        ['U', 'L'],
        ['L', 'O'],
      ] as const)
    : []),
];

export function stationsOf(g: Grid, key: StationKey): Pos[] {
  const out: Pos[] = [];
  g.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t.kind !== 'station') return;
      const hit =
        key === '1'
          ? t.station === 'crate' && t.crate === 0
          : key === '2'
            ? t.station === 'crate' && t.crate === 1
            : key === '3'
              ? t.station === 'crate' && t.crate === 2
              : key === '4'
                ? t.station === 'crate' && t.crate === 3
                : key === 'U'
                  ? t.station === 'dirty'
                  : key === 'L'
                    ? t.station === 'sink'
                    : key === 'K'
                      ? t.station === 'board'
                      : key === 'O'
                        ? t.station === 'pot'
                        : key === 'P'
                          ? t.station === 'plates'
                          : t.station === 'window';
      if (hit) out.push([x, y]);
    }),
  );
  return out;
}

export function accessTiles(g: Grid, x: number, y: number): Pos[] {
  const out: Pos[] = [];
  for (const [dx, dy] of DIRS) if (isFloor(g, x + dx, y + dy)) out.push([x + dx, y + dy]);
  return out;
}
