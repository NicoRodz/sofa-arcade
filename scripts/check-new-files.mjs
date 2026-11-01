// Every file ADDED since the base (a rename is not an addition) has at most 300 lines: new code is born under the soft limit, so the size-budget exceptions
// only ever shrink. Usage: node scripts/check-new-files.mjs [base-ref]   (default origin/master; CI passes origin/<PR base>)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const MAX = 300;
const CHECKED = /\.(ts|tsx|mts|cts|js|mjs|cjs|css|html)$/;
const EXEMPT = /(^|\/)(data|fixtures|levels|golden|dist|node_modules|docs)\//;
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 26 }).trim();

const base = process.argv[2] ?? 'origin/master';
const mergeBase = git('merge-base', base, 'HEAD');
const rows = git('diff', '--name-status', '-M', '--diff-filter=A', mergeBase).split('\n').filter(Boolean);
const added = rows.map((r) => r.split('\t')[1]).filter((f) => CHECKED.test(f) && !EXEMPT.test(f));

const lines = (f) => readFileSync(f, 'utf8').split('\n').length - (readFileSync(f, 'utf8').endsWith('\n') ? 1 : 0);
const over = added.map((f) => [f, lines(f)]).filter(([, n]) => n > MAX);

console.log(`check-new-files: ${added.length} file(s) added since ${base} (${mergeBase.slice(0, 7)}), limit ${MAX} lines`);
if (over.length) {
  console.error(
    `NEW FILES OVER ${MAX} LINES (split them; do not add them to size-budget.json):\n  - ${over.map(([f, n]) => `${f}: ${n}`).join('\n  - ')}`,
  );
  process.exit(1);
}
