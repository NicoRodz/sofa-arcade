import { fixedMap } from '@pichi/game-pizzas/sim/maps';
import { sleep } from '../config';
import type { Ctx } from '../session';

export async function runEvents({ cdp, bots, open, join, click, snap, waitFor }: Ctx) {
  // The mid-round events on map 13 (it has plates to wash, so the inspector can come), Normal, 6 chefs (the map asks for 5 or more): the lobby option, and for each event the banner (3 s before), the start and
  // the event itself. The sim is driven by hand (window.__pg.kit.event forces the kind and the instant).
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  const rows = fixedMap('13')!.rows;
  await open('EVTS');
  await join('EVTS', 6, rows);
  await click('[data-diff="normal"]');
  await click('[data-map="13"]');
  await sleep(500);
  await cdp.shot('ev-0-lobby');
  await click('[data-ev="false"]');
  await sleep(300);
  console.log('events option after clicking No: selected =', await cdp.eval(`document.querySelector('#evs .sel').textContent`));
  await cdp.shot('ev-0-lobby-off');
  await click('#evs [data-ev="true"]');
  await sleep(200);
  await click('#start');
  await sleep(1500);
  await key('Enter');
  await waitFor((s) => s.countdown <= 0 && s.time > 1500, 20_000);
  const kit = (expr: string) => cdp.eval<any>(`window.__pg.kit.${expr}`);
  const cs = await kit('counters()');
  const counters = cs.filter((c: any) => c.kind === 'counter'),
    ovens = cs.filter((c: any) => c.kind === 'pot');
  const stations = (await snap()).stations;
  const sinkIdx = stations.findIndex((s) => s.kind === 'sink'),
    dirtyIdx = stations.findIndex((s) => s.kind === 'dirty');
  const ids = (await snap()).players.map((p) => p.id);
  const phaseOf = async () => ((await snap()) as any).mid?.phase as string;
  const untilDone = async (ms: number) => {
    const end = Date.now() + ms;
    while (Date.now() < end && (await phaseOf()) !== 'done') await sleep(200);
  };
  // Hora punta
  await kit(`event('rush')`);
  await sleep(1300);
  await cdp.shot('ev-rush-1-announce');
  await sleep(2000);
  await cdp.shot('ev-rush-2-start');
  await sleep(700);
  await cdp.shot('ev-rush-3-tickets');
  await untilDone(8000);
  // Cumpleaños
  await kit(`event('birthday')`);
  await sleep(1300);
  await cdp.shot('ev-birthday-1-announce');
  await sleep(2000);
  await cdp.shot('ev-birthday-2-start');
  await sleep(800);
  await cdp.shot('ev-birthday-3-balloons');
  await untilDone(8000);
  // Corte de luz: an oven cooking and a ready one
  await kit(`bake(${ovens[0].i})`);
  await kit(`event('blackout')`);
  await sleep(1300);
  await cdp.shot('ev-blackout-1-announce');
  await sleep(2000);
  await cdp.shot('ev-blackout-2-start');
  await sleep(2500);
  await cdp.shot('ev-blackout-3-dark');
  await untilDone(14_000);
  await sleep(600);
  await cdp.shot('ev-blackout-4-back');
  // Inspector: two dirty plates (one in the sink, one at the return), then clean
  await kit(`setCount(${sinkIdx}, 1)`);
  await kit(`setCount(${dirtyIdx}, 1)`);
  await kit(`event('inspector')`);
  await sleep(1300);
  await cdp.shot('ev-inspector-1-announce');
  await sleep(2200);
  await cdp.shot('ev-inspector-2-dirty');
  await kit(`setCount(${sinkIdx}, 0)`);
  await kit(`setCount(${dirtyIdx}, 0)`);
  await sleep(900);
  await cdp.shot('ev-inspector-3-clean');
  await untilDone(30_000);
  await sleep(500);
  await cdp.shot('ev-inspector-4-verdict');
  // Rata: something to steal on a counter; one chef runs at it
  await sleep(4000);
  await kit(`setItem(${counters[3].i}, 'raw1')`);
  await kit(`setItem(${counters[9].i}, 'cut0')`);
  await kit(`event('rat')`);
  await sleep(1300);
  await cdp.shot('ev-rat-1-announce');
  await sleep(2300);
  await cdp.shot('ev-rat-2-appears');
  for (let i = 0; i < 12 && !((await snap()) as any).mid?.rat; i++) await sleep(200);
  await sleep(1500);
  await cdp.shot('ev-rat-3-running');
  await untilDone(12_000);
  await cdp.shot('ev-rat-4-gone');
  bots.splice(0).forEach((b) => b.close());
}

export async function runMagnet({ cdp, bots, open, join, click, snap, waitFor }: Ctx) {
  // Magnetism and the gentle rat on map 1 (Normal, 2 chefs: the lobby rules switch the magnet on): the bracket on the station each chef's Tomar will use (a chef at 45 degrees to a crate,
  // two chefs on one crate), then the rat: the arrow over it, the dashed line to the counter it goes for, the alarm when it is about to arrive. Driven by hand (window.__pg).
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  const rows = fixedMap('1')!.rows;
  await open('MAGN');
  await join('MAGN', 2, rows);
  await click('[data-diff="normal"]');
  await click('[data-map="1"]');
  await sleep(400);
  await click('#start');
  await sleep(1500);
  await key('Enter');
  await waitFor((s) => s.countdown <= 0 && s.time > 1500, 20_000);
  const kit = (expr: string) => cdp.eval<any>(`window.__pg.kit.${expr}`);
  const ids = (await snap()).players.map((p) => p.id);
  console.log('magnet on in the round:', await cdp.eval('!!window.__pg.snapshot().magnet'));
  await cdp.eval(`window.__pg.sab.place(${ids[0]}, 3.85, 1.35, 0.55, -0.84)`); // under the crate, looking up and to the right: the old probe would pick the counter beside it
  await cdp.eval(`window.__pg.sab.place(${ids[1]}, 10.5, 3.2, 0, -1)`);
  await sleep(400);
  await cdp.shot('mag-1-bracket');
  await cdp.eval(`window.__pg.sab.place(${ids[1]}, 3.4, 1.55, 0, -1)`);
  await sleep(400);
  await cdp.shot('mag-2-two-chefs');
  await cdp.eval(`window.__pg.sab.place(${ids[0]}, 12.5, 6.5, 0, 1)`);
  await cdp.eval(`window.__pg.sab.place(${ids[1]}, 1.5, 6.5, 0, 1)`);
  const counters = (await kit('counters()')).filter((c: any) => c.kind === 'counter');
  await kit(`setItem(${counters[3].i}, 'raw1')`);
  await kit(`setItem(${counters[9].i}, 'cut0')`);
  await kit(`event('rat')`);
  for (let i = 0; i < 40 && !((await snap()) as any).mid?.rat; i++) await sleep(200);
  await sleep(1600);
  await cdp.shot('mag-3-rat-arrow');
  await sleep(2000);
  await cdp.shot('mag-4-rat-closer');
  for (let i = 0; i < 40 && (await cdp.eval<boolean>('(() => { const r = window.__pg.snapshot().mid; return !r.rat; })()')); i++)
    await sleep(100);
  bots.splice(0).forEach((b) => b.close());
}
