import { describe, expect, it } from 'vitest';
import { CIRCUIT, MAP_H, MAP_ROWS, MAP_W, SPAWNS_LEFT, isSolid, spawnTile } from '../map';

function reach(from: readonly [number, number]): Set<string> {
  const seen = new Set<string>([`${from[0]},${from[1]}`]);
  const q = [from];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i]!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx,
        ny = y + dy,
        k = `${nx},${ny}`;
      if (isSolid(nx, ny) || seen.has(k)) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return seen;
}

describe('grid prototype map', () => {
  it('is 27x15 and made only of floor and furniture', () => {
    expect(MAP_ROWS).toHaveLength(MAP_H);
    expect(MAP_ROWS.every((r) => r.length === MAP_W && /^[.#]+$/.test(r))).toBe(true);
    expect(MAP_W * MAP_H).toBe(405);
  });

  it('is mirrored left-right and top-bottom', () => {
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        expect(isSolid(x, y)).toBe(isSolid(MAP_W - 1 - x, y));
        expect(isSolid(x, y)).toBe(isSolid(x, MAP_H - 1 - y));
      }
  });

  it('every floor tile is reachable from every other (no sealed pockets)', () => {
    const floor = MAP_ROWS.join('')
      .split('')
      .filter((c) => c === '.').length;
    expect(reach([0, 0]).size).toBe(floor);
  });

  it('the 16 spawns (both teams) and the 10 circuit checkpoints are floor', () => {
    for (let team = 0; team < 2; team++)
      for (let k = 0; k < SPAWNS_LEFT.length; k++) {
        const [x, y] = spawnTile(team, k);
        expect(isSolid(x, y)).toBe(false);
      }
    expect(CIRCUIT).toHaveLength(10);
    for (const [x, y] of CIRCUIT) expect(isSolid(x, y)).toBe(false);
  });

  it('out of bounds is solid', () => {
    expect([isSolid(-1, 0), isSolid(0, -1), isSolid(MAP_W, 0), isSolid(0, MAP_H)]).toEqual([true, true, true, true]);
  });
});
