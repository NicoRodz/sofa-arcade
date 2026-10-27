// The H hatch (a counter with its own drawing) and the spawn-zone check of the validator, on Pasaplatos (map 26: a wall with no door, hatches are the only way across).
import { describe, expect, it } from 'vitest';
import { floorComponents, fixedMap, parseMap, spawnPoints, type MapDef } from './maps';
import { analyze, validateMap } from './validate';
import { spawnZoneProblems } from './validate/spawn-zones';
import { addPlayer, createGame } from './overcooked';
import { act } from './round/stations';

const MAP = fixedMap('26')!;

describe('the H hatch', () => {
  it('is a counter for the sim (the validator joins the two sides through it) and only the art tells it apart', () => {
    const g = parseMap(MAP.rows);
    const hatches: [number, number][] = [];
    g.forEach((row, y) =>
      row.forEach((t, x) => {
        if (MAP.rows[y]![x] === 'H') {
          expect(t).toEqual({ kind: 'station', station: 'counter', crate: 1 });
          hatches.push([x, y]);
        }
      }),
    );
    expect(hatches).toHaveLength(3);
    const a = analyze(g);
    expect(a.passes.map((p) => p.pos).filter(([x, y]) => MAP.rows[y]![x] === 'H')).toHaveLength(3);
    expect(new Set(a.zone).size, 'one zone: items cross, so the recipe can be made').toBe(1);
    expect(a.count, 'two floor regions: the chefs cannot').toBe(2);
  });
  it('holds an item put down from one side and gives it to the chef of the other', () => {
    const m = MAP;
    const g = createGame({ rows: m.rows, mapId: '26', recipes: true, spawns: m.spawns });
    addPlayer(g, 1, 0, 0);
    const hatch = g.stations.find((s) => m.rows[s.ty]![s.tx] === 'H')!;
    const p = g.players.get(1)!;
    p.item = 'cut1';
    act(g, p, hatch);
    expect(hatch.item).toBe('cut1');
    expect(p.item).toBeNull();
    act(g, p, hatch);
    expect(p.item).toBe('cut1');
  });
});

describe('every N of the range has a chef on each side of the wall', () => {
  it('Pasaplatos: 2, 3 and 4 chefs alternate left and right', () => {
    const g = parseMap(MAP.rows);
    const { comp } = floorComponents(g);
    for (let n = MAP.nMin; n <= MAP.nMax; n++) {
      const sides = new Set(spawnPoints(g, n, MAP.spawns).map(([x, y]) => comp[y]![x]));
      expect(sides.size, `N=${n}`).toBe(2);
    }
    expect(spawnZoneProblems(MAP)).toEqual([]);
  });
  it('a variant whose only spawns are on the left is refused: nobody can reach the ovens', () => {
    const rows = MAP.rows.map((r) => r.replace('#...S...', '#.......')); // the two spawns of the right side are gone: both chefs start on the left
    const bad: MapDef = { ...MAP, id: 'x26', rows };
    const problems = spawnZoneProblems(bad);
    expect(problems.some((p) => p.startsWith('N=2:') && p.includes('station O'))).toBe(true);
    expect(validateMap(bad).ok).toBe(false);
  });
});
