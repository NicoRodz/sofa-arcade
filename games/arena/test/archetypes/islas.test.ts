import { describe, expect, it } from 'vitest';
import { ARCHETYPES, SEED_SPACE, archetypeOf, emptyMap, generateMap, sealedRooms, v8Signature, type TileMap } from '../../map';

const seedsOf = (kind: string, n: number) => {
  const out: number[] = [];
  for (let i = 0; out.length < n; i++) {
    const s = (i * 3359 + 17) % SEED_SPACE;
    if (archetypeOf(s) === kind) out.push(s);
  }
  return out;
};

/** A map from rows of text: '#' furniture, '.' floor. The left half is the 13 columns given plus the centre column; the right half is the mirror. */
function fromRows(rows: readonly string[]): TileMap {
  const m = emptyMap();
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      m.solid[y * m.w + x] = c === '#' ? 1 : 0;
      m.solid[y * m.w + (m.w - 1 - x)] = c === '#' ? 1 : 0;
    }),
  );
  return m;
}
const BLANK = '.............'; // 13 columns
// two 4x3 rooms one over the other (24 floor tiles), a contour of furniture and a door on each side of each, in the row of an exit
const ROOMS = [
  BLANK,
  BLANK,
  BLANK,
  '...######....',
  '...#....#....',
  BLANK,
  '...#....#....',
  '...######....',
  '...#....#....',
  BLANK,
  '...#....#....',
  '...######....',
  BLANK,
  BLANK,
  BLANK,
];

describe('Islas: the rooms are real', () => {
  it("40 Islas maps: 2 to 4 sealed rooms per half, each with a free 3x3 core and a door, 24 or more floor tiles in all, and the avenue and the exits' corridors free", () => {
    for (const seed of seedsOf('islas', 40)) {
      const g = generateMap(seed);
      expect(g.archetype, `seed ${seed}`).toBe('islas');
      const rooms = sealedRooms(g.map);
      expect(rooms.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      expect(rooms.length, `seed ${seed}`).toBeLessThanOrEqual(4);
      expect(rooms.reduce((n, r) => n + r.tiles, 0)).toBeGreaterThanOrEqual(24);
      for (const r of rooms) {
        expect(r.doors).toBeGreaterThanOrEqual(1);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) expect(g.map.solid[(r.core[1] + dy) * g.map.w + r.core[0] + dx], `seed ${seed} core`).toBe(0);
      }
      const free = (x: number, y: number) => g.map.solid[y * g.map.w + x] === 0;
      for (let y = 0; y < g.map.h; y++)
        expect([free(12, y), free(13, y), free(14, y)], `seed ${seed} avenue y ${y}`).toEqual([true, true, true]);
      for (const [x, y] of [g.map.spawns[0]![0]!, g.map.spawns[0]![3]!])
        for (let k = x; k <= 13; k++) expect(free(k, y), `seed ${seed} corridor row ${y}`).toBe(true);
    }
  });

  it('a hand-made floor plan: V8 accepts 2 rooms with a clear contour; a corner that leaks, or one room only, are rejected', () => {
    expect(v8Signature('islas', fromRows(ROOMS))).toBeNull();
    const leak = [...ROOMS];
    leak[3] = '....#####....'; // the corner of the first room opens a diagonal gap
    expect(v8Signature('islas', fromRows(leak))).toMatch(/1 sealed rooms/);
    const one = ROOMS.map((r, y) => (y > 7 ? BLANK : r));
    expect(v8Signature('islas', fromRows(one))).toMatch(/1 sealed rooms/);
  });
});

describe('Islas is not Pasillos, Plaza, Ocho or Clasico', () => {
  it('V8 of Islas rejects every one of 200 maps of each of the four others, and the Pasillos signature rejects every Islas map', () => {
    const maps = Object.fromEntries(
      ARCHETYPES.filter((k) => k !== 'islas').map((k) => [k, seedsOf(k, 200).map((s) => generateMap(s).map)]),
    ) as Record<string, TileMap[]>;
    maps.clasico = seedsOf('pasillos', 200).map((s) => generateMap(s, undefined, false, false).map);
    for (const [kind, list] of Object.entries(maps)) expect(list.filter((m) => v8Signature('islas', m) === null).length, kind).toBe(0);
    const islas = seedsOf('islas', 200).map((s) => generateMap(s).map);
    expect(islas.filter((m) => v8Signature('pasillos', m) === null).length).toBe(0);
  });
});
