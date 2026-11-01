// scripts/check-new-files.mjs against a throwaway git repo: what it accepts, and the two ways around it that used to work (an exempt-looking folder
// name anywhere in the path, and a high-similarity rename that grows over the limit).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SCRIPT = join(import.meta.dirname, '../../scripts/check-new-files.mjs');
const body = (n: number) => Array.from({ length: n }, (_, i) => `export const v${i} = ${i};`).join('\n') + '\n';
let repo: string;

const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' });
const put = (path: string, n: number) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), body(n));
};
const check = () => spawnSync('node', [SCRIPT, 'base'], { cwd: repo, encoding: 'utf8' });
const commit = (msg: string) => {
  git('add', '-A');
  git('commit', '-qm', msg);
};
const reset = () => git('reset', '-q', '--hard', 'base');

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'cnf-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  put('keep.ts', 5);
  put('old/big.ts', 290);
  commit('base');
  git('tag', 'base');
});
afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe('check-new-files', () => {
  it('passes a small new file and fails a new file over 300 lines', () => {
    put('src/small.ts', 100);
    commit('small');
    expect(check().status).toBe(0);
    put('src/large.ts', 301);
    commit('large');
    const r = check();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('src/large.ts: 301');
    reset();
  });
  it('exempts the concrete data folders only', () => {
    put('games/obstaculos/levels/l1.ts', 400);
    put('games/pizzas/test/golden/fixtures/f.ts', 400);
    put('docs/x/gen.ts', 400);
    commit('data');
    expect(check().status).toBe(0);
    reset();
  });
  it('does not exempt code in a folder that is merely called data, docs, levels or fixtures', () => {
    for (const dir of ['src/data', 'src/docs', 'src/levels', 'src/fixtures', 'games/other/levels', 'apps/x/docs']) {
      put(`${dir}/code.ts`, 350);
      commit(`hide in ${dir}`);
      const r = check();
      expect(r.status, dir).toBe(1);
      expect(r.stderr).toContain(`${dir}/code.ts: 350`);
      reset();
    }
  });
  it('fails a high-similarity rename that grows over 300 lines, passes a rename that stays under or does not grow', () => {
    renameSync(join(repo, 'old/big.ts'), join(repo, 'new-big.ts'));
    writeFileSync(join(repo, 'new-big.ts'), body(290) + body(15).replaceAll('v', 'w')); // 305 lines, ~95 % similar to the base
    commit('rename + grow');
    expect(git('diff', '--name-status', '-M', 'base')).toMatch(/^R\d+\told\/big\.ts\tnew-big\.ts/m); // it IS an R row: that is the hole
    const r = check();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('new-big.ts: 305');
    expect(r.stderr).toContain('renamed from old/big.ts, which had 290');
    reset();
    git('mv', 'old/big.ts', 'moved.ts'); // pure move: no growth
    commit('pure move');
    expect(check().status).toBe(0);
    reset();
    renameSync(join(repo, 'old/big.ts'), join(repo, 'new-big.ts'));
    writeFileSync(join(repo, 'new-big.ts'), body(295)); // grows but stays under the limit
    commit('rename + small growth');
    expect(check().status).toBe(0);
    reset();
  });
});
