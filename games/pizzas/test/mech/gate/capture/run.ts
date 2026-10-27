// Runner of the T1b capture: npx tsx games/pizzas/test/mech/gate/capture/run.ts <gate|beltReverse|ovenHeat> <outDir>   (PG_PORT / PG_CDP set the ports; it kills its Chrome when done)
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, connectCdp } from '../../../../../../tools/capture/browser';
import { PORT, sleep } from '../../../../../../tools/capture/config';

const mech = process.argv[2] ?? 'gate';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../../../..');
const shots: Record<string, [string, string][]> = {
  gate: [
    ['closed', 'closed'],
    ['open', 'open'],
  ],
  beltReverse: [
    ['warn', 'warn'],
    ['flipped', 'flipped'],
  ],
  ovenHeat: [['cold', 'cold']],
};

const server = await createServer({ root: here, server: { port: PORT, fs: { allow: [root] }, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const chrome = launchChrome();
try {
  const cdp = await connectCdp();
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?mech=${mech}` });
  for (let i = 0; i < 100 && !(await cdp.eval<boolean>('!!window.__cap && document.querySelector("canvas") !== null')); i++)
    await sleep(200);
  await sleep(800);
  for (const [name, cond] of shots[mech]!) {
    const at = await cdp.eval<number>(`window.__cap.until(${JSON.stringify(cond)})`);
    await sleep(400);
    console.log(mech, name, 'tick', at, JSON.stringify(await cdp.eval('window.__cap.info()')));
    await cdp.shot(`${mech}-${name}`);
  }
} finally {
  chrome.kill('SIGTERM');
  await server.close();
  setTimeout(() => process.exit(0), 500);
}
