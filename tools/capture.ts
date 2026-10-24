// Visual check: serves the app on :3200, drives the screen with simulated phones in headless Chrome and saves screenshots.
// usage: npx tsx tools/capture.ts <lobby|game|results|all> [outDir]
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { startServer } from '../server/src/server';
import { fixedMap } from '../shared/maps';

const PORT = 3200, CDP = 9333;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const what = process.argv[2] ?? 'all';
const outDir = path.resolve(process.argv[3] ?? 'docs/screens');
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function descendants(pid: number): number[] {
  const rows = execSync('ps -A -o pid=,ppid=').toString().trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
  const out: number[] = [];
  const walk = (p: number) => { for (const [c, pp] of rows) if (pp === p && c !== undefined) { out.push(c); walk(c); } };
  walk(pid);
  return out;
}
async function killTree(proc: ChildProcess) {
  if (!proc.pid) return;
  const pids = [proc.pid, ...descendants(proc.pid)];
  for (const p of pids) { try { process.kill(p, 'SIGTERM'); } catch { /* gone */ } }
  await sleep(600);
  for (const p of pids) { try { process.kill(p, 0); process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
}

class Cdp {
  private id = 0;
  private pending = new Map<number, (v: any) => void>();
  constructor(private ws: WebSocket) {
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)!(m); this.pending.delete(m.id); }
      else if (m.method === 'Runtime.exceptionThrown') console.error('PAGE ERROR', JSON.stringify(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 600));
      else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) console.error('PAGE', m.params.type, m.params.args.map((a: any) => a.value ?? a.description).join(' ').slice(0, 400));
    });
  }
  send(method: string, params: object = {}): Promise<any> {
    const id = ++this.id;
    return new Promise((resolve, reject) => { this.pending.set(id, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result))); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval<T = unknown>(expr: string): Promise<T> {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
    return r.result.value as T;
  }
  async shot(name: string, clip?: { x: number; y: number; width: number; height: number; scale?: number }) {
    const r = await this.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { scale: 1, ...clip } } : {}) });
    const file = path.join(outDir, `${name}.png`);
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    console.log('saved', file);
  }
}

interface Snap {
  phase: string; fps: number; time: number; score: number; countdown: number;
  players: { id: number; x: number; y: number; item: string | null; cutting: boolean }[];
  stations: { kind: string; tx: number; ty: number; crate: number; item: string | null; progress: number; inputs: number[]; done: boolean }[];
  orders: unknown[];
}

class Bot {
  ws: WebSocket;
  id = 0;
  seq = 0; a = 0;
  vec = { x: 0, y: 0 }; btn = 0;
  private waitUntil = 0; private lastPress = 0; private stable = 0; private nextCrate = 0; private hadItem = false;
  constructor(private slot: number, name: string, room: string, private rows: readonly string[]) {
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?room=${room}`);
    this.ws.on('open', () => this.ws.send(JSON.stringify({ t: 'join', name, token: `bot-${room}-${slot}` })));
    this.ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.t === 'joined') this.id = m.player.id; });
    this.nextCrate = slot % 2;
  }
  startSending() {
    setInterval(() => {
      if (this.ws.readyState !== WebSocket.OPEN) return;
      this.ws.send(JSON.stringify({ t: 'input', seq: this.seq++, x: this.vec.x, y: this.vec.y, btn: this.btn, presses: [this.a, 0], ts: Date.now() }));
    }, 33).unref();
  }
  private floor(x: number, y: number) { const c = this.rows[y]?.[x]; return c === '.' || c === 'S'; }
  private path(from: [number, number], goals: Set<string>): [number, number][] | null {
    const key = (x: number, y: number) => `${x},${y}`;
    const prev = new Map<string, string | null>([[key(...from), null]]);
    const q: [number, number][] = [from];
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i]!;
      if (goals.has(key(x, y))) {
        const out: [number, number][] = []; let k: string | null = key(x, y);
        while (k) { const [a, b] = k.split(',').map(Number) as [number, number]; out.unshift([a, b]); k = prev.get(k) ?? null; }
        return out;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (this.floor(nx, ny) && !prev.has(key(nx, ny))) { prev.set(key(nx, ny), key(x, y)); q.push([nx, ny]); }
      }
    }
    return null;
  }
  decide(snap: Snap) {
    const me = snap.players.find((p) => p.id === this.id);
    if (!me || snap.phase !== 'playing' || snap.countdown > 0) { this.vec = { x: 0, y: 0 }; this.btn = 0; return; }
    const now = Date.now();
    if (now < this.waitUntil) { this.btn = 0; this.vec = { x: 0, y: 0 }; return; }
    const st = snap.stations;
    const cutType = (it: string | null) => (it === 'cut0' ? 0 : it === 'cut1' ? 1 : -1);
    let target: (typeof st)[number] | undefined;
    const goalsOf = (t: (typeof st)[number]) => {
      const g = new Set<string>();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (this.floor(t.tx + dx, t.ty + dy)) g.add(`${t.tx + dx},${t.ty + dy}`);
      return g;
    };
    const cell0: [number, number] = [Math.floor(me.x), Math.floor(me.y)];
    const nearest = (list: typeof st) => list
      .map((t) => ({ t, p: this.path(cell0, goalsOf(t)) })).filter((x) => x.p)
      .sort((p, q) => p.p!.length - q.p!.length)[0]?.t;
    const pots = st.filter((s) => s.kind === 'pot');
    const boards = st.filter((s) => s.kind === 'board');
    const counters = st.filter((s) => s.kind === 'counter');
    let cutHere = false;
    if (me.item && !this.hadItem) this.nextCrate = 1 - this.nextCrate;
    this.hadItem = !!me.item;
    if (me.item === 'raw0' || me.item === 'raw1') target = nearest(boards.filter((b) => !b.item));
    else if (me.item === 'cut0' || me.item === 'cut1') {
      target = nearest(pots.filter((p) => !p.done && p.inputs.length < 2 && !p.inputs.includes(cutType(me.item))))
        ?? nearest(counters.filter((c) => !c.item && c.tx >= 6 && c.tx <= 8 && c.ty >= 1 && c.ty <= 7));
    } else if (me.item === 'plate') target = nearest(pots.filter((p) => p.done));
    else if (me.item === 'dish') target = nearest(st.filter((s) => s.kind === 'window'));
    else {
      const crates = st.filter((s) => s.kind === 'crate');
      const canCrate = !!nearest(crates);
      if (pots.some((p) => p.done)) target = nearest(st.filter((s) => s.kind === 'plates'));
      else {
        const ready = boards.filter((b) => b.item?.startsWith('cut'));
        const raw = boards.filter((b) => b.item?.startsWith('raw'));
        if (!canCrate) target = nearest(counters.filter((c) => c.item?.startsWith('cut')));
        else if (ready.length) target = nearest(ready);
        else if (raw.length) { target = nearest(raw); cutHere = !!target; }
        else {
          const wantType = pots.some((p) => p.inputs.includes(0)) ? 1 : pots.some((p) => p.inputs.includes(1)) ? 0 : this.nextCrate;
          target = nearest(crates.filter((s) => s.crate === wantType)) ?? nearest(crates);
        }
      }
    }
    if (!target) { this.vec = { x: 0, y: 0 }; this.btn = 0; return; }
    const cell = cell0;
    const p = this.path(cell, goalsOf(target));
    if (!p) { this.vec = { x: 0, y: 0 }; return; }
    if (p.length > 1 || Math.hypot(me.x - (cell[0] + 0.5), me.y - (cell[1] + 0.5)) > 0.18) {
      const [wx, wy] = p.length > 1 ? p[1]! : cell;
      const tx = (p.length > 1 && Math.hypot(me.x - (cell[0] + 0.5), me.y - (cell[1] + 0.5)) > 0.35 && false) ? cell[0] + 0.5 : wx + 0.5, ty = wy + 0.5;
      const dx = tx - me.x, dy = ty - me.y, d = Math.hypot(dx, dy) || 1;
      this.vec = { x: (dx / d) * Math.min(1, d * 3), y: (dy / d) * Math.min(1, d * 3) }; this.btn = 0; this.stable = 0;
      return;
    }
    // at the stand tile: face the station, then act
    const fx = target.tx + 0.5 - me.x, fy = target.ty + 0.5 - me.y, fd = Math.hypot(fx, fy) || 1;
    this.vec = { x: fx / fd, y: fy / fd };
    this.stable++;
    if (this.stable < 3) return;
    if (cutHere && !me.item) { this.btn = 2; return; }
    this.btn = 0;
    if (now - this.lastPress > 500) { this.a++; this.lastPress = now; this.waitUntil = now + 120; }
  }
  close() { this.ws.close(); }
}

async function main() {
  const srv = await startServer({ port: PORT, mode: process.env.DEV ? 'dev' : 'static' });
  let chromeRef: ChildProcess | null = null;
  // watchdog: never leave Chrome or the server behind
  const dog = setTimeout(async () => { console.error('watchdog fired'); if (chromeRef) await killTree(chromeRef); process.exit(2); }, Number(process.env.MAX_MS ?? 280_000));
  const profile = mkdtempSync(path.join(tmpdir(), 'pg-chrome-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, '--window-size=1920,1080', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', ...(process.env.SOFTGL ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []), '--ignore-gpu-blocklist', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
  chromeRef = chrome;
  const bots: Bot[] = [];
  const timers: ReturnType<typeof setInterval>[] = [];
  try {
    let targets: any[] = [];
    for (let i = 0; i < 50 && !targets.length; i++) { await sleep(200); try { targets = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).filter((t: any) => t.type === 'page'); } catch { /* not up yet */ } }
    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    await new Promise((r) => ws.once('open', r));
    const cdp = new Cdp(ws);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

    const open = async (room: string) => { await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${room}` }); await sleep(2500); };
    const join = async (room: string, n: number, rows: readonly string[]) => {
      const names = ['Nico', 'Angi', 'Pablo', 'Mati', 'Coni', 'Rafa', 'Vale', 'Tomás'];
      for (let i = 0; i < n; i++) { const b = new Bot(i, names[i]!, room, rows); bots.push(b); await sleep(150); }
      await sleep(600);
    };
    const click = (sel: string) => cdp.eval(`document.querySelector(${JSON.stringify(sel)}).click()`);
    const snap = () => cdp.eval<Snap>('JSON.parse(JSON.stringify(window.__pg.snapshot()))');
    const waitFor = async (pred: (s: Snap) => boolean, ms: number) => {
      const end = Date.now() + ms; let n = 0;
      while (Date.now() < end) {
        const s = await snap();
        if (pred(s)) return s;
        if (process.env.DEBUG_BOT && n++ % 20 === 0) console.log(s.time | 0, 'fps', s.fps.toFixed(0), 'score', s.score, s.players.map((p) => `${p.id}:${p.x.toFixed(1)},${p.y.toFixed(1)}:${p.item}${p.cutting ? '*' : ''}`).join(' '), s.stations.filter((x) => x.item || x.inputs.length).map((x) => `${x.kind}@${x.tx},${x.ty}=${x.item ?? x.inputs}`).join(' '));
        await sleep(150);
      }
      return null;
    };

    if (what === 'lobby' || what === 'all') {
      await open('LOBY');
      await join('LOBY', 8, fixedMap('1')!.rows);
      await sleep(1200);
      await cdp.shot('lobby');
      bots.splice(0).forEach((b) => b.close());
    }
    const play = async (mapId: string, n: number, tag: string, results: boolean) => {
      const room = `G${mapId}${tag}`.toUpperCase().slice(0, 4);
      await open(room);
      await join(room, n, fixedMap(mapId)!.rows);
      await click(`[data-map="${mapId}"]`);
      await click('[data-diff="easy"]');
      await sleep(300);
      await click('#start');
      await sleep(1700);
      await cdp.shot(`game-map${mapId}${n > 4 ? '-8chefs' : ''}-countdown`);
      if (n > 4) { await waitFor((s) => s.time > 1700, 10_000); await cdp.shot('game-8chefs-idle'); }
      bots.forEach((b) => b.startSending());
      timers.push(setInterval(async () => { try { const s = await snap(); bots.forEach((b) => b.decide(s)); } catch { /* page navigating */ } }, 100));
      await waitFor((s) => s.countdown <= 0 && s.time > 0, 8000);
      const good = await waitFor((s) => s.players.some((p) => p.cutting) && s.stations.some((x) => x.kind === 'pot' && (x.inputs.length === 2 || x.done)) && s.orders.length >= 1, Number(process.env.WAIT_MS ?? 90_000));
      console.log(`map ${mapId} scene ready:`, !!good, good ? `score ${good.score}` : '');
      await cdp.shot(`game-map${mapId}${n > 4 ? '-8chefs' : ''}`);
      if (results) {
        await waitFor((s) => s.score >= 60, 80_000);
        await cdp.shot(`game-map${mapId}-b`);
        await cdp.eval('window.__pg.fastForward(1200)');
        await sleep(1700);
        await cdp.shot('timeup');
        await sleep(5200);
        await cdp.shot('results');
      }
      timers.splice(0).forEach(clearInterval);
      bots.splice(0).forEach((b) => b.close());
    };
    if (what === 'cast') await play('1', 8, 'c', false);
    if (what === 'solo') {
      await open('SOLO'); await join('SOLO', 1, fixedMap('1')!.rows);
      await click('[data-map="1"]'); await click('[data-diff="easy"]'); await sleep(200); await click('#start'); await sleep(1500);
      bots.forEach((b) => b.startSending());
      timers.push(setInterval(async () => { try { const s = await snap(); bots.forEach((b) => b.decide(s)); } catch { /* ignore */ } }, 100));
      const s0 = await waitFor((s) => s.players.some((p) => p.cutting), 60_000);
      if (s0) {
        const me = s0.players[0]!;
        const cx = 96 + me.x * 108, cy = 106 + me.y * 108;
        for (let i = 0; i < 6; i++) { await cdp.shot(`solo-chop${i}`, { x: cx - 170, y: cy - 200, width: 340, height: 260, scale: 2 }); await sleep(30); }
      }
      timers.splice(0).forEach(clearInterval);
    }
    if (what === 'maps') {
      for (const id of ['2', '4', '5']) {
        const room = `M${id}XX`;
        await open(room); await join(room, 4, fixedMap(id)!.rows);
        await click(`[data-map="${id}"]`); await sleep(200); await click('#start'); await sleep(2800);
        await cdp.shot(`maps-${id}`);
        bots.splice(0).forEach((b) => b.close());
      }
    }
    if (what === 'replay') {
      await open('REPL'); await join('REPL', 3, fixedMap('1')!.rows);
      for (let round = 0; round < 2; round++) {
        await click('[data-map="1"]'); await sleep(200); await click('#start'); await sleep(4200);
        await cdp.eval('window.__pg.fastForward(800)'); await sleep(2600);
        await cdp.shot(`replay-results-${round}`);
        await click('#again'); await sleep(800);
      }
      await cdp.shot('replay-lobby');
    }
    if (what === 'juice') {
      await open('JUIC'); await join('JUIC', 4, fixedMap('1')!.rows);
      await click('[data-map="1"]'); await click('[data-diff="easy"]'); await sleep(200);
      await click('#start');
      await sleep(430); await cdp.shot('juice-iris-close');
      await sleep(330); await cdp.shot('juice-iris-open');
      bots.forEach((b) => b.startSending());
      timers.push(setInterval(async () => { try { const s = await snap(); bots.forEach((b) => b.decide(s)); } catch { /* ignore */ } }, 100));
      // countdown: catch "A COCINAR"
      await waitFor((s) => s.countdown > 0 && s.countdown < 900, 6000); await sleep(300); await cdp.shot('juice-go');
      let chopShot = false, score = 0, delivered = false, expired = false;
      const end = Date.now() + 120_000;
      while (Date.now() < end && !(chopShot && delivered && expired)) {
        const s = await snap();
        if (!chopShot && s.players.some((p) => p.cutting)) { chopShot = true; for (let i = 0; i < 3; i++) { await sleep(70); await cdp.shot(`juice-chop${i}`); } }
        if (s.score > score) { score = s.score; if (!delivered) { delivered = true; await sleep(120); await cdp.shot('juice-deliver'); await sleep(500); await cdp.shot('juice-deliver2'); await cdp.eval('window.__pg.forceExpire()'); await sleep(260); await cdp.shot('juice-expire'); await sleep(500); await cdp.shot('juice-expire2'); expired = true; } }
        await sleep(40);
      }
      timers.splice(0).forEach(clearInterval);
    }
    if (what === 'game' || what === 'all') { await play('1', 4, 'a', false); await play('3', 4, 'b', what === 'all' ? false : false); }
    if (what === 'results' || what === 'all') await play('1', 4, 'r', true);
  } finally {
    timers.forEach(clearInterval);
    bots.forEach((b) => b.close());
    clearTimeout(dog);
    await killTree(chrome);
    await srv.close();
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
