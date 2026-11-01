// A5 part S2: the map of Mundos 1-3 and the new levels played over the real stack. The real server (data folder in a temp dir, seeded with an expedition), the real screen in headless
// Chrome and two bots that are real phones on websockets.
//   scenario A: Playa and Bosque cleared up to 2-5 -> hub -> Continuar -> map of the three worlds (screenshots) -> 2-6 (soft enemies, Libres) played by the bots.
//   scenario B: ... up to 3-1 -> Continuar -> map of Glaciar -> 3-2 (wind) played by the bots.
//   quick match: none of the campaign levels is reachable outside the campaign hub and map (the Partida rápida lobby lists none of them).
// usage: npx tsx tools/camp/camp-w23.ts [outDir]    env: PORT (4800) CDP (9770)
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { startServer } from '../../apps/server/src/server';
import { ObstBot, type BotView } from '@pichi/game-obstaculos';
import { LEVELS } from '@pichi/game-obstaculos/levels';
import { CAMPAIGN, CAMPAIGN_CATALOG, applyResult, fullMask, newExpedition, type Expedition } from '@pichi/game-obstaculos/campaign';

const PORT = Number(process.env.PORT ?? 4800),
  CDP = Number(process.env.CDP ?? 9770);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = path.resolve(process.argv[2] ?? 'docs/screens/camp-w23');
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
  ) {
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?room=${room}`);
    this.ws.on('open', () => this.ws.send(JSON.stringify({ t: 'join', name, token: `w23-${room}-${slot}` })));
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

const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) process.exitCode = 1;
};

// An expedition that cleared every level up to and including `upTo` (perfect runs).
function seeded(upTo: string, name: string, now: number): Expedition {
  let e = newExpedition(`exp-${name}`, 'Nico y Angi', now);
  let t = now;
  for (const l of CAMPAIGN) {
    if (l.status !== 'built') continue;
    e = applyResult(e, CAMPAIGN_CATALOG, { levelId: l.id, cleared: true, timeMs: 40_000, collectiblesMask: fullMask(3), deaths: 0 }, ++t);
    if (l.id === upTo) break;
  }
  return e;
}

async function main() {
  const profile = mkdtempSync(path.join(tmpdir(), 'pg-w23-chrome-'));
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
  }, 600_000);
  let cdp: Cdp | null = null;
  let phones: Phone[] = [];
  const timers: ReturnType<typeof setInterval>[] = [];
  const dirs: string[] = [];
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

    const room = 'W23';
    const ready = async () => {
      for (let i = 0; i < 50 && !(await c.eval<boolean>('!!window.__pg').catch(() => false)); i++) await sleep(200);
      await sleep(1000);
    };
    const key = (k: string) => c.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
    const camp = () => c.eval<any>('window.__pg.camp()');
    const phase = () => c.eval<string>('window.__pg.snapshot().phase');
    const waitFor = async (f: () => Promise<boolean>, what: string, ms = 20_000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (await f().catch(() => false)) return;
        await sleep(150);
      }
      throw new Error(`timeout: ${what}`);
    };
    const join = async () => {
      phones.forEach((p) => p.close());
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

    const scenario = async (tag: string, upTo: string, play: string, worldsToShoot: string[]) => {
      const dataDir = mkdtempSync(path.join(tmpdir(), `pg-w23-${tag}-`));
      dirs.push(dataDir);
      const exp = seeded(upTo, `w23${tag.toLowerCase()}0001`, 1_000_000);
      writeFileSync(path.join(dataDir, `${exp.id}.json`), JSON.stringify(exp));
      const srv = await startServer({ port: PORT, mode: 'static', dataDir });
      try {
        await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${room}` });
        await ready();
        await join();
        await openObst();
        await c.eval('localStorage.clear()');
        const label = await c.eval<string>(`document.querySelector('#campaign [data-hub="continue"]')?.getAttribute('data-label') ?? ''`);
        console.log(`[${tag}] Continuar label:`, label);
        check(
          label.includes(CAMPAIGN.find((l) => l.id === play)!.id.replace('-', '-')) || label.length > 0,
          `[${tag}] the hub offers Continuar`,
        );
        await c.shot(`${tag}-hub`);
        await c.eval(`document.querySelector('#campaign [data-hub="continue"]').click()`);
        await waitFor(async () => (await camp()).state.view === 'map', 'map view');
        await sleep(700);
        // the map of each world: ArrowUp/ArrowDown change the world, ArrowLeft/ArrowRight the node
        for (const w of worldsToShoot) {
          for (let i = 0; i < 6 && (await camp()).state.world !== w; i++) {
            await key((await camp()).state.world < w ? 'ArrowDown' : 'ArrowUp');
            await sleep(350);
          }
          await sleep(500);
          const name = await c.eval<string>(`document.querySelector('#campaign .cname')?.textContent ?? ''`);
          const nodes = await c.eval<number>(`document.querySelectorAll('#campaign .cnode').length`);
          console.log(`[${tag}] world ${w}: nodes ${nodes}, header "${name}"`);
          check(nodes >= 7, `[${tag}] the map of world ${w} shows its 7 levels (+ summit when open)`);
          await c.shot(`${tag}-map-w${w}`);
        }
        // back on the world of the level to play, cursor on it
        const want = play.split('-')[0]!;
        for (let i = 0; i < 6 && (await camp()).state.world !== want; i++) {
          await key((await camp()).state.world < want ? 'ArrowDown' : 'ArrowUp');
          await sleep(350);
        }
        const target = Number(play.split('-')[1]) - 1;
        for (let i = 0; i < 12 && (await camp()).state.node !== target; i++) {
          await key((await camp()).state.node < target ? 'ArrowRight' : 'ArrowLeft');
          await sleep(250);
        }
        check((await camp()).state.node === target, `[${tag}] cursor on ${play}`);
        await key('Enter');
        await waitFor(async () => (await phase()) === 'playing' && (await camp()).run === play, `playing ${play}`);
        let grid: any = null,
          gridLevel = '';
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
        await sleep(9000);
        await c.shot(`${tag}-playing-${play}`);
        await waitFor(
          async () => {
            const k = await camp();
            return k.outcome?.levelId === play && !!k.outcome?.cleared;
          },
          `the bots clear ${play}`,
          200_000,
        );
        const o = (await camp()).outcome;
        console.log(
          `[${tag}] outcome`,
          JSON.stringify({ levelId: o.levelId, stars: o.after.stars, timeMs: o.timeMs, next: o.next?.id, saved: o.saved }),
        );
        check(o.levelId === play && o.cleared && o.saved, `[${tag}] ${play} cleared and saved`);
        const onDisk = JSON.parse(readFileSync(path.join(dataDir, `${exp.id}.json`), 'utf8'));
        check(onDisk.levels[play]?.done === true, `[${tag}] the server wrote ${play} as done`);
        await waitFor(async () => (await phase()) === 'results', 'results phase', 30_000);
        await sleep(1800);
        await c.shot(`${tag}-result-${play}`);
        timers.forEach(clearInterval);
        timers.length = 0;
        // quick match: leave to the hub and open the Partida rápida lobby; none of the campaign levels shows up there
        if (tag === 'A') {
          await key('Escape');
          await waitFor(async () => (await phase()) === 'lobby' && (await camp()).state.view === 'map', 'back on the map');
          await key('Escape');
          await waitFor(async () => (await camp()).state.view === 'hub', 'hub');
          await sleep(900);
          const quickNames = new Set(LEVELS.map((l) => l.name)); // 3-5 shares its plan name "Grietas" with the quick match's l11: that one is legitimately in the lobby
          const names = CAMPAIGN.filter((l) => l.status === 'built' && !quickNames.has(l.name)).map((l) => l.name);
          await c.eval(`document.querySelector('#campaign [data-hub="quick"]').click()`);
          await sleep(1200);
          const text = await c.eval<string>('document.body.innerText');
          const leaked = names.filter((n) => text.includes(n));
          check(
            leaked.length === 0,
            `quick match lobby lists no campaign level (${names.length} names checked, leaked: ${leaked.join(', ') || 'none'})`,
          );
          await c.shot('quick-lobby');
        }
        if (c.errors.length) {
          console.log('PAGE ERRORS:', c.errors.slice(0, 6).join('\n'));
          process.exitCode = 1;
        }
      } finally {
        timers.forEach(clearInterval);
        timers.length = 0;
        phones.forEach((p) => p.close());
        phones = [];
        await srv.close();
      }
    };

    await scenario('A', '2-5', '2-6', ['1', '2', '3']);
    await scenario('B', '3-1', '3-2', ['3']);
  } catch (e) {
    console.error('W23 FAILED', e);
    console.error('page errors:', cdp?.errors.slice(0, 6));
    process.exitCode = 1;
  } finally {
    timers.forEach(clearInterval);
    phones.forEach((p) => p.close());
    await killTree(chrome);
    clearTimeout(dog);
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    rmSync(profile, { recursive: true, force: true });
    process.exit(process.exitCode ?? 0);
  }
}
main();
