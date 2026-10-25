// F3 codemod (plan reestructura-repo, section 6): moves files and rewrites imports; it never touches logic.
//   npm run move                 apply scripts/moves.json to the checkout (a branch off the pre-F3 tree works the same)
//   npm run move -- --dry-run    print what would happen, write nothing
// Steps: (1) map every tracked file old path -> new path (explicit `files`, else the longest `dirs` prefix, kebab-case names);
// (2) with ts-morph rewrite every module specifier (import/export/dynamic import/import type/vi.mock) that points at a moved
// file: same package -> relative path, other package -> `@pichi/<pkg>/<path>` (barrels in `barrels`); (3) `git mv` + write;
// (4) generate each package's package.json/tsconfig and the root workspaces/scripts and vitest.config.ts; (5) text `patches`
// for the tools that hardcode paths; (6) biome format of the files whose import lines got longer.
// Running it again on an already moved tree finds no old paths and exits 0.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, writeFileSync } from 'node:fs';
import { posix } from 'node:path';
import { Node, Project, SyntaxKind, type SourceFile } from 'ts-morph';

const ROOT = posix.resolve(import.meta.dirname, '..');
const DRY = process.argv.includes('--dry-run');

type Tsconfig = { dir: string; lib?: string[]; types: string[]; include: string[]; exclude?: string[] };
type Pkg = {
  name: string;
  relativeOnly?: boolean; // apps are not libraries: other code reaches them by relative path
  main?: string;
  src?: string;
  tsconfigs: Tsconfig[];
  scripts?: Record<string, string>;
  deps?: Record<string, string>;
  devDeps?: Record<string, string>;
};
type Cfg = {
  files: Record<string, string>;
  dirs: { from: string; to: string }[];
  roots: string[];
  barrels: Record<string, string>;
  create: Record<string, string>;
  packages: Record<string, Pkg>;
  external: Record<string, string>;
  rootPackage: { workspaces: string[]; scripts: Record<string, string> };
  vitest: { name: string; dirs: string[] }[];
  vitestSlowOnly: string[];
  overlay: Record<string, string>;
  patches: { file: string; find: string; replace: string }[];
};
const cfg: Cfg = JSON.parse(readFileSync(posix.join(ROOT, 'scripts/moves.json'), 'utf8'));

const sh = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
const kebab = (b: string) => b.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const kebabPath = (p: string) => {
  const m = /^([^.]+)(\..*)$/.exec(posix.basename(p));
  return posix.join(posix.dirname(p), m ? kebab(m[1]!) + m[2] : posix.basename(p));
};

// ---- (1) the map
const tracked = sh('git', ['ls-files']).trim().split('\n');
const dirsByLength = [...cfg.dirs].sort((a, b) => b.from.length - a.from.length);
const inRoots = (f: string) => cfg.roots.some((r) => f.startsWith(r));
const DELETE = 'DELETE';
const moves = new Map<string, string>();
const unmapped: string[] = [];
for (const f of tracked) {
  if (!inRoots(f)) continue;
  const explicit = cfg.files[f];
  if (explicit) moves.set(f, explicit);
  else {
    const d = dirsByLength.find((x) => f.startsWith(x.from));
    if (d) moves.set(f, kebabPath(d.to + f.slice(d.from.length)));
    else unmapped.push(f);
  }
}
if (unmapped.length) fail(`unmapped files under ${cfg.roots.join(', ')} (add them to scripts/moves.json):\n  ${unmapped.join('\n  ')}`);
if (moves.size === 0) {
  console.log('move: nothing to do (no tracked file under the old roots: already applied)');
  process.exit(0);
}
const dests = [...moves.values()].filter((d) => d !== DELETE);
const dup = dests.filter((d, i) => dests.indexOf(d) !== i);
if (dup.length) fail(`two files map to the same destination:\n  ${[...new Set(dup)].join('\n  ')}`);
const clash = dests.filter((d) => tracked.includes(d) && !moves.has(d));
if (clash.length) fail(`destination already exists and is not moving:\n  ${clash.join('\n  ')}`);
function fail(msg: string): never {
  console.error('move: ' + msg);
  process.exit(1);
}
const newOf = (p: string): string => {
  const m = moves.get(p);
  return m === undefined || m === DELETE ? p : m;
};

// ---- packages
const pkgRoots = Object.keys(cfg.packages).sort((a, b) => b.length - a.length);
const pkgOf = (p: string): string | null => pkgRoots.find((r) => p.startsWith(r + '/')) ?? null;
function packageSpec(target: string): string {
  const root = pkgOf(target)!;
  const pkg = cfg.packages[root]!;
  const src = pkg.src ?? '.';
  const base = src === '.' ? root : `${root}/${src}`;
  if (pkg.main && target === `${root}/${pkg.main}`) return pkg.name;
  const rel = posix.relative(base, target).replace(/\.ts$/, '');
  return `${pkg.name}/${rel.endsWith('/index') ? rel.slice(0, -6) : rel}`;
}

// ---- old specifier -> old file
const oldShared: Record<string, string> = JSON.parse(readFileSync(posix.join(ROOT, 'shared/package.json'), 'utf8')).exports ?? {};
const isFile = (p: string) => existsSync(posix.join(ROOT, p)) && tracked.includes(p);
function resolveOld(importer: string, spec: string): { file: string; dirStyle: boolean; js: boolean } | null {
  if (spec === '@party/shared' || spec.startsWith('@party/shared/')) {
    const key = spec === '@party/shared' ? '.' : './' + spec.slice('@party/shared/'.length);
    const v = oldShared[key];
    return v ? { file: posix.join('shared', v), dirStyle: false, js: false } : null;
  }
  if (!spec.startsWith('.')) return null;
  const js = /\.js$/.test(spec);
  const clean = js ? spec.slice(0, -3) : spec;
  const abs = posix.join(posix.dirname(importer), clean);
  for (const c of [abs, `${abs}.ts`, `${abs}/index.ts`]) {
    if (isFile(c)) return { file: c, dirStyle: c === `${abs}/index.ts`, js: js && c === `${abs}.ts` };
  }
  return null;
}

function newSpecifier(importerOld: string, spec: string): string | null {
  const r = resolveOld(importerOld, spec);
  if (!r) return null;
  const importerNew = newOf(importerOld);
  let targetNew = newOf(r.file);
  const pi = pkgOf(importerNew);
  const pt = pkgOf(targetNew);
  if (pi !== pt && cfg.barrels[targetNew]) targetNew = cfg.barrels[targetNew]!;
  const isTs = targetNew.endsWith('.ts');
  let out: string;
  if (isTs && pt && pi !== pt && !cfg.packages[pt]!.relativeOnly) out = packageSpec(targetNew);
  else {
    let t = isTs ? targetNew.slice(0, -3) : targetNew;
    if (isTs && r.dirStyle && t.endsWith('/index')) t = t.slice(0, -6);
    out =
      t === posix.dirname(importerNew) && !r.dirStyle ? `../${posix.basename(t)}` : posix.relative(posix.dirname(importerNew), t) || '.';
    if (!out.startsWith('.')) out = './' + out;
    if (r.js) out += '.js';
  }
  return out === spec ? null : out;
}

// ---- (2) rewrite with ts-morph
const project = new Project({ skipAddingFilesFromTsConfig: true, compilerOptions: { allowJs: false } });
for (const f of tracked) if (f.endsWith('.ts') && existsSync(posix.join(ROOT, f))) project.addSourceFileAtPath(posix.join(ROOT, f));
const rewritten = new Map<string, string>(); // old path -> new text
let nSpec = 0;
const VI = /^vi\.(mock|doMock|unmock|doUnmock|importActual|importMock)$/;
function specifierNodes(sf: SourceFile) {
  const out: Node[] = [];
  sf.forEachDescendant((n) => {
    if (Node.isImportDeclaration(n) || Node.isExportDeclaration(n)) {
      const s = n.getModuleSpecifier();
      if (s) out.push(s);
    } else if (Node.isCallExpression(n)) {
      const e = n.getExpression();
      const a = n.getArguments()[0];
      if (a && Node.isStringLiteral(a) && (e.getKind() === SyntaxKind.ImportKeyword || VI.test(e.getText()))) out.push(a);
    } else if (Node.isImportTypeNode(n)) {
      const a = n.getArgument();
      if (Node.isLiteralTypeNode(a) && Node.isStringLiteral(a.getLiteral())) out.push(a.getLiteral());
    }
  });
  return out;
}
for (const sf of project.getSourceFiles()) {
  const old = posix.relative(ROOT, sf.getFilePath());
  let changed = false;
  for (const node of specifierNodes(sf)) {
    if (!Node.isStringLiteral(node)) continue;
    const ns = newSpecifier(old, node.getLiteralValue());
    if (ns) {
      node.setLiteralValue(ns);
      changed = true;
      nSpec++;
    }
  }
  if (changed) rewritten.set(old, sf.getFullText());
}
const nMoves = [...moves.entries()].filter(([a, b]) => a !== b).length;
console.log(
  `move: ${nMoves} files to move, ${[...moves.values()].filter((d) => d === DELETE).length} to delete, ${nSpec} specifiers rewritten in ${rewritten.size} files`,
);
if (DRY) {
  for (const [a, b] of moves) if (a !== b) console.log(`  ${a} -> ${b}`);
  process.exit(0);
}

// ---- (3) git mv + write
const write = (p: string, text: string) => {
  mkdirSync(posix.dirname(posix.join(ROOT, p)), { recursive: true });
  writeFileSync(posix.join(ROOT, p), text);
};
const touched = new Set<string>();
for (const [a, b] of moves) {
  if (b === DELETE) sh('git', ['rm', '-q', '-f', a]);
  else if (a !== b) {
    mkdirSync(posix.dirname(posix.join(ROOT, b)), { recursive: true });
    sh('git', ['mv', a, b]);
  }
}
for (const [old, text] of rewritten) {
  const p = newOf(old);
  write(p, text);
  touched.add(p);
}
const pruneEmpty = (d: string) => {
  const abs = posix.join(ROOT, d);
  if (!existsSync(abs)) return;
  for (const e of readdirSync(abs, { withFileTypes: true })) if (e.isDirectory()) pruneEmpty(posix.join(d, e.name));
  if (readdirSync(abs).length === 0) rmdirSync(abs);
};
for (const r of cfg.roots) pruneEmpty(r.replace(/\/$/, ''));

// Old file paths named in comments and strings ("see screen/src/main.ts") follow their file; directories are left alone.
const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const movedFiles = [...moves.entries()]
  .filter(([a, b]) => b !== DELETE && a !== b && /\.[a-z]+$/.test(a))
  .sort((x, y) => y[0].length - x[0].length);
const mention = new RegExp(`(?<![\\w./@-])(${movedFiles.map(([a]) => escapeRe(a)).join('|')})(?![\\w-])`, 'g');
const newByOld = new Map(movedFiles);
for (const f of sh('git', ['ls-files']).trim().split('\n')) {
  if (!/\.(ts|mjs|html|css)$/.test(f) || /^(scripts|docs)\//.test(f)) continue;
  const text = readFileSync(posix.join(ROOT, f), 'utf8');
  const next = text.replace(mention, (m) => newByOld.get(m) ?? m);
  if (next !== text) {
    writeFileSync(posix.join(ROOT, f), next);
    touched.add(f);
  }
}

// ---- (4) new files, packages, root package.json, vitest.config.ts
for (const [p, text] of Object.entries(cfg.create)) write(p, text);
const json = (o: unknown) => JSON.stringify(o, null, 2) + '\n';
const allFiles = sh('git', ['ls-files', '--cached', '--others', '--exclude-standard']).trim().split('\n');
for (const [root, pkg] of Object.entries(cfg.packages)) {
  const src = pkg.src ?? '.';
  const base = src === '.' ? '.' : src;
  const exp: Record<string, string> = {};
  if (pkg.main) exp['.'] = `./${pkg.main}`;
  for (const f of allFiles.filter((x) => x.startsWith(root + '/') && /(^|\/)index\.ts$/.test(x))) {
    const rel = f.slice(root.length + 1);
    if (rel === pkg.main) continue;
    const dir = posix.relative(base, posix.dirname(rel));
    if (dir && !dir.startsWith('..')) exp['./' + dir] = './' + rel;
  }
  exp['./*'] = src === '.' ? './*.ts' : `./${src}/*.ts`;
  // dependencies: other @pichi packages and external libraries actually imported by the package's files
  const deps: Record<string, string> = { ...(pkg.deps ?? {}) };
  for (const f of allFiles.filter((x) => x.startsWith(root + '/') && x.endsWith('.ts'))) {
    const text = readFileSync(posix.join(ROOT, f), 'utf8');
    for (const m of text.matchAll(/(?:from|import\()\s*['"]([^'"./][^'"]*)['"]/g)) {
      const spec = m[1]!;
      const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!;
      if (name.startsWith('node:') || name === pkg.name) continue;
      if (name.startsWith('@pichi/')) deps[name] = '*';
      else if (cfg.external[name] && name !== 'vite' && name !== 'vitest') deps[name] = cfg.external[name]!;
    }
  }
  const sorted = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  const scripts: Record<string, string> = { ...(pkg.scripts ?? {}) };
  scripts.typecheck = pkg.tsconfigs.map((t) => `tsc -p ${t.dir}`).join(' && ');
  const out: Record<string, unknown> = { name: pkg.name, private: true, type: 'module' };
  if (!pkg.relativeOnly) out.exports = exp;
  out.scripts = scripts;
  if (Object.keys(deps).length) out.dependencies = sorted(deps);
  if (pkg.devDeps) out.devDependencies = pkg.devDeps;
  write(`${root}/package.json`, json(out));
  for (const t of pkg.tsconfigs) {
    const up = posix.relative(posix.join(root, t.dir), '.');
    const co: Record<string, unknown> = {};
    if (t.lib) co.lib = t.lib;
    co.types = t.types;
    const tc: Record<string, unknown> = { extends: `${up}/tsconfig.base.json`, compilerOptions: co, include: t.include };
    if (t.exclude) tc.exclude = t.exclude;
    write(posix.join(root, t.dir, 'tsconfig.json'), json(tc));
  }
}
const rootPkgPath = posix.join(ROOT, 'package.json');
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'));
rootPkg.workspaces = cfg.rootPackage.workspaces;
Object.assign(rootPkg.scripts, cfg.rootPackage.scripts);
writeFileSync(rootPkgPath, json(rootPkg));
for (const [dest, src] of Object.entries(cfg.overlay)) {
  write(dest, readFileSync(posix.join(ROOT, src), 'utf8'));
  touched.add(dest);
}
const projects = cfg.vitest.map((p) => `  ${JSON.stringify(p.name)}: ${JSON.stringify(p.dirs)},`).join('\n');
write(
  'vitest.config.ts',
  `import { defineConfig } from 'vitest/config';
import { packageProject, slowProject } from './vitest.shared.ts';

// Packages and where their tests live. \`npm test\` runs everything; \`test:fast\` skips \`slow\`. Generated by scripts/move.ts from scripts/moves.json.
const packages: Record<string, string[]> = {
${projects}
};
// Directories with slow tests only (a fast project of theirs would run 0 tests).
const slowOnly: string[] = ${JSON.stringify(cfg.vitestSlowOnly)};

export default defineConfig({
  test: {
    projects: [
      ...Object.entries(packages).map(([name, dirs]) => packageProject(name, dirs)),
      slowProject([...Object.values(packages).flat(), ...slowOnly]),
    ],
  },
});
`,
);

// ---- (5) text patches (idempotent: skipped when the replacement is already there)
for (const p of cfg.patches) {
  const abs = posix.join(ROOT, p.file);
  if (!existsSync(abs)) fail(`patch target missing: ${p.file}`);
  const text = readFileSync(abs, 'utf8');
  if (text.includes(p.find)) {
    writeFileSync(abs, text.split(p.find).join(p.replace));
    touched.add(p.file);
  } else if (!text.includes(p.replace)) fail(`patch does not apply to ${p.file}: ${p.find.slice(0, 80)}`);
}

// ---- (6) format what changed (long package specifiers can overflow the line width)
const ts = [...touched].filter((f) => /\.(ts|cjs|mjs)$/.test(f) && !/(^|\/)(golden|fixtures|levels|data)\//.test(f));
if (ts.length) execFileSync('npx', ['biome', 'format', '--write', ...ts], { cwd: ROOT, stdio: 'ignore' });
// ---- (7) size budget: the exceptions are keyed by path, so measure them again at the new paths
if (existsSync(posix.join(ROOT, 'size-budget.json')))
  execFileSync('npx', ['tsx', 'tools/meta/size-budget.ts', 'init'], { cwd: ROOT, stdio: 'inherit' });
console.log('move: done. Next: npm install (workspace links), npm run typecheck, npm run lint, npm run test:fast');
