// The four surface maps: valid for the solver, built on ice and belts, listed in the coop lobby, never in versus; and mutations of them that the validator must catch.
import { describe, expect, it } from 'vitest';
import { createGame } from './overcooked';
import { COOP_MAPS, FIXED_MAPS, SURFACE_MAPS, lobbyMaps, mapStatus, parseMap, recommendedMaps, fixedMap } from './maps';
import { spawnTiles, surfaceProblems, surfaceTiles, validateMap } from './validate';
import { usesSurfaces } from './surfaces/legend';
import { versusMap } from './versus/maps';
import { cardFor } from './recipes/cards';

const ICE_MAPS = ['16', '18'];
const mutate = (rows: readonly string[], y: number, x: number, c: string) =>
  rows.map((r, i) => (i === y ? r.slice(0, x) + c + r.slice(x + 1) : r));

describe('the surface maps', () => {
  it('are four, appended after the fifteen original ones, with ids 16..19', () => {
    expect(SURFACE_MAPS.map((m) => m.id)).toEqual(['16', '17', '18', '19']);
    expect(FIXED_MAPS).toHaveLength(15);
    expect(COOP_MAPS).toHaveLength(19);
    for (const m of SURFACE_MAPS) expect(fixedMap(m.id)).toBe(m);
  });
  for (const m of SURFACE_MAPS)
    describe(`${m.id} ${m.name}`, () => {
      const g = parseMap(m.rows);
      it('passes the map validator (solvable, spawns, range, minDuro, surfaces)', () => {
        expect(validateMap(m)).toEqual({ ok: true, errors: [] });
        expect(surfaceProblems(g)).toEqual([]);
      });
      it('uses ice or belts as its own mechanic, never under a spawn, and has a recipe card', () => {
        const { ice, belts } = surfaceTiles(g);
        expect(usesSurfaces(m.rows)).toBe(true);
        expect(ICE_MAPS.includes(m.id) ? ice.length : belts.length).toBeGreaterThanOrEqual(10);
        expect(spawnTiles(g).length).toBeGreaterThanOrEqual(m.nMax);
        expect(cardFor(m.id)).toBeDefined();
      });
      it('is coop only: versus has no such map and parsing it as a versus map fails', () => {
        expect(versusMap(m.id)).toBeUndefined();
        expect(() => parseMap(m.rows, true)).toThrow(/unknown tile/);
      });
      it('turns the surfaces on in a round only when asked (the lobby asks for a map that uses them)', () => {
        expect(createGame({ rows: m.rows, spawns: m.spawns, n: 2 }).surf).toBeNull();
        expect(createGame({ rows: m.rows, spawns: m.spawns, n: 2, surfaces: usesSurfaces(m.rows) }).surf).not.toBeNull();
      });
    });
  it('the original fifteen use no surface at all', () => {
    for (const m of FIXED_MAPS) expect(usesSurfaces(m.rows), m.name).toBe(false);
  });
  it('are in the lobby list for 3 players, blocked above 4, and out of the "auto" draw', () => {
    const ids = lobbyMaps(3, COOP_MAPS)
      .filter((x) => x.status.state === 'recommended')
      .map((x) => x.map.id);
    for (const id of ['16', '17', '18', '19']) expect(ids).toContain(id);
    for (const m of SURFACE_MAPS) expect(mapStatus(m, 5).state).toBe('blocked');
    expect(recommendedMaps(3).some((m) => SURFACE_MAPS.includes(m))).toBe(false);
  });
});

describe('Cinta de sushi', () => {
  it('is a closed ring: following the belts from any belt tile comes back to it', () => {
    const g = parseMap(fixedMap('17')!.rows);
    const { belts } = surfaceTiles(g);
    expect(belts).toHaveLength(18);
    for (const [x0, y0] of belts) {
      let [x, y] = [x0, y0];
      for (let n = 1; n <= belts.length; n++) {
        const t = g[y]![x]!;
        if (t.kind !== 'floor' || t.surface?.kind !== 'belt') throw new Error(`the ring breaks at (${x}, ${y})`);
        x += t.surface.dx;
        y += t.surface.dy;
        if (x === x0 && y === y0) {
          expect(n).toBe(belts.length);
          break;
        }
      }
      expect([x, y]).toEqual([x0, y0]);
    }
  });
});

describe('mutations the validator catches', () => {
  it('a belt that ends in a wall, a belt facing another, a missing delivery window, no spawn', () => {
    const sushi = SURFACE_MAPS[1]!; // the ring belt: (4,3) goes east
    expect(validateMap({ ...sushi, rows: mutate(sushi.rows, 3, 5, '←') }).errors.join()).toMatch(/\(4, 3\).*head on/); // (5,3) now faces (4,3)
    const line = SURFACE_MAPS[3]!; // two belts, rows 2 and 6
    expect(validateMap({ ...line, rows: mutate(line.rows, 1, 1, '↑') }).errors.join()).toMatch(/belt at \(1, 1\) feeds wall/);
    expect(validateMap({ ...line, rows: mutate(line.rows, 6, 7, '→') }).errors.join()).toMatch(/head on/);
    for (const m of SURFACE_MAPS)
      expect(validateMap({ ...m, rows: m.rows.map((r) => r.replace('E', 'C')) }).errors.join(), m.name).toMatch(/missing station E/);
    const ice = SURFACE_MAPS[0]!;
    expect(validateMap({ ...ice, rows: ice.rows.map((r) => r.replace(/S/g, '.')) }).errors.join()).toMatch(/no spawn/); // an ice map still needs its plain start tiles
  });
});
