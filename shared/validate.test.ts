import { describe, expect, it } from 'vitest';
import { FIXED_MAPS, fixedMap, mapFeatures, parseMap } from './maps';
import { analyze, minPlayers, validate, validateMap } from './validate';

const rowsOf = (id: string) => [...fixedMap(id)!.rows];
const edit = (rows: string[], cells: [number, number, string][]) => {
  const out = rows.map((r) => [...r]);
  for (const [x, y, c] of cells) out[y]![x] = c;
  return out.map((r) => r.join(''));
};
const check = (rows: string[]) => validate(parseMap(rows));

describe('validate', () => {
  it('passes the five fixed maps', () => {
    for (const m of FIXED_MAPS) expect(check([...m.rows]), m.name).toEqual({ ok: true, errors: [] });
  });

  it('river map: items cross through the three counters; it breaks only when all are gone', () => {
    const rows = rowsOf('3');
    expect(analyze(parseMap(rows)).passes.map((p) => p.pos)).toEqual([[7, 2], [7, 4], [7, 6]]);
    expect(check(edit(rows, [[7, 4, '~']])).ok).toBe(true);
    expect(check(edit(rows, [[7, 4, '~'], [7, 2, '~']])).ok).toBe(true);
    const cut = check(edit(rows, [[7, 4, '~'], [7, 2, '~'], [7, 6, '~']]));
    expect(cut.ok).toBe(false);
    expect(cut.errors.join()).toMatch(/no route K -> O/);
  });

  it('flags a zone with recipe stations but no spawn', () => {
    const rows = rowsOf('3').map((r) => r.replace('S', '.'));
    const r = check(rows);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/no spawn/);
    const onlyLeft = edit(rowsOf('3'), [[11, 4, '.'], [11, 6, '.']]);
    expect(check(onlyLeft).errors.join()).toMatch(/holds recipe stations but no spawn/);
  });

  it('flags missing and walled-in stations', () => {
    expect(check(edit(rowsOf('1'), [[15, 4, 'C']])).errors.join()).toMatch(/missing station E/);
    // oven at (11,0) and (13,0) get their floor row turned into walls
    const walled = edit(rowsOf('1'), [[11, 1, 'C'], [13, 1, 'C'], [12, 1, 'C']]);
    expect(check(walled).errors.join()).toMatch(/station O at \(11, 0\) has no floor/);
  });

  it('the corridor map is one connected region, the river map has two', () => {
    expect(analyze(parseMap(rowsOf('4'))).count).toBe(1);
    expect(analyze(parseMap(rowsOf('3'))).count).toBe(2);
  });
});

describe('validateMap: one test per fixed map', () => {
  it('map 1 Cocina abierta: valid, one region, 4 spawns for its max of 4', () => {
    const m = fixedMap('1')!;
    expect(validateMap(m)).toEqual({ ok: true, errors: [] });
    // sabotage: without its only delivery counter the map is unsolvable
    const rows = edit([...m.rows], [[15, 4, 'C']]);
    expect(validateMap({ ...m, rows }).errors.join()).toMatch(/missing station E/);
  });
  it('map 2 Isla central: valid with 5 spawns for its max of 5', () => {
    const m = fixedMap('2')!;
    expect(validateMap(m)).toEqual({ ok: true, errors: [] });
    expect(validateMap({ ...m, rows: edit([...m.rows], [[8, 6, '.']]) }).errors.join()).toMatch(/4 spawns for up to 5/);
  });
  it('map 3 El río: valid, needs one player per bank; no ford = no recipe', () => {
    const m = fixedMap('3')!;
    expect(validateMap(m)).toEqual({ ok: true, errors: [] });
    expect(minPlayers(parseMap([...m.rows]))).toBe(2);
    const cut = edit([...m.rows], [[7, 2, '~'], [7, 4, '~'], [7, 6, '~']]);
    expect(validateMap({ ...m, rows: cut }).errors.join()).toMatch(/no route K -> O/);
  });
  it('map 4 Pasillo: valid; walling the only gap splits the kitchen', () => {
    const m = fixedMap('4')!;
    expect(validateMap(m)).toEqual({ ok: true, errors: [] });
    const walled = edit([...m.rows], [[6, 4, '#'], [7, 4, '#'], [8, 4, '#'], [9, 4, '#']]);
    expect(validateMap({ ...m, rows: walled }).ok).toBe(false);
  });
  it('map 5 Cinta: valid with 6 spawns; its minDuro is 2 because the belt is two counters over water', () => {
    const m = fixedMap('5')!;
    expect(validateMap(m)).toEqual({ ok: true, errors: [] });
    expect(validateMap({ ...m, minDuro: 1 }).errors.join()).toMatch(/minDuro is 1 but the recipe needs 2/);
    expect(validateMap({ ...m, rows: edit([...m.rows], [[7, 2, '~'], [7, 6, '~']]) }).errors.join()).toMatch(/no route/);
  });
});

describe('validateMap: maps 6 to 8', () => {
  it('map 6 La ventanita: two kitchens joined only by the serving counters (7,2) (7,4) (7,6)', () => {
    const m = fixedMap('6')!;
    expect(validateMap(m)).toEqual({ ok: true, errors: [] });
    expect(analyze(parseMap([...m.rows])).passes.map((p) => p.pos)).toEqual([[7, 2], [7, 4], [7, 6]]);
    expect(minPlayers(parseMap([...m.rows]))).toBe(2);
    // sabotage: take the serving counters away and the recipe cannot cross
    const cut = edit([...m.rows], [[7, 2, '#'], [7, 4, '#'], [7, 6, '#']]);
    expect(validateMap({ ...m, rows: cut }).errors.join()).toMatch(/no route K -> O/);
    // one counter is enough to keep it solvable
    expect(validateMap({ ...m, rows: edit([...m.rows], [[7, 2, '#'], [7, 6, '#']]) }).ok).toBe(true);
  });
  it('map 7 Food truck: one 12x2 corridor, two ovens, three spawns', () => {
    const m = fixedMap('7')!;
    expect(validateMap(m)).toEqual({ ok: true, errors: [] });
    expect(analyze(parseMap([...m.rows])).count).toBe(1);
    // sabotage: both ovens turn into counters
    const noOven = edit([...m.rows], [[9, 2, 'C'], [6, 5, 'C']]);
    expect(validateMap({ ...m, rows: noOven }).errors.join()).toMatch(/missing station O/);
  });
  it('map 8 Espejo: dough only on the left, tomato only on the right, oven/window/plates shared from both sides', () => {
    const m = fixedMap('8')!;
    expect(validateMap(m)).toEqual({ ok: true, errors: [] });
    const g = parseMap([...m.rows]);
    expect(analyze(g).count).toBe(2);
    expect(minPlayers(g)).toBe(2);
    // sabotage: close the left dough crates and nobody can make dough
    expect(validateMap({ ...m, rows: edit([...m.rows], [[1, 0, '#'], [2, 0, '#']]) }).errors.join()).toMatch(/missing station 1/);
    // sabotage: no counter or oven left on column 7 and the halves are disconnected
    const split = edit([...m.rows], [[7, 1, '#'], [7, 2, '#'], [7, 3, '#'], [7, 4, '#'], [7, 5, '#'], [7, 6, '#'], [7, 7, '#']]);
    expect(validateMap({ ...m, rows: split }).ok).toBe(false);
  });
});

describe('validateMap: cheese maps 9, 11 and 15', () => {
  it('map 9 La trattoria: valid; without the cheese crate it is a different map; a walled-in cheese crate fails the cheese route', () => {
    const m = fixedMap('9')!;
    expect(validateMap(m)).toEqual({ ok: true, errors: [] });
    expect(mapFeatures(m.rows)).toEqual({ cheese: true, sink: false });
    // sabotage: the cheese crate (6,0) loses its only floor tile
    const walled = edit([...m.rows], [[6, 1, '#']]);
    expect(validate(parseMap(walled)).errors.join()).toMatch(/station 3 at \(6, 0\) has no floor/);
    expect(validateMap({ ...m, nMax: 6 }).errors.join()).toMatch(/5 spawns for up to 6/);
  });
  it('map 11 Tres carriles: valid with 8 explicit spawns; losing the four ovens breaks it; a spawn order off the S tiles is caught', () => {
    const m = fixedMap('11')!;
    expect(validateMap(m)).toEqual({ ok: true, errors: [] });
    expect(m.spawns).toHaveLength(8);
    const noOvens = edit([...m.rows], [[5, 3, 'C'], [11, 3, 'C'], [5, 5, 'C'], [11, 5, 'C']]);
    expect(validateMap({ ...m, rows: noOvens }).errors.join()).toMatch(/missing station O/);
    expect(validateMap({ ...m, spawns: [[1, 1], ...m.spawns!.slice(1)] }).errors.join()).toMatch(/explicit spawn order/);
  });
  it('map 15 El sótano: four rooms joined by doors; closing the doors splits it and the serving pass-throughs rescue only part of the recipe', () => {
    const m = fixedMap('15')!;
    expect(validateMap(m)).toEqual({ ok: true, errors: [] });
    expect(analyze(parseMap([...m.rows])).count).toBe(1);
    // sabotage: close the four doors (7,2) (3,4) (11,4) (7,6)
    const closed = edit([...m.rows], [[7, 2, '#'], [3, 4, '#'], [11, 4, '#'], [7, 6, '#']]);
    const r = validateMap({ ...m, rows: closed });
    expect(r.ok).toBe(false);
    expect(analyze(parseMap(closed)).count).toBe(4);
    // sabotage: remove both pass-throughs as well and the rooms cannot trade at all
    const sealed = edit(closed, [[5, 4, '#'], [9, 4, '#']]);
    expect(validateMap({ ...m, rows: sealed }).errors.join()).toMatch(/no route/);
  });
});
