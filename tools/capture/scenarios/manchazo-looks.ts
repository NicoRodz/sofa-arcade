import { PORT, sleep } from '../config';
import type { Ctx } from '../session';

// Manchazo F7a: the TV at 3840x2160 with the same 4 looks in both teams (the look sheet), in the order the sheet reads: the orange team on the top row, the
// blue one under it, the same look in the same column. Saved as manchazo-looks-sheet.png (the whole TV); the 8 phones keep their own random looks for the
// other shot of the mode, manchazo-tv-8.png. The look of a slot is set through the debug hook (a phone cannot change it during a round).
const LOOKS = [
  { v: 1, g: 1, s: 0, hc: 0, sk: 0, hat: 0, gl: 0, bk: 0, cl: 0 }, // plain white tee: the whole shirt is the team colour
  { v: 1, g: 2, s: 2, hc: 2, sk: 2, hat: 1, gl: 1, bk: 0, cl: 6 }, // stripes and a cap
  { v: 1, g: 1, s: 0, hc: 3, sk: 3, hat: 3, gl: 2, bk: 1, cl: 4 }, // orange hair, straw hat, cape, plaid: the hardest one for the orange team
  { v: 1, g: 0, s: 1, hc: 4, sk: 1, hat: 5, gl: 0, bk: 5, cl: 8 }, // dress with dots, crown, backpack
];

export async function runManchazoLooks({ cdp, bots, join, waitFor, click }: Ctx) {
  const room = 'MNLK';
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 2,
    mobile: false,
    screenWidth: 1920,
    screenHeight: 1080,
  });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${room}&soon=1` });
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
  // 8 random looks (the bots sent none): the plain TV with 8 avatars, in motion
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
  await sleep(4000);
  await cdp.shot('manchazo-tv-8');
  bots.forEach((b) => {
    b.vec = { x: 0, y: 0 };
  });
  await sleep(400);
  // the sheet: team 0 on the top row, team 1 under it, look k in column k
  const teams = await cdp.eval<{ slot: number; team: number }[]>('window.__pg.manchazoTeams()');
  for (const team of [0, 1]) {
    const slots = teams.filter((t) => t.team === team).map((t) => t.slot);
    for (const [k, slot] of slots.slice(0, LOOKS.length).entries()) {
      await cdp.eval(`window.__pg.manchazoLook(${slot}, ${JSON.stringify(LOOKS[k])})`);
      await cdp.eval(`window.__pg.manchazoPut(${slot}, ${6 + k * 5}, ${team === 0 ? 5 : 9})`);
    }
  }
  await sleep(500);
  await cdp.shot('manchazo-looks-sheet');
}
