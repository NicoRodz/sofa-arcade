// Codemod for folder moves (plan pichiclub-refactor, P2): `git mv` files and rewrite every module specifier that points at a moved file.
//
//   npx tsx tools/codemods/move-files.ts <plan.json>            apply
//   npx tsx tools/codemods/move-files.ts <plan.json> --dry      only print the plan
//
// plan.json: { "moves": [ { "from": "games/pizzas/sim/score.ts", "to": "games/pizzas/sim/scoring" } ] }
//   `to` is the destination folder (the file keeps its name). The sibling tests of a moved file travel with it: `<stem>.test.ts` and `<stem>.*.test.ts`.
// Rewrites: relative specifiers (kept relative, recomputed for both ends), `@pichi/<pkg>/<path>` wildcard exports (path updated), import / export /
// dynamic import / require / vi.mock first argument. It also re-keys size-budget.json `files` and updates the values of scripts/moves.json `files`
// (new entries for moved tests are added there so baseline:check can translate their paths). Logic is never touched.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { Node, Project, SyntaxKind, type StringLiteral } from 'ts-morph';

const ROOT = resolve(import.meta.dirname, '../..');
const planFile = process.argv[2];
const DRY = process.argv.includes('--dry');
if (!planFile) throw new Error('usage: move-files.ts <plan.json> [--dry]');
const plan: { moves: { from: string; to: string }[] } = JSON.parse(readFileSync(resolve(planFile), 'utf8'));

type Pkg = { dir: string; name: string; exports: Record<string, string> };
const pkgs: Pkg[] = [];
for (const parent of ['platform', 'games', 'apps']) {
  for (const d of readdirSync(join(ROOT, parent))) {
    const file = join(ROOT, parent, d, 'package.json');
    if (!existsSync(file)) continue;
    const json = JSON.parse(readFileSync(file, 'utf8'));
    pkgs.push({ dir: `${parent}/${d}`, name: json.name, exports: json.exports ?? {} });
  }
}
const pkgOf = (rel: string) => pkgs.find((p) => rel.startsWith(`${p.dir}/`));

// ---- the move map (old repo-relative path -> new), tests included
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
  .trim()
  .split('\n');
const trackedSet = new Set(tracked);
const moved = new Map<string, string>();
for (const { from, to } of plan.moves) {
  if (!trackedSet.has(from)) throw new Error(`not tracked: ${from}`);
  const dir = dirname(from);
  const stem = basename(from).replace(/\.ts$/, '');
  const group = [
    from,
    ...tracked.filter(
      (f) => dirname(f) === dir && (f === `${dir}/${stem}.test.ts` || (f.startsWith(`${dir}/${stem}.`) && f.endsWith('.test.ts'))),
    ),
  ];
  for (const f of new Set(group)) {
    const dest = join(to, basename(f));
    if (trackedSet.has(dest) || [...moved.values()].includes(dest)) throw new Error(`destination exists: ${dest}`);
    moved.set(f, dest);
  }
}
const newPath = (p: string) => moved.get(p) ?? p;

// ---- resolve a specifier (written in `fromRel`) to the repo-relative file it points at
type Hit = { target: string; via: 'relative' | 'wildcard' | 'exact'; pkg?: Pkg; key?: string };
function resolveSpec(spec: string, fromRel: string): Hit | null {
  const bare = spec.replace(/\?.*$/, '');
  const cands = (base: string) => [`${base}.ts`, join(base, 'index.ts'), base];
  if (bare.startsWith('.')) {
    const hit = cands(join(dirname(fromRel), bare)).find((c) => trackedSet.has(c));
    return hit ? { target: hit, via: 'relative' } : null;
  }
  const m = /^(@pichi\/[^/]+)(\/.*)?$/.exec(bare);
  if (!m) return null;
  const pkg = pkgs.find((p) => p.name === m[1]);
  if (!pkg) return null;
  const key = m[2] ? `.${m[2]}` : '.';
  if (pkg.exports[key]) return { target: join(pkg.dir, pkg.exports[key]), via: 'exact', pkg, key };
  for (const [k, v] of Object.entries(pkg.exports)) {
    const star = k.indexOf('*');
    if (star < 0) continue;
    const pre = k.slice(0, star);
    const post = k.slice(star + 1);
    if (key.startsWith(pre) && key.endsWith(post) && key.length >= pre.length + post.length)
      return { target: join(pkg.dir, v.replace('*', key.slice(pre.length, key.length - post.length))), via: 'wildcard', pkg, key: k };
  }
  return null;
}

const project = new Project({ tsConfigFilePath: join(ROOT, 'tsconfig.base.json'), skipAddingFilesFromTsConfig: true });
for (const top of ['platform', 'games', 'apps', 'tools', 'scripts', 'vitest.config.ts', 'vitest.shared.ts', 'vitest.setup.ts']) {
  const p = join(ROOT, top);
  if (top.endsWith('.ts')) project.addSourceFileAtPath(p);
  else project.addSourceFilesAtPaths([`${p}/**/*.ts`, `!${p}/**/node_modules/**`, `!${p}/**/dist/**`]);
}

const literals = (sf: ReturnType<Project['getSourceFiles']>[number]): StringLiteral[] => {
  const out: StringLiteral[] = [];
  for (const d of sf.getImportDeclarations()) {
    const l = d.getModuleSpecifier();
    if (Node.isStringLiteral(l)) out.push(l);
  }
  for (const d of sf.getExportDeclarations()) {
    const l = d.getModuleSpecifier();
    if (l && Node.isStringLiteral(l)) out.push(l);
  }
  for (const c of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = c.getExpression().getText();
    const first = c.getArguments()[0];
    if (!first || !Node.isStringLiteral(first)) continue;
    if (
      c.getExpression().getKind() === SyntaxKind.ImportKeyword ||
      callee === 'require' ||
      /^vi\.(mock|doMock|importActual|importMock|unmock)$/.test(callee)
    )
      out.push(first);
  }
  return out;
};

const rewrites: string[] = [];
const manual: string[] = [];
for (const sf of project.getSourceFiles()) {
  const fromRel = relative(ROOT, sf.getFilePath());
  const fromNew = newPath(fromRel);
  for (const lit of literals(sf)) {
    const spec = lit.getLiteralValue();
    const hit = resolveSpec(spec, fromRel);
    if (!hit) continue;
    const toNew = newPath(hit.target);
    if (hit.via === 'relative') {
      if (fromNew === fromRel && toNew === hit.target) continue;
      const suffix = /\?.*$/.exec(spec)?.[0] ?? '';
      const bare = spec.replace(/\?.*$/, '');
      const keepExt = /\.\w+$/.test(bare) && !/\.ts$/.test(bare) ? true : /\.ts$/.test(bare);
      let rel = relative(dirname(fromNew), toNew);
      const isIndexSpec = basename(hit.target) === 'index.ts' && !/index(\.ts)?$/.test(bare);
      if (isIndexSpec) rel = relative(dirname(fromNew), dirname(toNew));
      else if (!keepExt) rel = rel.replace(/\.ts$/, '');
      if (rel === '') rel = '.';
      if (!rel.startsWith('.')) rel = `./${rel}`;
      rewrites.push(`${fromRel}: ${spec} -> ${rel}${suffix}`);
      lit.setLiteralValue(rel + suffix);
    } else {
      if (toNew === hit.target) continue;
      const pkg = hit.pkg as Pkg;
      if (hit.via === 'exact' || pkgOf(toNew) !== pkg) {
        manual.push(`${fromRel}: ${spec} (exports entry ${hit.key} points at a moved file)`);
        continue;
      }
      const wild = pkg.exports[hit.key as string] as string;
      const keyPre = (hit.key as string).slice(0, (hit.key as string).indexOf('*'));
      const valPre = wild.slice(0, wild.indexOf('*'));
      const valPost = wild.slice(wild.indexOf('*') + 1);
      const inner = relative(pkg.dir, toNew);
      const stripped =
        inner.startsWith(valPre.replace(/^\.\//, '')) && inner.endsWith(valPost)
          ? inner.slice(valPre.replace(/^\.\//, '').length, inner.length - valPost.length)
          : null;
      if (stripped === null) {
        manual.push(`${fromRel}: ${spec} (new path ${toNew} does not fit ${wild})`);
        continue;
      }
      const next = `${pkg.name}/${keyPre.replace(/^\.\//, '')}${stripped}`;
      rewrites.push(`${fromRel}: ${spec} -> ${next}`);
      lit.setLiteralValue(next);
    }
  }
}

console.log(`${moved.size} files to move, ${rewrites.length} specifiers rewritten`);
if (manual.length) console.log(`MANUAL (${manual.length}):\n  ${manual.join('\n  ')}`);
if (DRY) {
  console.log([...moved].map(([a, b]) => `${a} -> ${b}`).join('\n'));
  process.exit(0);
}

project.saveSync();
const dirs = new Set([...moved.values()].map((d) => dirname(d)));
execFileSync('mkdir', ['-p', ...[...dirs].map((d) => join(ROOT, d))]);
for (const [a, b] of moved) execFileSync('git', ['mv', a, b], { cwd: ROOT });

// size-budget.json: re-key the file exceptions of moved files
const sbFile = join(ROOT, 'size-budget.json');
let sb = readFileSync(sbFile, 'utf8');
for (const [a, b] of moved) sb = sb.replace(`"${a}":`, `"${b}":`);
writeFileSync(sbFile, sb);

// scripts/moves.json: values that pointed at a moved file follow it; moved tests get their own entry (old path -> new path)
const mvFile = join(ROOT, 'scripts/moves.json');
const mv = JSON.parse(readFileSync(mvFile, 'utf8'));
const owner = new Map<string, string>();
for (const [k, v] of Object.entries(mv.files as Record<string, string>)) owner.set(v as string, k);
for (const [a, b] of moved) {
  const k = owner.get(a);
  if (k) mv.files[k] = b;
  else if (a.endsWith('.test.ts')) mv.files[a] = b;
}
writeFileSync(mvFile, `${JSON.stringify(mv, null, 1)}\n`);
console.log('done; run biome format on the changed files and typecheck');
