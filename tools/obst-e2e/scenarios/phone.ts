import { WebSocket } from 'ws';
import { PORT, sleep } from '../config';
import type { Cdp } from '../browser';

// returns without touching the server's exit path: `c.code` is set but main ends the run through `return` (as before)
export async function runPhone(c: { cdp: Cdp; code: number }) {
  const { cdp } = c;
  // the real controller page in a phone-sized viewport, driven by a fake screen that picks Obstaculos; taps reach the relay as counters
  const room = 'OBPH';
  const fake = new WebSocket(`ws://127.0.0.1:${PORT}/ws?role=screen&room=${room}`);
  await new Promise((r) => fake.once('open', r));
  const got: any[] = [];
  fake.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.t === 'input') got.push(m);
  });
  fake.send(
    JSON.stringify({
      t: 'config',
      game: 'obstaculos',
      difficulty: 'normal',
      map: '1',
      seed: 4242,
      modeOptions: { tether: 'chain', level: 3 },
    }),
  );
  fake.send(JSON.stringify({ t: 'phase', phase: 'lobby' }));
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/c/?room=${room}` });
  await sleep(1200);
  await cdp.eval(`document.getElementById('name').value = 'Nico'; document.getElementById('join').requestSubmit()`);
  await sleep(1500);
  await cdp.shot('phone-lobby');
  console.log(
    'setup line:',
    JSON.stringify(await cdp.eval(`document.getElementById('setup').textContent`)),
    '| game:',
    JSON.stringify(await cdp.eval(`document.getElementById('game').textContent`)),
  );
  const tap = async (x: number, y: number) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(300);
  };
  await tap(422, 195); // closes the how-to card
  fake.send(JSON.stringify({ t: 'phase', phase: 'playing' }));
  await sleep(900);
  await cdp.shot('phone-play');
  const lab = await cdp.eval<any>(
    `({ a: document.getElementById('btnA').textContent.trim(), b: document.getElementById('btnB').textContent.trim(), stick: document.getElementById('stickhint').textContent.trim() })`,
  );
  console.log('control labels:', JSON.stringify(lab));
  const pos = async (id: string) =>
    cdp.eval<{ x: number; y: number }>(
      `(() => { const b = document.getElementById('${id}').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`,
    );
  const A = await pos('btnA'),
    B = await pos('btnB');
  await tap(A.x, A.y);
  await tap(A.x, A.y);
  await tap(B.x, B.y);
  await sleep(400);
  const last = got[got.length - 1];
  console.log('relay saw presses:', JSON.stringify(last?.presses), 'inputs received:', got.length);
  if (!last || last.presses[0] < 2 || last.presses[1] < 1 || lab.a !== 'Saltar' || lab.b !== 'Agarrar') c.code = 1;
  fake.close();
  return;
}
