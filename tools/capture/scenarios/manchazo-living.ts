import { PORT, sleep } from '../config';
import type { Ctx } from '../session';

// Manchazo F5: the TV with the living map, on the seed 2·00103 (a sofa pair, a brush pair and the fountain). Each element is shown in action: the brush's warning
// and the strip it painted in the colour of whoever stood on its pivot, the sofa's warning with a body on the tile it is about to shut and that body pushed one tile
// along the rail, the fountain's splash in the colour of the team with more bodies near. The `window.__pg.manchazoLiving*` hooks only re-time an element or claim a
// pivot (capture tool only); the round runs on the real 60 Hz clock. Saved as manchazo-viva-*.png.
export async function runManchazoLivingTv({ cdp, bots, join, waitFor, click }: Ctx) {
  const room = 'MNLV';
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${room}&soon=1` });
  await sleep(2500);
  await join(room, 5, [], { menu: true });
  await sleep(500);
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  for (let i = 0; i < 4; i++) {
    const m = await cdp.eval<{ sel: number; cards: string[] }>('window.__pg.menu()');
    if (m.cards[m.sel]?.startsWith('arena:')) break;
    await key('ArrowRight');
    await sleep(150);
  }
  await key('Enter');
  await sleep(2200);
  await cdp.eval(`window.__pg.manchazoNextMapSeed(${JSON.stringify('2·00103')})`);
  await click('#start');
  await sleep(1500);
  await key('Enter');
  await waitFor((s) => s.phase === 'playing', 15_000);
  bots.forEach((b) => {
    b.vec = { x: 0.01, y: 0 }; // barely leaning: they stay put
    b.startSending();
  });
  const call = (fn: string, ...args: unknown[]) => cdp.eval<unknown>(`window.__pg.${fn}(${args.map((a) => JSON.stringify(a)).join(', ')})`);
  await sleep(1000);
  console.log('living on this map', JSON.stringify(await call('manchazoLivingCount')));

  // brush: pivot (6,7); team of slot 0 stands on it, then the bar turns 90 degrees (4 s) and paints what it swept
  await call('manchazoPut', 0, 6, 7);
  await call('manchazoLivingIn', 'brush', 0, 100);
  await sleep(1000); // 40 ticks left: inside the 1 s warning
  await cdp.shot('manchazo-viva-brocha-aviso');
  await call('manchazoPut', 0, 3, 12); // it leaves the pivot: the colour stays
  await sleep(1100);
  await cdp.shot('manchazo-viva-brocha');

  // sofa: rail (2..4, 5); a body stands on (4,5), the tile the sofa is about to take, and is pushed to (5,5)
  await call('manchazoPut', 1, 4, 5);
  await call('manchazoLivingIn', 'sofa', 0, 100);
  await sleep(1000);
  await cdp.shot('manchazo-viva-sofa-aviso');
  await sleep(1100);
  await cdp.shot('manchazo-viva-sofa-empuje');

  // fountain: two bodies of the same team within 2 tiles, one rival: the splash is the majority's colour
  await call('manchazoPut', 0, 13, 6);
  await call('manchazoPut', 2, 12, 7);
  await call('manchazoPut', 1, 14, 8);
  await call('manchazoLivingIn', 'fountain', 0, 100);
  await sleep(1000);
  await cdp.shot('manchazo-viva-fuente-aviso');
  await sleep(1000);
  await cdp.shot('manchazo-viva-fuente');
}
