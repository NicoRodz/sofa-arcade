import { describe, expect, it } from 'vitest';
import { COOP_MAPS, DIRS, isFloor, parseMap, type Grid } from '../../sim/maps';
import { mechFlagsOf } from '../../sim/mech/ids';
import { firstStep } from './bfs-route';

// The walk the bots had before: BFS with string-keyed Maps, first step recovered by following the parents back to the start.
function reference(g: Grid, sx: number, sy: number, goal: (x: number, y: number) => boolean): [number, number] | null {
  const prev = new Map<string, string | null>([[`${sx},${sy}`, null]]);
  const queue: [number, number][] = [[sx, sy]];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    if (goal(x, y)) {
      let k = `${x},${y}`;
      while (prev.get(k) && prev.get(prev.get(k)!) !== null) k = prev.get(k)!;
      return k.split(',').map(Number) as [number, number];
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx,
        ny = y + dy,
        k = `${nx},${ny}`;
      if (isFloor(g, nx, ny) && !prev.has(k)) {
        prev.set(k, `${x},${y}`);
        queue.push([nx, ny]);
      }
    }
  }
  return null;
}

describe('firstStep', () => {
  it('it takes the same first step as the Map BFS from every floor tile to a sample of goals, on every coop map (ties included), and calls do not leak into each other', () => {
    let compared = 0;
    let steps = 0;
    for (const m of COOP_MAPS) {
      const g = parseMap(m.rows, false, mechFlagsOf(m.mechanics));
      const floor: [number, number][] = [];
      g.forEach((row, y) => row.forEach((_t, x) => isFloor(g, x, y) && floor.push([x, y])));
      for (const [sx, sy] of floor)
        for (const [gx, gy] of floor.filter((_, i) => i % 9 === 0)) {
          const goal = (x: number, y: number) => x === gx && y === gy;
          const got = (sx === gx && sy === gy) ? null : firstStep(g, sx, sy, goal);
          if (sx !== gx || sy !== gy) expect(got).toEqual(reference(g, sx, sy, goal));
          compared++;
          if (got) steps++;
        }
    }
    expect(compared).toBeGreaterThan(20_000);
    expect(steps).toBeGreaterThan(15_000);
  });

  it('it says null when no tile satisfies the goal', () => {
    const g = parseMap(COOP_MAPS[0]!.rows, false, mechFlagsOf(COOP_MAPS[0]!.mechanics));
    expect(firstStep(g, 1, 1, () => false)).toBeNull();
  });
});
