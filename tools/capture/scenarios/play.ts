import { fixedMap } from '@pichi/game-pizzas/sim/maps';
import { sleep } from '../config';
import type { Ctx } from '../session';

export async function runLobby({ cdp, bots, open, join }: Ctx) {
  await open('LOBY');
  await join('LOBY', 8, fixedMap('1')!.rows);
  await sleep(1200);
  await cdp.shot('lobby');
  // nothing in the map grid may spill out of its card (a subtitle too long for its card, as "mecánicas nuevas" once did)
  const spill = await cdp.eval<string[]>(
    `[...document.querySelectorAll('#maps .mc')].flatMap((c) => { const r = c.getBoundingClientRect(); return [...c.querySelectorAll('*')].filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.right > r.right + 0.5 || b.bottom > r.bottom + 0.5 || e.scrollWidth > e.clientWidth + 1); }).map((e) => c.textContent.trim().slice(0, 24) + ' > ' + e.className); })`,
  );
  if (spill.length) throw new Error(`lobby map cards overflow: ${spill.join(' | ')}`);
  bots.splice(0).forEach((b) => b.close());
}

// A map outside the draw (as 1) lives on its group's page of the lobby grid, not on the first one: go through the group cards until its card shows up.
const pickMap = async ({ click, cdp }: Ctx, id: string) => {
  const has = (sel: string) => cdp.eval<boolean>(`!!document.querySelector(${JSON.stringify(sel)})`);
  for (const to of [null, 'plain', 'taller', 'series']) {
    if (to && !(await has(`[data-map="group"][data-to="${to}"]`))) continue;
    if (to) {
      await click(`[data-map="group"][data-to="${to}"]`);
      await sleep(300);
    }
    if (await has(`[data-map="${id}"]`)) return click(`[data-map="${id}"]`);
    if (to) await click('[data-map="group"][data-to="classic"]'); // back to the first page for the next group
  }
  throw new Error(`capture: no map card ${id} on any page of the lobby grid`);
};

const play = async (c: Ctx, mapId: string, n: number, tag: string, results: boolean) => {
  const { cdp, bots, timers, open, join, click, snap, waitFor } = c;
  const room = `G${mapId}${tag}`.toUpperCase().slice(0, 4);
  await open(room);
  await join(room, n, fixedMap(mapId)!.rows);
  await pickMap(c, mapId);
  await click('[data-diff="easy"]');
  await sleep(300);
  await click('#start');
  await sleep(1700);
  await cdp.shot(`game-map${mapId}${n > 4 ? '-8chefs' : ''}-countdown`);
  if (n > 4) {
    await waitFor((s) => s.time > 1700, 10_000);
    await cdp.shot('game-8chefs-idle');
  }
  bots.forEach((b) => b.startSending());
  timers.push(
    setInterval(async () => {
      try {
        const s = await snap();
        bots.forEach((b) => b.decide(s));
      } catch {
        /* page navigating */
      }
    }, 100),
  );
  await waitFor((s) => s.countdown <= 0 && s.time > 0, 8000);
  const good = await waitFor(
    (s) =>
      s.players.some((p) => p.cutting) &&
      s.stations.some((x) => x.kind === 'pot' && (x.inputs.length >= 2 || x.done)) &&
      s.orders.length >= 1,
    Number(process.env.WAIT_MS ?? 90_000),
  );
  console.log(`map ${mapId} scene ready:`, !!good, good ? `score ${good.score}` : '');
  await cdp.shot(`game-map${mapId}${n > 4 ? '-8chefs' : ''}`);
  if (results) {
    await waitFor((s) => s.score >= 60, 80_000);
    await cdp.shot(`game-map${mapId}-b`);
    await cdp.eval('window.__pg.fastForward(1200)');
    await sleep(1700);
    await cdp.shot('timeup');
    await sleep(5200);
    await cdp.shot('results');
  }
  timers.splice(0).forEach(clearInterval);
  bots.splice(0).forEach((b) => b.close());
};

// map 1 holds 2-4 chefs and the grid folds it away for 8; map 12 (5-8) is the 8-chef map
export const runCast = (c: Ctx) => play(c, '12', 8, 'c', false);

export async function runSolo({ timers, open, join }: Ctx) {
  await open('SOLO');
  await join('SOLO', 1, fixedMap('1')!.rows);
  timers.splice(0).forEach(clearInterval);
}

export async function runGame(c: Ctx) {
  await play(c, '1', 4, 'a', false);
  await play(c, '3', 4, 'b', false);
}

export const runResults = (c: Ctx) => play(c, '1', 4, 'r', true);
