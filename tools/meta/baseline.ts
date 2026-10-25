// Equivalence-gate baseline (plan reestructura-repo, section 6).
//   npm run baseline:write   run the whole suite and write docs/refactor/baseline/*
//   npm run baseline:check   run it again and compare against the baseline
// check fails when: a baseline test name is missing, a test is skipped/todo that was not, a project runs 0 tests,
// a test fails, or a capture/golden hash changed or its file disappeared. Extra tests only get a note.
// Test identity is the full name (describe > test), never the path, so moving or renaming a file keeps the gate valid.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = join(ROOT, 'docs/refactor/baseline');
const TMP = join(ROOT, '.vitest/baseline.json');
const HASHED = [
  { dir: 'docs/screens', ext: '.png' },
  { dir: 'games/pizzas/test/golden', ext: '' },
];

type Row = { file: string; status: string; name: string; ms: number };
type Report = {
  rows: Row[];
  fileMs: Record<string, number>;
  wallSec: number;
  failed: number;
  badFiles: string[];
  failedFiles: string[];
  retried: string[];
};

const sh = (cmd: string, args: string[]) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });

function runSuite(only: string[] = []): Report {
  const t0 = Date.now();
  rmSync(TMP, { force: true });
  const r = spawnSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${TMP}`, '--silent', ...only], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const wallSec = Math.round((Date.now() - t0) / 100) / 10;
  if (!existsSync(TMP)) {
    console.error('vitest produced no JSON report (exit ' + r.status + ')');
    process.exit(2);
  }
  const json = JSON.parse(readFileSync(TMP, 'utf8'));
  const rows: Row[] = [];
  const fileMs: Record<string, number> = {};
  const failedFiles: string[] = [];
  let failed = 0;
  const badFiles: string[] = []; // a suite that dies in beforeAll reports its tests as skipped: catch it by the file status
  for (const f of json.testResults) {
    const file = relative(ROOT, f.name);
    if (f.status === 'failed') failedFiles.push(file);
    if (f.status === 'failed') badFiles.push(`${file}: ${String(f.message || 'failed').split('\n')[0]}`);
    fileMs[file] = Math.round(f.endTime - f.startTime);
    for (const a of f.assertionResults) {
      if (a.status === 'failed') failed++;
      rows.push({ file, status: a.status, name: a.fullName, ms: a.duration ?? 0 });
    }
  }
  return { rows, fileMs, wallSec, failed, badFiles, failedFiles, retried: [] };
}

// Browser tests (controller/test/layout) flake when 10 workers compete for the CPU: files that failed get one
// retry ALONE; a real failure fails again. Retried files are reported so a flake never passes unnoticed.
function runWithRetry(): Report {
  const first = runSuite();
  if (!first.failedFiles.length) return first;
  console.error(`retrying alone: ${first.failedFiles.join(', ')}`);
  const again = runSuite(first.failedFiles);
  const redo = new Set(first.failedFiles);
  const rows = [...first.rows.filter((r) => !redo.has(r.file)), ...again.rows];
  const fileMs = { ...first.fileMs, ...again.fileMs };
  const failed = rows.filter((r) => r.status === 'failed').length;
  return {
    rows,
    fileMs,
    wallSec: Math.round((first.wallSec + again.wallSec) * 10) / 10,
    failed,
    badFiles: again.badFiles,
    failedFiles: again.failedFiles,
    retried: first.failedFiles,
  };
}

// file -> project name, from `vitest list`; empty if the config has no projects (pre-F1 layout)
function projectOfFiles(): Map<string, string> {
  const out = sh('npx', ['vitest', 'list', '--filesOnly']).stdout ?? '';
  const m = new Map<string, string>();
  for (const line of out.split('\n')) {
    const g = /^\[([^\]]+)\] (.+)$/.exec(line.trim());
    if (g) m.set(g[2]!, g[1]!);
  }
  return m;
}

async function configuredProjects(): Promise<string[]> {
  const cfg = (await import('../../vitest.config')).default as { test?: { projects?: { test?: { name?: string } }[] } };
  return (cfg.test?.projects ?? []).map((p) => p.test?.name ?? '?');
}

// The baseline was written before F3 moved the files: translate its paths through scripts/moves.json. Golden JSON is compared byte for byte at its new
// path; the golden bots (.ts) had their import lines rewritten by the move, so they are checked with `git diff -M` (only import lines may differ).
function translateHashes(h: Record<string, string>): Record<string, string> {
  const file = join(ROOT, 'scripts/moves.json');
  const moved: Record<string, string> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).files : {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    const nk = existsSync(join(ROOT, k)) ? k : (moved[k] ?? k);
    if (nk !== k && k.endsWith('.ts')) continue;
    out[nk] = v;
  }
  return out;
}

function walk(dir: string, ext: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, ext, acc);
    else if (!ext || p.endsWith(ext)) acc.push(p);
  }
  return acc;
}

function hashes(): Record<string, string> {
  const h: Record<string, string> = {};
  for (const { dir, ext } of HASHED) {
    for (const p of walk(join(ROOT, dir), ext).sort()) h[relative(ROOT, p)] = createHash('sha256').update(readFileSync(p)).digest('hex');
  }
  return h;
}

const sortRows = (rows: Row[]) => [...rows].sort((a, b) => (a.name + a.file).localeCompare(b.name + b.file));
const tsv = (rows: Row[]) =>
  sortRows(rows)
    .map((r) => `${r.file}\t${r.status}\t${r.name}`)
    .join('\n') + '\n';
const count = (names: string[]) => {
  const m = new Map<string, number>();
  for (const n of names) m.set(n, (m.get(n) ?? 0) + 1);
  return m;
};

function slowestMd(rep: Report, tests: { file: string; name: string; ms: number }[]): string {
  const files = Object.entries(rep.fileMs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const top = [...tests].sort((a, b) => b.ms - a.ms).slice(0, 10);
  const L = [
    '# Slowest tests (baseline)',
    '',
    `Measured with files running in parallel on a shared machine (load average ${loadavg()[0]!.toFixed(1)}, ${cpus().length} cores): treat as order of magnitude, not as a benchmark.`,
    '',
    '## 10 slowest files (wall time of the file)',
    '',
    '| ms | file |',
    '|---:|---|',
    ...files.map(([f, ms]) => `| ${ms} | ${f} |`),
    '',
    '## 10 slowest tests',
    '',
    '| ms | file | test |',
    '|---:|---|---|',
    ...top.map((t) => `| ${Math.round(t.ms)} | ${t.file} | ${t.name.slice(0, 90).replace(/\|/g, '/')} |`),
    '',
  ];
  return L.join('\n');
}

async function write() {
  const rep = runWithRetry();
  const tests = rep.rows;
  if (rep.failed || rep.badFiles.length) {
    console.error(`refusing to write: ${rep.failed} failing test(s), ${rep.badFiles.length} failed file(s)\n` + rep.badFiles.join('\n'));
    process.exit(1);
  }
  const skipped = rep.rows.filter((r) => r.status !== 'passed');
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'tests.tsv'), tsv(rep.rows));
  writeFileSync(join(OUT, 'durations.json'), JSON.stringify(Object.fromEntries(Object.entries(rep.fileMs).sort()), null, 1) + '\n');
  writeFileSync(join(OUT, 'slowest.md'), slowestMd(rep, tests));
  writeFileSync(join(OUT, 'captures.json'), JSON.stringify(hashes(), null, 1) + '\n');
  const sha = sh('git', ['rev-parse', '--short', 'HEAD']).stdout.trim();
  const meta = {
    generatedFrom: sha,
    retriedAloneAfterFailing: rep.retried,
    vitest: sh('npx', ['vitest', '--version']).stdout.trim(),
    totalTests: rep.rows.length,
    skippedOrTodo: skipped.length,
    files: Object.keys(rep.fileMs).length,
    wallSeconds: rep.wallSec,
    loadAvg: loadavg()[0],
    cores: cpus().length,
    failed: rep.failed,
  };
  writeFileSync(join(OUT, 'meta.json'), JSON.stringify(meta, null, 1) + '\n');
  console.log(`baseline written: ${rep.rows.length} tests in ${meta.files} files, ${skipped.length} skipped/todo, ${rep.wallSec}s`);
}

async function check() {
  const base = readFileSync(join(OUT, 'tests.tsv'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => {
      const [file, status, ...n] = l.split('\t');
      return { file: file!, status: status!, name: n.join('\t') };
    });
  const baseHashes = translateHashes(JSON.parse(readFileSync(join(OUT, 'captures.json'), 'utf8')));
  const rep = runWithRetry();
  const errors: string[] = [];
  const notes: string[] = [];

  const baseCount = count(base.map((r) => r.name));
  const nowCount = count(rep.rows.map((r) => r.name));
  const missing: string[] = [];
  for (const [n, c] of baseCount) {
    const d = c - (nowCount.get(n) ?? 0);
    if (d > 0) missing.push(`${d}x ${n}`);
  }
  if (missing.length)
    errors.push(
      `${missing.length} baseline test name(s) missing:\n  - ` +
        missing.slice(0, 25).join('\n  - ') +
        (missing.length > 25 ? `\n  ... +${missing.length - 25}` : ''),
    );
  const extra = [...nowCount].reduce((a, [n, c]) => a + Math.max(0, c - (baseCount.get(n) ?? 0)), 0);
  if (extra) notes.push(`${extra} test(s) not in the baseline (new tests are allowed; run baseline:write to freeze them)`);

  const baseNotRun = new Set(base.filter((r) => r.status !== 'passed').map((r) => r.name));
  const newSkips = [
    ...new Set(rep.rows.filter((r) => r.status !== 'passed' && r.status !== 'failed' && !baseNotRun.has(r.name)).map((r) => r.name)),
  ];
  if (newSkips.length) errors.push(`${newSkips.length} new skip/todo:\n  - ` + newSkips.slice(0, 25).join('\n  - '));
  const nowSkips = rep.rows.filter((r) => r.status !== 'passed' && r.status !== 'failed').length;
  if (nowSkips > baseNotRun.size && !newSkips.length) errors.push(`skips grew: ${nowSkips} now vs ${baseNotRun.size} in the baseline`);
  if (rep.badFiles.length)
    errors.push(
      `${rep.badFiles.length} test file(s) failed outside a test (their tests show as skipped):\n  - ` + rep.badFiles.join('\n  - '),
    );
  if (rep.failed)
    errors.push(
      `${rep.failed} failing test(s): ` +
        rep.rows
          .filter((r) => r.status === 'failed')
          .slice(0, 10)
          .map((r) => `${r.file} :: ${r.name}`)
          .join('; '),
    );

  const projects = await configuredProjects();
  const owner = projectOfFiles();
  if (projects.length) {
    const perProject = new Map(projects.map((p) => [p, 0]));
    for (const r of rep.rows) {
      const p = owner.get(r.file);
      if (p) perProject.set(p, (perProject.get(p) ?? 0) + 1);
    }
    const zero = [...perProject].filter(([, c]) => c === 0).map(([p]) => p);
    if (zero.length) errors.push(`project(s) with 0 tests: ${zero.join(', ')}`);
    notes.push('tests per project: ' + [...perProject].map(([p, c]) => `${p}=${c}`).join(' '));
  } else notes.push('config has no projects (pre-F1 layout): per-project check skipped');

  const now = hashes();
  const changed = Object.keys(baseHashes).filter((f) => now[f] !== baseHashes[f]);
  if (changed.length)
    errors.push(
      `${changed.length} capture/golden file(s) changed or missing:\n  - ` +
        changed
          .slice(0, 25)
          .map((f) => `${f}${now[f] ? '' : ' (missing)'}`)
          .join('\n  - '),
    );
  const added = Object.keys(now).filter((f) => !(f in baseHashes));
  if (added.length) notes.push(`${added.length} capture/golden file(s) not in the baseline`);

  if (rep.retried.length) notes.push(`flaky under load, passed on retry alone: ${rep.retried.join(', ')}`);
  for (const n of notes) console.log('note: ' + n);
  console.log(`suite: ${rep.rows.length} tests, wall ${rep.wallSec}s`);
  if (errors.length) {
    console.error('BASELINE CHECK FAILED\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log(`baseline check OK (${base.length} baseline tests all present, no new skips, no project with 0 tests, hashes unchanged)`);
}

const mode = process.argv[2];
if (mode === 'write') await write();
else if (mode === 'check') await check();
else {
  console.error('usage: tsx tools/meta/baseline.ts write|check');
  process.exit(2);
}
