import { WebSocket } from 'ws';
import { PORT, sleep } from '../config';
import type { Ctx } from '../session';

// Manchazo F0 (Arena's grid prototype, `?soon=1&control=A`): the TV with 6 phones played by bots (3 against 3, by slot parity), then the phone's pad.
export async function runArenaGridTv({ cdp, bots, open, join, snap, waitFor, click }: Ctx) {
  const room = 'AGRD';
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${room}&soon=1&control=${process.env.CONTROL ?? 'A'}` });
  await sleep(2500);
  await join(room, 6, [], { menu: true });
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  for (let i = 0; i < 4; i++) {
    if ((await cdp.eval<{ sel: string }>('window.__pg.menu()')).sel === 'arena') break;
    await key('ArrowRight');
    await sleep(150);
  }
  await key('Enter');
  await sleep(2200);
  await cdp.shot('arena-grid-lobby');
  await click('#start');
  await sleep(1500);
  await key('Enter'); // past the how-to / countdown, if one is up
  await waitFor((s) => s.phase === 'playing', 15_000);
  // each bot holds a stick; a few change their mind so the telemetry shows turns
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ] as const;
  bots.forEach((b, i) => {
    b.vec = { x: dirs[i]![0], y: dirs[i]![1] };
    b.startSending();
  });
  let n = 0;
  const flip = setInterval(() => bots.forEach((b, i) => (b.vec = (n + i) % 3 === 0 ? { x: b.vec.y, y: b.vec.x } : b.vec)), 700);
  await sleep(200);
  for (const _ of [0, 1, 2, 3, 4, 5]) {
    n++;
    await sleep(700);
  }
  clearInterval(flip);
  console.log('phase', ((await snap()) as { phase: string }).phase);
  await cdp.shot('arena-grid-tv');
}

export async function runArenaGridPhone({ cdp }: Ctx) {
  const room = 'AGRP';
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
  await cdp.shot('arena-grid-phone');
  fake.close();
}
