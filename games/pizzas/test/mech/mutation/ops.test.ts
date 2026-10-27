// The pure part of the v2 mutation: applying ops to rows, the inverse, and every way an op list can be wrong.
import { describe, expect, it } from 'vitest';
import { applyRows, handleProblems, invertOps, opsProblems, type MutationV2 } from '../../../sim/mech/mutation/ops';
import { MUT, MUT_ROWS } from './map';

const m = (ops: MutationV2['ops'], over: Partial<MutationV2> = {}): MutationV2 => ({ at: 300, warn: 60, revertAt: null, ops, ...over });

describe('mutation ops on rows', () => {
  it('move puts the letter on the floor tile and leaves floor behind; swap trades two letters', () => {
    const after = applyRows(MUT_ROWS, MUT.ops);
    expect(after[4]![2]).toBe('.');
    expect(after[4]![12]).toBe('O');
    expect(after[1]![8]).toBe('2');
    expect(after[1]![3]).toBe('K');
  });
  it('the inverse gives the original map back, for move, swap and tile', () => {
    for (const ops of [
      MUT.ops,
      [['tile', [5, 5], 'i']],
      [
        ['tile', [5, 5], '→'],
        ['move', [2, 4], [5, 5]],
      ],
    ] as const) {
      const rows = MUT_ROWS.map((r, y) => (y === 5 ? `${r.slice(0, 5)}→${r.slice(6)}` : r)); // an arrow under the tile op: the inverse must write it back
      const after = applyRows(rows, ops as never);
      expect(applyRows(after, invertOps(rows, ops as never))).toEqual(rows);
    }
  });
});

describe('opsProblems', () => {
  it('the test mutation is fine', () => {
    expect(opsProblems(MUT_ROWS, MUT)).toEqual([]);
  });
  it('refuses: more than 3 ops, a move onto a non-floor, a station that cannot move, a swap with floor, a tile over a station', () => {
    expect(
      opsProblems(
        MUT_ROWS,
        m([
          ['tile', [5, 5], 'i'],
          ['tile', [6, 5], 'i'],
          ['tile', [7, 5], 'i'],
          ['tile', [8, 5], 'i'],
        ]),
      ).join(),
    ).toMatch(/at most 3/);
    expect(opsProblems(MUT_ROWS, m([['move', [2, 4], [1, 2]]])).join()).toMatch(/destination must be plain floor/); // (1,2) is S
    expect(opsProblems(MUT_ROWS, m([['move', [1, 2], [5, 5]]])).join()).toMatch(/cannot move/); // S never moves
    expect(opsProblems(MUT_ROWS, m([['swap', [2, 4], [5, 5]]])).join()).toMatch(/swaps with/);
    expect(opsProblems(MUT_ROWS, m([['tile', [2, 4], 'i']])).join()).toMatch(/only floor changes/);
    expect(opsProblems(MUT_ROWS, m([['move', [2, 4], [30, 4]]])).join()).toMatch(/ends outside/);
  });
  it('refuses a bad clock: warn longer than at, or a revert before the change', () => {
    expect(opsProblems(MUT_ROWS, m(MUT.ops, { warn: 400 })).join()).toMatch(/warn within it/);
    expect(opsProblems(MUT_ROWS, m(MUT.ops, { revertAt: 100 })).join()).toMatch(/revertAt must come after/);
  });
  it('M needs its handles after the move', () => {
    expect(handleProblems(['################', '#M.............#', '#..............#', '################'])).toHaveLength(1);
    expect(handleProblems(['################', '#..............#', '#..M...........#', '#..............#', '################'])).toEqual(
      [],
    );
  });
});
