// Size ratchet (plan reestructura-repo, section 5). The rules live in `evaluate` (pure, unit-tested); the CLI mode
// `tsx tools/meta/size-budget.ts init|ratchet` rewrites size-budget.json. Limits are in size-budget.json too.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '../..');
export const BUDGET_PATH = join(ROOT, 'size-budget.json');

export type Limit = { soft: number; hard: number };
export type Entry = { max: number; until: string };
export type Budget = {
  limits: {
    code: Limit;
    test: Limit;
    markup: Limit;
    index: { hard: number };
    folder: Limit;
    shrinkSlack: number;
    folderShrinkSlack: number;
  };
  exemptPaths: string[]; // repo-root-relative folder prefixes (trailing slash); a folder that merely has the same name elsewhere is NOT exempt
  files: Record<string, Entry>;
  folders: Record<string, Entry>;
};
export type FileInfo = { path: string; lines: number; reexportOnly?: boolean };
export type Result = { errors: string[]; warnings: string[] };

const CODE = /\.(ts|tsx|js|mjs|cjs)$/;
const MARKUP = /\.(css|html)$/;
const SKIP = /(^|\/)(node_modules|dist|\.vitest|\.git)\//;

export const isTest = (p: string) => /\.test\.(ts|tsx)$/.test(p);
export const isIndex = (p: string) => /(^|\/)index\.ts$/.test(p);

export function isExempt(path: string, b: Budget): boolean {
  return b.exemptPaths.some((prefix) => path.startsWith(prefix));
}

export function kindOf(path: string): 'index' | 'test' | 'code' | 'markup' | null {
  if (SKIP.test(path)) return null;
  if (MARKUP.test(path)) return 'markup';
  if (!CODE.test(path)) return null;
  if (isIndex(path)) return 'index';
  return isTest(path) ? 'test' : 'code';
}

// index.ts must hold re-exports only: drop comments and every `export ... from '...'`, nothing else may remain.
export function onlyReexports(src: string): boolean {
  const noComments = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/.*$/gm, '');
  const rest = noComments.replace(/export\s+(type\s+)?(\*(\s+as\s+\w+)?|\{[^}]*\})\s+from\s+['"][^'"]+['"]\s*;?/g, '');
  return rest.trim() === '';
}

export const lineCount = (src: string) => src.split('\n').length - (src.endsWith('\n') ? 1 : 0);

export function evaluate(files: FileInfo[], b: Budget, today: string): Result {
  const errors: string[] = [];
  const warnings: string[] = [];
  const L = b.limits;
  const seen = new Set<string>();
  const dirCount = new Map<string, number>();

  const checkEntry = (path: string, n: number, e: Entry | undefined, slack: number, what: string): boolean => {
    if (!e) return false;
    if (e.until < today) errors.push(`${path}: exception expired on ${e.until} (${n} ${what}); split it or renew the date on purpose`);
    if (n > e.max) errors.push(`${path}: grew to ${n} ${what}, above its exception max ${e.max}`);
    else if (n < e.max - slack)
      errors.push(`${path}: shrank to ${n} ${what}, more than ${slack} below max ${e.max}; lower max (npm run size:ratchet)`);
    return true;
  };

  for (const f of files) {
    seen.add(f.path);
    const kind = kindOf(f.path);
    if (!kind || isExempt(f.path, b)) continue;
    if (kind !== 'test' && kind !== 'markup' && kind !== 'index') {
      const d = dirname(f.path);
      dirCount.set(d, (dirCount.get(d) ?? 0) + 1);
    }
    const entry = b.files[f.path];
    if (kind === 'index') {
      const bad =
        f.lines > L.index.hard ? `${f.lines} lines (hard ${L.index.hard})` : f.reexportOnly === false ? 'holds more than re-exports' : '';
      if (!checkEntry(f.path, f.lines, entry, L.shrinkSlack, 'lines') && bad)
        errors.push(`${f.path}: index.ts ${bad} and is not in the exception list`);
      continue;
    }
    const lim = kind === 'test' ? L.test : kind === 'markup' ? L.markup : L.code;
    if (checkEntry(f.path, f.lines, entry, L.shrinkSlack, 'lines')) continue;
    if (f.lines > lim.hard)
      errors.push(`${f.path}: ${f.lines} lines, over the hard limit ${lim.hard} (${kind}) and not in the exception list`);
    else if (f.lines > lim.soft) warnings.push(`${f.path}: ${f.lines} lines, over the soft limit ${lim.soft} (${kind})`);
  }

  for (const path of Object.keys(b.files))
    if (!seen.has(path))
      errors.push(`${path}: listed in size-budget.json but the file no longer exists; remove the entry (or update the path)`);

  for (const [dir, n] of dirCount) {
    const entry = b.folders[dir];
    if (checkEntry(dir + '/', n, entry, L.folderShrinkSlack, 'code files')) continue;
    if (n > L.folder.hard) errors.push(`${dir}/: ${n} code files, over the hard limit ${L.folder.hard} and not in the exception list`);
    else if (n > L.folder.soft) warnings.push(`${dir}/: ${n} code files, over the soft limit ${L.folder.soft}`);
  }
  for (const dir of Object.keys(b.folders))
    if (!dirCount.has(dir))
      errors.push(`${dir}/: listed in size-budget.json (folders) but it has no code files any more; remove the entry`);

  return { errors, warnings };
}

export function loadBudget(): Budget {
  return JSON.parse(readFileSync(BUDGET_PATH, 'utf8')) as Budget;
}

// every non-ignored file of the checkout, tracked or not, so a new big file is seen before it is committed
export function scan(b: Budget): FileInfo[] {
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  });
  const files: FileInfo[] = [];
  for (const path of out.split('\0')) {
    const kind = path && kindOf(path);
    if (!kind) continue;
    let src: string;
    try {
      src = readFileSync(join(ROOT, path), 'utf8');
    } catch {
      continue;
    } // deleted in the working tree
    files.push({ path, lines: lineCount(src), reexportOnly: kind === 'index' && !isExempt(path, b) ? onlyReexports(src) : undefined });
  }
  return files;
}

export const todayISO = () => process.env.SIZE_BUDGET_TODAY ?? new Date().toISOString().slice(0, 10);

// Files the plan splits in F3-F5 get a short fuse; the rest (300-400 lines, long tests) wait for a task that touches them.
const SPLIT_PLANNED = new Set([
  'apps/screen/src/main.ts',
  'games/pizzas/sim/overcooked.ts',
  'tools/capture.ts',
  'apps/screen/index.html',
  'games/obstaculos/validator/graph.ts',
  'games/pizzas/sim/maps.ts',
  'apps/controller/src/main.ts',
  'games/pizzas/sim/validate.ts',
]);

// ---- CLI: init (first list from the current state) / ratchet (lower max, drop entries that are healthy again)
function cli(mode: string) {
  const b = loadBudget();
  const files = scan(b);
  const L = b.limits;
  const now = new Map(files.map((f) => [f.path, f]));
  if (mode === 'init') {
    b.files = {};
    b.folders = {};
    const dirs = new Map<string, number>();
    for (const f of files) {
      const kind = kindOf(f.path);
      if (!kind || isExempt(f.path, b)) continue;
      if (kind === 'code') dirs.set(dirname(f.path), (dirs.get(dirname(f.path)) ?? 0) + 1);
      const lim =
        kind === 'test' ? L.test : kind === 'markup' ? L.markup : kind === 'code' ? L.code : { soft: L.index.hard, hard: L.index.hard };
      const bad = f.lines > lim.soft || (kind === 'index' && f.reexportOnly === false);
      if (bad) b.files[f.path] = { max: f.lines, until: SPLIT_PLANNED.has(f.path) ? '2026-12-31' : '2027-03-31' };
    }
    for (const [d, n] of dirs) if (n > L.folder.soft) b.folders[d] = { max: n, until: '2026-12-31' };
  } else if (mode === 'ratchet') {
    const dirs = new Map<string, number>();
    for (const f of files)
      if (kindOf(f.path) === 'code' && !isExempt(f.path, b)) dirs.set(dirname(f.path), (dirs.get(dirname(f.path)) ?? 0) + 1);
    for (const [p, e] of Object.entries(b.files)) {
      const f = now.get(p);
      if (!f) delete b.files[p];
      else e.max = Math.min(e.max, f.lines);
    }
    for (const [d, e] of Object.entries(b.folders)) {
      const n = dirs.get(d);
      if (!n) delete b.folders[d];
      else e.max = Math.min(e.max, n);
    }
  } else {
    console.error('usage: tsx tools/meta/size-budget.ts init|ratchet');
    process.exit(2);
  }
  const sorted = (o: Record<string, Entry>) => Object.fromEntries(Object.entries(o).sort(([a], [c]) => a.localeCompare(c)));
  b.files = sorted(b.files);
  b.folders = sorted(b.folders);
  const block = (o: Record<string, Entry>) =>
    '{\n' +
    Object.entries(o)
      .map(
        ([k, v]) =>
          `  ${JSON.stringify(k)}: ${JSON.stringify(v)
            .replace(/([:,])/g, '$1 ')
            .replace('{', '{ ')
            .replace('}', ' }')}`,
      )
      .join(',\n') +
    '\n }';
  writeFileSync(
    BUDGET_PATH,
    `{\n "limits": ${JSON.stringify(b.limits)},\n "exemptPaths": ${JSON.stringify(b.exemptPaths)},\n "files": ${block(b.files)},\n "folders": ${block(b.folders)}\n}\n`,
  );
  console.log(`size-budget.json: ${Object.keys(b.files).length} file exceptions, ${Object.keys(b.folders).length} folder exceptions`);
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) cli(process.argv[2] ?? '');
