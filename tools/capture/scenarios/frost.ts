import { fixedMap } from '@pichi/game-pizzas/sim/maps';
import { sleep } from '../config';
import type { Ctx } from '../session';

// The frost event on map 1, Normal, 2 chefs: the banner, then the whole kitchen frozen (window.__pg.kit.event forces the kind and the instant).
export async function runFrost({ cdp, open, join, click, snap, waitFor }: Ctx) {
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  await open('FROS');
  await join('FROS', 2, fixedMap('1')!.rows);
  await click('[data-diff="normal"]');
  await click('[data-map="1"]');
  await click('#evs [data-ev="true"]');
  await sleep(300);
  await click('#start');
  await sleep(1500);
  await key('Enter');
  await waitFor((s) => s.countdown <= 0 && s.time > 1500, 20_000);
  await cdp.eval(`window.__pg.kit.event('frost')`);
  await sleep(1300);
  await cdp.shot('frost-1-announce');
  await sleep(3500);
  await cdp.shot('frost-2-on');
  console.log('mid', JSON.stringify(((await snap()) as any).mid));
}
