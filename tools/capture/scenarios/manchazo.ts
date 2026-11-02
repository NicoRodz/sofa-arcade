import { WebSocket } from 'ws';
import { PORT, sleep } from '../config';
import type { Ctx } from '../session';

// Manchazo F1 (Arena's default round, `?soon=1`): the TV lobby with the two teams (5 players, 3 against 2, so the handicap line shows), the round with
// 5 phones played by bots dropping pinatas, and the results; then the phone's pad. Saved to the output folder as manchazo-*.png.
export async function runManchazoTv({ cdp, bots, join, snap, waitFor, click }: Ctx) {
  const room = 'MNCH';
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${room}&soon=1` });
  await sleep(2500);
  await join(room, 5, [], { menu: true });
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  for (let i = 0; i < 4; i++) {
    if ((await cdp.eval<{ sel: string }>('window.__pg.menu()')).sel === 'arena') break;
    await key('ArrowRight');
    await sleep(150);
  }
  await key('Enter');
  await sleep(2200);
  await cdp.shot('manchazo-lobby');
  await click('#start');
  await sleep(1500);
  await key('Enter'); // past the how-to / countdown, if one is up
  await waitFor((s) => s.phase === 'playing', 15_000);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 0],
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
      if ((n + i) % 2 === 0) b.a++; // button 1: a pinata
    });
  }, 700);
  await sleep(9000);
  await cdp.shot('manchazo-tv');
  clearInterval(flip);
  await cdp.eval('window.__pg.manchazoSkipToEnd()');
  await sleep(1500);
  await cdp.shot('manchazo-final-board');
  await waitFor((s) => s.phase === 'results', 15_000);
  await sleep(800);
  console.log('phase', ((await snap()) as { phase: string }).phase);
  await cdp.shot('manchazo-results');
  // back to the lobby: reset() hides Arena's team hint, and the lobby's own render must show it again
  await click('#again');
  await waitFor((st) => st.phase === 'lobby', 15_000);
  await sleep(1200);
  const hint = await cdp.eval<{ off: boolean; top: number; text: string }>(
    `(() => { const el = document.getElementById('arenahint'); return { off: el.classList.contains('off'), top: Math.round(el.getBoundingClientRect().top), text: el.textContent }; })()`,
  );
  console.log('lobby hint after a round', JSON.stringify(hint));
  if (hint.off || !hint.text.includes('contra')) throw new Error('the lobby hint is hidden after returning from a round');
  await cdp.shot('manchazo-lobby-back');
}

export async function runManchazoPhone({ cdp }: Ctx) {
  const room = 'MNCP';
  const fake = new WebSocket(`ws://127.0.0.1:${PORT}/ws?role=screen&room=${room}`);
  await new Promise((r) => fake.once('open', r));
  fake.send(JSON.stringify({ t: 'config', game: 'arena', modeId: 'versus', difficulty: 'normal', map: '1', seed: 1 }));
  fake.send(JSON.stringify({ t: 'phase', phase: 'menu' }));
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/c/?room=${room}` });
  await sleep(1200);
  await cdp.eval(`document.getElementById('name').value = 'Nico'; document.getElementById('join').requestSubmit()`);
  await sleep(1200);
  fake.send(JSON.stringify({ t: 'phase', phase: 'lobby' }));
  await sleep(600);
  fake.send(JSON.stringify({ t: 'phase', phase: 'playing' }));
  await sleep(800);
  await cdp.shot('manchazo-phone');
  fake.close();
}
