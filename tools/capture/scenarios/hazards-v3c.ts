import path from 'node:path';
import { fixedMap } from '@pichi/game-pizzas/sim/maps';
import { sleep } from '../config';
import type { Ctx } from '../session';

// HAZARD_V3 mechanics (hazards-v3c), each on its own map, Hard, no events (needs DEV=1: the page's game state is reached through vite's module graph, `pz.game`).
// hz3-31: the broken bridge mended with B held, the raft with two aboard; hz3-15: the two caves, the rat in; hz3-22: both waves (warning + after); hz3-28: the Bandeja plate lost on oil.
const ROOT = path.resolve(import.meta.dirname, '../../..');
const PZ = `(await import('/screen/@fs${ROOT}/games/pizzas/screen/state.ts')).pz`;
const OIL = `(await import('/screen/@fs${ROOT}/games/pizzas/sim/mech/oil/state.ts'))`;
const G = (body: string) => `(async () => { const g = ${PZ}.game; ${body} })()`;

async function start({ cdp, bots, open, join, click, waitFor }: Ctx, id: string, n: number) {
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  const room = `H3C${id}`;
  await open(room);
  await join(room, n, fixedMap(id)!.rows);
  await click('[data-diff="hard"]');
  // the map may sit in one of the lobby's pages (Carta larga, Taller, Sin dinámica) or in the folded "Otros mapas": look in each
  const has = () => cdp.eval<boolean>(`!!document.querySelector('[data-map="${id}"]')`);
  for (const to of ['', 'series', 'taller', 'plain', 'others']) {
    if (to) {
      await click(`[data-map="group"][data-to="${to}"]`).catch(() => undefined);
      await sleep(250);
    }
    if (await has()) break;
    if (to && to !== 'others') await click('[data-map="group"][data-to="classic"]').catch(() => undefined);
  }
  await click(`[data-map="${id}"]`);
  await sleep(400);
  await click('#start');
  await sleep(1500);
  await key('Enter');
  await waitFor((s) => s.countdown <= 0 && s.time > 1500, 20_000);
  await waitFor((s) => s.time > 9000, 30_000); // the puesto pills are big for the first 8 s: let them go
  return bots.map((b) => b);
}
const place = (cdp: Ctx['cdp'], id: number, x: number, y: number, fx: number, fy: number) =>
  cdp.eval(`window.__pg.sab.place(${id}, ${x}, ${y}, ${fx}, ${fy})`);

export async function runHz3Bridge(ctx: Ctx) {
  const { cdp } = ctx;
  const bots = await start(ctx, '31', 3);
  await cdp.shot('hz3-31-0-before');
  // two bridge tiles at the west end of the row-1 bridge break (worn out, broken for a long while); chef 1 stands at (5, 1) facing it and holds B
  await cdp.eval(G(`const e = g.mech.ext.bridge; for (const x of [6, 7]) g.mech.bridge[16 + x] = { uses: 6, brokenUntil: e.tick + 100000 };`));
  place(cdp, bots[0]!.id, 5.5, 1.5, 1, 0);
  place(cdp, bots[1]!.id, 4.5, 2.5, 1, 0);
  place(cdp, bots[2]!.id, 9.5, 7.5, 0, -1);
  await sleep(500);
  await cdp.shot('hz3-31-1-broken');
  bots[0]!.startSending();
  bots[0]!.btn = 2;
  await sleep(700);
  await cdp.shot('hz3-31-2-mending-b-held');
  console.log('mend', await cdp.eval(G(`return g.mech.ext.bridge.work;`)));
  await sleep(800);
  await cdp.shot('hz3-31-2b-mending-later');
  bots[0]!.btn = 0;
  // the raft: hold it docked at the west shore, chefs 2 and 3 on it (it is a 1-tile lane), chef 1 stays ashore
  await cdp.eval(
    G(`for (let i = 0; i < 400 && !(g.mech.raft[0].pos === 0 && g.mech.raft[0].wait >= 30); i++) await new Promise((r) => setTimeout(r, 50)); g.mech.raft[0].wait = 1e6;`),
  );
  await sleep(300);
  await cdp.shot('hz3-31-3a-raft-docked');
  place(cdp, bots[0]!.id, 4.5, 4.5, 1, 0);
  place(cdp, bots[1]!.id, 6.3, 4.5, 1, 0);
  place(cdp, bots[2]!.id, 6.7, 4.5, 1, 0);
  await sleep(500);
  await cdp.shot('hz3-31-3-raft-two-aboard');
  console.log('raft', JSON.stringify(await cdp.eval(G(`return [g.mech.raft, g.mech.ext.rafts, g.grid[4][6], g.grid[4][7], [...g.players.values()].map((p) => [p.x, p.y, p.ghost])];`))));
  bots.splice(0).forEach((b) => b.close());
}

export async function runHz3Caves(ctx: Ctx) {
  const { cdp } = ctx;
  const bots = await start(ctx, '15', 3);
  await cdp.shot('hz3-15-1-caves');
  await cdp.eval(`window.__pg.kit.event('rat', 1500)`);
  await sleep(2800);
  await cdp.shot('hz3-15-2-rat-in');
  await sleep(2500);
  await cdp.shot('hz3-15-3-rat-later');
  bots.splice(0).forEach((b) => b.close());
}

export async function runHz3Waves(ctx: Ctx) {
  const { cdp } = ctx;
  const bots = await start(ctx, '22', 4);
  await cdp.shot('hz3-22-0-start');
  const setTick = (t: number) => cdp.eval(G(`g.mech.ext.mutation.tick = ${t};`));
  await setTick(3600 - 180 - 1);
  await sleep(1300);
  await cdp.shot('hz3-22-1-wave1-warn');
  await sleep(3200);
  await cdp.shot('hz3-22-2-wave1-after');
  await setTick(7200 - 180 - 1);
  await sleep(1300);
  await cdp.shot('hz3-22-3-wave2-warn');
  await sleep(3200);
  await cdp.shot('hz3-22-4-wave2-after');
  bots.splice(0).forEach((b) => b.close());
}

export async function runHz3Tray(ctx: Ctx) {
  const { cdp } = ctx;
  const bots = await start(ctx, '28', 5);
  const id = bots[0]!.id;
  // an open Bandeja order, chef 1 carries a plate and walks east onto an oil tile at (3, 5)
  await cdp.eval(
    G(`const o = ${OIL}; o.setTile(g, 5 * 16 + 3, o.OIL, 0);
       g.teams[0].orders.push({ id: 900, expiresAt: 1e9, warned: false, recipe: 'bandeja', parts: ['marinara', 'marinara', 'marinara'] });`),
  );
  await cdp.eval(`window.__pg.kit.item(${id}, 'dish')`);
  place(cdp, id, 2.2, 5.5, 1, 0);
  await sleep(300);
  await cdp.shot('hz3-28-1-oil-carrying');
  bots[0]!.startSending();
  bots[0]!.vec = { x: 1, y: 0 };
  for (let i = 0; i < 12; i++) {
    await sleep(120);
    if (!(await cdp.eval<boolean>(`!!window.__pg.snapshot().players.find((p) => p.id === ${id}).item`))) break;
  }
  bots[0]!.vec = { x: 0, y: 0 };
  await cdp.shot('hz3-28-2-pizza-lost');
  await sleep(300);
  await cdp.shot('hz3-28-2b-pizza-lost-later');
  bots.splice(0).forEach((b) => b.close());
}
