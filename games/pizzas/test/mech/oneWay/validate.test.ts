// The validator of 'oneWay': the loop is fine, a dead-end trap is refused, a station sealed by the flow is refused.
import { describe, expect, it } from 'vitest';
import { oneWayValidate } from '../../../sim/validate/mech/oneWay';
import { ONEWAY_ROWS } from './map';

describe('oneWayValidate', () => {
  it('the loop is fine for 2, 4 and 8; a map with no one-way is not its business', () => {
    for (const n of [2, 4, 8]) expect(oneWayValidate(ONEWAY_ROWS, n)).toEqual([]);
    expect(oneWayValidate(['################'], 2)).toEqual([]);
  });
  it('a pit under a v can be entered and not left: a trap', () => {
    const rows = ONEWAY_ROWS.map((r, y) => (y === 6 ? '#..vO......O...#' : y === 7 ? '#.#.#..........#' : r));
    expect(oneWayValidate(rows, 2).join()).toMatch(/trap at \(3, 7\)/);
  });
});
