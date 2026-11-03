import { sleep } from '../config';
import type { Ctx } from '../session';
import { startRound } from './manchazo-sabotage';

// Manchazo PR4: the projectiles at 4K (3840x2160): the aim of a Pegote, a Cambiazo in flight and a Pegote that was just passed (fuse, pass pips, the arc). The
// `window.__pg.manchazoPin*` hooks hold each thing still on a free stretch of floor (capture tool only). Saved as manchazo-proyectil-*.png.
export async function runManchazoShotTv(ctx: Ctx) {
  const { cdp } = ctx;
  await startRound(ctx, 'MNSH', 5, true);
  const call = (fn: string, ...args: unknown[]) => cdp.eval<number>(`window.__pg.${fn}(${args.map((a) => JSON.stringify(a)).join(', ')})`);
  await sleep(1800); // the map's name (90 ticks) is gone
  const row = await call('manchazoPinShot', 0, 1, 'glue', true);
  console.log('aim on row', row);
  if (row < 0) throw new Error('no free run of 10 tiles for the aim');
  await sleep(500);
  await cdp.shot('manchazo-proyectil-apuntado');
  await call('manchazoUnpinShot');
  await call('manchazoPinShot', 0, 1, 'swap', false);
  await sleep(500);
  await cdp.shot('manchazo-proyectil-vuelo');
  await call('manchazoUnpinShot');
  const pass = await call('manchazoPinPass', 1, 0);
  console.log('pass on row', pass);
  if (pass < 0) throw new Error('no free run of 4 tiles for the pass');
  await sleep(500);
  await cdp.shot('manchazo-proyectil-pase');
  await call('manchazoUnpinShot');
}
