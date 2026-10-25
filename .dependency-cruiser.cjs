// Dependency rules of the plan (reestructura-repo, section 5), adapted to TODAY's layout. All of them are "warn" until
// F6, which promotes them to "error" once the tree is the target one (platform/, games/<id>/, apps/).
//
// Today's map -> target names used in the plan:
//   apps      = the three monolithic entry points: screen/src/main.ts, controller/src/main.ts, server/src/main.ts
//   game      = shared/games/**, screen/src/games/** (Obstaculos)  [Pizzas is still flat: shared/*.ts, screen/src/art/**]
//   sim       = shared/** (pure simulation + protocol), except tests and shared/golden/ (recorders use node:fs)
//   platform  = everything else in shared/, screen/src, controller/src, server/src that is not a game or an app
// Run: npm run deps (prints warnings)   npm run deps:report (writes docs/refactor/depcruise-report.md)

const APPS = '^(screen|controller|server)/src/main\\.ts$';
const TESTS = '(\\.test\\.ts$|^[^/]+/test/|/harness/)';
const PACKAGES = '(shared|screen|controller|server|tools)';

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
      comment:
        'Platform code (shared core, screen/controller/server kits) must not import a game or an app. Today main.ts files and shared/games.ts still do.',
      severity: 'warn',
      from: {
        path: '^(shared|screen/src|controller/src|server/src)/',
        pathNot: [`(^|/)games/`, APPS, TESTS, '^shared/golden/', '^screen/src/art/'],
      },
      to: { path: ['(^|/)games/[^/]+/', APPS] },
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
      comment: 'shared/ (sim, protocol) stays free of DOM/Node/Phaser/ws/express and of the screen, controller and server packages.',
      severity: 'warn',
      from: { path: '^shared/', pathNot: [TESTS, '^shared/golden/'] },
      to: {
        path: ['^node_modules/(phaser|ws|express)/', '^(screen|controller|server)/'],
      },
    },
    {
      name: 'pure-sim-node-core',
      comment: 'Second half of pure-sim: no node:* / Node core modules in shared/.',
      severity: 'warn',
      from: { path: '^shared/', pathNot: [TESTS, '^shared/golden/'] },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'public-api',
      comment:
        'Between packages, import only a package entry point (index.ts). Today screen/controller/server use the subpath exports of @party/shared (shared/protocol.ts, shared/overcooked.ts, ...), so every one of those counts until F3/F4.',
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
      from: {
        path: '^(shared|screen/src|controller/src|server/src)/',
        pathNot: [TESTS, '^shared/golden/', '^screen/src/games/obstaculos/harness/'],
      },
      to: { path: ['\\.test\\.ts$', '^(server|controller|screen)/test/'] },
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
