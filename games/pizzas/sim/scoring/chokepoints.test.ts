import { describe, expect, it } from 'vitest';
import { COOP_MAPS, isFloor, parseMap, posKey, floorComponents, type Grid } from '../maps';
import { mechFlagsOf } from '../mech/ids';
import { generate } from '../generate';
import { chokepoints } from './chokepoints';

// The definition: a floor tile is a chokepoint when taking it away leaves more floor regions than before (one flood fill per tile).
function bruteForce(g: Grid): Set<string> {
  const { count } = floorComponents(g);
  const out = new Set<string>();
  g.forEach((row, y) =>
    row.forEach((_t, x) => isFloor(g, x, y) && floorComponents(g, posKey(x, y)).count > count && out.add(posKey(x, y))),
  );
  return out;
}
const sorted = (s: Set<string>) => [...s].sort();

describe('chokepoints', () => {
  it('it is the set the flood fill per tile finds, on every coop map and on 120 generated kitchens', () => {
    const grids = COOP_MAPS.map((m) => parseMap(m.rows, false, mechFlagsOf(m.mechanics)));
    for (const d of ['easy', 'normal', 'hard'] as const)
      for (const n of [2, 5, 8]) for (let seed = 0; seed < 14; seed++) grids.push(parseMap(generate(seed, d, n).rows));
    expect(grids.length).toBeGreaterThanOrEqual(150);
    let withChokepoints = 0;
    for (const g of grids) {
      const fast = chokepoints(g);
      expect(sorted(fast)).toEqual(sorted(bruteForce(g)));
      if (fast.size) withChokepoints++;
    }
    expect(withChokepoints).toBeGreaterThan(10); // the comparison is not two empty sets
  });

  it('two 3x3 rooms joined by a one-tile corridor: the corridor and the two tiles it touches are chokepoints; a lone tile and a room corner are not', () => {
    const rows = Array.from({ length: 9 }, () => Array.from({ length: 16 }, () => '#'));
    const open = (x0: number, x1: number, y0: number, y1: number) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) rows[y]![x] = '.';
    };
    open(1, 3, 1, 3);
    open(4, 4, 2, 2);
    open(5, 7, 1, 3);
    open(10, 10, 6, 6); // a lone tile: its own region
    const g = parseMap(rows.map((r) => r.join('')));
    expect(sorted(chokepoints(g))).toEqual(['3,2', '4,2', '5,2']);
    expect(sorted(bruteForce(g))).toEqual(['3,2', '4,2', '5,2']);
  });

  it('edges: a root that is itself the cut, a one-component map with no cut, a floor-less map and a map that is a single tile', () => {
    const grid = (rows: string[]) => parseMap(Array.from({ length: 9 }, (_, y) => (rows[y] ?? '').padEnd(16, '#')));
    const cases: Record<string, string[]> = {
      // the first floor tile in scan order (1,1) has two children: only removing it splits the L
      rootIsCut: ['########', '#..#####', '#.######'],
      open: ['########', '#......#', '#......#', '#......#'],
      noFloor: ['########', '########'],
      single: ['########', '#.######'],
    };
    for (const [name, rows] of Object.entries(cases)) {
      const g = grid(rows);
      expect(sorted(chokepoints(g)), name).toEqual(sorted(bruteForce(g)));
    }
    expect(sorted(chokepoints(grid(cases.rootIsCut!)))).toEqual(['1,1']);
    expect(chokepoints(grid(cases.open!)).size).toBe(0);
  });
});
