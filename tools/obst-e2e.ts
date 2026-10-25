// End to end of "Obstaculos en cadena": the real server, the real screen in headless Chrome and scripted explorers that are real phones
// (they join by ws, send stick and button counters at 30 Hz, and read the world the way a person reads the screen: from the page).
// usage: npx tsx tools/obst-e2e.ts <play|soak|shots|fps> [n=4] [outDir]     env: PORT (3700) MODE (free|chain) LEVEL (1) DIFF (normal) SOAK_S (300) LAG=1 (150 +- 60 ms, spikes to 370)
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { startServer } from '../apps/server/src/server';
import { ObstBot, type BotView } from '@pichi/game-obstaculos';

const PORT = Number(process.env.PORT ?? 3700),
  CDP = 9444 + (PORT % 50);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const what = process.argv[2] ?? 'play';
const N = Number(process.argv[3] ?? 4);
const outDir = path.resolve(process.argv[4] ?? 'docs/screens/obst');
mkdirSync(outDir, { recursive: true });
const MODE = (process.env.MODE ?? 'free') as 'free' | 'chain';
const LEVEL = Number(process.env.LEVEL ?? 1);
const DIFF = process.env.DIFF ?? 'normal';
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
      } else if (m.method === 'Debugger.paused')
        console.log(
          'PAUSED',
          m.params.callFrames
            .slice(0, 8)
            .map((f: any) => `${f.functionName}@${f.url.split('/').pop()}:${f.location.lineNumber}`)
            .join(' < '),
        );
      else if (m.method === 'Runtime.exceptionThrown')
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
    return file;
  }
}

// A phone: joins, sends its stick and counters at 30 Hz, and (optionally) delays and jitters the packets like a bad wifi.
class Phone {
  ws: WebSocket;
  id = 0;
  seq = 0;
  a = 0;
  b = 0;
  vec = { x: 0, y: 0 };
  bot: ObstBot;
  level = '';
  sent = 0;
  constructor(
    readonly slot: number,
    name: string,
    room: string,
    readonly lag: boolean,
  ) {
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?room=${room}`);
    this.ws.on('open', () => this.ws.send(JSON.stringify({ t: 'join', name, token: `obst-${room}-${slot}` })));
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.t === 'joined') this.id = m.player.id;
    });
    this.bot = new ObstBot(slot);
  }
  startSending() {
    setInterval(() => {
      if (this.ws.readyState !== WebSocket.OPEN) return;
      const msg = JSON.stringify({
        t: 'input',
        seq: this.seq++,
        x: this.vec.x,
        y: this.vec.y,
        btn: 0,
        presses: [this.a, this.b],
        ts: Date.now(),
      });
      const delay = this.lag ? (Math.random() < 0.02 ? 370 : Math.max(0, 150 + (Math.random() - 0.5) * 120)) : 0; // 150 +- 60 ms with a spike now and then
      this.sent++;
      if (delay)
        setTimeout(() => {
          if (this.ws.readyState === WebSocket.OPEN) this.ws.send(msg);
        }, delay);
      else this.ws.send(msg);
    }, 33).unref();
  }
  think(state: ObstState, grid: { w: number; h: number; cells: Uint8Array } | null) {
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
  close() {
    this.ws.close();
  }
}

interface ObstState {
  phase: string;
  sess: string;
  level: string;
  levelIndex: number;
  tick: number;
  countdownMs: number;
  over: boolean;
  world: string;
  players: any[];
  goal: any;
  timeSec: number;
  lives: number;
  deaths: number;
}

async function main() {
  const srv = await startServer({ port: PORT, mode: 'static' });
  let chromeRef: ChildProcess | null = null;
  const dog = setTimeout(
    async () => {
      console.error('watchdog fired');
      if (chromeRef) await killTree(chromeRef);
      process.exit(2);
    },
    Number(process.env.MAX_MS ?? 900_000),
  );
  const profile = mkdtempSync(path.join(tmpdir(), 'pg-obst-chrome-'));
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
      ...(process.env.UNCAP ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : []),
      ...(process.env.SOFTGL ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []),
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  chromeRef = chrome;
  const phones: Phone[] = [];
  let cdpRef: Cdp | null = null;
  const timers: ReturnType<typeof setInterval>[] = [];
  let code = 0;
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
    const cdp = new Cdp(ws);
    cdpRef = cdp;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

    if (what === 'phone') {
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
      if (!last || last.presses[0] < 2 || last.presses[1] < 1 || lab.a !== 'Saltar' || lab.b !== 'Agarrar') code = 1;
      fake.close();
      return;
    }

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

    if (what === 'drop') {
      // a phone loses its connection in the middle of the level and comes back: the level goes on, the slot is kept
      for (let i = 0; i < 80 && ((await state())?.tick ?? 0) < 240; i++) await sleep(100);
      const victim = phones[1]!;
      victim.ws.close();
      await sleep(1500);
      const away = await state();
      console.log('while away: player 1 connected =', away?.players.find((p: any) => p.slot === 1)?.connected, ' level still', away?.world);
      await cdp.shot('drop-away');
      const back = new Phone(1, names[1]!, room, false);
      phones[1] = back;
      back.level = victim.level;
      back.bot = victim.bot;
      back.startSending();
      await sleep(1500);
      const again = await state();
      console.log('after rejoining: player 1 connected =', again?.players.find((p: any) => p.slot === 1)?.connected);
      await cdp.shot('drop-back');
      const t0 = Date.now();
      let ok = false;
      while (Date.now() - t0 < 120_000 && !ok) {
        await sleep(500);
        const st = await state();
        ok = !!st && (st.world === 'cleared' || st.levelIndex > 0);
      }
      console.log(
        `RESULT drop n=${N}: away connected=${away?.players.find((p: any) => p.slot === 1)?.connected}, back connected=${again?.players.find((p: any) => p.slot === 1)?.connected}, level cleared after the drop: ${ok}`,
      );
      if (
        !ok ||
        away?.players.find((p: any) => p.slot === 1)?.connected !== false ||
        again?.players.find((p: any) => p.slot === 1)?.connected !== true
      )
        code = 1;
    }
    if (what === 'switch') {
      // obstaculos -> results -> lobby -> menu -> pizzas -> back: the two games share one canvas and one set of phones
      for (let i = 0; i < 8; i++) {
        for (let k = 0; k < 40 && (await state())?.sess !== 'playing'; k++) await sleep(200);
        if ((await phase()) !== 'playing') break;
        await cdp.eval('window.__pg.obstWin()');
        await sleep(5200);
      }
      for (let i = 0; i < 40 && (await phase()) !== 'results'; i++) await sleep(300);
      await sleep(2500);
      await cdp.shot('switch-results');
      await click('#again');
      await sleep(600);
      console.log('after again ->', await phase());
      await key('Escape');
      for (let i = 0; i < 30 && (await phase()) !== 'menu'; i++) await sleep(200);
      console.log('after Esc ->', await phase());
      await sleep(1800); // the iris is still opening: clicks are ignored until it ends
      await click('[data-game="pizzas"]');
      for (let i = 0; i < 30 && (await phase()) !== 'lobby'; i++) await sleep(200);
      await sleep(700);
      await click('#start');
      for (let i = 0; i < 40 && (await phase()) !== 'playing'; i++) {
        await sleep(300);
        await key('Enter');
      }
      await sleep(4500);
      const sn = await cdp.eval<any>(
        '({ phase: window.__pg.snapshot().phase, stations: window.__pg.snapshot().stations.length, players: window.__pg.snapshot().players.length, countdown: window.__pg.snapshot().countdown })',
      );
      await cdp.shot('switch-pizzas');
      console.log('pizzas after obstaculos:', JSON.stringify(sn), 'page errors', cdp.errors.length);
      if (sn.phase !== 'playing' || sn.stations < 5 || sn.players < 2) code = 1;
    }
    if (what === 'play' || what === 'shots' || what === 'fps') {
      const cleared: { level: string; sec: number }[] = [];
      let lastLevelIdx = 0;
      if (what === 'shots') {
        // mid-level pictures first (the camera, the rope in Encadenados, the group at the wall)
        for (let i = 0; i < 60 && ((await state())?.tick ?? 0) < 420; i++) await sleep(250);
        await cdp.shot(`play-${MODE}-${N}p-t7`);
        await sleep(2500);
        await cdp.shot(`play-${MODE}-${N}p-t10`);
      }
      const t0 = Date.now();
      const need = Number(process.env.CLEAR ?? 2); // levels the bots must clear before the run is closed by hand
      while (cleared.length < need && Date.now() - t0 < 240_000) {
        await sleep(400);
        const st = await state();
        if (!st) continue;
        if (process.env.V && Date.now() % 4000 < 420)
          console.log(
            `  [${((Date.now() - t0) / 1000).toFixed(0)}s] ${st.sess} ${st.level} tick ${st.tick} cd ${st.countdownMs} lives ${st.lives} ${st.players.map((p: any) => `${p.slot}:${(p.x / 48).toFixed(1)},${(p.y / 48).toFixed(1)}${p.mode[0]}`).join(' ')}`,
          );
        if (st.levelIndex > lastLevelIdx || st.sess === 'between') {
          if (st.sess === 'between' && cleared.length === st.levelIndex) {
            cleared.push({ level: st.level, sec: st.timeSec });
            console.log(`  cleared ${st.level} in ${st.timeSec.toFixed(1)} s, deaths ${st.deaths}`);
            if (what === 'shots') await cdp.shot(`cleared-${MODE}-${N}p-${st.level}`);
          }
          lastLevelIdx = st.levelIndex;
        }
      }
      const fps = await cdp.eval<{ avg: number; p5: number; worst: number }>(
        `new Promise((res) => { const ts = []; let n = 0; const f = (t) => { ts.push(t); if (++n < 300) requestAnimationFrame(f); else { const d = ts.slice(1).map((v, i) => v - ts[i]).sort((a, b) => a - b); res({ avg: 1000 / (d.reduce((a, b) => a + b, 0) / d.length), p5: 1000 / d[Math.floor(d.length * 0.95)], worst: d[d.length - 1] }); } }; requestAnimationFrame(f); })`,
      );
      const perf = await cdp.eval<any>('window.__pg.obstPerf()');
      console.log(
        `RESULT ${what} n=${N} ${MODE} level ${LEVEL}: cleared ${cleared.length}/${need}`,
        JSON.stringify(cleared),
        'fps',
        JSON.stringify(fps),
        'step ms',
        JSON.stringify(perf),
      );
      if (cleared.length < need) code = 1;
      if (what === 'shots' || process.env.RESULTS) {
        await sleep(1500);
        await cdp.eval('window.__pg.obstWin && 0');
        // close the run by hand: win whatever is left, to see the results screen
        for (let i = 0; i < 6 && (await phase()) === 'playing'; i++) {
          const st = await state();
          if (st?.sess === 'playing') await cdp.eval('window.__pg.obstWin()');
          await sleep(5200);
          if ((await phase()) === 'playing' && what === 'shots') await cdp.shot(`banner-${N}p-${i}`);
        }
        for (let i = 0; i < 20 && (await phase()) !== 'results'; i++) await sleep(500);
        await sleep(3800);
        await cdp.shot(`results-${N}p`);
      }
    }

    if (what === 'soak') {
      const secs = Number(process.env.SOAK_S ?? 300);
      const t0 = Date.now();
      const mem: number[] = [];
      let rounds = 1,
        lastPhase = 'playing',
        worstP95 = 0,
        worstMax = 0,
        minFps = 999,
        wins = 0,
        lastWin = Date.now();
      const levelsSeen = new Set<string>();
      while (Date.now() - t0 < secs * 1000) {
        await sleep(2000);
        const ph = await phase();
        if (ph === 'results' && lastPhase !== 'results') {
          await sleep(2500);
          await click('#again');
          await sleep(900);
          await click('#start');
          rounds++;
          for (let i = 0; i < 40 && (await phase()) !== 'playing'; i++) {
            await sleep(300);
            await key('Enter');
          }
        }
        lastPhase = ph;
        // the lagging bots rarely clear a level on their own: every SOAK_WIN s the level is closed by hand so the transitions (new world, new view, results, new round) are part of the soak
        const cur = await state();
        if (cur) levelsSeen.add(`${rounds}:${cur.levelIndex}:${cur.level}`);
        if (cur?.sess === 'playing' && Date.now() - lastWin > Number(process.env.SOAK_WIN ?? 40) * 1000) {
          await cdp.eval('window.__pg.obstWin()');
          wins++;
          lastWin = Date.now();
        }
        const perf = await cdp.eval<any>('window.__pg.obstPerf()');
        worstP95 = Math.max(worstP95, perf.p95);
        worstMax = Math.max(worstMax, perf.max);
        if (perf.fps) minFps = Math.min(minFps, perf.fps);
        const heap = await cdp.eval<number>('(performance.memory && performance.memory.usedJSHeapSize) || 0');
        mem.push(heap);
        const st = await state();
        if (mem.length % 10 === 0)
          console.log(
            `  t=${((Date.now() - t0) / 1000).toFixed(0)}s phase ${ph} level ${st?.level} idx ${st?.levelIndex} heap ${(heap / 1e6).toFixed(0)} MB step p95 ${perf.p95.toFixed(2)} ms max ${perf.max.toFixed(2)} fps ${perf.fps?.toFixed(0)}`,
          );
      }
      const first = mem[Math.floor(mem.length * 0.2)] ?? 0,
        last = mem[mem.length - 1] ?? 0;
      console.log(
        `RESULT soak ${secs}s n=${N}: rounds ${rounds}, levels seen ${levelsSeen.size}, hand-cleared ${wins}, step p95 worst ${worstP95.toFixed(2)} ms, max ${worstMax.toFixed(2)} ms, min fps ${minFps.toFixed(0)}, heap ${(first / 1e6).toFixed(0)} -> ${(last / 1e6).toFixed(0)} MB, page errors ${cdp.errors.length}, ws closed ${phones.filter((p) => p.ws.readyState !== WebSocket.OPEN).length}`,
      );
      if (cdp.errors.length) code = 1;
    }
    if (cdp.errors.length) console.log('PAGE ERRORS:', cdp.errors.slice(0, 8).join('\n'));
  } catch (e) {
    console.error('E2E FAILED', e);
    console.error('page errors so far:', cdpRef?.errors.slice(0, 6));
    code = 1;
  } finally {
    timers.forEach(clearInterval);
    phones.forEach((p) => p.close());
    await killTree(chrome);
    clearTimeout(dog);
    await srv.close();
  }
  process.exit(code);
}
main();
