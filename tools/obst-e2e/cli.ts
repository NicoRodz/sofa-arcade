// End to end of "Obstaculos en cadena": the real server, the real screen in headless Chrome and scripted explorers that are real phones
// (they join by ws, send stick and button counters at 30 Hz, and read the world the way a person reads the screen: from the page).
// usage: npx tsx tools/obst-e2e.ts <play|soak|shots|fps|drop|switch|phone> [n=4] [outDir]     env: PORT (3700) PG_CDP_PORT (9444 + PORT % 50) MODE (free|chain) LEVEL (1) DIFF (normal) SOAK_S (300) LAG=1 (150 +- 60 ms, spikes to 370)
import type { ChildProcess } from 'node:child_process';
import { startServer } from '../../apps/server/src/server';
import { killTree } from '../kill-tree';
import { type Cdp, connectCdp, launchChrome } from './browser';
import { PORT, what } from './config';
import type { Phone } from './phone';
import { runDrop } from './scenarios/drop';
import { runPhone } from './scenarios/phone';
import { runPlay } from './scenarios/play';
import { runSoak } from './scenarios/soak';
import { runSwitch } from './scenarios/switch';
import { startRun } from './setup';

export async function main() {
  const srv = await startServer({ port: PORT, mode: 'static' });
  let chromeRef: ChildProcess | null = null;
  const dog = setTimeout(
    async () => {
      console.error('watchdog fired');
      if (chromeRef) await killTree(chromeRef, 700);
      process.exit(2);
    },
    Number(process.env.MAX_MS ?? 900_000),
  );
  const chrome = launchChrome();
  chromeRef = chrome;
  const phones: Phone[] = [];
  let cdpRef: Cdp | null = null;
  const timers: ReturnType<typeof setInterval>[] = [];
  let code = 0;
  try {
    const cdp = await connectCdp();
    cdpRef = cdp;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

    if (what === 'phone') {
      await runPhone({ cdp, code });
      return;
    }

    const c = await startRun(cdp, timers, phones);
    if (what === 'drop') await runDrop(c);
    if (what === 'switch') await runSwitch(c);
    if (what === 'play' || what === 'shots' || what === 'fps') await runPlay(c);
    if (what === 'soak') await runSoak(c);
    code = c.code;
    if (cdp.errors.length) console.log('PAGE ERRORS:', cdp.errors.slice(0, 8).join('\n'));
  } catch (e) {
    console.error('E2E FAILED', e);
    console.error('page errors so far:', cdpRef?.errors.slice(0, 6));
    code = 1;
  } finally {
    timers.forEach(clearInterval);
    phones.forEach((p) => p.close());
    await killTree(chrome, 700);
    clearTimeout(dog);
    await srv.close();
  }
  process.exit(code);
}
