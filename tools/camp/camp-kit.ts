// Shared by tools/camp/camp-e2e.ts and camp-w23.ts: a CDP client, a bot phone on a websocket, the headless Chrome launch and the driver of the real screen.
import { type ChildProcess, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { WebSocket } from 'ws';
import { ObstBot, type BotView } from '@pichi/game-obstaculos';
import { waitForPageTarget } from '../capture/page-target';
import { killTree } from '../proc/kill-tree';

export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) process.exitCode = 1;
};

export class Cdp {
  private id = 0;
  private pending = new Map<number, (v: any) => void>();
  errors: string[] = [];
  constructor(
    private ws: WebSocket,
    private outDir: string,
  ) {
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.id && this.pending.has(m.id)) {
        this.pending.get(m.id)!(m);
        this.pending.delete(m.id);
      } else if (m.method === 'Runtime.exceptionThrown')
        this.errors.push(
          `EXC ${JSON.stringify(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 400)}`,
        );
      else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
        this.errors.push(
          `console.error ${m.params.args
            .map((a: any) => a.value ?? a.description)
            .join(' ')
            .slice(0, 300)}`,
        );
    });
  }
  send(method: string, params: object = {}): Promise<any> {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval<T = unknown>(expr: string): Promise<T> {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, timeout: 20_000 });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
    return r.result.value as T;
  }
  async shot(name: string) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(this.outDir, `${name}.png`);
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    console.log('saved', file);
  }
}

/** A phone on a websocket: it joins, sends its inputs at 30 Hz and plays with an ObstBot. */
export class Phone {
  ws: WebSocket;
  id = 0;
  seq = 0;
  a = 0;
  b = 0;
  vec = { x: 0, y: 0 };
  bot: ObstBot;
  level = '';
  timer: ReturnType<typeof setInterval>;
  constructor(
    readonly slot: number,
    name: string,
    room: string,
    port: number,
    tokenPrefix: string,
  ) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws?room=${room}`);
    this.ws.on('open', () => this.ws.send(JSON.stringify({ t: 'join', name, token: `${tokenPrefix}-${room}-${slot}` })));
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.t === 'joined') this.id = m.player.id;
    });
    this.bot = new ObstBot(slot);
    this.timer = setInterval(() => {
      if (this.ws.readyState !== WebSocket.OPEN) return;
      this.ws.send(
        JSON.stringify({ t: 'input', seq: this.seq++, x: this.vec.x, y: this.vec.y, btn: 0, presses: [this.a, this.b], ts: Date.now() }),
      );
    }, 33);
    this.timer.unref();
  }
  close() {
    clearInterval(this.timer);
    this.ws.close();
  }
  think(state: any, grid: any) {
    if (!grid || state.sess !== 'playing') {
      this.vec = { x: 0, y: 0 };
      return;
    }
    if (state.level !== this.level) {
      this.level = state.level;
      this.bot.reset();
    }
    const view: BotView = { tick: state.tick, grid, players: state.players, goal: state.goal };
    const o = this.bot.decide(view);
    this.vec = { x: o.x, y: o.y };
    if (o.jump) this.a++;
    if (o.grab) this.b++;
  }
}

/** Headless Chrome with the flags the campaign scripts share, plus a watchdog that kills its tree and exits 2. */
export function launchChrome(
  cdpPort: number,
  profile: string,
  watchdogMs: number,
): { chrome: ChildProcess; dog: ReturnType<typeof setTimeout> } {
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${profile}`,
      '--window-size=1920,1080',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--ignore-gpu-blocklist',
      '--force-color-profile=srgb',
      '--autoplay-policy=no-user-gesture-required',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const dog = setTimeout(async () => {
    console.error('watchdog fired');
    await killTree(chrome);
    process.exit(2);
  }, watchdogMs);
  return { chrome, dog };
}

/** Attaches to the first page of the Chrome on `cdpPort` and sets the 1920x1080 TV viewport. */
export async function connectScreen(cdpPort: number, outDir: string): Promise<Cdp> {
  const target = await waitForPageTarget(cdpPort, { timeoutMs: 10_000 });
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.once('open', r));
  const c = new Cdp(ws, outDir);
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  return c;
}

export type DriverOpts = { port: number; room: string; tokenPrefix: string };

/** Drives the real screen (keys, window.__pg probes, waits) and owns the two bot phones and the bot timers. */
export class ScreenDriver {
  phones: Phone[] = [];
  timers: ReturnType<typeof setInterval>[] = [];
  constructor(
    readonly c: Cdp,
    private o: DriverOpts,
  ) {}
  navigate = () => this.c.send('Page.navigate', { url: `http://127.0.0.1:${this.o.port}/screen/?room=${this.o.room}` });
  ready = async () => {
    for (let i = 0; i < 50 && !(await this.c.eval<boolean>('!!window.__pg').catch(() => false)); i++) await sleep(200);
    await sleep(1000);
  };
  key = (k: string) => this.c.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  camp = () => this.c.eval<any>('window.__pg.camp()');
  phase = () => this.c.eval<string>('window.__pg.snapshot().phase');
  text = (sel: string) => this.c.eval<string>(`(document.querySelector(${JSON.stringify(sel)})?.textContent ?? '')`);
  attr = (sel: string, a: string) =>
    this.c.eval<string>(`(document.querySelector(${JSON.stringify(sel)})?.getAttribute(${JSON.stringify(a)}) ?? '')`);
  waitFor = async (f: () => Promise<boolean>, what: string, ms = 20_000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await f().catch(() => false)) return;
      await sleep(150);
    }
    throw new Error(`timeout: ${what}`);
  };
  closePhones = () => this.phones.forEach((p) => p.close());
  join = async () => {
    this.closePhones();
    this.phones = [
      new Phone(0, 'Nico', this.o.room, this.o.port, this.o.tokenPrefix),
      new Phone(1, 'Angi', this.o.room, this.o.port, this.o.tokenPrefix),
    ];
    await sleep(1200);
  };
  openObst = async () => {
    await this.waitFor(async () => (await this.phase()) === 'menu', 'menu');
    await this.c.eval(`document.querySelector('[data-game="obstaculos"]').click()`);
    await this.waitFor(async () => (await this.phase()) === 'lobby', 'lobby');
    await this.waitFor(
      async () => !(await this.c.eval<boolean>(`document.getElementById('campaign').classList.contains('off')`)),
      'campaign panel',
    );
    await sleep(1200);
  };
  /** Every 66 ms the phones read the level state from the page and decide their input. */
  startBots = () => {
    let grid: any = null,
      gridLevel = '';
    this.timers.push(
      setInterval(async () => {
        try {
          const st = await this.c.eval<any>('window.__pg.obst()');
          if (!st) return;
          if (st.level !== gridLevel) {
            const g = await this.c.eval<any>('window.__pg.obstGrid()');
            if (g) {
              grid = { w: g.w, h: g.h, cells: Uint8Array.from(g.cells) };
              gridLevel = st.level;
            }
          }
          this.phones.forEach((p) => p.think(st, grid));
        } catch {
          /* busy */
        }
      }, 66),
    );
  };
  stopBots = () => {
    this.timers.forEach(clearInterval);
    this.timers.length = 0;
  };
  /** Opens the Obstaculos lobby on a fresh page load with two new phones. */
  enterLobby = async () => {
    await this.navigate();
    await this.ready();
    await this.join();
    await this.openObst();
  };
}
