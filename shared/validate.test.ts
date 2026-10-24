import { describe, expect, it } from 'vitest';
import { FIXED_MAPS, fixedMap, parseMap } from './maps';
import { analyze, validate } from './validate';

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
