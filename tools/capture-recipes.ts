// Visual check of the Carta del día: serves the built app, joins idle phones to a coop round and saves screenshots of what the new recipes look like (the card under the
// countdown, the tickets, the crate, the plates, the oven with the fold bar), driving the sim by hand through window.__pg.kit.
// usage: npm run build && npx tsx tools/capture-recipes.ts <outDir> [maps, default 9,12,2]   (PG_PORT 5000 / PG_CDP 9790 move the ports)
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { startServer } from '../server/src/server';

const PORT = Number(process.env.PG_PORT ?? 5000), CDP = Number(process.env.PG_CDP ?? 9790);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = path.resolve(process.argv[2] ?? 'docs/screens-recipes');
const maps = (process.argv[3] ?? '9,12,2').split(',');
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function descendants(pid: number): number[] {
  const rows = execSync('ps -A -o pid=,ppid=').toString().trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
  const out: number[] = [];
  const walk = (p: number) => { for (const [c, pp] of rows) if (pp === p && c !== undefined) { out.push(c); walk(c); } };
  walk(pid);
  return out;
}
async function killTree(proc: ChildProcess) { // Chrome leads its own process group: kill the tree by pid, SIGTERM first
  if (!proc.pid) return;
  const pids = [proc.pid, ...descendants(proc.pid)];
  for (const p of pids) { try { process.kill(p, 'SIGTERM'); } catch { /* gone */ } }
  await sleep(700);
  for (const p of pids) { try { process.kill(p, 0); process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
}

type Clip = { x: number; y: number; width: number; height: number; scale?: number };
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
  async shot(name: string, clip?: Clip) {
    const r = await this.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { scale: 1, ...clip } } : {}) });
    const file = path.join(outDir, `${name}.png`);
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    console.log('saved', file);
  }
}

// An idle phone: it joins a room and sends the stick centred; B can be held for a fold.
class Phone {
  ws: WebSocket;
  id = 0; seq = 0; btn = 0; presses = [0, 0];
  constructor(name: string, room: string) {
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?room=${room}`);
    this.ws.on('open', () => this.ws.send(JSON.stringify({ t: 'join', name, token: `rc-${room}-${name}` })));
    this.ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.t === 'joined') this.id = m.player.id; });
    setInterval(() => { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'input', seq: this.seq++, x: 0, y: 0, btn: this.btn, presses: this.presses, ts: Date.now() })); }, 33).unref();
  }
  close() { this.ws.close(); }
}

interface Snap { phase: string; time: number; countdown: number; players: { id: number }[]; stations: { kind: string; tx: number; ty: number; crate: number; item: string | null; inputs: number[]; done: boolean; folded?: boolean; fold?: number }[]; orders: { recipe: string }[] }

// the playfield: 16x9 tiles of TILE px from (OX, OY) on the 1920x1080 canvas (screen/src/art/tokens.ts)
const TILE = Math.floor((1080 - 104) / 9), OX = Math.floor((1920 - TILE * 16) / 2), OY = 104 + Math.floor((1080 - 104 - TILE * 9) / 2);
const around = (tx: number, ty: number, r = 1.6, scale = 2): Clip => ({ x: OX + (tx + 0.5 - r) * TILE, y: OY + (ty + 0.5 - r) * TILE, width: 2 * r * TILE, height: 2 * r * TILE, scale });

async function main() {
  const srv = await startServer({ port: PORT, mode: 'static' });
  let chromeRef: ChildProcess | null = null;
  const dog = setTimeout(async () => { console.error('watchdog fired'); if (chromeRef) await killTree(chromeRef); process.exit(2); }, 240_000);
  const profile = mkdtempSync(path.join(tmpdir(), 'pg-chrome-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, '--window-size=1920,1080', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--ignore-gpu-blocklist', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
  chromeRef = chrome;
  const phones: Phone[] = [];
  try {
    let targets: any[] = [];
    for (let i = 0; i < 50 && !targets.length; i++) { await sleep(200); try { targets = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).filter((t: any) => t.type === 'page'); } catch { /* not up yet */ } }
    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    await new Promise((r) => ws.once('open', r));
    const cdp = new Cdp(ws);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    const click = (sel: string) => cdp.eval(`document.querySelector(${JSON.stringify(sel)}).click()`);
    const snap = () => cdp.eval<Snap>('JSON.parse(JSON.stringify(window.__pg.snapshot()))');
    const kit = (expr: string) => cdp.eval<any>(`window.__pg.kit.${expr}`);
    const waitFor = async (pred: (s: Snap) => boolean, ms: number) => { const end = Date.now() + ms; while (Date.now() < end) { const s = await snap(); if (pred(s)) return s; await sleep(120); } return null; };

    for (const map of maps) {
      const room = `RC${map}`.slice(0, 4).padEnd(4, 'X');
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${room}` });
      await sleep(2500);
      for (const name of ['Nico', 'Angi']) { phones.push(new Phone(name, room)); await sleep(150); }
      await sleep(700);
      await cdp.eval('window.__pg.forceLobby()');
      await click('[data-diff="normal"]'); await click(`[data-map="${map}"]`); await sleep(300);
      await click('#start'); await sleep(1500);
      await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))`);
      await waitFor((s) => s.countdown > 0 && s.countdown < 2700, 8000); await sleep(500);
      await cdp.shot(`rc${map}-1-countdown`);
      await waitFor((s) => s.countdown <= 0 && s.time > 3000, 20_000);
      const ids = (await snap()).players.map((p) => p.id);
      const st = (await snap()).stations;
      const idx = (kind: string, k = 0) => st.map((s, i) => ({ s, i })).filter((x) => x.s.kind === kind)[k]!.i;
      const at = (i: number) => st[i]!;
      await cdp.shot(`rc${map}-2-play`);
      await kit(`event('rush')`); await sleep(6500); // three more tickets at once
      const hudStrip: Clip = { x: 0, y: 0, width: 1000, height: 150, scale: 2 };
      await cdp.shot(`rc${map}-3-tickets`, hudStrip);
      console.log(`map ${map}: tickets`, (await snap()).orders.map((o) => o.recipe).join(','));

      // the cheese crate (it holds the card's topping) and a board with the cut topping
      const crate2 = st.findIndex((s) => s.kind === 'crate' && s.crate === 2);
      if (crate2 >= 0) await cdp.shot(`rc${map}-4-crate`, around(at(crate2).tx, at(crate2).ty));
      const bottom = st.map((s, i) => ({ s, i })).filter((x) => x.s.kind === 'counter' && x.s.ty === 8).map((x) => x.i);
      const board = idx('board'), counter0 = bottom[2]!, counter1 = bottom[3]!, counter2 = bottom[4]!;
      const topping = (await cdp.eval<number>(`(window.__pg.snapshot().topping ?? 2)`));
      void topping;
      // the plates on counters, and one in a chef's hands
      const plates: [string, number][] = [['dishP', counter0], ['dishM', counter1], ['dishC', counter2]];
      for (const [item, i] of plates) await kit(`setItem(${i}, '${item}')`);
      await kit(`setItem(${board}, 'cut3')`);
      await sleep(500);
      await cdp.shot(`rc${map}-5-dishes`, { x: OX + (at(counter0).tx - 0.5) * TILE, y: OY + (8 - 0.2) * TILE, width: 4 * TILE, height: 1.3 * TILE, scale: 2 });
      await cdp.shot(`rc${map}-5-board`, around(at(board).tx, at(board).ty, 1.2, 2));
      await kit(`setItem(${counter0}, null)`); await kit(`setItem(${counter1}, null)`); await kit(`setItem(${counter2}, null)`); await kit(`setItem(${board}, null)`);

      // ovens: pepperoni raw-ish (cooking 60%), baked mushroom, a calzone cooking, a folded calzone ready
      const ovens = st.map((s, i) => ({ s, i })).filter((x) => x.s.kind === 'pot').map((x) => x.i);
      const showOven = async (label: string, inputs: number[], folded: boolean, progress: number, extra?: () => Promise<void>) => {
        const o = ovens[0]!;
        await kit(`bake(${o}, ${JSON.stringify(inputs)}, ${folded}, ${progress})`);
        await extra?.();
        await sleep(450);
        await cdp.shot(`rc${map}-6-oven-${label}`, around(at(o).tx, at(o).ty, 1.3, 2.5));
      };
      await showOven('pepperoni-cooking', [0, 1, 3], false, 0.55);
      await showOven('pepperoni-ready', [0, 1, 3], false, 1);
      await showOven('mushroom-ready', [0, 1, 4], false, 1);
      await showOven('calzone-arrow', [0, 1], false, 0.3); // dough and tomato baking: the fold arrow invites Picar
      await showOven('calzone-cooking', [0, 1], true, 0.5);
      await showOven('calzone-ready', [0, 1], true, 1);
      // folding for real: a chef stands at the oven and holds Picar
      await kit(`bake(${ovens[0]!}, [0, 1], false, 0.2)`);
      await kit(`stand(${ids[0]}, ${ovens[0]!})`);
      phones[phones.length - 2]!.btn = 2;
      await sleep(900);
      await cdp.shot(`rc${map}-7-folding`, around(at(ovens[0]!).tx, at(ovens[0]!).ty, 1.6, 2));
      await sleep(1500);
      phones[phones.length - 2]!.btn = 0;
      console.log('folded:', JSON.stringify((await snap()).stations.filter((s) => s.kind === 'pot').map((s) => ({ f: s.folded, fold: s.fold }))));
      await kit(`item(${ids[0]}, 'dishC')`); await kit(`item(${ids[1]}, 'dishP')`);
      await kit(`stand(${ids[1]}, ${idx('window')})`);
      await sleep(500);
      await cdp.shot(`rc${map}-8-chefs-carrying`);
      phones.splice(0).forEach((p) => p.close());
    }
  } finally {
    phones.forEach((p) => p.close());
    clearTimeout(dog);
    await killTree(chrome);
    await srv.close();
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
