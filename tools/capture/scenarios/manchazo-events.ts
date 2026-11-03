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

// F8b: the five new events on the map `2·000R9` (Mudanza needs a round whose seed has valid moves; the same round shows the other four). Saved as manchazo-ev-*.png.
export async function runManchazoEventsPlusTv({ cdp, bots, join, waitFor, click }: Ctx) {
  const room = 'MNE2';
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${room}&soon=1` });
  await sleep(2500);
  await join(room, 8, [], { menu: true });
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
  await cdp.eval(`window.__pg.manchazoNextMapSeed(${JSON.stringify('2·000R9')})`); // before #start: this round plays that map
  await click('#start');
  await sleep(1500);
  await key('Enter');
  await waitFor((s) => s.phase === 'playing', 15_000);
  bots.forEach((b) => {
    b.vec = { x: 0.01, y: 0 };
    b.startSending();
  });
  const call = <T = number | undefined>(fn: string, ...args: unknown[]) =>
    cdp.eval<T>(`window.__pg.${fn}(${args.map((a) => JSON.stringify(a)).join(', ')})`);
  await sleep(1000);
  const info = await call<{ moves: { from: [number, number]; to: [number, number] }[]; balloons: [number, number][] } | null>(
    'manchazoPlusInfo',
  );
  console.log('plus info', JSON.stringify(info));
  // a checkerboard of both teams in the middle band (every tile has rival neighbours: the contagion has something to turn), the teams around it
  for (let y = 2; y <= 12; y++) for (let x = 4; x <= 22; x++) await call('manchazoPaint', (x + y) % 2, x, y, x, y);
  for (let i = 0; i < 4; i++) {
    await call('manchazoPutTeam', 0, 3 + i, 13, i);
    await call('manchazoPutTeam', 1, 23 - i, 13, i);
  }
  await call('manchazoEvent', 'blackout');
  await sleep(1500);
  await cdp.shot('manchazo-ev-apagon'); // the dark with a light around each player: the 8 are visible
  await sleep(5000);
  await call('manchazoEvent', 'contagion');
  await sleep(1800);
  await cdp.shot('manchazo-ev-contagio-aviso'); // the marks on the tiles about to turn
  await sleep(2200);
  await cdp.shot('manchazo-ev-contagio-resultado'); // the pass ran over a copy: the checkerboard is inverted
  await sleep(2500);
  await call('manchazoEvent', 'happyHour');
  await sleep(1500);
  await cdp.shot('manchazo-ev-hora-feliz');
  await sleep(7000);
  // Mudanza: nobody stands on the destinations (the round puts the 8 bodies on the bottom row)
  await call('manchazoEvent', 'move');
  await sleep(1000);
  await cdp.shot('manchazo-ev-mudanza-aviso'); // arrows from the old to the new spot
  await sleep(2200);
  await cdp.shot('manchazo-ev-mudanza-salto'); // the furniture has jumped
  await sleep(3500);
  // Globos: two bodies of team 0 next to the first balloon (it lands for them), one of each beside the second (a tie: neutral); the third has nobody (neutral)
  const [b0, b1] = info?.balloons ?? [];
  if (b0) {
    await call('manchazoPutTeam', 0, b0[0], b0[1], 0);
    await call('manchazoPutTeam', 0, b0[0] + 1, b0[1], 1);
  }
  if (b1) {
    await call('manchazoPutTeam', 1, b1[0], b1[1], 0);
    await call('manchazoPutTeam', 0, b1[0] + 1, b1[1], 2);
  }
  await call('manchazoEvent', 'balloons');
  await sleep(1800);
  await cdp.shot('manchazo-ev-globos-aviso'); // the shadows
  await sleep(2000);
  await cdp.shot('manchazo-ev-globos-aterrizaje'); // landed: 3x3 painted for the team with more bodies around, neutral on a tie
}
