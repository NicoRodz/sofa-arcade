import { versusMap } from '@pichi/game-pizzas/sim/versus/maps';
import { sleep } from '../config';
import type { Ctx } from '../session';

// VERSUS_V3 (rat per kitchen + twin patch of ice), on the versus map `id`: the ice from tick 0, then both rats coming in, seeking and (later) leaving. Hard, events on.
export const runVersusV3 =
  (id: string) =>
  async ({ cdp, bots, open, join, click, waitFor }: Ctx) => {
    const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
    const room = `V3${id}`;
    await open(room);
    await join(room, 4, versusMap(id)!.rows);
    await click('[data-mode="versus"]');
    await click(`[data-map="${id}"]`);
    await click('[data-diff="hard"]');
    await sleep(500);
    await click('#start');
    await sleep(1500);
    await key('Enter');
    await waitFor((s) => s.countdown <= 0 && s.time > 1500, 20_000);
    await cdp.shot(`vsv3-${id}-1-ice`);
    await cdp.eval<any>(`window.__pg.kit.event('rat', 1500)`);
    await sleep(2600);
    await cdp.shot(`vsv3-${id}-2-rats-in`);
    await sleep(1800);
    await cdp.shot(`vsv3-${id}-3-rats-seek`);
    await sleep(2500);
    await cdp.shot(`vsv3-${id}-4-rats-later`);
    bots.splice(0).forEach((b) => b.close());
  };
