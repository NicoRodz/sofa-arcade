// Local visual regression of the Pizzas screen (Phaser + DOM overlays): 17 scenes (coop stations, oven, HUD; versus HUD; sabotage; end of round) shot in headless
// Chrome with a fake requestAnimationFrame / clock / Math.random (page-fakes.ts) and compared pixel by pixel with the PNGs in tools/visual/golden/pizzas.
//   npm run visual           compare (exit 1 on any differing pixel; diffs in tmp/visual-diff/<scene>.png = golden | actual | diff, differing pixels in magenta)
//   npm run visual:update    regenerate the goldens (then commit the PNGs and say in the PR which render rule moved and why)
// Tolerance: ZERO. Goldens are 1/4 resolution (480x270, 4x4 box mean: a moved edge or a changed fill still changes the mean) and depend on macOS system fonts
// (the screen uses ui-rounded / system-ui), so this is a local command: it is not part of test:slow nor of CI.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../apps/server/src/server';
import { type Browser, freePort, openBrowser } from './browser-session';
import { compare, decodePng, diffImage, downscale, encodePng } from './png';
import { GROUPS } from './pizzas-scenes';

const GOLDEN_DIR = fileURLToPath(new URL('./golden/pizzas/', import.meta.url));
const DIFF_DIR = fileURLToPath(new URL('../../tmp/visual-diff/', import.meta.url));
const SCALE = 4; // goldens are 1/4 of the 1920x1080 shot (480x270): 17 full-size PNGs weigh over 4 MB
const UPDATE = process.env.UPDATE_GOLDENS === '1';

async function main() {
  mkdirSync(GOLDEN_DIR, { recursive: true });
  const port = await freePort();
  const server = await startServer({ port, mode: 'dev' });
  const browsers: Browser[] = [];
  const shots = new Map<string, Buffer>();
  try {
    await Promise.all(
      GROUPS.map(async (group) => {
        const browser = await openBrowser();
        browsers.push(browser);
        await group.run(browser.page, port, async (name) => {
          shots.set(name, await browser.page.shot());
        });
        // the dev server runs without HMR, so Vite's client reports its own websocket as closed: not an app error
        const errors = browser.page.pageErrors.filter((e) => !e.includes('@vite/client'));
        if (errors.length) throw new Error(`${group.name}: page errors\n${errors.join('\n')}`);
      }),
    );
  } finally {
    await Promise.all(browsers.map((b) => b.stop()));
    await server.close();
  }

  const expected = GROUPS.flatMap((g) => g.scenes);
  const missing = expected.filter((n) => !shots.has(n));
  if (missing.length) throw new Error(`scenes not shot: ${missing.join(', ')}`);
  const failures: string[] = [];
  for (const name of expected) {
    const actual = downscale(decodePng(shots.get(name)!), SCALE);
    const file = `${GOLDEN_DIR}${name}.png`;
    if (UPDATE) {
      writeFileSync(file, encodePng(actual));
      continue;
    }
    if (!existsSync(file)) {
      failures.push(`${name}: no golden (run with UPDATE_GOLDENS=1)`);
      continue;
    }
    const golden = decodePng(readFileSync(file));
    const cmp = compare(golden, actual);
    if (cmp.differing === 0) continue;
    mkdirSync(DIFF_DIR, { recursive: true });
    writeFileSync(`${DIFF_DIR}${name}.png`, encodePng(diffImage(golden, actual, cmp.box)));
    writeFileSync(`${DIFF_DIR}${name}.actual.png`, encodePng(actual));
    const b = cmp.box!;
    failures.push(
      `${name}: ${cmp.differing} px differ (max channel delta ${cmp.maxDelta}) in box x ${b.x0}-${b.x1}, y ${b.y0}-${b.y1} -> tmp/visual-diff/${name}.png`,
    );
  }
  if (failures.length) {
    console.error(`visual: ${failures.length} scene(s) differ\n${failures.join('\n')}`);
    process.exit(1);
  }
  console.log(UPDATE ? `visual: ${expected.length} goldens written` : `visual: ${expected.length} scenes, 0 px of difference`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
