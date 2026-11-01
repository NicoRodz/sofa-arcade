// Boot smoke of the BUILT apps (npm run build first): serves apps/*/dist the way `npm start` does, opens /screen and /c in headless Chrome and fails on any
// uncaught page exception or when the page never finishes its composition root (window.__pg on the screen, window.__pad on the phone).
// PR #18 broke the compiled screen's startup and passed lint, typecheck and test:fast: nothing in them loads the bundle. This does.
//   npm run build && npm run smoke       (PG_PORT / PG_CDP pick the ports; CHROME_BIN the browser; CHROME_NO_SANDBOX=1 in CI)
import type { ChildProcess } from 'node:child_process';
import { startServer } from '../../apps/server/src/server';
import { killTree } from '../proc/kill-tree';
import { type Cdp, connectCdp, launchChrome } from './browser';
import { PORT, sleep } from './config';

const PAGES = [
  { path: '/screen/', ready: 'window.__pg', what: 'window.__pg (the screen composition root finished)' },
  { path: '/c/', ready: 'window.__pad', what: 'window.__pad (the phone composition root finished)' },
] as const;
const READY_MS = 15000;

async function check(cdp: Cdp, page: (typeof PAGES)[number]): Promise<string[]> {
  const before = cdp.pageErrors.length;
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}${page.path}` });
  let ready = false;
  for (let t = 0; t < READY_MS && !ready; t += 250) {
    await sleep(250);
    ready = await cdp.eval<boolean>(`typeof ${page.ready} !== 'undefined' && ${page.ready} !== null`).catch(() => false);
  }
  await sleep(500); // late exceptions (a first frame, the socket's first message)
  const problems = cdp.pageErrors.slice(before).map((e) => `${page.path}: PAGE ERROR ${e}`);
  if (!ready) problems.push(`${page.path}: ${page.what} is missing after ${READY_MS} ms`);
  return problems;
}

const server = await startServer({ port: PORT, mode: 'static' });
const chrome: ChildProcess = launchChrome();
let problems: string[] = [];
try {
  const cdp = await connectCdp();
  for (const page of PAGES) problems.push(...(await check(cdp, page)));
  cdp.close();
} catch (e) {
  problems = [...problems, `smoke harness failed: ${(e as Error).message}`];
} finally {
  await killTree(chrome);
  await server.close();
}
if (problems.length) {
  console.error(`BOOT SMOKE FAILED\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log(`boot smoke OK: ${PAGES.map((p) => p.path).join(' and ')} loaded without page errors and finished their composition root`);
process.exit(0);
