import { sleep } from '../config';
import type { Ctx } from '../setup';

export async function runSwitch(c: Ctx) {
  const { cdp, click, key, state, phase } = c;
  // obstaculos -> results -> lobby -> menu -> pizzas -> back: the two games share one canvas and one set of phones
  for (let i = 0; i < 8; i++) {
    for (let k = 0; k < 40 && (await state())?.sess !== 'playing'; k++) await sleep(200);
    if ((await phase()) !== 'playing') break;
    await cdp.eval('window.__pg.obstWin()');
    await sleep(5200);
  }
  for (let i = 0; i < 40 && (await phase()) !== 'results'; i++) await sleep(300);
  await sleep(2500);
  await cdp.shot('switch-results');
  await click('#again');
  await sleep(600);
  console.log('after again ->', await phase());
  await key('Escape');
  for (let i = 0; i < 30 && (await phase()) !== 'menu'; i++) await sleep(200);
  console.log('after Esc ->', await phase());
  await sleep(1800); // the iris is still opening: clicks are ignored until it ends
  await click('[data-game="pizzas"]');
  for (let i = 0; i < 30 && (await phase()) !== 'lobby'; i++) await sleep(200);
  await sleep(700);
  await click('#start');
  for (let i = 0; i < 40 && (await phase()) !== 'playing'; i++) {
    await sleep(300);
    await key('Enter');
  }
  await sleep(4500);
  const sn = await cdp.eval<any>(
    '({ phase: window.__pg.snapshot().phase, stations: window.__pg.snapshot().stations.length, players: window.__pg.snapshot().players.length, countdown: window.__pg.snapshot().countdown })',
  );
  await cdp.shot('switch-pizzas');
  console.log('pizzas after obstaculos:', JSON.stringify(sn), 'page errors', cdp.errors.length);
  if (sn.phase !== 'playing' || sn.stations < 5 || sn.players < 2) c.code = 1;
}
