// Cocina escuela, end to end in headless Chrome: the REAL screen (page A, 1920x1080) and a REAL phone (page B, 844x390 mobile) plus bot phones on websockets, driven through the
// whole flow: lobby -> "A cocinar" offers the school -> four steps (a capture of the TV and of the phone at each) -> "todos listos" -> the round's how-to card; then the lobby button
// (P), Enter to skip, the memory (no second offer), versus, and eight players.
// usage: npx tsx tools/school-shots.ts <outDir>      (PG_PORT 5100 / PG_CDP 9791 by default; static mode: run `npm run build` first)
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { startServer } from '../server/src/server';
import { createGame, addPlayer, TICK_MS, type Game } from '../shared/overcooked';
import { SCHOOL_ROWS, SCHOOL_MAP_ID, SCHOOL_TOTAL } from '../shared/tutorial';
import { botControls, type BotMem } from '../shared/tutorial/schoolBot';

const PORT = Number(process.env.PG_PORT ?? 5100), CDP = Number(process.env.PG_CDP ?? 9791);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const out = path.resolve(process.argv[2] ?? 'docs/school');
mkdirSync(out, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function descendants(pid: number): number[] {
  const rows = execSync('ps -A -o pid=,ppid=').toString().trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
  const acc: number[] = [];
  const walk = (p: number) => { for (const [c, pp] of rows) if (pp === p && c !== undefined) { acc.push(c); walk(c); } };
  walk(pid);
  return acc;
}
async function killTree(proc: ChildProcess) {
  if (!proc.pid) return;
  const pids = [proc.pid, ...descendants(proc.pid)];
  for (const p of pids) { try { process.kill(p, 'SIGTERM'); } catch { /* gone */ } }
  await sleep(700);
  for (const p of pids) { try { process.kill(p, 0); process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
}

class Page {
  private id = 0;
  private pending = new Map<number, (m: any) => void>();
  errors: string[] = [];
  constructor(private ws: WebSocket, readonly name: string) {
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)!(m); this.pending.delete(m.id); }
      else if (m.method === 'Runtime.exceptionThrown') this.errors.push(`${name}: ${JSON.stringify(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 400)}`);
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
  async shot(file: string) { const r = await this.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(path.join(out, `${file}.png`), Buffer.from(r.data, 'base64')); console.log('saved', file); }
}

/** A phone on a websocket: it joins, sends its inputs at 30 Hz and hears the school messages. */
class Bot {
  ws: WebSocket; id = 0; seq = 0; vec = { x: 0, y: 0 }; btn = 0; presses = [0, 0]; school: any[] = []; mem: BotMem = { lastPress: -99, stuck: 0 };
  constructor(readonly name: string, room: string) {
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?room=${room}`);
    this.ws.on('open', () => this.ws.send(JSON.stringify({ t: 'join', name, token: `bot-${room}-${name}` })));
    this.ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.t === 'joined') this.id = m.player.id; else if (m.t === 'school') this.school.push(m); });
    setInterval(() => { if (this.ws.readyState === WebSocket.OPEN && this.id) this.ws.send(JSON.stringify({ t: 'input', seq: this.seq++, x: this.vec.x, y: this.vec.y, btn: this.btn, presses: this.presses, ts: Date.now() })); }, 33).unref();
  }
}

interface Dbg { on: boolean; origin: string; ending: boolean; everyoneDone: boolean; done: boolean; rows: { id: number; slot: number; step: number; done: boolean; skipped: boolean }[]; players: any[]; stations: any[] }

async function main() {
  const srv = await startServer({ port: PORT, mode: 'static' });
  const profile = mkdtempSync(path.join(tmpdir(), 'pg-school-chrome-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, '--window-size=1920,1080', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--ignore-gpu-blocklist', '--force-color-profile=srgb', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
  const dog = setTimeout(async () => { console.error('watchdog fired'); await killTree(chrome); process.exit(2); }, Number(process.env.MAX_MS ?? 270_000));
  const bots: Bot[] = [];
  const timers: ReturnType<typeof setInterval>[] = [];
  const pages: Page[] = [];
  try {
    let targets: any[] = [];
    for (let i = 0; i < 50 && !targets.length; i++) { await sleep(200); try { targets = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).filter((t: any) => t.type === 'page'); } catch { /* not up */ } }
    const mk = async (name: string, url: string, first?: any) => {
      const t = first ?? (await (await fetch(`http://127.0.0.1:${CDP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json());
      const ws = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((r) => ws.once('open', r));
      const p = new Page(ws, name); pages.push(p);
      await p.send('Page.enable'); await p.send('Runtime.enable'); await p.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      return p;
    };
    const tv = await mk('tv', '', targets[0]);
    await tv.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    const dbg = () => tv.eval<Dbg>('JSON.parse(JSON.stringify(window.__pg.school()))');
    const key = (k: string) => tv.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
    const click = (sel: string) => tv.eval(`document.querySelector(${JSON.stringify(sel)}).click()`);
    const until = async (f: () => Promise<boolean>, what: string, ms = 30_000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await f()) return; await sleep(120); } throw new Error(`timeout: ${what}`); };
    const phaseOf = () => tv.eval<string>('window.__pg.snapshot().phase');

    // the mirror game the bots decide with: the school's kitchen, chefs and stations synced from the page every poll
    const mirror: Game = createGame({ mapId: SCHOOL_MAP_ID, difficulty: 'easy', n: 2, rows: SCHOOL_ROWS, countdownMs: 0 });
    let poll = 0;
    const decideAll = async (phone: Page | null, phoneBot: { id: number }) => {
      const d = await dbg();
      if (!d.on) return d;
      for (const p of d.players) { if (!mirror.players.has(p.id)) addPlayer(mirror, p.id, p.slot, p.slot); Object.assign(mirror.players.get(p.id)!, { x: p.x, y: p.y, fx: p.fx, fy: p.fy, item: p.item, cutting: p.cutting }); }
      d.stations.forEach((s, i) => { Object.assign(mirror.stations[i]!, { item: s.item, inputs: s.inputs, done: s.done }); });
      poll++;
      for (const b of bots) {
        const gp = mirror.players.get(b.id); const row = d.rows.find((r) => r.id === b.id);
        if (!gp || !row) continue;
        const c = botControls(mirror, gp, row.step, b.mem, poll * (50 / TICK_MS));
        b.vec = { x: c.x, y: c.y }; b.btn = c.b ? 2 : 0; if (c.a) b.presses[0] = (b.presses[0]! + c.a) % 65536;
      }
      const mine = mirror.players.get(phoneBot.id), mrow = d.rows.find((r) => r.id === phoneBot.id);
      if (phone && mine && mrow) {
        const c = botControls(mirror, mine, mrow.step, memPhone, poll * (50 / TICK_MS));
        await phone.eval(`(() => { const s = window.__pad; s.x = ${c.x}; s.y = ${c.y}; s.btn = ${c.b ? 2 : 0}; s.presses[0] = (s.presses[0] + ${c.a}) % 65536; })()`);
      }
      return d;
    };
    const memPhone: BotMem = { lastPress: -99, stuck: 0 };
    const drive = (phone: Page | null, me: { id: number }) => { let busy = false; const t = setInterval(async () => { if (busy) return; busy = true; try { await decideAll(phone, me); } catch { /* page navigating */ } busy = false; }, 50); timers.push(t); return t; };
    const stopDrive = () => { timers.splice(0).forEach(clearInterval); for (const b of bots) { b.vec = { x: 0, y: 0 }; b.btn = 0; } };
    const joinBots = async (room: string, names: string[]) => { for (const n of names) { bots.push(new Bot(n, room)); await sleep(150); } await sleep(500); };
    const phoneOpen = async (room: string, name: string) => {
      const ph = await mk('phone', `http://127.0.0.1:${PORT}/c/?room=${room}`);
      await ph.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
      await ph.send('Emulation.setTouchEmulationEnabled', { enabled: true });
      await sleep(1000);
      await ph.eval(`document.getElementById('name').value = ${JSON.stringify(name)}; document.getElementById('join').requestSubmit()`);
      await sleep(1000);
      await ph.eval(`document.getElementById('howto').dispatchEvent(new PointerEvent('pointerup'))`); // close the how-to card
      return ph;
    };

    // ---- Scenario 1: 4 players, the school offered by "A cocinar" --------------------------------------------------------------------------------------------
    const room = 'SCHL';
    await tv.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${room}` });
    await sleep(2200);
    const ph = await phoneOpen(room, 'Nico');
    await joinBots(room, ['Angi', 'Pablo', 'Mati']);
    await tv.eval('window.__pg.forceLobby()');
    await sleep(800);
    await tv.shot('01-lobby');
    await ph.shot('01-phone-lobby');
    await click('#start'); // "A cocinar": the first of this room, nobody has done it: the school takes over
    await until(async () => (await phaseOf()) === 'school', 'phase school');
    await sleep(1200);
    // Nico's player id: the one that is not a bot
    const ids = (await dbg()).rows.map((r) => r.id);
    const meId = ids.find((i) => !bots.some((b) => b.id === i))!;
    console.log('phase:', await phaseOf(), '| rows:', JSON.stringify((await dbg()).rows));
    await tv.shot('02-tv-step1-start'); await ph.shot('02-phone-step1-start');
    drive(ph, { id: meId });
    let shotStep = 0;
    await until(async () => {
      const d = await dbg();
      const me = d.rows.find((r) => r.id === meId);
      if (me && me.step > shotStep && me.step < SCHOOL_TOTAL) { shotStep = me.step; await sleep(450); await tv.shot(`0${2 + shotStep}-tv-step${shotStep + 1}`); await ph.shot(`0${2 + shotStep}-phone-step${shotStep + 1}`); }
      return !!me && me.step >= SCHOOL_TOTAL;
    }, 'Nico done', 90_000);
    await sleep(500); await tv.shot('06-tv-nico-done'); await ph.shot('06-phone-nico-done');
    await until(async () => (await dbg()).everyoneDone, 'everyone done', 90_000);
    await sleep(500); await tv.shot('07-tv-all-done'); await ph.shot('07-phone-all-done');
    stopDrive();
    await until(async () => !(await dbg()).on, 'school ended by itself', 15_000);
    await sleep(1500);
    console.log('after the school: phase', await phaseOf(), '| how-to card open:', !(await tv.eval<boolean>("document.getElementById('howto').classList.contains('off')")), '| remembered:', (await dbg()).done);
    await tv.shot('08-tv-howto-after-school');
    console.log('phone remembered it (localStorage):', await ph.eval(`Object.keys(localStorage).filter((k) => k.startsWith('pg.school.')).join(',')`));
    await key('Enter'); // skip the how-to card: the countdown starts, the round runs
    await sleep(2600);
    console.log('the round runs after the school: phase', await phaseOf());
    await tv.shot('09-tv-round-after-school');
    for (const b of bots) b.ws.close(); bots.length = 0; ph.send('Page.close').catch(() => {});

    // ---- Scenario 2: the room remembers (no second offer), P opens it by hand, Enter skips; versus; ---------------------------------------------------------------
    const room2 = 'SCH2';
    await tv.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${room2}` });
    await sleep(2200);
    await joinBots(room2, ['Ana', 'Beto']);
    await tv.eval('window.__pg.forceLobby()');
    await sleep(600);
    await key('p'); // by hand, from the lobby
    await until(async () => (await phaseOf()) === 'school', 'P opens the school');
    await sleep(900);
    console.log('opened by hand: origin =', (await dbg()).origin);
    await tv.shot('10-tv-school-two-players');
    await key('Enter'); // Enter skips it for everyone
    await sleep(2200);
    console.log('after Enter in the school: phase', await phaseOf(), '| remembered:', (await dbg()).done);
    await click('#start'); await sleep(2200);
    console.log('"A cocinar" after that goes to the how-to card, not the school again: phase', await phaseOf(), '| howto open:', !(await tv.eval<boolean>("document.getElementById('howto').classList.contains('off')")));
    await key('Enter'); await sleep(300);
    for (const b of bots) b.ws.close(); bots.length = 0;

    // versus: teams together
    const room3 = 'SCH3';
    await tv.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${room3}` });
    await sleep(2200);
    await joinBots(room3, ['Ana', 'Beto', 'Caro', 'Dani']);
    await tv.eval('window.__pg.forceLobby()');
    await sleep(500);
    await click('[data-mode="versus"]'); await sleep(900);
    await tv.shot('11-tv-lobby-versus');
    await click('#start'); await until(async () => (await phaseOf()) === 'school', 'versus school'); await sleep(1500);
    await tv.shot('12-tv-school-versus-together');
    await key('Enter'); await sleep(1800);
    for (const b of bots) b.ws.close(); bots.length = 0;

    // eight players
    const room4 = 'SCH4';
    await tv.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${room4}` });
    await sleep(2200);
    await joinBots(room4, ['Ana', 'Beto', 'Caro', 'Dani', 'Eli', 'Fer', 'Gus', 'Hana']);
    await tv.eval('window.__pg.forceLobby()');
    await sleep(500);
    await click('#start'); await until(async () => (await phaseOf()) === 'school', '8-player school'); await sleep(1200);
    const me8 = { id: -1 };
    drive(null, me8);
    await sleep(9000);
    await tv.shot('13-tv-school-eight-players');
    await until(async () => (await dbg()).everyoneDone, 'eight players done', 120_000);
    await sleep(600);
    await tv.shot('14-tv-school-eight-done');
    stopDrive();
    if (pages.some((p) => p.errors.length)) console.error('PAGE ERRORS', pages.flatMap((p) => p.errors));
    console.log('captures in', out);
  } finally {
    timers.forEach(clearInterval);
    for (const b of bots) b.ws.close();
    clearTimeout(dog);
    await killTree(chrome);
    await srv.close();
    process.exit(0);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
