// Static pictures of the campaign's screens with a catalog of the plan's size (5 worlds x 7 + a summit each), rendered from the same view functions as
// the screen, with the page's own CSS. No server, no game: it shows what the map looks like at the size S2's catalog will have.
// usage: npx tsx tools/camp-shots.ts [outDir]    env: CDP (9730)
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { DIFFICULTIES, DIFFICULTY_LABEL } from '../shared/difficulty';
import { applyResult, fullMask, newExpedition, openWorld, type Expedition } from '../shared/games/obstaculos/campaign';
import { planCatalog } from '../shared/games/obstaculos/campaign/testkit';
import { initialState, type CampState } from '../screen/src/games/obstaculos/campaign/model';
import { renderHub, renderMap, renderPick, renderResult, type ViewCtx } from '../screen/src/games/obstaculos/campaign/view';

const CDP = Number(process.env.CDP ?? 9730);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = path.resolve(process.argv[2] ?? 'docs/screens/camp');
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const css = readFileSync(path.resolve('screen/index.html'), 'utf8').match(/<style>([\s\S]*?)<\/style>/)![1]!;

const plan = planCatalog();
let t = 1000;
const play = (e: Expedition, id: string, perfect: boolean, ms = 50_000) => applyResult(e, plan, { levelId: id, cleared: true, timeMs: ms, collectiblesMask: perfect ? fullMask(3) : 0, deaths: perfect ? 0 : 3 }, ++t);
let mid = newExpedition('exp-mid00001', 'Nico y Angi', 1000);
['1-1', '1-2', '1-3', '1-4', '1-5', '1-6'].forEach((id, i) => { mid = play(mid, id, i % 2 === 0, i % 3 === 0 ? 40_000 : 120_000); });
mid = play(mid, '1-7', true);
['2-1', '2-2', '2-3'].forEach((id, i) => { mid = play(mid, id, i === 1); });
let rich = mid;
for (const id of ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7']) rich = play(rich, id, true, 30_000);
const hubOf = (list: Expedition[]) => ({ list: list.map((e) => ({ id: e.id, name: e.name, updatedAt: e.updatedAt, stars: 7, lastLevelId: e.lastLevelId, active: e.id === 'exp-busy0001' })), last: list[0] ?? null, offline: false });
const base = (o: Partial<ViewCtx> = {}): ViewCtx => ({ now: 20_000, hub: hubOf([mid, { ...newExpedition('exp-busy0001', 'Pablo, Coni y Mati', 500), lastLevelId: '1-4' }]), exp: mid, catalog: plan, n: 2, outcome: null, difficulty: 'normal', diffLabels: DIFFICULTY_LABEL, difficulties: DIFFICULTIES, names: ['Nico', 'Angi'], ...o });
const st = (o: Partial<CampState>): CampState => ({ ...initialState(), ...o });

const panel = (inner: string) => `<div class="stage"><div id="lobbyui" class="camp"><div id="campaign" class="panel">${inner}</div></div></div>`;
const results = (inner: string) => `<section id="results" style="position:fixed;inset:0"><div class="stage"><div id="resultsInner" class="panel" style="animation:none"><div id="campres">${inner}</div></div></div></section>`;
const outcome = (o: Partial<Parameters<typeof renderResult>[1]>) => ({ levelId: '1-3', cleared: true, timeMs: 54_000, deaths: 0, before: { done: true, stars: [true, false, false] as [boolean, boolean, boolean], bestTimeMs: 70_000, timeMedal: false, collectiblesMask: 1, skipped: false }, after: { done: true, stars: [true, true, true] as [boolean, boolean, boolean], bestTimeMs: 54_000, timeMedal: true, collectiblesMask: 7, skipped: false }, next: plan.levels[3]!, failuresInARow: 0, canSkip: false, saved: true, ...o });
const shots: [string, string][] = [
  ['hub-two', panel(renderHub(st({}), base()))],
  ['hub-reset-armed', panel(renderHub(st({ resetArmedAt: 17_000 }), base()))],
  ['hub-reset-ready', panel(renderHub(st({ resetArmedAt: 10_000 }), base()))],
  ['pick', panel(renderPick(st({ view: 'pick', pickSel: 1 }), base()))],
  ['map-w1-partway', panel(renderMap(st({ view: 'map', world: '1', node: 6 }), base({ exp: mid })))],
  ['map-w1-summit-open', panel(renderMap(st({ view: 'map', world: '1', node: 7 }), base({ exp: rich })))],
  ['map-w1-summit-hidden', panel(renderMap(st({ view: 'map', world: '1', node: 7 }), base({ exp: mid })))],
  ['map-w2-locked', panel(renderMap(st({ view: 'map', world: '3', node: 0, notice: 'Vence a Bosque 7 (2-7) para abrir Glaciar' }), base({ exp: mid })))],
  ['map-w2-fresh', panel(renderMap(st({ view: 'map', world: '2', node: 3 }), base({ exp: openWorld(newExpedition('exp-skip0001', 'Nico y Angi', 1000), plan, '2', 2000) })))],
  ['map-3players', panel(renderMap(st({ view: 'map', world: '1', node: 0 }), base({ exp: newExpedition('exp-new00001', 'Nico, Angi y Pablo', 1000), n: 3 })))],
  ['result-win', results(renderResult(st({ view: 'result' }), outcome({}), plan))],
  ['result-fail-skip', results(renderResult(st({ view: 'result' }), outcome({ cleared: false, canSkip: true, failuresInARow: 5, next: null, deaths: 14 }), plan))],
  ['result-win-unsaved', results(renderResult(st({ view: 'result', resSel: 1 }), outcome({ saved: false, next: null }), plan))],
];

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

async function main() {
  const profile = mkdtempSync(path.join(tmpdir(), 'pg-shots-chrome-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, '--window-size=1920,1080', '--hide-scrollbars', '--no-first-run', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
  try {
    let targets: any[] = [];
    for (let i = 0; i < 50 && !targets.length; i++) { await sleep(200); try { targets = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).filter((x: any) => x.type === 'page'); } catch { /* not up yet */ } }
    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    await new Promise((r) => ws.once('open', r));
    let id = 0;
    const pending = new Map<number, (m: any) => void>();
    ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); } });
    const send = (method: string, params: object = {}) => new Promise<any>((resolve, reject) => { const i = ++id; pending.set(i, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result))); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    for (const [name, body] of shots) {
      const file = path.join(profile, `${name}.html`);
      writeFileSync(file, `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${css}</style></head><body style="background:#3A2A24">${body}</body></html>`);
      await send('Page.navigate', { url: `file://${file}` });
      await sleep(500);
      const r = await send('Page.captureScreenshot', { format: 'png', ...(name.startsWith('result') ? {} : { clip: { x: 600, y: 440, width: 1290, height: 640, scale: 1 } }) });
      writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(r.data, 'base64'));
      console.log('saved', name);
    }
  } finally { await killTree(chrome); rmSync(profile, { recursive: true, force: true }); process.exit(0); }
}
main();
