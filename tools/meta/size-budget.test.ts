// Size ratchet: fails on any of the cases of plan section 5. Soft-limit warnings are one line and never fail.
import { describe, expect, it } from 'vitest';
import { type Budget, evaluate, loadBudget, onlyReexports, scan, todayISO } from './size-budget';

describe('size budget (real repo)', () => {
  it('no file or folder breaks the budget or its exception', () => {
    const b = loadBudget();
    const { errors, warnings } = evaluate(scan(b), b, todayISO());
    if (warnings.length)
      console.warn(
        `size-budget: ${warnings.length} soft warning(s): ${warnings.slice(0, 3).join(' | ')}${warnings.length > 3 ? ' ...' : ''}`,
      );
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

const B: Budget = {
  limits: {
    code: { soft: 300, hard: 500 },
    test: { soft: 500, hard: 800 },
    markup: { soft: 150, hard: 250 },
    index: { hard: 40 },
    folder: { soft: 12, hard: 20 },
    shrinkSlack: 25,
    folderShrinkSlack: 3,
  },
  exemptPaths: ['g/levels/', 'g/golden/fixtures/'],
  files: { 'a/big.ts': { max: 600, until: '2027-01-01' } },
  folders: {},
};
const T = '2026-10-24';
const run = (files: { path: string; lines: number; reexportOnly?: boolean }[], b = B, today = T) => evaluate(files, b, today);
const big = { path: 'a/big.ts', lines: 600 };

describe('size budget rules (synthetic)', () => {
  it('passes the listed exception at its max', () => expect(run([big]).errors).toEqual([]));
  it('fails a file over the hard limit that is not listed', () =>
    expect(run([{ path: 'a/new.ts', lines: 501 }, big]).errors[0]).toMatch(/a\/new\.ts.*hard limit 500/));
  it('fails a listed file that grows above its max', () => expect(run([{ ...big, lines: 601 }]).errors[0]).toMatch(/grew to 601/));
  it('fails a listed file that shrank more than 25 lines (ratchet down)', () =>
    expect(run([{ ...big, lines: 574 }]).errors[0]).toMatch(/shrank to 574/));
  it('tolerates a shrink of up to 25 lines', () => expect(run([{ ...big, lines: 575 }]).errors).toEqual([]));
  it('fails an expired exception', () => expect(run([big], B, '2027-01-02').errors[0]).toMatch(/expired on 2027-01-01/));
  it('fails an entry whose path no longer exists', () => expect(run([]).errors[0]).toMatch(/no longer exists/));
  it('tests: 500 soft (warn), 800 hard (fail)', () => {
    expect(run([{ path: 'a/x.test.ts', lines: 700 }, big])).toMatchObject({
      errors: [],
      warnings: [expect.stringMatching(/soft limit 500/)],
    });
    expect(run([{ path: 'a/x.test.ts', lines: 801 }, big]).errors[0]).toMatch(/hard limit 800/);
  });
  it('css/html: 150 soft, 250 hard', () => {
    expect(run([{ path: 'a/x.css', lines: 200 }, big]).warnings).toHaveLength(1);
    expect(run([{ path: 'a/x.html', lines: 251 }, big]).errors[0]).toMatch(/hard limit 250/);
  });
  it('code: 300 warns without failing', () =>
    expect(run([{ path: 'a/m.ts', lines: 400 }, big])).toMatchObject({ errors: [], warnings: [expect.stringMatching(/m\.ts/)] }));
  it('index.ts: over 40 lines or more than re-exports fails', () => {
    expect(run([{ path: 'a/index.ts', lines: 41, reexportOnly: true }, big]).errors[0]).toMatch(/index\.ts/);
    expect(run([{ path: 'a/index.ts', lines: 10, reexportOnly: false }, big]).errors[0]).toMatch(/more than re-exports/);
    expect(run([{ path: 'a/index.ts', lines: 40, reexportOnly: true }, big]).errors).toEqual([]);
  });
  it('folder: 12 code files warn, 21 fail; tests do not count', () => {
    const mk = (n: number, dir = 'f') => Array.from({ length: n }, (_, i) => ({ path: `${dir}/m${i}.ts`, lines: 10 }));
    expect(run([...mk(13), big]).warnings.some((w) => w.startsWith('f/'))).toBe(true);
    expect(run([...mk(21), big]).errors[0]).toMatch(/f\/: 21 code files/);
    expect(run([...mk(15), ...Array.from({ length: 30 }, (_, i) => ({ path: `f/t${i}.test.ts`, lines: 10 })), big]).errors).toEqual([]);
  });
  it('data/, fixtures/ and levels/ are exempt', () => {
    expect(run([{ path: 'g/levels/l1.ts', lines: 5000 }, { path: 'g/golden/fixtures/x.ts', lines: 5000 }, big]).errors).toEqual([]);
  });
  it('a folder merely named levels/data/golden elsewhere is not exempt', () => {
    const errs = run([
      { path: 'a/levels/l1.ts', lines: 5000 },
      { path: 'a/data/x.ts', lines: 5000 },
      { path: 'g/golden/bot.ts', lines: 5000 },
      big,
    ]).errors;
    expect(errs).toHaveLength(3);
  });
  it('onlyReexports reads comments and multi-line exports', () => {
    expect(onlyReexports("// api\nexport * from './a';\nexport type { X,\n Y } from './b';\n")).toBe(true);
    expect(onlyReexports("export * from './a';\nexport const x = 1;\n")).toBe(false);
  });
});
