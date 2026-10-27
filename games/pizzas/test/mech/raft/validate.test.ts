// The validator of 'raft': the test map, a lane that ends in a wall, two rafts in a lane, and a raft that is the only way across.
import { describe, expect, it } from 'vitest';
import { raftValidate } from '../../../sim/validate/mech/raft';
import { RAFT_ROWS } from './map';

const row4 = (s: string) => RAFT_ROWS.map((r, y) => (y === 4 ? s : r));

describe('raftValidate', () => {
  it('the test map is fine; a map with no raft is not its business', () => {
    for (const n of [2, 4, 8]) expect(raftValidate(RAFT_ROWS, n)).toEqual([]);
    expect(raftValidate([], 2)).toEqual([]);
  });
  it('a lane that ends in a wall does not reach land', () => {
    expect(raftValidate(row4('#...~~=~~~~#...#'), 2).join()).toMatch(/does not reach land/);
  });
  it('two rafts in one lane are refused', () => {
    expect(raftValidate(row4('#...~=~~=~~O...#'), 2).join()).toMatch(/share the lane/);
  });
  it('a lane across a closed room is the only way', () => {
    const rows = RAFT_ROWS.map((r, y) => (y === 1 || y === 5 ? r : r)).map((r, y) => (y === 4 ? '#####~~=~~~~O#..#'.slice(0, 16) : r));
    expect(raftValidate(rows, 2).join()).toMatch(/raft:/);
  });
});
