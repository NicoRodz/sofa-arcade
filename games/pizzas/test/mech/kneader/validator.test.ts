// The static validators of M and of W + Q (design section 2, "Validador"): handles reachable by two different chefs, N >= 2, Q to W at least 5 tiles, an O on the map.
import { describe, expect, it } from 'vitest';
import { KNEADER_ROWS } from './map';
import { WOOD_ROWS } from '../woodOven/map';
import { kneaderValidate } from '../../../sim/validate/mech/kneader';
import { woodOvenValidate } from '../../../sim/validate/mech/woodOven';
import { mechModule } from '../../../sim/mech/registry';

const edit = (rows: readonly string[], y: number, row: string) => rows.map((r, i) => (i === y ? row : r));

describe('kneader validator', () => {
  it('the test map is fine for 2, 4 and 8 chefs', () => {
    for (const n of [2, 4, 8]) expect(kneaderValidate(KNEADER_ROWS, n)).toEqual([]);
    expect(mechModule('kneader').validate(KNEADER_ROWS, 2)).toEqual([]);
  });
  it('N = 1 is a problem: the kneader is for a team', () => {
    expect(kneaderValidate(KNEADER_ROWS, 1)).toEqual(['kneader: M needs at least 2 chefs']);
  });
  it('a map without M has nothing to say', () => {
    expect(kneaderValidate(WOOD_ROWS, 2)).toEqual([]);
  });
  it('an M with no pair of opposite floor tiles is a problem (a wall on one handle)', () => {
    const rows = edit(KNEADER_ROWS, 4, '#3.....M#.....X#');
    expect(kneaderValidate(rows, 4).join()).toContain('no pair of opposite floor tiles');
  });
  it('a handle that nobody reaches is a problem', () => {
    // wall column 7 shut on every row: the right handle is a closed room, and the two first spawns are on the left
    let rows = edit(KNEADER_ROWS, 3, '#....S.#.......#');
    for (const y of [1, 2, 6, 7]) rows = edit(rows, y, rows[y]!.slice(0, 7) + '#' + rows[y]!.slice(8));
    expect(kneaderValidate(rows, 2).join()).toContain('no chef reaches both handles');
  });
  it('a missing dough crate is a problem', () => {
    expect(kneaderValidate(edit(KNEADER_ROWS, 1, '#..K.....O.O..E#'), 2).join()).toContain('no dough crate');
  });
});

describe('woodOven validator', () => {
  it('the test map is fine', () => {
    for (const n of [2, 8]) expect(woodOvenValidate(WOOD_ROWS, n)).toEqual([]);
    expect(mechModule('woodOven').validate(WOOD_ROWS, 2)).toEqual([]);
  });
  it('Q next to W is a problem (the walk must be at least 5 tiles)', () => {
    const rows = edit(WOOD_ROWS, 7, '#............QW#');
    expect(woodOvenValidate(rows, 2).join()).toContain('needs at least 5');
  });
  it('the shortest legal walk (Q.....W stamp, 5 tiles) passes', () => {
    expect(woodOvenValidate(edit(WOOD_ROWS, 7, '#...Q....W....#'), 2)).toEqual([]);
    expect(woodOvenValidate(edit(WOOD_ROWS, 7, '#...Q...W.....#'), 2).join()).toContain('needs at least 5');
  });
  it('a map with no normal oven is a problem', () => {
    expect(woodOvenValidate(edit(WOOD_ROWS, 1, '#1.2..K.......E#'), 2).join()).toContain('normal oven');
  });
  it('a Q without W, or a W without Q, is a problem', () => {
    expect(woodOvenValidate(edit(WOOD_ROWS, 7, '#Q.............#'), 2).join()).toContain('no W');
    expect(woodOvenValidate(edit(WOOD_ROWS, 7, '#.............W#'), 2).join()).toContain('no bellows');
  });
});
