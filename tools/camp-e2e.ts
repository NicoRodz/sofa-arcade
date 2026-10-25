// End to end of the campaign: the real server (data folder in a temp dir), the real screen in headless Chrome and two bots that are real phones on websockets.
//   hub (nothing yet) -> Nueva expedición -> map -> 1-1 played by the bots -> results -> server restart -> reload -> "Continuar" offers 1-2.
// usage: npx tsx tools/camp-e2e.ts [outDir]    env: PORT (4400) CDP (9730)
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { startServer } from '../server/src/server';
import { ObstBot, type BotView } from '../shared/games/obstaculos';

const PORT = Number(process.env.PORT ?? 4400),
  CDP = Number(process.env.CDP ?? 9730);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = path.resolve(process.argv[2] ?? 'docs/screens/camp');
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function descendants(pid: number): number[] {
  const rows = execSync('ps -A -o pid=,ppid=')
    .toString()
    .trim()
    .split('\n')
    .map((l) => l.trim().split(/\s+/).map(Number));
  const out: number[] = [];
  const walk = (p: number) => {
    for (const [c, pp] of rows)
      if (pp === p && c !== undefined) {
        out.push(c);
        walk(c);
      }
  };
  walk(pid);
  return out;
}
async function killTree(proc: ChildProcess) {
  if (!proc.pid) return;
  const pids = [proc.pid, ...descendants(proc.pid)];
  for (const p of pids) {
    try {
      process.kill(p, 'SIGTERM');
    } catch {
      /* gone */
    }
  }
  await sleep(700);
  for (const p of pids) {
    try {
      process.kill(p, 0);
      process.kill(p, 'SIGKILL');
    } catch {
      /* gone */
    }
  }
}

class Cdp {
  private id = 0;
  private pending = new Map<number, (v: any) => void>();
  errors: string[] = [];
  constructor(private ws: WebSocket) {
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
    const file = path.join(outDir, `${name}.png`);
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    console.log('saved', file);
  }
}

class Phone {
  ws: WebSocket;
  id = 0;
  seq = 0;
  a = 0;
  b = 0;
  vec = { x: 0, y: 0 };
  bot: ObstBot;
  level = '';
  constructor(
    readonly slot: number,
    name: string,
    room: string,
  ) {
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?room=${room}`);
    this.ws.on('open', () => this.ws.send(JSON.stringify({ t: 'join', name, token: `camp-${room}-${slot}` })));
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.t === 'joined') this.id = m.player.id;
    });
    this.bot = new ObstBot(slot);
    setInterval(() => {
      if (this.ws.readyState !== WebSocket.OPEN) return;
      this.ws.send(
        JSON.stringify({ t: 'input', seq: this.seq++, x: this.vec.x, y: this.vec.y, btn: 0, presses: [this.a, this.b], ts: Date.now() }),
      );
    }, 33).unref();
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

const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) process.exitCode = 1;
};

async function main() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'pg-camp-e2e-'));
  let srv = await startServer({ port: PORT, mode: 'static', dataDir });
  const profile = mkdtempSync(path.join(tmpdir(), 'pg-camp-chrome-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP}`,
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
  }, 420_000);
  let phones: Phone[] = [];
  let cdp: Cdp | null = null;
  const timers: ReturnType<typeof setInterval>[] = [];
  try {
    let targets: any[] = [];
    for (let i = 0; i < 50 && !targets.length; i++) {
      await sleep(200);
      try {
        targets = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).filter((t: any) => t.type === 'page');
      } catch {
        /* not up yet */
      }
    }
    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    await new Promise((r) => ws.once('open', r));
    cdp = new Cdp(ws);
    const c = cdp;
    await c.send('Page.enable');
    await c.send('Runtime.enable');
    await c.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

    const room = 'CAMP';
    const ready = async () => {
      for (let i = 0; i < 50 && !(await c.eval<boolean>('!!window.__pg').catch(() => false)); i++) await sleep(200);
      await sleep(1000);
    };
    const key = (k: string) => c.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
    const camp = () => c.eval<any>('window.__pg.camp()');
    const phase = () => c.eval<string>('window.__pg.snapshot().phase');
    const text = (sel: string) => c.eval<string>(`(document.querySelector(${JSON.stringify(sel)})?.textContent ?? '')`);
    const attr = (sel: string, a: string) =>
      c.eval<string>(`(document.querySelector(${JSON.stringify(sel)})?.getAttribute(${JSON.stringify(a)}) ?? '')`);
    const waitFor = async (f: () => Promise<boolean>, what: string, ms = 20_000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (await f().catch(() => false)) return;
        await sleep(150);
      }
      throw new Error(`timeout: ${what}`);
    };
    const join = async () => {
      phones.forEach((p) => p.ws.close());
      phones = [new Phone(0, 'Nico', room), new Phone(1, 'Angi', room)];
      await sleep(1200);
    };
    const openObst = async () => {
      await waitFor(async () => (await phase()) === 'menu', 'menu');
      await c.eval(`document.querySelector('[data-game="obstaculos"]').click()`);
      await waitFor(async () => (await phase()) === 'lobby', 'lobby');
      await waitFor(
        async () => !(await c.eval<boolean>(`document.getElementById('campaign').classList.contains('off')`)),
        'campaign panel',
      );
      await sleep(1200);
    };

    await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${room}` });
    await ready();
    await join();
    await openObst();
    await c.eval('localStorage.clear()');

    // 1. the hub with nothing saved: no "Continuar"
    check(
      (await c.eval<number>(`document.querySelectorAll('#campaign [data-hub="continue"]').length`)) === 0,
      'hub without expeditions has no Continuar',
    );
    await c.shot('hub-empty');

    // 2. Nueva expedición -> the map
    await c.eval(`document.querySelector('#campaign [data-hub="new"]').click()`);
    await waitFor(async () => (await camp()).state.view === 'map', 'map view');
    await sleep(600);
    const expId = (await camp()).expId as string;
    check(/^exp-/.test(expId), `expedition created on the server (${expId})`);
    check((await text('#campaign .cname')) === 'Nico y Angi', 'the expedition is named after the players');
    await c.shot('map-new');

    // 3. 1-1: the bots play it
    await key('Enter');
    await waitFor(async () => (await phase()) === 'playing', 'playing');
    let grid: any = null,
      gridLevel = '';
    const think = () =>
      timers.push(
        setInterval(async () => {
          try {
            const st = await c.eval<any>('window.__pg.obst()');
            if (!st) return;
            if (st.level !== gridLevel) {
              const g = await c.eval<any>('window.__pg.obstGrid()');
              if (g) {
                grid = { w: g.w, h: g.h, cells: Uint8Array.from(g.cells) };
                gridLevel = st.level;
              }
            }
            phones.forEach((p) => p.think(st, grid));
          } catch {
            /* busy */
          }
        }, 66),
      );
    think();
    await waitFor(async () => !!(await camp()).outcome?.cleared, 'the bots clear 1-1', 120_000);
    const o = (await camp()).outcome;
    console.log('outcome', JSON.stringify({ levelId: o.levelId, stars: o.after.stars, next: o.next?.id, saved: o.saved }));
    check(o.levelId === '1-1' && o.cleared && o.saved, 'level 1-1 cleared and saved');
    check(o.next?.id === '1-2', 'Siguiente offers 1-2');
    const onDisk = () => JSON.parse(readFileSync(path.join(dataDir, `${expId}.json`), 'utf8'));
    check(onDisk().levels['1-1']?.done === true, 'the server wrote 1-1 as done (before the banners ended)');
    await waitFor(async () => (await phase()) === 'results', 'results phase', 30_000);
    await sleep(1800);
    await c.shot('result-1-1');
    check((await text('#campres .rtitle')) === '¡Nivel completado!', 'results panel is the campaign one');
    check((await c.eval<number>(`document.querySelectorAll('#campres .rbtn').length`)) === 3, 'three buttons: Siguiente, Repetir, Mapa');

    // 3b. Siguiente: the bots play 1-2 (Encadenados, with the campaign's longer rope)
    await key('Enter');
    await waitFor(async () => {
      const k = await camp();
      return (await phase()) === 'playing' && k.run === '1-2';
    }, 'playing 1-2');
    await waitFor(
      async () => {
        const k = await camp();
        return k.outcome?.levelId === '1-2' && !!k.outcome?.cleared;
      },
      'the bots clear 1-2',
      150_000,
    );
    check(onDisk().levels['1-2']?.done === true, 'the server wrote 1-2 as done');
    await waitFor(async () => (await phase()) === 'results', 'results of 1-2', 30_000);
    await sleep(1500);
    await c.shot('result-1-2');

    // 4. Esc = Mapa: the cursor is on the next open level
    await key('Escape');
    await waitFor(async () => (await phase()) === 'lobby' && (await camp()).state.view === 'map', 'back on the map');
    await sleep(800);
    const sel = await c.eval<string>(`document.querySelector('#campaign .cnode.sel')?.className ?? ''`);
    check(/open/.test(sel), 'the cursor sits on the next open level (1-3)');
    await c.shot('map-after-1-1');
    timers.forEach(clearInterval);

    // 5. the server stops and comes back on the same folder; the page is reloaded (a fresh screen); Continuar offers 1-2
    phones.forEach((p) => p.ws.close());
    await srv.close();
    srv = await startServer({ port: PORT, mode: 'static', dataDir });
    await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${room}` });
    await ready();
    await join();
    await openObst();
    const label = await attr('#campaign [data-hub="continue"]', 'data-label');
    console.log('Continuar label:', label);
    check(/^Continuar · Nico y Angi · Playa 1-3 · \d+★$/.test(label), 'after the restart Continuar offers Playa 1-3 with the group name');
    await c.shot('hub-continue');
    await c.eval(`document.querySelector('#campaign [data-hub="continue"]').click()`);
    await waitFor(async () => (await camp()).state.view === 'map', 'map after Continuar');
    await sleep(600);
    check(
      (await c.eval<string>(`document.querySelector('#campaign .cnode.sel')?.className ?? ''`)).includes('open'),
      'Continuar opens the map on the open level',
    );
    await c.shot('map-continue');

    think(); // the phones are new after the reload
    // 5b. the practice room: 8 stations, the ones of the levels already reached open
    await key('Escape');
    await waitFor(async () => (await camp()).state.view === 'hub', 'hub for the practice room');
    await sleep(900); // the hub reloads its list after leaving; clicks wait for it
    await c.eval(`document.querySelector('#campaign [data-hub="practice"]').click()`);
    await waitFor(async () => (await camp()).state.view === 'practice', 'practice view');
    await sleep(500);
    check(
      (await c.eval<number>(`document.querySelectorAll('#campaign [data-station]').length`)) === 8,
      'the practice room lists 8 stations',
    );
    check(
      (await c.eval<number>(`document.querySelectorAll('#campaign [data-station]:not(.dis)').length`)) === 5,
      'five stations are open after 1-1 and 1-2 (1-3 is reached, its tower station opens)',
    );
    await c.shot('practice');
    await key('Enter'); // Mover
    await waitFor(async () => (await phase()) === 'playing' && (await camp()).run === 'p-move', 'playing the station');
    await waitFor(
      async () => {
        const k = await camp();
        return k.outcome?.levelId === 'p-move' && !!k.outcome?.cleared;
      },
      'the bots clear the station',
      90_000,
    );
    check(
      JSON.parse(readFileSync(path.join(dataDir, `${expId}.json`), 'utf8')).levels['p-move'] === undefined,
      'the practice saved nothing',
    );
    await waitFor(async () => (await phase()) === 'results', 'practice results', 30_000);
    await sleep(1200);
    await c.shot('practice-result');
    await key('Escape');
    await waitFor(async () => (await phase()) === 'lobby' && (await camp()).state.view === 'practice', 'back on the stations');
    await key('Escape');
    await waitFor(async () => (await camp()).state.view === 'hub', 'hub again after the practice');

    // 6. reset: "?" arms it, OK before 3 s is refused, OK after 3 s sends it to the trash
    await sleep(500);
    for (let i = 0; i < 4; i++) {
      await key('ArrowUp');
      await sleep(150);
    } // back on Continuar
    await key('h');
    await sleep(500);
    check((await camp()).state.resetArmedAt !== null, "the Captain's ? arms the reset");
    await key('Enter');
    await sleep(400);
    check(readdirSync(dataDir).includes(`${expId}.json`), 'OK before 3 s does not reset');
    await c.shot('reset-armed');
    await sleep(3000);
    await key('Enter');
    await waitFor(async () => !readdirSync(dataDir).includes(`${expId}.json`), 'the file left the data folder', 8000);
    check(
      readdirSync(path.join(dataDir, 'trash')).some((f) => f.startsWith(expId)),
      'the reset expedition is in the trash',
    );
    await waitFor(
      async () => (await c.eval<number>(`document.querySelectorAll('#campaign [data-hub="continue"]').length`)) === 0,
      'the hub drops Continuar',
      5000,
    ).catch(() => {});
    check(
      (await c.eval<number>(`document.querySelectorAll('#campaign [data-hub="continue"]').length`)) === 0,
      'the hub no longer offers Continuar',
    );
    await c.shot('hub-after-reset');

    if (c.errors.length) {
      console.log('PAGE ERRORS:', c.errors.slice(0, 6).join('\n'));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error('E2E FAILED', e);
    console.error('page errors:', cdp?.errors.slice(0, 6));
    process.exitCode = 1;
  } finally {
    timers.forEach(clearInterval);
    phones.forEach((p) => p.ws.close());
    await killTree(chrome);
    clearTimeout(dog);
    await srv.close();
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(profile, { recursive: true, force: true });
    process.exit(process.exitCode ?? 0);
  }
}
main();
