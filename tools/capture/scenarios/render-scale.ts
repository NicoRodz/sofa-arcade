import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fixedMap } from '@pichi/game-pizzas/sim/maps';
import { PORT, outDir, sleep } from '../config';
import type { Ctx } from '../session';

// F6. Two checks of the render scale (`render-scale` and `manchazo-4k` modes).
const sha = (name: string) =>
  createHash('sha256')
    .update(readFileSync(path.join(outDir, `${name}.png`)))
    .digest('hex');
const rs = (c: Ctx) => c.cdp.eval<{ r: number; canvas: number[] } | null>('window.__pg.renderScale ? window.__pg.renderScale() : null');
const shotHash = async (c: Ctx, name: string) => {
  await c.cdp.shot(name);
  console.log(`HASH ${name} ${sha(name)} renderScale=${JSON.stringify(await rs(c))}`);
};

/** Pizzas and Obstaculos with `?render=2` in the URL: their canvas must stay 1920x1080 and their pictures must not move. Run it on master and on the branch and compare the HASH lines. */
export async function runRenderScaleOthers(c: Ctx) {
  const { cdp, bots, join, click, waitFor } = c;
  const open = (room: string) =>
    cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${room}&render=2` }).then(() => sleep(2500));
  await open('RSPZ');
  await join('RSPZ', 8, fixedMap('1')!.rows);
  await click('[data-diff="easy"]');
  await sleep(300);
  await shotHash(c, 'rs-pizzas-lobby');
  await click('#start');
  await sleep(1700);
  await shotHash(c, 'rs-pizzas-countdown');
  await waitFor((s) => s.time > 1700, 10_000);
  await shotHash(c, 'rs-pizzas-idle');
  bots.splice(0).forEach((b) => b.close());
  await open('RSOB');
  await join('RSOB', 2, [], { menu: true });
  await sleep(800);
  await shotHash(c, 'rs-menu');
  await click('[data-game="obstaculos"]');
  await waitFor((s) => s.phase === 'lobby', 15_000);
  await sleep(1500);
  await shotHash(c, 'rs-obst-lobby');
  await click('#start');
  await waitFor((s) => s.phase === 'playing', 15_000);
  await sleep(600);
  await shotHash(c, 'rs-obst-play');
}

const BOUNDS = `(() => { const sc = window.__pg.manchazoTexts ? window.__pg.manchazoTexts() : null; return sc; })()`;

/** Manchazo with 8 phones: the TV picture at 3840x2160 (device scale 2 makes the display 4K, so the scale picks itself), the HUD's real bounds, and the fps probe. */
export async function runManchazo4k({ cdp, bots, join, waitFor, click }: Ctx) {
  const room = 'M4K0';
  const visible = !!process.env.CHROME_VISIBLE;
  const query = process.env.RENDER ? `&render=${process.env.RENDER}` : '';
  if (!visible)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 2,
      mobile: false,
      screenWidth: 1920,
      screenHeight: 1080,
    });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${room}&soon=1&fps=1${query}` });
  await sleep(2500);
  await join(room, 8, [], { menu: true });
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  for (let i = 0; i < 4; i++) {
    const m = await cdp.eval<{ sel: number; cards: string[] }>('window.__pg.menu()');
    if (m.cards[m.sel]?.startsWith('arena:')) break;
    await key('ArrowRight');
    await sleep(150);
  }
  await key('Enter');
  await sleep(2200);
  await click('#start');
  await sleep(1500);
  await key('Enter');
  await waitFor((s) => s.phase === 'playing', 15_000);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  bots.forEach((b, i) => {
    b.vec = { x: dirs[i]![0], y: dirs[i]![1] };
    b.startSending();
  });
  let n = 0;
  const flip = setInterval(() => {
    n++;
    bots.forEach((b, i) => {
      if ((n + i) % 3 === 0) b.vec = { x: b.vec.y, y: b.vec.x };
      if ((n + i) % 2 === 0) b.a++;
    });
  }, 700);
  await sleep(6000);
  await cdp.eval('window.__fps.reset()');
  await sleep(Number(process.env.MEASURE_S ?? 25) * 1000);
  console.log('FPS raf', JSON.stringify(await cdp.eval('window.__fps.stats()')));
  console.log('FPS game', JSON.stringify(await cdp.eval('window.__fps.game()')), 'renderScale', JSON.stringify(await rs({ cdp } as Ctx)));
  console.log('UA', await cdp.eval<string>('navigator.userAgent'), 'dpr', await cdp.eval<number>('devicePixelRatio'));
  await cdp.shot(process.env.SHOT ?? 'manchazo-tv-4k');
  console.log('HUDBOUNDS', JSON.stringify(await cdp.eval(BOUNDS)));
  clearInterval(flip);
}
