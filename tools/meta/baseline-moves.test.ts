import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { currentPath, loadMoveTable, movedWithoutEntry, type MoveTable } from './baseline-moves';

const T: MoveTable = {
  files: { 'old/a.test.ts': 'new/a.test.ts', 'old/gone.test.ts': 'DELETE' },
  testMoves: { 'new/a.test.ts': 'newer/a.test.ts' },
};
const row = (file: string, name = 'does a thing') => ({ file, name });

describe('movedWithoutEntry', () => {
  it('a test at the path the table gives it is fine, also through two moves', () => {
    expect(movedWithoutEntry([row('old/a.test.ts')], [row('newer/a.test.ts')], T)).toEqual([]);
    expect(movedWithoutEntry([row('x/b.test.ts')], [row('x/b.test.ts')], T)).toEqual([]);
  });
  it('a file moved without an entry in moves.json is reported', () => {
    expect(movedWithoutEntry([row('x/b.test.ts')], [row('y/b.test.ts')], T)).toEqual([
      'x/b.test.ts -> now in y/b.test.ts (expected x/b.test.ts)',
    ]);
    expect(movedWithoutEntry([row('old/a.test.ts')], [row('new/a.test.ts')], T)).toHaveLength(1); // the second move has no testMoves entry
  });
  it('a test that jumped to another file is reported, a duplicated name is counted', () => {
    expect(movedWithoutEntry([row('x/b.test.ts')], [row('x/c.test.ts')], T)).toHaveLength(1);
    expect(movedWithoutEntry([row('x/b.test.ts'), row('x/b.test.ts')], [row('x/b.test.ts'), row('x/c.test.ts')], T)).toHaveLength(1);
  });
  it('a missing name is not this check (baseline:check reports it), neither is a file the table deletes', () => {
    expect(movedWithoutEntry([row('x/b.test.ts')], [], T)).toEqual([]);
    expect(movedWithoutEntry([row('old/gone.test.ts')], [row('y/gone.test.ts')], T)).toEqual([]);
  });
});

describe('currentPath / the real table', () => {
  it('follows files then testMoves', () => {
    expect(currentPath('old/a.test.ts', T)).toBe('newer/a.test.ts');
    expect(currentPath('old/gone.test.ts', T)).toBeNull();
    expect(currentPath('same.ts', T)).toBe('same.ts');
  });
  it('scripts/moves.json has a testMoves table and every target exists', () => {
    const root = new URL('../..', import.meta.url).pathname;
    const t = loadMoveTable(root);
    expect(Object.keys(t.testMoves).length).toBeGreaterThan(0);
    for (const to of Object.values(t.testMoves)) expect(existsSync(join(root, to)), to).toBe(true);
  });
});
