// Codemod for the depcruise rule `public-api` (plan pichiclub-refactor, P1).
//
// Rewrites every production import that reaches into another package's internals (`@pichi/x/some/file`) to the index.ts of the folder that
// holds that file, and adds the missing named re-exports to that index.ts (creating it, and the package.json `exports` entry, when absent).
// Tests, harnesses and static assets (.html/.css) are out of the rule and are not touched.
//
//   npx tsx tools/codemods/public-api.ts            apply
//   npx tsx tools/codemods/public-api.ts --dry      only print the plan
//
// Imports that cannot be mapped mechanically (default import, side-effect-only import, unresolved) are listed under "MANUAL" and left alone.
// An index.ts that would exceed MAX_INDEX_LINES switches its biggest named re-exports to `export * from`, until it fits.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { type ExportDeclaration, type ImportDeclaration, Node, Project, type SourceFile } from 'ts-morph';

const ROOT = resolve(import.meta.dirname, '../..');
const DRY = process.argv.includes('--dry');
const MAX_INDEX_LINES = 40;
const TESTS = /(\.test\.ts$|\/test\/|\/harness\/)/;
const ASSET = /\.(html|css)(\?.*)?$/;
const PACKAGES = /^(platform\/[^/]+|games\/[^/]+|apps\/[^/]+|tools\/latency-report)\//;

type Pkg = { dir: string; name: string; exports: Record<string, string>; srcRoot: string };

function loadPackages(): Pkg[] {
  const out: Pkg[] = [];
  for (const parent of ['platform', 'games', 'apps']) {
    for (const d of readdirSync(join(ROOT, parent))) {
      const file = join(ROOT, parent, d, 'package.json');
      if (!existsSync(file)) continue;
      const json = JSON.parse(readFileSync(file, 'utf8'));
      const exp: Record<string, string> = json.exports ?? {};
      const wild = exp['./*'] ?? './*.ts';
      out.push({
        dir: `${parent}/${d}`,
        name: json.name,
        exports: exp,
        srcRoot: wild
          .replace(/^\.\//, '')
          .replace(/\*\.ts$/, '')
          .replace(/\/$/, ''),
      });
    }
  }
  const lr = JSON.parse(readFileSync(join(ROOT, 'tools/latency-report/package.json'), 'utf8'));
  out.push({ dir: 'tools/latency-report', name: lr.name, exports: lr.exports ?? {}, srcRoot: '' });
  return out;
}

const pkgs = loadPackages();
const pkgOf = (rel: string) => pkgs.find((p) => rel.startsWith(`${p.dir}/`));

/** Resolves a `@pichi/...` or relative specifier written in `fromRel` to a repo-relative file path, or null. */
function resolveSpec(spec: string, fromRel: string): string | null {
  const pathCands = (base: string) => [`${base}.ts`, join(base, 'index.ts'), base];
  if (spec.startsWith('.')) {
    const base = join(dirname(fromRel), spec);
    return pathCands(base).find((c) => existsSync(join(ROOT, c)) && /\.\w+$/.test(c)) ?? null;
  }
  const m = /^(@pichi\/[^/]+)(\/.*)?$/.exec(spec.replace(/\?.*$/, ''));
  if (!m) return null;
  const pkg = pkgs.find((p) => p.name === m[1]);
  if (!pkg) return null;
  const key = m[2] ? `.${m[2]}` : '.';
  const hit = pkg.exports[key];
  if (hit) return join(pkg.dir, hit);
  for (const [k, v] of Object.entries(pkg.exports)) {
    const star = k.indexOf('*');
    if (star < 0) continue;
    const pre = k.slice(0, star);
    const post = k.slice(star + 1);
    if (key.startsWith(pre) && key.endsWith(post) && key.length >= pre.length + post.length) {
      return join(pkg.dir, v.replace('*', key.slice(pre.length, key.length - post.length)));
    }
  }
  return null;
}

/** Package.json `exports` key under which the index.ts of `dirRel` is published (creates the entry when missing). */
function exportKeyFor(pkg: Pkg, dirRel: string, created: Map<string, Set<string>>): string {
  const indexRel = `./${relative(pkg.dir, join(dirRel, 'index.ts'))}`;
  for (const [k, v] of Object.entries(pkg.exports)) if (v === indexRel) return k;
  const sub = relative(join(pkg.dir, pkg.srcRoot), dirRel);
  // `./menu` would shadow the wildcard entry for src/menu.ts, so a folder next to a same-named file is published as `./menu/index`
  const shadows = sub !== '' && existsSync(join(ROOT, pkg.dir, pkg.srcRoot, `${sub}.ts`));
  const key = sub === '' ? '.' : shadows ? `./${sub}/index` : `./${sub}`;
  pkg.exports[key] = indexRel;
  if (!created.has(pkg.dir)) created.set(pkg.dir, new Set());
  created.get(pkg.dir)?.add(key);
  return key;
}

const specFor = (pkg: Pkg, key: string) => (key === '.' ? pkg.name : `${pkg.name}/${key.slice(2)}`);

type Need = { names: Map<string, boolean>; star: boolean }; // names: name -> isType
const barrels = new Map<string, Map<string, Need>>(); // barrel rel path -> module rel path -> need
const manual: string[] = [];
const rewrites: { file: string; from: string; to: string }[] = [];

const project = new Project({ tsConfigFilePath: join(ROOT, 'tsconfig.base.json'), skipAddingFilesFromTsConfig: true });
for (const top of ['platform', 'games', 'apps', 'tools/latency-report']) {
  project.addSourceFilesAtPaths([`${join(ROOT, top)}/**/*.ts`, `!${join(ROOT, top)}/**/node_modules/**`, `!${join(ROOT, top)}/**/dist/**`]);
}

const isTypeDecl = (sf: SourceFile | undefined, name: string): boolean | undefined => {
  if (!sf) return undefined;
  const decls = sf.getExportedDeclarations().get(name);
  if (!decls || decls.length === 0) return undefined;
  return decls.every((d) => Node.isInterfaceDeclaration(d) || Node.isTypeAliasDeclaration(d));
};

const created = new Map<string, Set<string>>();
const touched = new Set<string>();
const decisions: { decl: ImportDeclaration | ExportDeclaration; file: SourceFile; spec: string }[] = [];

for (const sf of project.getSourceFiles()) {
  const rel = relative(ROOT, sf.getFilePath());
  if (TESTS.test(rel) || !PACKAGES.test(rel)) continue;
  const mine = pkgOf(rel);
  if (!mine) continue;
  for (const decl of [...sf.getImportDeclarations(), ...sf.getExportDeclarations()]) {
    const spec = decl.getModuleSpecifierValue();
    if (!spec) continue;
    if (spec.startsWith('.') && !spec.includes('..')) continue;
    const target = resolveSpec(spec, rel);
    if (!target || ASSET.test(spec) || ASSET.test(target)) continue;
    const theirs = pkgOf(target);
    if (!theirs || theirs === mine || /(^|\/)index\.ts$/.test(target)) continue;
    const where = `${rel}:${decl.getStartLineNumber()}`;
    const targetFile = project.getSourceFile(join(ROOT, target));
    const tdir = dirname(target);
    const barrel = join(tdir, 'index.ts');
    const need = barrels.get(barrel) ?? new Map<string, Need>();
    barrels.set(barrel, need);
    const modRel = `./${relative(tdir, target).replace(/\.ts$/, '')}`;
    const n = need.get(modRel) ?? { names: new Map<string, boolean>(), star: false };
    need.set(modRel, n);
    if (Node.isImportDeclaration(decl)) {
      if (decl.getDefaultImport()) {
        manual.push(`${where} default import of ${spec}`);
        continue;
      }
      if (decl.getNamespaceImport()) n.star = true;
      else if (decl.getNamedImports().length === 0) {
        manual.push(`${where} side-effect import of ${spec}`);
        continue;
      }
      for (const ni of decl.getNamedImports()) {
        const nm = ni.getName();
        n.names.set(nm, isTypeDecl(targetFile, nm) ?? (decl.isTypeOnly() || ni.isTypeOnly()));
      }
    } else {
      if (decl.isNamespaceExport() || decl.getNamedExports().length === 0) n.star = true;
      for (const ne of decl.getNamedExports()) {
        const nm = ne.getName();
        n.names.set(nm, isTypeDecl(targetFile, nm) ?? (decl.isTypeOnly() || ne.isTypeOnly()));
      }
    }
    const key = exportKeyFor(theirs, tdir, created);
    const next = specFor(theirs, key);
    decisions.push({ decl, file: sf, spec: next });
    rewrites.push({ file: rel, from: spec, to: next });
  }
}

console.log(
  `rewrites: ${rewrites.length} in ${new Set(rewrites.map((r) => r.file)).size} files; barrels: ${barrels.size}; new export keys: ${[...created].map(([p, k]) => `${p}:${[...k].join(',')}`).join(' ')}`,
);
if (manual.length) console.log(`MANUAL (${manual.length}):\n${manual.join('\n')}`);
if (DRY) process.exit(0);

// 1. rewrite consumers
for (const { decl, file, spec } of decisions) {
  decl.setModuleSpecifier(spec);
  touched.add(file.getFilePath());
}
// merge import declarations that now share the same module specifier
for (const f of new Set(decisions.map((d) => d.file))) {
  const seen = new Map<string, ImportDeclaration>();
  for (const imp of f.getImportDeclarations()) {
    if (imp.getDefaultImport() || imp.getNamespaceImport() || imp.getNamedImports().length === 0) continue;
    const k = `${imp.getModuleSpecifierValue()}|${imp.isTypeOnly()}`;
    const first = seen.get(k);
    if (!first) {
      seen.set(k, imp);
      continue;
    }
    const have = new Set(first.getNamedImports().map((x) => x.getText()));
    for (const ni of imp.getNamedImports()) if (!have.has(ni.getText())) first.addNamedImport(ni.getStructure());
    imp.remove();
  }
}

// 2. barrels
for (const [barrelRel, mods] of barrels) {
  const abs = join(ROOT, barrelRel);
  const sf = project.getSourceFile(abs) ?? project.createSourceFile(abs, '', { overwrite: false });
  const existing = new Map<string, ExportDeclaration[]>();
  for (const ed of sf.getExportDeclarations()) {
    const m = ed.getModuleSpecifierValue();
    if (m) existing.set(m, [...(existing.get(m) ?? []), ed]);
  }
  for (const [mod, need] of mods) {
    const eds = existing.get(mod) ?? [];
    if (eds.some((e) => e.isNamespaceExport() || (e.getNamedExports().length === 0 && !e.getNamespaceExport()))) continue; // already `export *`
    if (need.star) {
      sf.addExportDeclaration({ moduleSpecifier: mod });
      continue;
    }
    const have = new Set(eds.flatMap((e) => e.getNamedExports().map((x) => x.getAliasNode()?.getText() ?? x.getName())));
    const missing = [...need.names].filter(([nm]) => !have.has(nm));
    if (missing.length === 0) continue;
    const value = missing.filter(([, t]) => !t).map(([nm]) => nm);
    const types = missing.filter(([, t]) => t).map(([nm]) => nm);
    const target = eds.find((e) => !e.isTypeOnly() && e.getNamedExports().length > 0);
    if (value.length || types.length) {
      if (target) {
        for (const nm of value) target.addNamedExport({ name: nm });
        for (const nm of types) target.addNamedExport({ name: nm, isTypeOnly: true });
      } else {
        sf.addExportDeclaration({
          moduleSpecifier: mod,
          namedExports: [...value.map((nm) => ({ name: nm })), ...types.map((nm) => ({ name: nm, isTypeOnly: true }))],
        });
      }
    }
  }
  touched.add(abs);
}

project.saveSync();

// 3. format, then shrink over-long indexes to `export *`
const format = (files: string[]) => {
  for (let i = 0; i < files.length; i += 100)
    spawnSync('npx', ['biome', 'format', '--write', ...files.slice(i, i + 100)], { cwd: ROOT, stdio: 'ignore' });
};
format([...touched]);
const lines = (f: string) =>
  readFileSync(f, 'utf8')
    .split('\n')
    .filter((l, i, a) => i < a.length - 1 || l !== '').length;
const starred: string[] = [];
for (const barrelRel of barrels.keys()) {
  const abs = join(ROOT, barrelRel);
  while (lines(abs) > MAX_INDEX_LINES) {
    const sf = project.addSourceFileAtPath(abs);
    sf.refreshFromFileSystemSync();
    const named = sf
      .getExportDeclarations()
      .filter((e) => !e.isNamespaceExport() && e.getNamedExports().length > 0 && e.getModuleSpecifierValue());
    if (named.length === 0) break;
    const biggest = named.reduce((a, b) => (b.getNamedExports().length > a.getNamedExports().length ? b : a));
    starred.push(`${barrelRel} <- ${biggest.getModuleSpecifierValue()} (${biggest.getNamedExports().length} names)`);
    const mod = biggest.getModuleSpecifierValue() as string;
    biggest.replaceWithText(`export * from '${mod}';`);
    sf.saveSync();
    format([abs]);
  }
}
if (starred.length) console.log(`export * fallback (${starred.length}):\n${starred.join('\n')}`);

// 4. package.json exports
for (const [dir, keys] of created) {
  const file = join(ROOT, dir, 'package.json');
  const json = JSON.parse(readFileSync(file, 'utf8'));
  const pkg = pkgs.find((p) => p.dir === dir) as Pkg;
  const old: Record<string, string> = json.exports ?? {};
  const added = [...keys].map((k) => [k, pkg.exports[k]] as const);
  const entries = Object.entries(old);
  const firstWild = entries.findIndex(([k]) => k.includes('*'));
  const at = firstWild < 0 ? entries.length : firstWild;
  json.exports = Object.fromEntries([...entries.slice(0, at), ...added, ...entries.slice(at)]);
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}
console.log('done');
