// Every file ADDED since the base has at most 300 lines: new code is born under the soft limit, so the size-budget exceptions only ever shrink.
// A rename (`R`, similarity >= 50 %) is not an addition, but it must not be a way around the limit either: a renamed file that ends over 300 lines
// AND longer than it was at the base fails. Usage: node scripts/check-new-files.mjs [base-ref]   (default origin/master; CI passes origin/<PR base>)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const MAX = 300;
const CHECKED = /\.(ts|tsx|mts|cts|js|mjs|cjs|css|html)$/;
// Concrete paths only, anchored at the repo root. A folder that merely CALLS itself `data/`, `docs/`, `levels/` or `fixtures/` is not exempt: code put
// there is still checked. Level data, golden fixtures and the docs tree are data, not code; build output and node_modules are not tracked.
const EXEMPT = /^(docs\/|games\/obstaculos\/levels\/|games\/pizzas\/test\/golden\/fixtures\/|(apps|platform|games)\/[^/]+\/dist\/|node_modules\/)/;
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 26 });
const countLines = (text) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

const base = process.argv[2] ?? 'origin/master';
const mergeBase = git('merge-base', base, 'HEAD').trim();
// -M: a high-similarity rename shows as `R<score>\told\tnew`; an added file as `A\tpath`.
const rows = git('diff', '--name-status', '-M', '--diff-filter=AR', mergeBase).split('\n').filter(Boolean).map((r) => r.split('\t'));
const checked = (f) => CHECKED.test(f) && !EXEMPT.test(f);

const added = rows.filter(([s, f]) => s === 'A' && checked(f)).map(([, f]) => f);
const renamed = rows.filter(([s, , f]) => s.startsWith('R') && checked(f)).map(([, from, to]) => ({ from, to }));

const over = added.map((f) => ({ f, n: countLines(readFileSync(f, 'utf8')), why: '' })).filter(({ n }) => n > MAX);
for (const { from, to } of renamed) {
  const n = countLines(readFileSync(to, 'utf8'));
  const before = countLines(git('show', `${mergeBase}:${from}`));
  if (n > MAX && n > before) over.push({ f: to, n, why: ` (renamed from ${from}, which had ${before})` });
}

console.log(
  `check-new-files: ${added.length} file(s) added, ${renamed.length} renamed since ${base} (${mergeBase.slice(0, 7)}), limit ${MAX} lines`,
);
if (over.length) {
  console.error(
    `NEW FILES OVER ${MAX} LINES (split them; do not add them to size-budget.json):\n  - ${over.map(({ f, n, why }) => `${f}: ${n}${why}`).join('\n  - ')}`,
  );
  process.exit(1);
}
