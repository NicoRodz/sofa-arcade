import type { ChildProcess } from 'node:child_process';
import { startServer } from '../../apps/server/src/server';
import { Bot } from './bots';
import { killTree } from '../kill-tree';
import { type Cdp, connectCdp, launchChrome } from './browser';
import { PORT, sleep } from './config';
import { logSnap } from './report';
import type { Snap } from './snapshot';

export interface Ctx {
  cdp: Cdp;
  bots: Bot[];
  timers: ReturnType<typeof setInterval>[];
  open: (room: string) => Promise<void>;
  join: (room: string, n: number, rows: readonly string[], opts?: { from?: number; menu?: boolean }) => Promise<void>;
  click: (sel: string) => Promise<unknown>;
  snap: () => Promise<Snap>;
  waitFor: (pred: (s: Snap) => boolean, ms: number) => Promise<Snap | null>;
}

function makeCtx(cdp: Cdp): Ctx {
  const bots: Bot[] = [];
  const timers: ReturnType<typeof setInterval>[] = [];
  const open = async (room: string) => {
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${room}` });
    await sleep(2500);
  };
  // bots i..n-1 join; by default the screen then skips the start menu (its player range included) so the older modes keep working
  const join = async (room: string, n: number, rows: readonly string[], opts: { from?: number; menu?: boolean } = {}) => {
    const names = ['Nico', 'Angi', 'Pablo', 'Mati', 'Coni', 'Rafa', 'Vale', 'Tomás'];
    for (let i = opts.from ?? 0; i < n; i++) {
      const b = new Bot(i, names[i]!, room, rows);
      bots.push(b);
      await sleep(150);
    }
    await sleep(600);
    if (!opts.menu) await cdp.eval('window.__pg.forceLobby()');
  };
  const click = (sel: string) => cdp.eval(`document.querySelector(${JSON.stringify(sel)}).click()`);
  const snap = () => cdp.eval<Snap>('JSON.parse(JSON.stringify(window.__pg.snapshot()))');
  const waitFor = async (pred: (s: Snap) => boolean, ms: number) => {
    const end = Date.now() + ms;
    let n = 0;
    while (Date.now() < end) {
      const s = await snap();
      if (pred(s)) return s;
      if (process.env.DEBUG_BOT && n++ % 20 === 0) logSnap(s);
      await sleep(150);
    }
    return null;
  };
  return { cdp, bots, timers, open, join, click, snap, waitFor };
}

// server + headless Chrome + watchdog around one capture run; always tears Chrome (by PID tree) and the server down
export async function withSession(run: (ctx: Ctx) => Promise<void>) {
  const srv = await startServer({ port: PORT, mode: process.env.DEV ? 'dev' : 'static' });
  let chromeRef: ChildProcess | null = null;
  // watchdog: never leave Chrome or the server behind
  const dog = setTimeout(
    async () => {
      console.error('watchdog fired');
      if (chromeRef) await killTree(chromeRef);
      process.exit(2);
    },
    Number(process.env.MAX_MS ?? 280_000),
  );
  const chrome = launchChrome();
  chromeRef = chrome;
  let ctx: Ctx | null = null;
  try {
    const cdp = await connectCdp();
    ctx = makeCtx(cdp);
    await run(ctx);
  } finally {
    ctx?.timers.forEach(clearInterval);
    ctx?.bots.forEach((b) => b.close());
    clearTimeout(dog);
    await killTree(chrome);
    await srv.close();
  }
}
