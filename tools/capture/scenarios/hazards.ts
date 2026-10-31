import { fireIsBig } from '@pichi/game-pizzas/sim/hazards/hazard-v2';
import { fixedMap } from '@pichi/game-pizzas/sim/maps';
import path from 'node:path';
import { sleep } from '../config';
import type { Ctx } from '../session';

// Hazards tanda 1, the feedback of each hazard (needs DEV=1: the page's game state is reached through vite's module graph, `pz.game`, with no hook of its own).
// hz-fire: a big fire with no chef, one chef (it only contains) and two (the bar moves); hz-rat: the dodge and the panting; hz-ice: a chef sliding on the frost.
const PZ = `(await import('/@fs${path.resolve(import.meta.dirname, '../../..')}/games/pizzas/screen/state.ts')).pz`;

async function start({ cdp, bots, open, join, click, waitFor }: Ctx, room: string, events: boolean, chefs = 2) {
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  await open(room);
  await join(room, chefs, fixedMap('1')!.rows);
  await click('[data-diff="normal"]');
  await click('[data-map="1"]');
  if (events) await click('#evs [data-ev="true"]');
  await sleep(400);
  await click('#start');
  await sleep(1500);
  await key('Enter');
  await waitFor((s) => s.countdown <= 0 && s.time > 1500, 20_000);
  return bots.map((b) => b.id);
}

export async function runHzFire(ctx: Ctx) {
  const { cdp, bots, snap } = ctx;
  const ids = await start(ctx, 'HZFI', false);
  const kit = (expr: string) => cdp.eval<any>(`window.__pg.kit.${expr}`);
  const ovens = (await kit('counters()')).filter((c: any) => c.kind === 'pot');
  const o1 = ovens[0].i;
  // a seed whose first fire is big (the hash is pure: the k-th fire of the kitchen)
  let seed = 1;
  while (!fireIsBig(seed, 0, 'normal', 2, true)) seed++;
  await cdp.eval(`(async () => { const pz = ${PZ}; pz.game.burn.v2.seed = ${seed}; })()`);
  await kit(`bake(${o1})`);
  await sleep(300);
  await kit(`age(${o1}, 13300)`);
  await sleep(900);
  console.log('big?', await cdp.eval(`(async () => !!${PZ}.game.burn.fires[0]?.big)()`));
  await cdp.shot('fire-1-big-nobody');
  // chef 1 alone: it contains (the bar must not move), then both
  // both chefs share the one open tile in front of the oven (side by side), facing it, holding Picar
  const st0 = (await snap()).stations[o1]!;
  const below = st0.ty + 1 + 0.5 > 0 && (await cdp.eval<boolean>(`window.__pg.snapshot().stations[${o1}].ty < 3`));
  const dy = below ? 1.55 : -0.55;
  const hold = async (id: number, k: number) => {
    const b = bots.find((x) => x.id === id)!;
    b.startSending();
    await cdp.eval(`window.__pg.sab.place(${id}, ${st0.tx + 0.28 + 0.44 * k}, ${st0.ty + dy}, 0, ${below ? -1 : 1})`);
    b.vec = { x: 0, y: below ? -1 : 1 };
    b.btn = 2;
  };
  await hold(ids[0]!, 0);
  await sleep(1200);
  await cdp.shot('fire-2-big-1chef');
  await sleep(600);
  await cdp.shot('fire-2b-big-1chef-later');
  await hold(ids[1]!, 1);
  await sleep(1500);
  await cdp.shot('fire-3-big-2chefs');
  await sleep(1500);
  await cdp.shot('fire-3b-big-2chefs-later');
  console.log('fire ms', await cdp.eval(`(async () => ${PZ}.game.stations[${o1}].fire)()`));
  bots.splice(0).forEach((b) => b.close());
}

export async function runHzRat(ctx: Ctx) {
  const { cdp, bots, snap } = ctx;
  const ids = await start(ctx, 'HZRA', true);
  await ctx.waitFor((s) => s.time > 9000, 30_000); // the puesto pills are big for the first 8 s of play: let them go so they do not hide the rat
  await cdp.eval(`window.__pg.kit.event('rat')`);
  for (let i = 0; i < 60 && !((await snap()) as any).mid?.rat; i++) await sleep(200);
  await sleep(500);
  // the chef 2 tiles behind the rat, dashing at it: the sim dodges it next tick
  const setup = `(async () => {
    const g = ${PZ}.game, r = g.mid.rat, p = g.players.get(${ids[0]});
    const open = [[-2, 0], [2, 0], [0, 2], [0, -2]].find(([dx, dy]) => g.grid[Math.floor(r.y + dy)]?.[Math.floor(r.x + dx)]?.kind === 'floor');
    const [dx, dy] = open;
    Object.assign(p, { x: r.x + dx, y: r.y + dy, fx: -dx / 2, fy: -dy / 2, vx: 0, vy: 0, dashMs: 180, dashDx: -dx / 2, dashDy: -dy / 2 });
    r.pauseMs = 0; r.dodgeCd = 0;
    g.players.get(${ids[1]}).x = 1.5; g.players.get(${ids[1]}).y = 6.5;
  })()`;
  await cdp.eval(setup);
  await sleep(100);
  await cdp.shot('rat-1-dodge');
  await sleep(160);
  await cdp.shot('rat-2-landed');
  // the window is 600 ms and a screenshot costs about as much: pin the remaining pant time before each shot so the frame is inside it (open ring, then nearly closed)
  const pin = (ms: number) => cdp.eval(`(async () => { const r = ${PZ}.game.mid.rat; if (r) { r.pantMs = ${ms}; r.dodgeMs = 0; } })()`);
  await pin(560);
  await sleep(60);
  await cdp.shot('rat-3-panting');
  await pin(230);
  await sleep(40);
  await cdp.shot('rat-4-panting-later');
  console.log(
    'rat',
    JSON.stringify(
      await cdp.eval(`(async () => { const r = ${PZ}.game.mid.rat; return r && { x: r.x, y: r.y, pant: r.pantMs, dodge: r.dodgeMs }; })()`),
    ),
  );
  bots.splice(0).forEach((b) => b.close());
}

export async function runHzIce(ctx: Ctx) {
  const { cdp, bots, snap } = ctx;
  const ids = await start(ctx, 'HZIC', true);
  await cdp.eval(`window.__pg.kit.event('frost', 1200)`);
  await sleep(4500);
  const slide = (id: number, x: number, y: number, vx: number, vy: number) =>
    cdp.eval(
      `(async () => { Object.assign(${PZ}.game.players.get(${id}), { x: ${x}, y: ${y}, vx: ${vx}, vy: ${vy}, fx: ${Math.sign(vx)}, fy: 0 }); })()`,
    );
  await slide(ids[0]!, 5.5, 4.5, 4.2, 0);
  await slide(ids[1]!, 10.5, 5.5, -1.2, 1.0);
  await sleep(120);
  await cdp.shot('ice-1-slide');
  await sleep(700);
  await cdp.shot('ice-2-slowing');
  console.log('players', JSON.stringify((await snap()).players.map((p: any) => [p.x.toFixed(2), p.y.toFixed(2), p.vx?.toFixed(2)])));
  bots.splice(0).forEach((b) => b.close());
}
