import { PORT, sleep } from '../../config';
import type { Ctx } from '../../session';

// Manchazo PR2 (the round in three acts): a round at 3840x2160 put one tick before the Final with both halves painted, so the shot is the announcement strip of the Final
// (`PHASE=scramble` takes the Revuelta's). It must not cover the floor: it lives in the band under it. `SHOT` names the file; `WAIT_MS` is how long after the change.
export async function runManchazoPhasesTv({ cdp, bots, join, waitFor, click }: Ctx) {
  const room = 'MNPH';
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 2,
    mobile: false,
    screenWidth: 1920,
    screenHeight: 1080,
  });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${room}&soon=1&render=2` });
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
  await cdp.eval('window.__pg.manchazoNextMapSeed("2·00103")');
  await click('#start');
  await sleep(1500);
  await key('Enter');
  await waitFor((s) => s.phase === 'playing', 15_000);
  bots.forEach((b) => {
    b.vec = { x: 0.01, y: 0 }; // barely leaning: they stay put
    b.startSending();
  });
  const call = <T>(fn: string, ...args: unknown[]) => cdp.eval<T>(`window.__pg.${fn}(${args.map((a) => JSON.stringify(a)).join(', ')})`);
  await sleep(800);
  await call('manchazoPaint', 0, 0, 1, 12, 13);
  await call('manchazoPaint', 1, 14, 1, 26, 13);
  const phase = process.env.PHASE === 'scramble' ? 'scramble' : 'final';
  await call('manchazoPhaseJump', phase);
  await sleep(Number(process.env.WAIT_MS ?? 700));
  await cdp.shot(process.env.SHOT ?? `manchazo-phase-${phase}`);
}
