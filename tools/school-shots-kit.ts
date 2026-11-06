// Shared by tools/school-shots.ts: a CDP page, a bot phone on a websocket and the rig that drives the school (the real screen, an optional real phone and the bots).
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createGame, addPlayer, TICK_MS, type Game } from '@pichi/game-pizzas/sim';
import { SCHOOL_ROWS, SCHOOL_MAP_ID } from '@pichi/game-pizzas/sim/school';
import { botControls, type BotMem } from '@pichi/game-pizzas/sim/school/school-bot';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Page {
  private id = 0;
  private pending = new Map<number, (m: any) => void>();
  errors: string[] = [];
  constructor(
    private ws: WebSocket,
    readonly name: string,
    private out: string,
  ) {
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.id && this.pending.has(m.id)) {
        this.pending.get(m.id)!(m);
        this.pending.delete(m.id);
      } else if (m.method === 'Runtime.exceptionThrown')
        this.errors.push(
          `${name}: ${JSON.stringify(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 400)}`,
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
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
    return r.result.value as T;
  }
  async shot(file: string) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(this.out, `${file}.png`), Buffer.from(r.data, 'base64'));
    console.log('saved', file);
  }
}

/** A phone on a websocket: it joins, sends its inputs at 30 Hz and hears the school messages. */
export class Bot {
  ws: WebSocket;
  id = 0;
  seq = 0;
  vec = { x: 0, y: 0 };
  btn = 0;
  presses = [0, 0];
  school: any[] = [];
  mem: BotMem = { lastPress: -99, stuck: 0 };
  constructor(
    readonly name: string,
    room: string,
    port: number,
  ) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws?room=${room}`);
    this.ws.on('open', () => this.ws.send(JSON.stringify({ t: 'join', name, token: `bot-${room}-${name}` })));
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.t === 'joined') this.id = m.player.id;
      else if (m.t === 'school') this.school.push(m);
    });
    setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN && this.id)
        this.ws.send(
          JSON.stringify({
            t: 'input',
            seq: this.seq++,
            x: this.vec.x,
            y: this.vec.y,
            btn: this.btn,
            presses: this.presses,
            ts: Date.now(),
          }),
        );
    }, 33).unref();
  }
}

export interface Dbg {
  on: boolean;
  origin: string;
  ending: boolean;
  everyoneDone: boolean;
  done: boolean;
  rows: { id: number; slot: number; step: number; done: boolean; skipped: boolean }[];
  players: any[];
  stations: any[];
}

export type RigOpts = { port: number; cdp: number; out: string };

/** The screen page (`tv`), the bots, and the loop that decides their inputs from the school state the page exposes. */
export class Rig {
  bots: Bot[] = [];
  timers: ReturnType<typeof setInterval>[] = [];
  pages: Page[] = [];
  tv!: Page;
  // the mirror game the bots decide with: the school's kitchen, chefs and stations synced from the page every poll
  private mirror: Game = createGame({ mapId: SCHOOL_MAP_ID, difficulty: 'easy', n: 2, rows: SCHOOL_ROWS, countdownMs: 0 });
  private poll = 0;
  private memPhone: BotMem = { lastPress: -99, stuck: 0 };
  constructor(private o: RigOpts) {}

  mk = async (name: string, url: string, first?: any) => {
    const t =
      first ?? (await (await fetch(`http://127.0.0.1:${this.o.cdp}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json());
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r) => ws.once('open', r));
    const p = new Page(ws, name, this.o.out);
    this.pages.push(p);
    await p.send('Page.enable');
    await p.send('Runtime.enable');
    await p.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    return p;
  };
  /** Attaches the TV page: the first `page` target of the Chrome, at 1920x1080. */
  openTv = async () => {
    let targets: any[] = [];
    for (let i = 0; i < 50 && !targets.length; i++) {
      await sleep(200);
      try {
        targets = (await (await fetch(`http://127.0.0.1:${this.o.cdp}/json/list`)).json()).filter((t: any) => t.type === 'page');
      } catch {
        /* not up */
      }
    }
    this.tv = await this.mk('tv', '', targets[0]);
    await this.tv.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  };
  dbg = () => this.tv.eval<Dbg>('JSON.parse(JSON.stringify(window.__pg.school()))');
  key = (k: string) => this.tv.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  click = (sel: string) => this.tv.eval(`document.querySelector(${JSON.stringify(sel)}).click()`);
  phaseOf = () => this.tv.eval<string>('window.__pg.snapshot().phase');
  until = async (f: () => Promise<boolean>, what: string, ms = 30_000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await f()) return;
      await sleep(120);
    }
    throw new Error(`timeout: ${what}`);
  };
  /** Navigates the TV to a fresh room and waits for it to load. */
  openRoom = async (room: string) => {
    await this.tv.send('Page.navigate', { url: `http://127.0.0.1:${this.o.port}/screen/?room=${room}` });
    await sleep(2200);
  };
  private decideAll = async (phone: Page | null, phoneBot: { id: number }) => {
    const d = await this.dbg();
    const { mirror, bots } = this;
    if (!d.on) return d;
    for (const p of d.players) {
      if (!mirror.players.has(p.id)) addPlayer(mirror, p.id, p.slot, p.slot);
      Object.assign(mirror.players.get(p.id)!, { x: p.x, y: p.y, fx: p.fx, fy: p.fy, item: p.item, cutting: p.cutting });
    }
    d.stations.forEach((s, i) => {
      Object.assign(mirror.stations[i]!, { item: s.item, inputs: s.inputs, done: s.done });
    });
    this.poll++;
    for (const b of bots) {
      const gp = mirror.players.get(b.id);
      const row = d.rows.find((r) => r.id === b.id);
      if (!gp || !row) continue;
      const c = botControls(mirror, gp, row.step, b.mem, this.poll * (50 / TICK_MS));
      b.vec = { x: c.x, y: c.y };
      b.btn = c.b ? 2 : 0;
      if (c.a) b.presses[0] = (b.presses[0]! + c.a) % 65536;
    }
    const mine = mirror.players.get(phoneBot.id),
      mrow = d.rows.find((r) => r.id === phoneBot.id);
    if (phone && mine && mrow) {
      const c = botControls(mirror, mine, mrow.step, this.memPhone, this.poll * (50 / TICK_MS));
      await phone.eval(
        `(() => { const s = window.__pad; s.x = ${c.x}; s.y = ${c.y}; s.btn = ${c.b ? 2 : 0}; s.presses[0] = (s.presses[0] + ${c.a}) % 65536; })()`,
      );
    }
    return d;
  };
  drive = (phone: Page | null, me: { id: number }) => {
    let busy = false;
    const t = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        await this.decideAll(phone, me);
      } catch {
        /* page navigating */
      }
      busy = false;
    }, 50);
    this.timers.push(t);
    return t;
  };
  stopDrive = () => {
    this.timers.splice(0).forEach(clearInterval);
    for (const b of this.bots) {
      b.vec = { x: 0, y: 0 };
      b.btn = 0;
    }
  };
  joinBots = async (room: string, names: string[]) => {
    for (const n of names) {
      this.bots.push(new Bot(n, room, this.o.port));
      await sleep(150);
    }
    await sleep(500);
  };
  closeBots = () => {
    for (const b of this.bots) b.ws.close();
    this.bots.length = 0;
  };
  phoneOpen = async (room: string, name: string) => {
    const ph = await this.mk('phone', `http://127.0.0.1:${this.o.port}/c/?room=${room}`);
    await ph.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
    await ph.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await sleep(1000);
    await ph.eval(`document.getElementById('name').value = ${JSON.stringify(name)}; document.getElementById('join').requestSubmit()`);
    await sleep(1000);
    await ph.eval(`document.getElementById('howto').dispatchEvent(new PointerEvent('pointerup'))`); // close the how-to card
    return ph;
  };
}
