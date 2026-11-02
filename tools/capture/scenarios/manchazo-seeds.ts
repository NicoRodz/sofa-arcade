import { PORT, sleep } from '../config';
import type { Ctx } from '../session';

// Manchazo F2: the TV in the round on two different map seeds (the capture tool forces the seed through the debug hook; a phone cannot), with the
// seed code bottom left, and the results of the second round with the code in big letters. Saved as manchazo-seed-a.png / manchazo-seed-b.png / manchazo-seed-results.png.
export async function runManchazoSeeds({ cdp, bots, join, waitFor, click }: Ctx) {
  const room = 'MNSD';
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${room}&soon=1` });
  await sleep(2500);
  await join(room, 4, [], { menu: true });
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
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  const round = async (code: string, shot: string) => {
    await cdp.eval(`window.__pg.manchazoNextMapSeed(${JSON.stringify(code)})`);
    await click('#start');
    await sleep(1500);
    await key('Enter');
    await waitFor((s) => s.phase === 'playing', 15_000);
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
    await sleep(9000);
    await cdp.shot(shot);
    clearInterval(flip);
  };
  await round('2·7KQ2M', 'manchazo-seed-a');
  await cdp.eval('window.__pg.manchazoSkipToEnd()');
  await waitFor((s) => s.phase === 'results', 15_000);
  await click('#again');
  await waitFor((st) => st.phase === 'lobby', 15_000);
  await sleep(1200);
  await round('2·0Z9A4', 'manchazo-seed-b');
  await cdp.eval('window.__pg.manchazoSkipToEnd()');
  await waitFor((s) => s.phase === 'results', 15_000);
  await sleep(800);
  await cdp.shot('manchazo-seed-results');
}
