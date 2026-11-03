import { sleep } from '../../config';
import type { Ctx } from '../../session';
import { startRound } from '../manchazo-sabotage';

// Manchazo PR6: the sponge v2 and the packing tape at 4K (3840x2160): the sponge soaking the rival paint round it (diamond, clock, the sponge over its head), its squeeze flying
// out (radius 3, gold) and a tape on the floor. `window.__pg.manchazoPinWrap` holds each one still on a free stretch of floor (capture tool only). Saved as manchazo-esponja-*.png
// and manchazo-cinta-activa.png.
export async function runManchazoWrapTv(ctx: Ctx) {
  const { cdp } = ctx;
  await startRound(ctx, 'MNWR', 5, true);
  const call = (fn: string, ...args: unknown[]) => cdp.eval<number>(`window.__pg.${fn}(${args.map((a) => JSON.stringify(a)).join(', ')})`);
  await sleep(1800); // the map's name (90 ticks) is gone
  for (const [what, name, wait] of [
    ['soak', 'manchazo-esponja-absorbiendo', 600],
    ['squeeze', 'manchazo-esponja-exprimiendo', 300],
    ['tape', 'manchazo-cinta-activa', 900],
  ] as const) {
    const row = await call('manchazoPinWrap', 0, what);
    console.log(what, 'on row', row);
    if (row < 0) throw new Error(`no free spot for ${what}`);
    await sleep(wait);
    await cdp.shot(name);
    await call('manchazoUnpinWrap');
    await sleep(300);
  }
}
