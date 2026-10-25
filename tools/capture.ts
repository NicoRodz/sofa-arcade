// Visual check: serves the app on :3200, drives the screen with simulated phones in headless Chrome and saves screenshots.
// usage: npx tsx tools/capture.ts <menu|lobby|game|results|all|phone|versus|versus-phone|sabotage|burn|events|events-vs|assist|magnet> [outDir]   (PG_PORT / PG_CDP move the server and Chrome ports)
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { startServer } from '../server/src/server';
import { fixedMap } from '../shared/maps';
import { versusMap } from '../shared/versusMaps';

const PORT = Number(process.env.PG_PORT ?? 3200), CDP = Number(process.env.PG_CDP ?? 9333);
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
  phase: string; fps: number; time: number; score: number; countdown: number; streak: number; bestStreak: number; crowd: string[];
  players: { id: number; x: number; y: number; item: string | null; cutting: boolean }[];
  stations: { kind: string; tx: number; ty: number; crate: number; item: string | null; progress: number; inputs: number[]; done: boolean; count: number; clean: number }[];
  orders: { recipe: string }[];
}

class Bot {
  ws: WebSocket;
  id = 0;
  seq = 0; a = 0; b = 0;
  hints: any[] = []; // every `hint` message this phone heard (contextual buttons)
  vec = { x: 0, y: 0 }; btn = 0;
  private waitUntil = 0; private lastPress = 0; private stable = 0; private nextCrate = 0; private hadItem = false;
  constructor(private slot: number, name: string, room: string, private rows: readonly string[]) {
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?room=${room}`);
    this.ws.on('open', () => this.ws.send(JSON.stringify({ t: 'join', name, token: `bot-${room}-${slot}` })));
    this.ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.t === 'joined') this.id = m.player.id; else if (m.t === 'hint') this.hints.push(m); });
    this.nextCrate = slot % 2;
  }
  startSending() {
    setInterval(() => {
      if (this.ws.readyState !== WebSocket.OPEN) return;
      this.ws.send(JSON.stringify({ t: 'input', seq: this.seq++, x: this.vec.x, y: this.vec.y, btn: this.btn, presses: [this.a, this.b], ts: Date.now() }));
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
    const sinks = st.filter((s) => s.kind === 'sink');
    const returns = st.filter((s) => s.kind === 'dirty');
    const finite = sinks.length > 0 && returns.length > 0;
    const hasCheese = st.some((s) => s.kind === 'crate' && s.crate === 2);
    let cutHere = false;
    if (me.item && !this.hadItem) this.nextCrate = (this.nextCrate + 1) % (hasCheese ? 3 : 2);
    this.hadItem = !!me.item;
    const cutT = (it: string | null) => (it === 'cut0' ? 0 : it === 'cut1' ? 1 : it === 'cut2' ? 2 : -1);
    if (me.item === 'raw0' || me.item === 'raw1' || me.item === 'raw2') target = nearest(boards.filter((b) => !b.item));
    else if (me.item === 'cut0' || me.item === 'cut1' || me.item === 'cut2') {
      const t = cutT(me.item);
      target = nearest(pots.filter((p) => !p.done && p.inputs.length < 3 && !p.inputs.includes(t) && (t < 2 || p.inputs.length >= 1)))
        ?? nearest(counters.filter((c) => !c.item && c.tx >= 6 && c.tx <= 8 && c.ty >= 1 && c.ty <= 7));
    } else if (me.item === 'plate') target = nearest(pots.filter((p) => p.done));
    else if (me.item === 'dish' || me.item === 'dishQ') target = nearest(st.filter((s) => s.kind === 'window'));
    else if (me.item === 'dirty') target = nearest(sinks);
    else {
      const crates = st.filter((s) => s.kind === 'crate');
      const canCrate = !!nearest(crates);
      const dirtyAt = returns.find((r) => r.count > 0), washing = sinks.find((k) => k.count > 0);
      if (pots.some((p) => p.done)) {
        const pile = st.filter((s) => s.kind === 'plates' && (!finite || s.count > 0));
        target = nearest(pile) ?? nearest(sinks.filter((k) => k.clean > 0));
        if (!target && washing) { target = washing; cutHere = true; }
      } else if (washing && (this.slot % 4 === 3 || !canCrate)) { target = washing; cutHere = true; }
      else if (dirtyAt && this.slot % 4 === 3) target = dirtyAt;
      else {
        const ready = boards.filter((b) => b.item?.startsWith('cut'));
        const raw = boards.filter((b) => b.item?.startsWith('raw'));
        if (!canCrate) target = nearest(counters.filter((c) => c.item?.startsWith('cut')));
        else if (ready.length) target = nearest(ready);
        else if (raw.length) { target = nearest(raw); cutHere = !!target; }
        else {
          const have = new Set(pots.filter((p) => !p.done).flatMap((p) => p.inputs));
          const missing = [0, 1, ...(hasCheese ? [2] : [])].filter((k) => !have.has(k));
          const wantType = missing.length ? missing[this.slot % missing.length]! : this.nextCrate;
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
    if (target.kind === 'sink' && me.item !== 'dirty' && target.count > 0 && !me.item) { this.btn = 2; return; }
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
    // bots i..n-1 join; by default the screen then skips the start menu (its player range included) so the older modes keep working
    const join = async (room: string, n: number, rows: readonly string[], opts: { from?: number; menu?: boolean } = {}) => {
      const names = ['Nico', 'Angi', 'Pablo', 'Mati', 'Coni', 'Rafa', 'Vale', 'Tomás'];
      for (let i = opts.from ?? 0; i < n; i++) { const b = new Bot(i, names[i]!, room, rows); bots.push(b); await sleep(150); }
      await sleep(600);
      if (!opts.menu) await cdp.eval('window.__pg.forceLobby()');
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

    if (what === 'phone') {
      // a real controller page in a phone-sized emulated viewport, driven by a fake screen that sends config and phase
      const room = 'PHON';
      const fake = new WebSocket(`ws://127.0.0.1:${PORT}/ws?role=screen&room=${room}`);
      await new Promise((r) => fake.once('open', r));
      const cfg = { t: 'config', game: 'pizzas', difficulty: 'normal', map: '1', seed: 1 };
      fake.send(JSON.stringify(cfg)); fake.send(JSON.stringify({ t: 'phase', phase: 'menu' })); // the screen is still on the Pichiclub start
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/c/?room=${room}` });
      await sleep(1200);
      await cdp.shot('phone-join');
      await cdp.eval(`document.getElementById('name').value = 'Nico'; document.getElementById('join').requestSubmit()`);
      await sleep(1200);
      await cdp.shot('phone-menu');
      console.log('in the menu: view =', await cdp.eval(`document.body.dataset.view`), ', how-to card =', await cdp.eval(`document.body.dataset.howto`), ', text =', JSON.stringify(await cdp.eval(`document.querySelector('#choosing .big').textContent`)));
      fake.send(JSON.stringify({ t: 'phase', phase: 'lobby' })); await sleep(600); // the screen picked the game
      await cdp.shot('phone-lobby');
      console.log('how-to card open after joining:', await cdp.eval(`document.body.dataset.howto`));
      const tap = async (x: number, y: number) => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
        await sleep(60);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await sleep(400);
      };
      await tap(422, 195);
      console.log('after one tap:', await cdp.eval(`document.body.dataset.howto`));
      await cdp.shot('phone-lobby-closed');
      const ob = await cdp.eval<{ x: number; y: number }>(`(() => { const b = document.getElementById('howtoopen').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
      await tap(ob.x, ob.y);
      console.log('after tapping "Cómo se juega":', await cdp.eval(`document.body.dataset.howto`));
      await tap(422, 195);
      fake.send(JSON.stringify({ t: 'phase', phase: 'playing', puestos: { cheese: true, sink: true, assign: [{ id: 1, puestos: ['horno', 'reparto'], pool: ['masa', 'corte', 'queso', 'horno', 'reparto', 'lavado', 'apoyo'] }] } }));
      await sleep(800);
      await cdp.shot('phone-play');
      // R7: buzz from the screen. Android path (vibrate exists and works) and the iOS path (no vibration: the phone flashes its colour)
      await cdp.eval(`Object.defineProperty(navigator, 'vibrate', { value: (p) => { window.__vib = p; return true; }, configurable: true })`);
      fake.send(JSON.stringify({ t: 'buzz', playerId: 1, kind: 'pick' })); await sleep(300);
      console.log('vibrate called with:', JSON.stringify(await cdp.eval('window.__vib')));
      fake.send(JSON.stringify({ t: 'buzz', playerId: 1, kind: 'chop' })); await sleep(300);
      console.log('vibrate called with:', JSON.stringify(await cdp.eval('window.__vib')));
      await cdp.eval(`Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true })`);
      fake.send(JSON.stringify({ t: 'buzz', playerId: 1, kind: 'pick' })); await sleep(40);
      console.log('no vibrate API: flash class on body =', await cdp.eval(`document.body.classList.contains('flash')`));
      await cdp.shot('phone-flash');
      await sleep(300);
      console.log('flash gone after 300 ms =', await cdp.eval(`!document.body.classList.contains('flash')`));
      const r = await cdp.eval<{ x: number; y: number }>(`(() => { const b = document.getElementById('btnB').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
      const sw = await cdp.eval<{ x: number; y: number }>(`(() => { const b = document.getElementById('pswap').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
      await tap(sw.x, sw.y);
      console.log('after Cambiar:', await cdp.eval(`document.getElementById('pname').textContent`));
      await cdp.shot('phone-play-swap');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 1 }] });
      await sleep(250);
      await cdp.shot('phone-play-hold');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      // zoom defenses: cancelable gesture events, double-tap touchend, and the visualViewport.scale check
      const prevented = await cdp.eval<Record<string, boolean>>(`(() => {
        const r = {};
        for (const t of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) { const e = new Event(t, { cancelable: true, bubbles: true }); document.body.dispatchEvent(e); r[t] = e.defaultPrevented; }
        const a = new Event('touchend', { cancelable: true, bubbles: true }); document.dispatchEvent(a);
        const b = new Event('touchend', { cancelable: true, bubbles: true }); document.dispatchEvent(b);
        r.secondTouchend = b.defaultPrevented;
        return r;
      })()`);
      console.log('prevented:', JSON.stringify(prevented));
      // a real pinch (synthesized by CDP): the touchstart guard should keep the scale at 1
      await cdp.send('Input.synthesizePinchGesture', { x: 420, y: 200, scaleFactor: 2.5, relativeSpeed: 400 });
      await sleep(600);
      console.log('scale after a real pinch:', await cdp.eval('visualViewport.scale'));
      // wiring of the banner: force the reported scale (headless cannot reproduce the iOS zoom state)
      await cdp.eval(`window.__fakeScale = 2.5; Object.defineProperty(visualViewport, 'scale', { get: () => window.__fakeScale, configurable: true }); visualViewport.dispatchEvent(new Event('resize'))`);
      await sleep(1500);
      console.log('banner shown with scale 2.5:', await cdp.eval(`document.body.classList.contains('zoomed')`));
      await cdp.shot('phone-zoomed');
      await cdp.eval(`window.__fakeScale = 1; visualViewport.dispatchEvent(new Event('resize'))`);
      await sleep(300);
      console.log('banner after scale back to 1:', await cdp.eval(`document.body.classList.contains('zoomed')`));
      fake.close();
    }
    if (what === 'versus-phone') {
      // the controller in versus: team card + "Cambiar de equipo" in the lobby, the team strip on the pad. A fake screen owns the teams (the real one does the same).
      const room = 'VSPH';
      const fake = new WebSocket(`ws://127.0.0.1:${PORT}/ws?role=screen&room=${room}`);
      await new Promise((r) => fake.once('open', r));
      const got: string[] = [];
      fake.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.t === 'setTeam') got.push(JSON.stringify(m)); });
      const team = (id: number, name: string, color: string, icon: string, side: string, playerIds: number[]) => ({ id, name, color, icon, side, playerIds });
      const cfg = (locked: boolean, a: number[], b: number[]) => ({ t: 'config', game: 'pizzas', difficulty: 'normal', map: 'V1', seed: 1, modeId: 'versus', teamsLocked: locked, modeOptions: { hiddenScore: true, handicap: true },
        teams: [team(0, 'Picantes', '#A8330A', '▲', 'izquierda', a), team(1, 'Frescos', '#14338A', '●', 'derecha', b)] });
      fake.send(JSON.stringify(cfg(false, [1, 2, 3], [4, 5, 6]))); fake.send(JSON.stringify({ t: 'phase', phase: 'lobby' }));
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/c/?room=${room}` });
      await sleep(1200);
      await cdp.eval(`document.getElementById('name').value = 'Nico'; document.getElementById('join').requestSubmit()`);
      await sleep(1200);
      await cdp.eval(`document.getElementById('howto').dispatchEvent(new PointerEvent('pointerup'))`); await sleep(300);
      await cdp.shot('vsphone-lobby');
      const tap = async (sel: string) => {
        const r = await cdp.eval<{ x: number; y: number }>(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 1 }] }); await sleep(60);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(400);
      };
      await tap('#teamswap');
      console.log('screen got:', got.join(' '));
      fake.send(JSON.stringify(cfg(false, [2, 3], [4, 5, 6, 1]))); await sleep(500); // the host applies the move
      console.log('strip after the move:', await cdp.eval(`document.getElementById('tcname').textContent + ' ' + document.getElementById('tcside').textContent`));
      await cdp.shot('vsphone-lobby-moved');
      fake.send(JSON.stringify(cfg(true, [2, 3], [4, 5, 6, 1]))); await sleep(400);
      console.log('swap disabled when locked:', await cdp.eval(`document.getElementById('teamswap').disabled`), await cdp.eval(`document.getElementById('teamswap').textContent`));
      await cdp.shot('vsphone-lobby-locked');
      fake.send(JSON.stringify({ t: 'phase', phase: 'playing' })); await sleep(600);
      await cdp.shot('vsphone-play');
      const res = (verdict: string, winner: number | null) => ({ t: 'phase', phase: 'results', scores: [{ id: 1, score: 410 }], result: { verdict, winner, scores: [{ team: 0, score: 410 }, { team: 1, score: 340 }] } });
      fake.send(JSON.stringify(cfg(true, [1, 2, 3], [4, 5, 6]))); fake.send(JSON.stringify(res('win', 0))); await sleep(500); // the phone is in team 0
      await cdp.shot('vsphone-results-won');
      fake.send(JSON.stringify(res('win', 1))); await sleep(400); await cdp.shot('vsphone-results-lost');
      fake.send(JSON.stringify(res('draw', null))); await sleep(400); await cdp.shot('vsphone-results-draw');
      fake.send(JSON.stringify(Object.assign(cfg(true, [1, 2, 3], [4, 5, 6]), { modeId: 'coop', teams: null }))); await sleep(400);
      console.log('coop again: team strip =', await cdp.eval(`document.body.dataset.team`));
      fake.close();
    }
    if (what === 'versus') {
      // Versus F1: lobby with 6 players (3 v 3) and 5 (3 v 2, k), a V1 round with 6 bots, the time-up banner and the results
      const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
      const rows = versusMap('V1')!.rows;
      await open('VS06'); await join('VS06', 6, rows);
      await cdp.shot('vs-lobby-coop-6');
      await click('[data-mode="versus"]'); await sleep(1000);
      await cdp.shot('vs-lobby-6');
      bots.splice(0).forEach((b) => b.close());
      await open('VS05'); await join('VS05', 5, rows);
      await click('[data-mode="versus"]'); await sleep(1000);
      await cdp.shot('vs-lobby-5');
      bots.splice(0).forEach((b) => b.close());
      await open('VS02'); await join('VS02', 2, rows);
      await click('[data-mode="versus"]'); await sleep(600);
      await cdp.shot('vs-lobby-2-refused');
      bots.splice(0).forEach((b) => b.close());
      await open('VS6P'); await join('VS6P', 6, rows);
      await click('[data-mode="versus"]'); await click('[data-map="V1"]'); await click('[data-diff="easy"]'); await sleep(400);
      await click('#start'); await sleep(1500); await cdp.shot('vs-howto'); await key('Enter');
      await sleep(2100); await cdp.shot('vs-6-countdown');
      bots.forEach((b) => b.startSending());
      timers.push(setInterval(async () => { try { const s = await snap(); bots.forEach((b) => b.decide(s)); } catch { /* page navigating */ } }, 100));
      const both = await waitFor((s) => (s as any).teams?.every((t: any) => t.delivered >= 1), Number(process.env.WAIT_MS ?? 110_000));
      console.log('both teams delivered:', !!both, JSON.stringify((both as any)?.teams));
      await cdp.shot('vs-6-play');
      await cdp.eval('window.__pg.fastForward(12000)'); await sleep(2500); await cdp.shot('vs-6-last-seconds');
      await sleep(11000); await cdp.shot('vs-6-timeup');
      await sleep(5000); await cdp.shot('vs-6-results');
      console.log('final', JSON.stringify(await cdp.eval('JSON.parse(JSON.stringify({ t: window.__pg.snapshot().teams, w: window.__pg.snapshot().winner, ph: window.__pg.snapshot().phase }))')));
      timers.splice(0).forEach(clearInterval);
      bots.splice(0).forEach((b) => b.close());
    }
    if (what === 'vs-hud') {
      // Versus F4: the HUD of a running round with 6 chefs on V1 and V3 (queues, scoreboard, streak, golden order, hidden score), then the results
      const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
      const maps = (process.env.VS_MAPS ?? 'V1,V3').split(',');
      for (const id of maps) {
        const rows = versusMap(id)!.rows;
        const room = `H${id}X`.slice(0, 4);
        await open(room); await join(room, 6, rows);
        await click('[data-mode="versus"]'); await click(`[data-map="${id}"]`); await click('[data-diff="easy"]'); await sleep(400);
        await click('#start'); await sleep(1500); await key('Enter');
        await sleep(2100);
        bots.forEach((b) => b.startSending());
        timers.push(setInterval(async () => { try { const s = await snap(); bots.forEach((b) => b.decide(s)); } catch { /* page navigating */ } }, 100));
        await waitFor((s) => s.time > 9_000, 30_000);
        await cdp.eval('window.__pg.setTeam(0, { score: 340, streak: 3, bestStreak: 3, vips: 1 })'); await cdp.eval('window.__pg.setTeam(1, { score: 410, streak: 1 })');
        await cdp.eval('window.__pg.vipNow()'); await sleep(700);
        await cdp.shot(`vs-hud-${id}-vip`);
        await cdp.eval('window.__pg.fastForward(15000)'); await sleep(1500);
        await cdp.shot(`vs-hud-${id}-hidden`);
        timers.splice(0).forEach(clearInterval);
        bots.splice(0).forEach((b) => b.close());
      }
    }
    if (what === 'vs-lobby') {
      await open('VSLB'); await join('VSLB', 6, versusMap('V1')!.rows);
      await click('[data-mode="versus"]'); await sleep(900);
      await cdp.shot('vs-lobby-colors');
      bots.splice(0).forEach((b) => b.close());
    }
    if (what === 'vs-drop') {
      // Versus: a chef's phone drops (ghost, notice), the grace time runs out (leaves, the handicap goes up for its team)
      const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
      await open('VSDR'); await join('VSDR', 6, versusMap('V1')!.rows);
      await click('[data-mode="versus"]'); await click('[data-map="V1"]'); await click('[data-diff="easy"]'); await sleep(400);
      await click('#start'); await sleep(1500); await key('Enter');
      await waitFor((s) => s.countdown <= 0 && s.time > 12_000, 40_000);
      const id = (await snap()).players[0]!.id;
      await cdp.eval(`window.__pg.dropChef(${id})`); await sleep(700);
      await cdp.shot('vs-drop-ghost');
      await waitFor((s) => s.time > 33_500, 40_000); await sleep(300);
      await cdp.shot('vs-drop-gone');
      console.log('teams after the drop:', JSON.stringify((await snap() as any).teams));
      bots.splice(0).forEach((b) => b.close());
    }
    if (what === 'assist') {
      // Ayudante on the REAL screen and relay: 4 bot phones, two of them switch it on from their lobby. The lobby lists them (badge + "Ayudante"), versus shows the k it
      // costs, the round gives them the propeller, the sim flags exactly those chefs, and every phone hears its contextual buttons (labels + glyphs) through the relay.
      const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
      const rows = fixedMap('6')!.rows;
      await open('ASST'); await join('ASST', 4, rows);
      for (const i of [0, 2]) bots[i]!.ws.send(JSON.stringify({ t: 'assist', on: true }));
      await sleep(700);
      await cdp.shot('assist-lobby');
      bots[2]!.ws.send(JSON.stringify({ t: 'assist', on: false })); await sleep(400); // one Ayudante only: its team is the one that gets the k
      await click('[data-mode="versus"]'); await sleep(900);
      await cdp.shot('assist-lobby-versus');
      console.log('versus team headers:', JSON.stringify(await cdp.eval(`[0, 1].map((i) => document.getElementById('th' + i).textContent)`)), '| hint:', JSON.stringify(await cdp.eval(`document.getElementById('teamhint').textContent`)));
      bots[2]!.ws.send(JSON.stringify({ t: 'assist', on: true })); await sleep(400);
      await click('[data-mode="coop"]'); await sleep(500);
      await click('[data-map="6"]'); await click('[data-diff="easy"]'); await sleep(300);
      await click('#start'); await sleep(1500); await key('Enter');
      await waitFor((s) => s.countdown <= 0 && s.time > 1000, 20_000);
      bots.forEach((b) => b.startSending());
      timers.push(setInterval(async () => { try { const s = await snap(); bots.forEach((b) => b.decide(s)); } catch { /* page navigating */ } }, 100));
      await waitFor((s) => s.time > 12_000, 40_000);
      const sn: any = await snap();
      console.log('chefs on Ayudante in the sim:', JSON.stringify(sn.players.map((p: any) => [p.id, !!p.assist])), '| bot ids', JSON.stringify(bots.map((b) => b.id)));
      await cdp.shot('assist-play');
      for (const p of sn.players.filter((q: any) => q.assist).slice(0, 2)) {
        const cx = 96 + p.x * 108, cy = 106 + p.y * 108;
        await cdp.shot(`assist-chef-${p.id}`, { x: cx - 150, y: cy - 230, width: 300, height: 300, scale: 2 });
      }
      for (const b of bots) {
        const labels = [...new Set(b.hints.map((h: any) => `${h.a ?? '-'}|${h.b ?? '-'}`))];
        console.log(`phone ${b.id}: ${b.hints.length} hint messages, ${labels.length} different; icons seen: ${[...new Set(b.hints.flatMap((h: any) => [h.aIcon, h.bIcon]).filter(Boolean))].join(',')}; some greyed: ${b.hints.some((h: any) => h.aOff || h.bOff)}; sample: ${labels.slice(0, 6).join(' ; ')}`);
      }
      timers.splice(0).forEach(clearInterval);
      bots.splice(0).forEach((b) => b.close());
    }
    if (what === 'sabotage') {
      // Sabotage: a round on V1 (Suave, Normal) with 6 chefs; the sim is driven by hand (window.__pg.sab) to frame the throw: the loaded catapult with its reticle,
      // the bag in the air with its shadow, the impact, a rival chef slipping on the rubbish, and the cleaning. The chefs of team 1 are moved and pushed by their bots.
      const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
      const rows = versusMap('V1')!.rows;
      await open('SABO'); await join('SABO', 6, rows);
      await click('[data-mode="versus"]'); await click('[data-map="V1"]'); await click('[data-diff="normal"]'); await sleep(500);
      await cdp.shot('sab-lobby');
      await click('#start'); await sleep(1500); await key('Enter');
      await waitFor((s) => s.countdown <= 0 && s.time > 1500, 20_000);
      bots.forEach((b) => b.startSending());
      const pg = (expr: string) => cdp.eval<any>(`window.__pg.sab.${expr}`);
      const team1 = (await snap() as any).players.filter((p: any) => p.team === 1).map((p: any) => p.id as number);
      await pg('give(0, 1)');
      const aimer = await pg('aim(0)');
      await sleep(1100); await cdp.shot('sab-aim');
      await pg(`throw(${aimer})`);
      await sleep(330); await cdp.shot('sab-flight');
      await sleep(500); await cdp.shot('sab-impact');
      const st = await pg('state()');
      const trash = st.floor.find((f: any) => f.kind === 'trash');
      console.log('rubbish on the floor:', JSON.stringify(trash), '| bags/desechos team 0:', st.sab.teams[0].bags, st.sab.teams[0].desechos);
      // a chef of team 1 walks over it carrying a pizza
      const floorAt = (x: number, y: number) => rows[y]?.[x] === '.' || rows[y]?.[x] === 'S';
      const dir = floorAt(trash.tx - 2, trash.ty) ? 1 : -1;
      const walker = team1[0]!, helper = team1[1]!;
      await pg(`place(${walker}, ${trash.tx + 0.5 - dir * 1.8}, ${trash.ty + 0.5}, ${dir}, 0)`); await pg(`item(${walker}, 'dishQ')`);
      const bw = bots.find((b) => b.id === walker)!, bh = bots.find((b) => b.id === helper)!;
      bw.vec = { x: dir, y: 0 };
      await sleep(330); await cdp.shot('sab-slip');
      await sleep(260); await cdp.shot('sab-slip-spin');
      bw.vec = { x: 0, y: 0 };
      await sleep(900); await cdp.shot('sab-dropped');
      // the helper cleans: the dropped pizza first, then the rubbish
      const st2 = await pg('state()');
      const dropped = st2.floor.find((f: any) => f.kind === 'dropped');
      if (dropped) { await pg(`place(${helper}, ${dropped.tx + 0.5 - dir * 0.9}, ${dropped.ty + 0.5}, ${dir}, 0)`); await sleep(150); bh.a++; await sleep(350); }
      await cdp.shot('sab-clean');
      console.log('final state:', JSON.stringify((await pg('state()')).floor));
      bots.splice(0).forEach((b) => b.close());
    }
    if (what === 'burn') {
      // The oven that burns: map 1 (open kitchen, ovens with counters beside them), Normal, 2 chefs. The sim is driven by hand (window.__pg.kit) to frame each stage:
      // a ready pizza with its grace ring, the warning, the burnt pizza smoking, the fire, the fire jumping, a chef putting it out with the extinguisher, and the results.
      const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
      const rows = fixedMap('1')!.rows;
      await open('BURN'); await join('BURN', 2, rows);
      await click('[data-diff="normal"]'); await click('[data-map="1"]'); await sleep(400);
      await click('#start'); await sleep(1500); await key('Enter');
      await waitFor((s) => s.countdown <= 0 && s.time > 1500, 20_000);
      const kit = (expr: string) => cdp.eval<any>(`window.__pg.kit.${expr}`);
      const cs = await kit('counters()');
      const ovens = cs.filter((c: any) => c.kind === 'pot');
      const [o1, o2] = [ovens[0].i, ovens[1].i];
      const ids = (await snap()).players.map((p) => p.id);
      await kit(`bake(${o1})`); await kit(`bake(${o2})`);
      await sleep(900); await cdp.shot('burn-1-ready');
      await kit(`age(${o1}, 5300)`); await kit(`age(${o2}, 3000)`);
      await sleep(400); await cdp.shot('burn-2-warn');
      await kit(`age(${o1}, 8200)`); await kit(`age(${o2}, 8200)`);
      await sleep(900); await cdp.shot('burn-3-burnt');
      await kit(`age(${o1}, 13100)`);
      await sleep(700); await cdp.shot('burn-4-fire');
      await sleep(3200); await cdp.shot('burn-5-spread');
      // chef 1 puts the oven out: stands in front of it and holds B (the bot sends the button; the sim does the rest)
      const b1 = bots.find((b) => b.id === ids[0])!;
      b1.startSending();
      await kit(`stand(${ids[0]}, ${o1})`);
      const st = (await snap()).stations[o1]!;
      const face = (await snap()).players.find((p) => p.id === ids[0])!;
      b1.vec = { x: st.tx + 0.5 - face.x, y: st.ty + 0.5 - face.y }; b1.btn = 2;
      await sleep(1500); await cdp.shot('burn-6-extinguish');
      await sleep(1900); await cdp.shot('burn-7-out');
      b1.btn = 0; b1.vec = { x: 0, y: 0 };
      // results with the kudos line
      await cdp.eval('window.__pg.fastForward(800)');
      await waitFor((s) => (s as any).over === true, 8000);
      await sleep(3500); await cdp.shot('burn-8-results');
      bots.splice(0).forEach((b) => b.close());
    }
    if (what === 'events') {
      // The mid-round events on map 13 (it has plates to wash, so the inspector can come), Normal, 6 chefs (the map asks for 5 or more): the lobby option, and for each event the banner (3 s before), the start and
      // the event itself. The sim is driven by hand (window.__pg.kit.event forces the kind and the instant).
      const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
      const rows = fixedMap('13')!.rows;
      await open('EVTS'); await join('EVTS', 6, rows);
      await click('[data-diff="normal"]'); await click('[data-map="13"]'); await sleep(500);
      await cdp.shot('ev-0-lobby');
      await click('[data-ev="false"]'); await sleep(300);
      console.log('events option after clicking No: selected =', await cdp.eval(`document.querySelector('#evs .sel').textContent`));
      await cdp.shot('ev-0-lobby-off');
      await click('#evs [data-ev="true"]'); await sleep(200);
      await click('#start'); await sleep(1500); await key('Enter');
      await waitFor((s) => s.countdown <= 0 && s.time > 1500, 20_000);
      const kit = (expr: string) => cdp.eval<any>(`window.__pg.kit.${expr}`);
      const cs = await kit('counters()');
      const counters = cs.filter((c: any) => c.kind === 'counter'), ovens = cs.filter((c: any) => c.kind === 'pot');
      const stations = (await snap()).stations;
      const sinkIdx = stations.findIndex((s) => s.kind === 'sink'), dirtyIdx = stations.findIndex((s) => s.kind === 'dirty');
      const ids = (await snap()).players.map((p) => p.id);
      const phaseOf = async () => ((await snap()) as any).mid?.phase as string;
      const untilDone = async (ms: number) => { const end = Date.now() + ms; while (Date.now() < end && (await phaseOf()) !== 'done') await sleep(200); };
      // Hora punta
      await kit(`event('rush')`); await sleep(1300); await cdp.shot('ev-rush-1-announce');
      await sleep(2000); await cdp.shot('ev-rush-2-start'); await sleep(700); await cdp.shot('ev-rush-3-tickets'); await untilDone(8000);
      // Cumpleaños
      await kit(`event('birthday')`); await sleep(1300); await cdp.shot('ev-birthday-1-announce');
      await sleep(2000); await cdp.shot('ev-birthday-2-start'); await sleep(800); await cdp.shot('ev-birthday-3-balloons'); await untilDone(8000);
      // Corte de luz: an oven cooking and a ready one
      await kit(`bake(${ovens[0].i})`);
      await kit(`event('blackout')`); await sleep(1300); await cdp.shot('ev-blackout-1-announce');
      await sleep(2000); await cdp.shot('ev-blackout-2-start'); await sleep(2500); await cdp.shot('ev-blackout-3-dark'); await untilDone(14_000); await sleep(600); await cdp.shot('ev-blackout-4-back');
      // Inspector: two dirty plates (one in the sink, one at the return), then clean
      await kit(`setCount(${sinkIdx}, 1)`); await kit(`setCount(${dirtyIdx}, 1)`);
      await kit(`event('inspector')`); await sleep(1300); await cdp.shot('ev-inspector-1-announce');
      await sleep(2200); await cdp.shot('ev-inspector-2-dirty');
      await kit(`setCount(${sinkIdx}, 0)`); await kit(`setCount(${dirtyIdx}, 0)`); await sleep(900); await cdp.shot('ev-inspector-3-clean');
      await untilDone(30_000); await sleep(500); await cdp.shot('ev-inspector-4-verdict');
      // Rata: something to steal on a counter; one chef runs at it
      await sleep(4000);
      await kit(`setItem(${counters[3].i}, 'raw1')`); await kit(`setItem(${counters[9].i}, 'cut0')`);
      await kit(`event('rat')`); await sleep(1300); await cdp.shot('ev-rat-1-announce');
      await sleep(2300); await cdp.shot('ev-rat-2-appears');
      for (let i = 0; i < 12 && !((await snap()) as any).mid?.rat; i++) await sleep(200);
      await sleep(1500); await cdp.shot('ev-rat-3-running');
      await untilDone(12_000); await cdp.shot('ev-rat-4-gone');
      bots.splice(0).forEach((b) => b.close());
    }
    if (what === 'magnet') {
      // Magnetism and the gentle rat on map 1 (Normal, 2 chefs: the lobby rules switch the magnet on): the bracket on the station each chef's Tomar will use (a chef at 45 degrees to a crate,
      // two chefs on one crate), then the rat: the arrow over it, the dashed line to the counter it goes for, the alarm when it is about to arrive. Driven by hand (window.__pg).
      const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
      const rows = fixedMap('1')!.rows;
      await open('MAGN'); await join('MAGN', 2, rows);
      await click('[data-diff="normal"]'); await click('[data-map="1"]'); await sleep(400);
      await click('#start'); await sleep(1500); await key('Enter');
      await waitFor((s) => s.countdown <= 0 && s.time > 1500, 20_000);
      const kit = (expr: string) => cdp.eval<any>(`window.__pg.kit.${expr}`);
      const ids = (await snap()).players.map((p) => p.id);
      console.log('magnet on in the round:', await cdp.eval('!!window.__pg.snapshot().magnet'));
      await cdp.eval(`window.__pg.sab.place(${ids[0]}, 3.85, 1.35, 0.55, -0.84)`); // under the crate, looking up and to the right: the old probe would pick the counter beside it
      await cdp.eval(`window.__pg.sab.place(${ids[1]}, 10.5, 3.2, 0, -1)`);
      await sleep(400); await cdp.shot('mag-1-bracket');
      await cdp.eval(`window.__pg.sab.place(${ids[1]}, 3.4, 1.55, 0, -1)`);
      await sleep(400); await cdp.shot('mag-2-two-chefs');
      await cdp.eval(`window.__pg.sab.place(${ids[0]}, 12.5, 6.5, 0, 1)`); await cdp.eval(`window.__pg.sab.place(${ids[1]}, 1.5, 6.5, 0, 1)`);
      const counters = (await kit('counters()')).filter((c: any) => c.kind === 'counter');
      await kit(`setItem(${counters[3].i}, 'raw1')`); await kit(`setItem(${counters[9].i}, 'cut0')`);
      await kit(`event('rat')`);
      for (let i = 0; i < 40 && !((await snap()) as any).mid?.rat; i++) await sleep(200);
      await sleep(1600); await cdp.shot('mag-3-rat-arrow');
      await sleep(2000); await cdp.shot('mag-4-rat-closer');
      for (let i = 0; i < 40 && (await cdp.eval<boolean>('(() => { const r = window.__pg.snapshot().mid; return !r.rat; })()')); i++) await sleep(100);
      bots.splice(0).forEach((b) => b.close());
    }
    if (what === 'events-vs') {
      // Versus on V3 (rotation, ovens with counters beside them): the burning oven and a blackout reach both kitchens. Hard + Caos (the sabotage level that allows fire).
      const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
      await open('EVVS'); await join('EVVS', 4, versusMap('V3')!.rows);
      await click('[data-mode="versus"]'); await click('[data-map="V3"]'); await click('[data-diff="hard"]'); await sleep(500);
      await cdp.shot('evvs-0-lobby');
      await click('#start'); await sleep(1500); await key('Enter');
      await waitFor((s) => s.countdown <= 0 && s.time > 1500, 20_000);
      const kit = (expr: string) => cdp.eval<any>(`window.__pg.kit.${expr}`);
      const ovens = (await kit('counters()')).filter((c: any) => c.kind === 'pot');
      for (const o of ovens) await kit(`bake(${o.i})`);
      for (const o of ovens) await kit(`age(${o.i}, 5500)`);
      await sleep(500); await cdp.shot('evvs-1-warn');
      for (const o of ovens) await kit(`age(${o.i}, 13100)`);
      await kit(`event('blackout')`);
      await sleep(1500); await cdp.shot('evvs-2-fire-banner');
      await sleep(3500); await cdp.shot('evvs-3-dark');
      bots.splice(0).forEach((b) => b.close());
    }
    if (what === 'vs-pantry') {
      // Versus F5: the shared pantry of V2 with 6 chefs: full stock, then drained with the refill bar running
      const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
      await open('VSPT'); await join('VSPT', 6, versusMap('V2')!.rows);
      await click('[data-mode="versus"]'); await click('[data-map="V2"]'); await click('[data-diff="easy"]'); await sleep(400);
      await click('#start'); await sleep(1500); await key('Enter');
      await waitFor((s) => s.countdown <= 0 && s.time > 1500, 20_000);
      await cdp.shot('vs-pantry-full');
      await cdp.eval('window.__pg.setPantry(1, 3500)'); await sleep(600);
      await cdp.shot('vs-pantry-low');
      await cdp.eval('window.__pg.setPantry(0, 5000)'); await sleep(600);
      await cdp.shot('vs-pantry-empty');
      bots.splice(0).forEach((b) => b.close());
    }
    if (what === 'vs-results') {
      // Versus F4: the results of a round with a winner, then (Revancha) of a draw with the series; the phone's own verdict is in versus-phone
      const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
      const rows = versusMap('V1')!.rows;
      await open('VSRS'); await join('VSRS', 6, rows);
      await click('[data-mode="versus"]'); await click('[data-map="V1"]'); await click('[data-diff="easy"]'); await sleep(400);
      await click('#start'); await sleep(1500); await key('Enter');
      await waitFor((s) => s.countdown <= 0 && s.time > 800, 20_000);
      const ids = (await snap()).players.map((p) => p.id);
      const stats = (i: number, o: object) => cdp.eval(`window.__pg.setTeam(${i}, ${JSON.stringify(o)})`);
      await stats(0, { score: 410, gross: 410, delivered: 7, bestStreak: 4, vips: 1, tips: 180, expired: 1, reachedAt: 150000 });
      await stats(1, { score: 340, gross: 340, delivered: 6, bestStreak: 3, vips: 0, tips: 120, expired: 2, rejected: 1, reachedAt: 170000 });
      for (const [i, n] of [[0, 4], [1, 2], [2, 1], [3, 3], [4, 2], [5, 1]] as const) await cdp.eval(`window.__pg.setDelivered(${ids[i]}, ${n})`);
      await cdp.eval('window.__pg.fastForward(800)');
      await waitFor((s) => (s as any).over === true, 8000);
      await sleep(850); await cdp.shot('vs-timeup-reveal');
      await sleep(1300); await cdp.shot('vs-results-reveal');
      await sleep(3300); await cdp.shot('vs-results-win');
      await click('#vs-rematch');
      await waitFor((s) => s.phase === 'playing' && s.countdown <= 0 && s.time > 800, 20_000);
      await stats(0, { score: 300, gross: 300, delivered: 5, bestStreak: 2, vips: 1, tips: 90, reachedAt: 100000 });
      await stats(1, { score: 300, gross: 300, delivered: 5, bestStreak: 3, vips: 1, tips: 100, reachedAt: 100000 });
      await cdp.eval('window.__pg.fastForward(800)'); await sleep(1500);
      await sleep(5000); await cdp.shot('vs-results-draw');
      bots.splice(0).forEach((b) => b.close());
    }
    if (what === 'howto') {
      const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
      const phase = () => cdp.eval<string>('window.__pg.snapshot().phase');
      await open('HOWT'); await join('HOWT', 4, fixedMap('1')!.rows);
      await sleep(800); await cdp.shot('howto-lobby');
      await key('h'); await sleep(700); await cdp.shot('howto-preview');
      await key('Enter'); await sleep(300);
      console.log('after Enter on preview: card hidden =', await cdp.eval(`document.getElementById('howto').classList.contains('off')`), 'phase =', await phase());
      await click('[data-diff="easy"]'); await click('#start');
      await sleep(1400); await cdp.shot('howto-card');
      await sleep(3000); await cdp.shot('howto-card-t4');
      const t0 = Date.now(); await key('Enter');
      await sleep(1300); await cdp.shot('howto-after-skip');
      console.log('after skip: phase =', await phase(), 'ms since Enter', Date.now() - t0);
      await sleep(3000); await cdp.shot('howto-countdown');
    }
    if (what === 'howto-timeout') {
      await open('HOWX'); await join('HOWX', 2, fixedMap('1')!.rows);
      await click('#start'); const t0 = Date.now();
      let ph = 'lobby';
      while (Date.now() - t0 < 20_000 && ph !== 'playing') { await sleep(100); ph = await cdp.eval<string>('window.__pg.snapshot().phase'); }
      console.log('howto-timeout: reached playing after', Date.now() - t0, 'ms (expect ~11 s: iris half + card 10 s + iris half)');
    }
    if (what === 'menu') {
      // Pichiclub start: 0, 2 and 8 players, keyboard selection, then the step into the game's lobby (and back with Esc)
      const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
      const rows = fixedMap('1')!.rows;
      await open('MENU'); await sleep(500);
      await cdp.shot('menu-0');
      await join('MENU', 1, rows, { menu: true }); await sleep(500);
      await cdp.shot('menu-1');
      console.log('menu with 1 player:', JSON.stringify(await cdp.eval('window.__pg.menu()')));
      await key('Enter'); await sleep(300);
      console.log('Enter on a disabled card -> phase', await cdp.eval('window.__pg.snapshot().phase'));
      await join('MENU', 2, rows, { from: 1, menu: true }); await sleep(500);
      await cdp.shot('menu-2');
      console.log('menu with 2 players:', JSON.stringify(await cdp.eval('window.__pg.menu()')));
      await join('MENU', 8, rows, { from: 2, menu: true }); await sleep(600);
      await cdp.shot('menu-8');
      await key('ArrowRight'); await key('ArrowDown'); await sleep(200);
      console.log('after arrows (nothing to move to):', JSON.stringify(await cdp.eval('window.__pg.menu()')));
      await key('Enter'); await sleep(550); await cdp.shot('menu-to-lobby-iris');
      await sleep(1000);
      console.log('after Enter -> phase', await cdp.eval('window.__pg.snapshot().phase'));
      await cdp.shot('menu-lobby');
      await key('Escape'); await sleep(1700);
      console.log('after Esc -> phase', await cdp.eval('window.__pg.snapshot().phase'));
      await cdp.shot('menu-back');
      bots.splice(0).forEach((b) => b.close());
    }
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
      const good = await waitFor((s) => s.players.some((p) => p.cutting) && s.stations.some((x) => x.kind === 'pot' && (x.inputs.length >= 2 || x.done)) && s.orders.length >= 1, Number(process.env.WAIT_MS ?? 90_000));
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
    if (what === 'newmaps') {
      // lobby with 5 players (filter by N), then three new maps: 2 chefs, 5 chefs (sink + cheese), 8 chefs with bots
      const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
      const scenario: [string, number][] = (process.env.SCENARIOS ?? '6:2,10:5,12:8').split(',').map((x) => [x.split(':')[0]!, Number(x.split(':')[1])]);
      for (const [id, n] of scenario) {
        const room = `N${id}X`.padEnd(4, 'X').slice(0, 4);
        await open(room);
        await join(room, n, fixedMap(id)!.rows);
        await sleep(800);
        await cdp.shot(`lobby-n${n}`);
        await click(`[data-map="${id}"]`); await click('[data-diff="easy"]'); await sleep(300);
        await cdp.shot(`lobby-n${n}-map${id}`);
        await click('#start'); await sleep(1500); await key('Enter');
        await sleep(2100); await cdp.shot(`map${id}-n${n}-countdown`);
        bots.forEach((b) => b.startSending());
        timers.push(setInterval(async () => { try { const s = await snap(); bots.forEach((b) => b.decide(s)); } catch { /* page navigating */ } }, 100));
        await waitFor((s) => s.countdown <= 0 && s.time > 9000, 20_000);
        await cdp.shot(`map${id}-n${n}-icons`);
        const good = await waitFor((s) => s.stations.some((x) => x.kind === 'pot' && x.inputs.length >= 2) && s.players.some((p) => p.cutting), Number(process.env.WAIT_MS ?? 70_000));
        console.log(`map ${id} n=${n} scene ready:`, !!good);
        await sleep(1500);
        await cdp.shot(`map${id}-n${n}-play`);
        if (process.env.LATE) { await sleep(Number(process.env.LATE)); await cdp.shot(`map${id}-n${n}-late`); }
        timers.splice(0).forEach(clearInterval);
        bots.splice(0).forEach((b) => b.close());
        await sleep(400);
      }
    }
    if (what === 'fase1') {
      // phase 1 of the overcooked-2 plan: 4 chefs (streak badge, dash, results with stars) and 8 chefs on a map for 4-8
      const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
      await open('F1AA'); await join('F1AA', 4, fixedMap('1')!.rows);
      await click('[data-map="1"]'); await sleep(300);
      await cdp.shot('f1-lobby');
      await click('#start'); await sleep(1500); await key('Enter');
      await sleep(2100); await cdp.shot('f1-4-countdown');
      bots.forEach((b) => b.startSending());
      timers.push(setInterval(async () => { try { const s = await snap(); bots.forEach((b) => b.decide(s)); } catch { /* page navigating */ } }, 100));
      const hot = await waitFor((s) => s.streak >= 2, Number(process.env.WAIT_MS ?? 110_000));
      console.log('streak >= 2 reached:', !!hot, hot ? `streak ${hot.streak} score ${hot.score}` : '');
      await sleep(250); await cdp.shot('f1-4-streak');
      timers.splice(0).forEach(clearInterval);
      // the dash: bot 0 runs to the right with B tapped; the screenshots fall inside the 180 ms and the dust after it
      const b0 = bots[0]!;
      for (const b of bots) { b.vec = { x: 0, y: 0 }; b.btn = 0; }
      await sleep(500);
      const s0 = await snap(); const me = s0.players.find((p) => p.id === b0.id)!;
      b0.vec = { x: 1, y: 0 }; await sleep(200); b0.b++;
      await sleep(60);
      const s1 = await snap(); const p1 = s1.players.find((p) => p.id === b0.id)!;
      const cx = 96 + p1.x * 108, cy = 106 + p1.y * 108;
      await cdp.shot('f1-4-dash', { x: Math.max(0, cx - 260), y: Math.max(0, cy - 230), width: 520, height: 330, scale: 2 });
      console.log('dash: x before', me.x.toFixed(2), 'x 60 ms after the tap', p1.x.toFixed(2));
      await sleep(900); b0.vec = { x: 0, y: 0 };
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
      await cdp.eval('window.__pg.setScore(400)'); await cdp.eval('window.__pg.fastForward(1200)');
      await sleep(1700); await cdp.shot('f1-4-timeup');
      await sleep(5200); await cdp.shot('f1-4-results-2star');
      bots.splice(0).forEach((b) => b.close());
      await click('#again'); await sleep(800);
      // 8 chefs
      await open('F1BB'); await join('F1BB', 8, fixedMap('11')!.rows);
      await click('[data-map="11"]'); await sleep(300);
      await click('#start'); await sleep(1500); await key('Enter');
      await sleep(2100); await cdp.shot('f1-8-countdown');
      bots.forEach((b) => b.startSending());
      timers.push(setInterval(async () => { try { const s = await snap(); bots.forEach((b) => b.decide(s)); } catch { /* page navigating */ } }, 100));
      await waitFor((s) => s.countdown <= 0 && s.time > 25_000, 60_000);
      await cdp.shot('f1-8-play');
      const s8 = await snap();
      console.log('8 chefs: score', s8.score, 'streak', s8.streak, 'pairs crossing', s8.crowd.length, 'fps', s8.fps.toFixed(0));
      await cdp.eval('window.__pg.setScore(760)'); await cdp.eval('window.__pg.fastForward(1200)');
      timers.splice(0).forEach(clearInterval);
      await sleep(1700); await cdp.shot('f1-8-timeup'); await sleep(5200); await cdp.shot('f1-8-results-3star');
      bots.splice(0).forEach((b) => b.close());
    }
    if (what === 'dash') {
      const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
      await open('DASH'); await join('DASH', 2, fixedMap('1')!.rows);
      await click('[data-map="1"]'); await sleep(300); await click('#start'); await sleep(1500); await key('Enter');
      bots.forEach((b) => b.startSending());
      await waitFor((s) => s.countdown <= 0 && s.time > 500, 15_000);
      const b0 = bots[0]!;
      b0.vec = { x: -1, y: 0 }; await sleep(900); b0.vec = { x: 0, y: 0 }; await sleep(400);
      b0.vec = { x: 1, y: 0 }; await sleep(120); b0.b++;
      for (let i = 0; i < 4; i++) {
        await sleep(i === 0 ? 40 : 60);
        const s = await snap(); const p = s.players.find((q) => q.id === b0.id)!;
        const cx = 96 + p.x * 108, cy = 106 + p.y * 108;
        await cdp.shot(`dash-${i}`, { x: Math.max(0, cx - 360), y: Math.max(0, cy - 200), width: 520, height: 330, scale: 2 });
        console.log('frame', i, 'x', p.x.toFixed(2));
      }
      b0.vec = { x: 0, y: 0 };
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
