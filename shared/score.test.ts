import { describe, expect, it } from 'vitest';
import { FIXED_MAPS, parseMap } from './maps';
import { metric } from './score';

const D = (i: number, n = 2) => metric(parseMap(FIXED_MAPS[i]!.rows), n);

describe('difficulty metric D', () => {
  it('orders the five fixed maps strictly with 2 players', () => {
    const d = FIXED_MAPS.slice(0, 5).map((_, i) => D(i).D);
    for (let i = 1; i < d.length; i++) expect(d[i]!, `D${i} vs D${i + 1}`).toBeGreaterThan(d[i - 1]!);
  });

  it('counts zone crossings (T) and chokepoint legs (C) per order', () => {
    expect(D(0)).toMatchObject({ T: 0, C: 0 });
    expect(D(2)).toMatchObject({ T: 2, C: 0 }); // both cut items cross the river
    expect(D(3)).toMatchObject({ T: 0, C: 3 }); // K->O twice and O->E cross the corridor
    expect(D(4)).toMatchObject({ T: 3, boards: 1 });
  });

  it('is exactly L + 14 T + 6 C with enough boards, and grows with players per board', () => {
    const m = D(2);
    expect(m.D).toBe(m.L + 14 * m.T + 6 * m.C);
    expect(D(2, 4).D).toBe(m.D * 1.25); // 2 boards, 4 players: N/boards - 1 = 1
  });
});
