// Runner of the real-scene capture: npx tsx games/pizzas/test/mech/real-capture/run.ts <scenario> <outDir>   (PG_PORT / PG_CDP set the ports; Chrome is killed by process tree when done)
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, connectCdp } from '../../../../../tools/capture/browser';
import { PORT, sleep } from '../../../../../tools/capture/config';
import { killTree } from '../../../../../tools/proc/kill-tree';

const mech = process.argv[2] ?? 'oil';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../../..');
const shots: Record<string, string[]> = {
  oil: ['oil', 'fire', 'spray'],
  bridge: ['still', 'worn', 'broken'],
  raft: ['still', 'mid'],
  oneWay: ['still'],
  mutation: ['still', 'warn', 'after'],
  gate: ['still'],
  kneader: ['still'],
  woodOven: ['still'],
};

const server = await createServer({ root: here, server: { port: PORT, fs: { allow: [root] }, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const chrome = launchChrome();
try {
  const cdp = await connectCdp();
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?mech=${mech}` });
  for (let i = 0; i < 150 && !(await cdp.eval<boolean>('!!window.__cap && window.__cap.ready()')); i++) await sleep(200);
  await sleep(800);
  for (const name of shots[mech]!) {
    await cdp.eval(`window.__cap.act(${JSON.stringify(name)})`);
    await sleep(500);
    console.log(mech, name, JSON.stringify(await cdp.eval('window.__cap.info()')));
    await cdp.shot(`${mech}-${name}`);
  }
} finally {
  await killTree(chrome);
  await server.close();
  setTimeout(() => process.exit(0), 500);
}
