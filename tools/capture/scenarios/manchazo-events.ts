import { PORT, sleep } from '../config';
import type { Ctx } from '../session';

// Manchazo F4: the TV with the events. The big pinata (landing shadow and announcement), the rain washing a painted band, the golden tiles, the vacuum robot, the disputed Hourglass (the losing
// team's carrier inside the circle, a rival at its edge, the bar filling) and ¡TIEMPO EXTRA!. Saved as manchazo-ev-*.png. The `window.__pg.manchazo*` hooks put
// the round in the state each shot needs (capture tool only); the events themselves run on the real 60 Hz clock.
export async function runManchazoEventsTv({ cdp, bots, join, waitFor, click }: Ctx) {
  const room = 'MNEV';
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
  await click('#start');
  await sleep(1500);
  await key('Enter');
  await waitFor((s) => s.phase === 'playing', 15_000);
  bots.forEach((b) => {
    b.vec = { x: 0.01, y: 0 }; // barely leaning: they stay put
    b.startSending();
  });
  const call = (fn: string, ...args: unknown[]) =>
    cdp.eval<number | undefined>(`window.__pg.${fn}(${args.map((a) => JSON.stringify(a)).join(', ')})`);
  await sleep(1000);
  await call('manchazoPaint', 0, 0, 2, 12, 12); // two painted halves
  await call('manchazoPaint', 1, 14, 2, 26, 12);
  await call('manchazoPutTeam', 0, 3, 13);
  await call('manchazoPutTeam', 1, 23, 13);
  await call('manchazoEvent', 'bigPinata');
  await sleep(1300);
  await cdp.shot('manchazo-ev-gran-pinata'); // announcement + the shadow that grows for 3 s
  await sleep(2500);
  await call('manchazoEvent', 'rain');
  await sleep(4200);
  await cdp.shot('manchazo-ev-lluvia'); // the band half washed out
  await sleep(4500);
  await call('manchazoClockFall', 1); // team 1 trails by a wide margin: the Hourglass falls within a second
  await sleep(1500);
  await cdp.shot('manchazo-ev-reloj-aviso');
  await sleep(2400); // 3 s of warning, then it is live
  const carrier = await call('manchazoClockCarrier', 1);
  await call('manchazoPutTeam', 0, 15, 9); // a rival of the leader stands at the circle's edge, not inside
  await sleep(1500);
  await cdp.shot('manchazo-ev-reloj-disputa'); // charging: the carrier alone inside, the bar partly full, the 12 s running
  console.log('carrier slot', carrier);
  await call('manchazoClockCharge', 40);
  await sleep(1300);
  await cdp.shot('manchazo-ev-tiempo-extra'); // ¡TIEMPO EXTRA! +15 s
  await call('manchazoEvent', 'gold');
  await sleep(3500);
  await cdp.shot('manchazo-ev-doradas'); // the golden tiles weigh double while the event runs
  await call('manchazoEvent', 'vacuum');
  await sleep(4000);
  await cdp.shot('manchazo-ev-robot'); // the vacuum robot eating paint
  const s = await cdp.eval<{ phase: string }>('window.__pg.snapshot()');
  console.log('phase after the extra time', s.phase);
}
