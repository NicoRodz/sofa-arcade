import { describe, expect, it } from 'vitest';
import { MAP_W, closedTiles, closing, footprint, mirrorTile, pivotsOf, statesOf, swept, toElement, type LivingSpec } from '../../map';

const brush = (x = 4, y = 4, variant = 0): LivingSpec => ({ kind: 'brush', x, y, variant, phase: 0 });
const sofa = (x = 4, y = 4, variant = 0): LivingSpec => ({ kind: 'sofa', x, y, variant, phase: 0 });
const keys = (ts: readonly (readonly [number, number])[]) => ts.map(([x, y]) => `${x},${y}`).sort();

describe('the shapes of the living map', () => {
  it('states: a brush turns through 4, a sofa has 2 ends, the fountain closes nothing', () => {
    expect([statesOf('brush'), statesOf('sofa'), statesOf('fountain')]).toEqual([4, 2, 1]);
    expect(closedTiles({ kind: 'fountain', x: 13, y: 7, variant: 0, phase: 0 }, 0)).toEqual([]);
  });

  it('a brush bar is 2 tiles beside its pivot and turns clockwise; the pivot stays open', () => {
    const b = brush(4, 4, 0);
    expect(keys(closedTiles(b, 0))).toEqual(
      keys([
        [5, 4],
        [6, 4],
        [21, 4],
        [20, 4],
      ]),
    ); // right member: mirrored
    expect(keys(closedTiles(b, 1))).toEqual(
      keys([
        [4, 5],
        [4, 6],
        [22, 5],
        [22, 6],
      ]),
    );
    expect(keys(closedTiles(b, 3)).includes('4,4')).toBe(false);
    for (let s = 0; s < 4; s++) expect(closedTiles(b, s).some(([x, y]) => (x === 4 || x === 22) && y === 4)).toBe(false);
  });

  it('a sofa takes 2 of the 3 rail tiles: one of them is always free, at one end or the other', () => {
    const s = sofa(3, 6, 0);
    expect(keys(closedTiles(s, 0))).toEqual(
      keys([
        [3, 6],
        [4, 6],
        [23, 6],
        [22, 6],
      ]),
    );
    expect(keys(closedTiles(s, 1))).toEqual(
      keys([
        [4, 6],
        [5, 6],
        [22, 6],
        [21, 6],
      ]),
    );
    const v = sofa(3, 6, 1); // vertical rail
    expect(keys(closedTiles(v, 1))).toEqual(
      keys([
        [3, 7],
        [3, 8],
        [23, 7],
        [23, 8],
      ]),
    );
  });

  it('every state of every shape is its own mirror image', () => {
    for (const spec of [brush(2, 3, 1), brush(7, 11, 3), sofa(1, 1, 0), sofa(8, 9, 1)])
      for (let st = 0; st < statesOf(spec.kind); st++) {
        const tiles = closedTiles(spec, st);
        expect(keys(tiles.map(mirrorTile))).toEqual(keys(tiles));
      }
    expect(pivotsOf(brush(4, 4))[1]).toEqual([MAP_W - 1 - 4, 4]);
  });

  it('push directions: the new tiles of a clockwise bar are swept against the old bar; a sofa slides along its rail', () => {
    expect(closing(brush(4, 4, 0), 0)).toEqual([
      { x: 4, y: 5, dir: 2 },
      { x: 4, y: 6, dir: 2 },
      { x: 22, y: 5, dir: 0 }, // the right member turns the other way: mirrored
      { x: 22, y: 6, dir: 0 },
    ]);
    expect(closing(sofa(3, 6, 0), 0)).toEqual([
      { x: 5, y: 6, dir: 0 },
      { x: 21, y: 6, dir: 2 },
    ]);
    expect(closing(sofa(3, 6, 0), 1)).toEqual([
      { x: 3, y: 6, dir: 2 },
      { x: 23, y: 6, dir: 0 },
    ]);
    expect(closing(sofa(3, 6, 1), 0)).toEqual([
      { x: 3, y: 8, dir: 1 },
      { x: 23, y: 8, dir: 1 },
    ]);
    expect(closing(sofa(3, 6, 1), 1)).toEqual([
      { x: 3, y: 6, dir: 3 },
      { x: 23, y: 6, dir: 3 },
    ]);
  });

  it('what the closing lists is exactly what the next state shuts and the last one did not', () => {
    for (const spec of [brush(4, 4, 2), sofa(2, 2, 1)])
      for (let a = 0; a < statesOf(spec.kind); a++) {
        const b = (a + 1) % statesOf(spec.kind);
        const was = new Set(keys(closedTiles(spec, a)));
        expect(keys(closing(spec, a).map((c) => [c.x, c.y] as const))).toEqual(keys(closedTiles(spec, b)).filter((k) => !was.has(k)));
      }
  });

  it('the brush sweeps the tiles it leaves and the corner it passes; every tile is inside the footprint', () => {
    const [left, right] = swept(brush(4, 4, 0), 0);
    expect(keys(left)).toEqual(
      keys([
        [5, 4],
        [6, 4],
        [5, 5],
      ]),
    );
    expect(keys(right)).toEqual(keys(left.map(mirrorTile)));
    expect(footprint(brush(4, 4, 0))).toHaveLength(2 * 2 * 4 + 2); // 4 states x 2 tiles x 2 members + 2 pivots
  });

  it('as a validator element: one variable per pair, closing what the shape says', () => {
    const el = toElement(sofa(3, 6, 0), 2);
    expect(el).toMatchObject({ id: 'sofa-2', states: 2 });
    expect(el.closed(1)).toEqual(closedTiles(sofa(3, 6, 0), 1));
  });
});
