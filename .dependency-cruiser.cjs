// Dependency rules of the plan (reestructura-repo, section 5) on the F3 tree: platform/{core,screen,controller,server}, games/<id>/, apps/<name>/.
// All of them are "warn" until F6, which promotes them to "error" once F4/F5 have cut the platform -> game imports that the mechanical move of F3
// left behind (see decisions.known-violations in scripts/moves.json and docs/refactor/depcruise-report.md).
//
//   apps     = apps/*/src/main.ts (the entry points; the only place that may compose games and platform)
//   game     = games/<id>/**
//   sim      = platform/core and the pure parts of a game (everything but screen/, controller/, server/ and test/)
//   platform = platform/**
// Run: npm run deps (prints warnings)   npm run deps:report (writes docs/refactor/depcruise-report.md)

const APPS = '^apps/[^/]+/src/main\\.ts$';
const TESTS = '(\\.test\\.ts$|/test/|/harness/)';
const PACKAGES = '(platform/[^/]+|games/[^/]+|apps/[^/]+|tools/latency-report)';
const UI = '(screen|controller|server)';
const SIM = '^(platform/core/|games/[^/]+/(?!screen/|controller/|server/|test/))';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-game',
      comment: 'games/X must not import games/Y (group $2 is the game id).',
      severity: 'warn',
      from: { path: '(^|/)games/([^/]+)/' },
      to: { path: '(^|/)games/([^/]+)/', pathNot: '(^|/)games/$2/' },
    },
    {
      name: 'platform-not-games',
      comment: 'platform/** must not import a game or an app. After the F3 move core, the kits and the registry still do (F4/F5 cut them).',
      severity: 'warn',
      from: { path: '^platform/', pathNot: [TESTS] },
      to: { path: ['^games/', '^apps/'] },
    },
    {
      name: 'only-apps-compose',
      comment: 'Nobody imports an app entry point (main.ts); apps only import.',
      severity: 'warn',
      from: {},
      to: { path: APPS },
    },
    {
      name: 'pure-sim',
      comment:
        'platform/core and the sim side of a game stay free of DOM/Node/Phaser/ws/express and of the screen, controller and server packages.',
      severity: 'warn',
      from: { path: SIM, pathNot: [TESTS, '^games/[^/]+/server/'] },
      to: {
        path: ['^node_modules/(phaser|ws|express)/', `^platform/${UI}/`, `^games/[^/]+/${UI}/`],
      },
    },
    {
      name: 'pure-sim-node-core',
      comment: 'Second half of pure-sim: no node:* / Node core modules in the sim side.',
      severity: 'warn',
      from: { path: SIM, pathNot: [TESTS, '^games/[^/]+/server/', '^games/pizzas/test/golden/'] },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'public-api',
      comment:
        'Between packages, import only a package entry point (index.ts). The F3 move keeps the per-file subpaths of the old @party/shared (file-level evaluation order), so every cross-package import of a file counts until F4/F5.',
      severity: 'warn',
      from: { path: `^${PACKAGES}/`, pathNot: [TESTS] },
      to: { path: `^(?!$1/)${PACKAGES}/`, pathNot: '(^|/)index\\.ts$' },
    },
    {
      name: 'no-circular',
      severity: 'warn',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-test-in-prod',
      comment: 'Production code must not import a test file or the test harness.',
      severity: 'warn',
      from: { path: '^(platform|games|apps)/', pathNot: [TESTS, '^games/obstaculos/screen/harness/'] },
      to: { path: ['\\.test\\.ts$', '^(games/[^/]+|apps/[^/]+)/test/'] },
    },
  ],
  options: {
    doNotFollow: { path: ['node_modules'] },
    exclude: { path: ['(^|/)(dist|\\.vitest|docs)/'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
