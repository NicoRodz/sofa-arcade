import { DIFF, LEVEL, MODE, N, PORT, sleep, what } from './config';
import type { Cdp } from './browser';
import { Phone } from './phone';
import type { ObstState } from './state';

// what every scenario gets once the round is running; `code` is the exit code the run ends with
export interface Ctx {
  cdp: Cdp;
  phones: Phone[];
  room: string;
  names: string[];
  code: number;
  click: (sel: string) => Promise<unknown>;
  key: (k: string) => Promise<unknown>;
  state: () => Promise<ObstState | null>;
  phase: () => Promise<string>;
}

// the explorers join the room, the lobby is configured, the round starts and the bots start thinking
export async function startRun(cdp: Cdp, timers: ReturnType<typeof setInterval>[], phones: Phone[]): Promise<Ctx> {
  const room = `OB${what.slice(0, 2).toUpperCase()}${N}`;
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${room}` });
  for (let i = 0; i < 50 && !(await cdp.eval<boolean>('!!window.__pg').catch(() => false)); i++) await sleep(200);
  await sleep(1200);
  const names = ['Nico', 'Angi', 'Pablo', 'Mati', 'Coni', 'Rafa', 'Vale', 'Tomás'];
  for (let i = 0; i < N; i++) {
    phones.push(new Phone(i, names[i]!, room, !!process.env.LAG));
    await sleep(150);
  }
  await sleep(800);
  const click = (sel: string) => cdp.eval(`document.querySelector(${JSON.stringify(sel)}).click()`);
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  const state = () => cdp.eval<ObstState | null>('window.__pg ? window.__pg.obst() : null');
  const phase = () => cdp.eval<string>('window.__pg.snapshot().phase');
  // menu -> game card -> lobby (the iris wipe takes ~1 s each way)
  await cdp.shot(`${what}-menu`);
  console.log('menu shot done');
  await click('[data-game="obstaculos"]');
  console.log('card clicked');
  for (let i = 0; i < 30 && (await phase()) !== 'lobby'; i++) await sleep(150);
  console.log('phase', await phase());
  await sleep(800);
  if (process.env.PAUSE) {
    await cdp.send('Debugger.enable');
    setTimeout(() => cdp.send('Debugger.pause').catch(() => {}), 6000);
  }
  console.log('A');
  await click(`[data-tether="${MODE}"]`);
  console.log('B');
  await click(`[data-level="${LEVEL}"]`);
  console.log('C');
  await click(`[data-diff="${DIFF}"]`);
  console.log('D');
  await sleep(500);
  if (what === 'shots') await cdp.shot(`lobby-${N}p`);

  const startRound = async () => {
    await click('#start');
    for (let i = 0; i < 40 && (await phase()) !== 'playing'; i++) {
      await sleep(300);
      await key('Enter');
    } // Enter skips the how-to card
    for (let i = 0; i < 40 && !(await state()); i++) await sleep(100);
  };
  await startRound();

  let grid: { w: number; h: number; cells: Uint8Array } | null = null;
  let gridLevel = '';
  const loop = setInterval(async () => {
    try {
      const st = await state();
      if (!st) return;
      if (st.level !== gridLevel) {
        const g = await cdp.eval<any>('window.__pg.obstGrid()');
        if (g) {
          grid = { w: g.w, h: g.h, cells: Uint8Array.from(g.cells) };
          gridLevel = st.level;
        }
      }
      for (const p of phones) p.think(st, grid);
    } catch {
      /* page busy or navigating */
    }
  }, 66);
  timers.push(loop);
  phones.forEach((p) => p.startSending());

  return { cdp, phones, room, names, code: 0, click, key, state, phase };
}
