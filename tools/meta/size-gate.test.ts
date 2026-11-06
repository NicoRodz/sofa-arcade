// Frente G: the size budget carries no exception that dies in 2026 (those were the ones the restructure had to resolve), and an expired one turns the size
// check red on the real budget.
import { describe, expect, it } from 'vitest';
import { evaluate, loadBudget, scan } from './size-budget';

const CUTOFF = '2026-12-31';

describe('size budget gate', () => {
  it('no exception of size-budget.json expires on or before 2026-12-31', () => {
    const b = loadBudget();
    const entries = [...Object.entries(b.files), ...Object.entries(b.folders)];
    // the budget may be empty (every oversize file was split): then nothing can expire, and the entry mechanics are covered in size-budget.test.ts
    expect(entries.filter(([, e]) => e.until <= CUTOFF).map(([p, e]) => `${p} until ${e.until}`)).toEqual([]);
  });
  it('an exception whose date has passed makes the real budget fail', () => {
    const b = loadBudget();
    const files = scan(b);
    expect(evaluate(files, b, '2026-11-01').errors).toEqual([]);
    const { errors } = evaluate(files, b, '2027-04-01');
    const entries = Object.keys(b.files).length + Object.keys(b.folders).length;
    if (entries === 0) return expect(errors).toEqual([]); // empty budget: no exception to expire
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((e) => /expired on/.test(e))).toBe(true);
  });
});
