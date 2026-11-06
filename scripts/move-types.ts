// Shape of scripts/moves.json (the F3 codemod config).
export type Tsconfig = { dir: string; lib?: string[]; types: string[]; include: string[]; exclude?: string[] };
export type Pkg = {
  name: string;
  relativeOnly?: boolean; // apps are not libraries: other code reaches them by relative path
  main?: string;
  src?: string;
  tsconfigs: Tsconfig[];
  scripts?: Record<string, string>;
  deps?: Record<string, string>;
  devDeps?: Record<string, string>;
};
export type Cfg = {
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
