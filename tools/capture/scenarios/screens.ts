import { fixedMap } from '@pichi/game-pizzas/sim/maps';
import { sleep } from '../config';
import type { Ctx } from '../session';

export async function runHowto({ cdp, open, join, click }: Ctx) {
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  const phase = () => cdp.eval<string>('window.__pg.snapshot().phase');
  await open('HOWT');
  await join('HOWT', 4, fixedMap('1')!.rows);
  await sleep(800);
  await cdp.shot('howto-lobby');
  await key('h');
  await sleep(700);
  await cdp.shot('howto-preview');
  await key('Enter');
  await sleep(300);
  console.log(
    'after Enter on preview: card hidden =',
    await cdp.eval(`document.getElementById('howto').classList.contains('off')`),
    'phase =',
    await phase(),
  );
  await click('[data-diff="easy"]');
  await click('#start');
  await sleep(1400);
  await cdp.shot('howto-card');
  await sleep(3000);
  await cdp.shot('howto-card-t4');
  const t0 = Date.now();
  await key('Enter');
  await sleep(1300);
  await cdp.shot('howto-after-skip');
  console.log('after skip: phase =', await phase(), 'ms since Enter', Date.now() - t0);
  await sleep(3000);
  await cdp.shot('howto-countdown');
}

export async function runHowtoTimeout({ cdp, open, join, click }: Ctx) {
  await open('HOWX');
  await join('HOWX', 2, fixedMap('1')!.rows);
  await click('#start');
  const t0 = Date.now();
  let ph = 'lobby';
  while (Date.now() - t0 < 20_000 && ph !== 'playing') {
    await sleep(100);
    ph = await cdp.eval<string>('window.__pg.snapshot().phase');
  }
  console.log('howto-timeout: reached playing after', Date.now() - t0, 'ms (expect ~11 s: iris half + card 10 s + iris half)');
}

export async function runMenu({ cdp, bots, open, join }: Ctx) {
  // Pichiclub start: 0, 2 and 8 players, keyboard selection, then the step into the game's lobby (and back with Esc)
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  const rows = fixedMap('1')!.rows;
  await open('MENU');
  await sleep(500);
  await cdp.shot('menu-0');
  await join('MENU', 1, rows, { menu: true });
  await sleep(500);
  await cdp.shot('menu-1');
  console.log('menu with 1 player:', JSON.stringify(await cdp.eval('window.__pg.menu()')));
  await key('Enter');
  await sleep(300);
  console.log('Enter on a disabled card -> phase', await cdp.eval('window.__pg.snapshot().phase'));
  await join('MENU', 2, rows, { from: 1, menu: true });
  await sleep(500);
  await cdp.shot('menu-2');
  console.log('menu with 2 players:', JSON.stringify(await cdp.eval('window.__pg.menu()')));
  await join('MENU', 8, rows, { from: 2, menu: true });
  await sleep(600);
  await cdp.shot('menu-8');
  await key('ArrowRight');
  await key('ArrowDown');
  await sleep(200);
  console.log('after arrows (nothing to move to):', JSON.stringify(await cdp.eval('window.__pg.menu()')));
  await key('Enter');
  await sleep(550);
  await cdp.shot('menu-to-lobby-iris');
  await sleep(1000);
  console.log('after Enter -> phase', await cdp.eval('window.__pg.snapshot().phase'));
  await cdp.shot('menu-lobby');
  await key('Escape');
  await sleep(1700);
  console.log('after Esc -> phase', await cdp.eval('window.__pg.snapshot().phase'));
  await cdp.shot('menu-back');
  bots.splice(0).forEach((b) => b.close());
}
