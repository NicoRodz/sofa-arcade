// The baseline identifies a test by its full name, so moving a test file keeps the gate green by design. The cost: a file moved WITHOUT an entry in
// scripts/moves.json (the rule of CLAUDE.md) went unnoticed. This closes it: every baseline (file, name) pair must still exist at the path the move table
// gives it. `files` maps the baseline path to its F3 path; `testMoves` maps a path to where a later frente moved it (add the entry in the same commit as the
// `git mv`). A moved test with no entry, or a test that jumped to another file, is an error.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type TestRow = { file: string; name: string };
export type MoveTable = { files: Record<string, string>; testMoves: Record<string, string> };

export function loadMoveTable(root: string): MoveTable {
  const f = join(root, 'scripts/moves.json');
  const j = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
  return { files: j.files ?? {}, testMoves: j.testMoves ?? {} };
}

/** Where the baseline's file lives now according to the table; null when the table deletes it. */
export function currentPath(file: string, t: MoveTable): string | null {
  const first = t.files[file] ?? file;
  if (first === 'DELETE') return null;
  return t.testMoves[first] ?? first;
}

const key = (r: TestRow) => `${r.file}\t${r.name}`;

/** Baseline tests that exist now under the same name but not at the path the table says: moved without an entry in moves.json. */
export function movedWithoutEntry(base: readonly TestRow[], now: readonly TestRow[], t: MoveTable): string[] {
  const have = new Map<string, number>();
  for (const r of now) have.set(key(r), (have.get(key(r)) ?? 0) + 1);
  const where = new Map<string, Set<string>>();
  for (const r of now) where.set(r.name, (where.get(r.name) ?? new Set()).add(r.file));
  const out = new Set<string>();
  for (const b of base) {
    const file = currentPath(b.file, t);
    if (file === null) continue;
    const k = key({ file, name: b.name });
    const n = have.get(k) ?? 0;
    if (n > 0) have.set(k, n - 1);
    else if (where.has(b.name)) out.add(`${b.file} -> now in ${[...where.get(b.name)!].join(', ')} (expected ${file})`);
  }
  return [...out].sort();
}
