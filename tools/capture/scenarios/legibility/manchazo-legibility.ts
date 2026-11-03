import { PORT, sleep } from '../../config';
import type { Ctx } from '../../session';

// Manchazo PR1 (couch legibility): one round with events at 3840x2160. Painted halves, four sabotages played at once (two per team), a Casillas doradas event and a
// small paint gain for each team in the last second. The two painted halves go in 2 s earlier, so the "+X %" in the picture is what each team won in the last seconds
// (a few pp), not the whole painted half. Run it on master and on the branch with SHOT=<name> and compare the two pictures from 3 m.
export async function runManchazoLegibilityTv({ cdp, bots, join, waitFor, click }: Ctx) {
  const room = 'MNLG';
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
  await sleep(1000);
  const teams = await call<{ slot: number; team: number }[]>('manchazoTeams');
  const of = (t: number) => teams.filter((x) => x.team === t).map((x) => x.slot);
  const [o, b] = [of(0), of(1)];
  await call('manchazoPaint', 0, 0, 2, 11, 12);
  await call('manchazoPaint', 1, 15, 2, 26, 12);
  await sleep(2400); // the halves' own "+X %" leaves the screen and the 2 s window
  await call('manchazoGive', o[0], 'dizzy');
  await call('manchazoGive', o[1], 'roller');
  await call('manchazoGive', b[0], 'tape');
  await call('manchazoGive', b[1], 'footprints');
  await call('manchazoEvent', 'gold');
  await sleep(300);
  for (const slot of [o[0], o[1], b[0], b[1]]) bots[slot!]!.b++; // button 2: the four play their card
  await call('manchazoPaint', 0, 0, 13, 5, 14); // orange wins 12 tiles of the bottom rows
  await call('manchazoPaint', 1, 21, 13, 26, 14); // blue too
  await sleep(Number(process.env.WAIT_MS ?? 450));
  await cdp.shot(process.env.SHOT ?? 'manchazo-legibility');
}
