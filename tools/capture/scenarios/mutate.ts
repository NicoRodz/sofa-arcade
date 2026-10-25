import { fixedMap } from '@pichi/game-pizzas/sim/maps';
import { sleep } from '../config';
import type { Ctx } from '../session';

// The kitchens that mutate (Normal turns the option on by itself): map 1 warning and after (ice); MUT_MAP=2 or 4 for the belts. The clock jumps to 1:26 of the match.
export async function runMutate({ cdp, open, join, click, waitFor }: Ctx) {
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  for (const map of [process.env.MUT_MAP ?? '1']) {
    const room = `MUT${map}`;
    await open(room);
    await join(room, 2, fixedMap(map)!.rows);
    await click('[data-diff="normal"]');
    await click(`[data-map="${map}"]`);
    await sleep(400);
    if (map === '1' || process.env.MUT_LOBBY) await cdp.shot('mut-0-lobby');
    if (process.env.MUT_LOBBY) return;
    await click('#start');
    await sleep(1500);
    await key('Enter');
    await waitFor((s) => s.countdown <= 0 && s.time > 1500, 20_000);
    await cdp.eval(`window.__pg.kit.setTime(86000)`);
    await sleep(1800);
    if (map === '1') await cdp.shot('mut-1-warn');
    await sleep(2600);
    await cdp.shot(`mut-2-map${map}-after`);
  }
}
