// The platform names no game: its non-test code never imports a game package or path and never spells a game id as a literal. The list of folders grows
// as each frente cuts its imports (D2: core and screen-kit; F4c adds platform/screen, F5d platform/controller, G the whole of platform/).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../../..');
const FOLDERS = ['platform/core/src', 'platform/screen/src'];
const TEST_FILE = /(\.test\.ts|\.slow\.test\.ts)$|[\\/](test|harness)[\\/]/;
// A game import, a path into games/, or a game id spelled as a string literal.
const FORBIDDEN = [/@pichi\/game-/, /\bgames\//, /(['"`])(pizzas|obstaculos|arena)\1/];

function sources(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, acc);
    else if (p.endsWith('.ts') && !TEST_FILE.test(p)) acc.push(p);
  }
  return acc;
}
/** Comments may talk about games; code may not. */
const code = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/ .*$/gm, '');

function violations(folders: readonly string[] = FOLDERS): string[] {
  const out: string[] = [];
  for (const f of folders)
    for (const file of sources(join(ROOT, f)))
      code(readFileSync(file, 'utf8'))
        .split('\n')
        .forEach((line, i) => {
          if (FORBIDDEN.some((re) => re.test(line))) out.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
        });
  return out;
}

describe('the platform is game-agnostic', () => {
  it('scans real files (a green from an empty list proves nothing)', () => {
    expect(sources(join(ROOT, 'platform/core/src')).length).toBeGreaterThan(20);
    expect(sources(join(ROOT, 'platform/screen/src')).length).toBeGreaterThan(20);
  });
  it('platform/core and platform/screen name no game', () => {
    expect(violations()).toEqual([]);
  });
  it('the scan does flag a game import and a game id literal', () => {
    const probe = ["import { COLS } from '@pichi/game-pizzas';", "const id = 'pizzas';", 'const p = `games/arena`;'];
    for (const line of probe) expect(FORBIDDEN.some((re) => re.test(line))).toBe(true);
    expect(FORBIDDEN.some((re) => re.test(code('// the pizzas game\nconst n = 1;')))).toBe(false);
  });
});
