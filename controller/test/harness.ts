// Phone layout harness: serves the controller with Vite, drives it in headless Chrome (touch + mobile emulation, safe-area
// insets) with a fake WebSocket standing in for the relay, and measures what ends up on screen.
// Shared by layout.test.ts (automatic overlap / touch-size checks) and capture.ts (screenshots).
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import { WebSocket } from 'ws';

export const PORT = Number(process.env.PG_PORT ?? 3600); // 3000 / 3100 belong to the dev servers of the user; PG_PORT / PG_CDP_PORT let two worktrees run this suite at once
const CDP_PORT = Number(process.env.PG_CDP_PORT ?? 9366);
const CHROME = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Insets { top: number; right: number; bottom: number; left: number }
export interface Viewport { name: string; w: number; h: number; insets: Insets[] }
const NONE: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
const NOTCH: Insets = { top: 0, right: 47, bottom: 21, left: 47 }; // iPhone with a notch, landscape
const ISLAND: Insets = { top: 0, right: 59, bottom: 21, left: 59 }; // iPhone with a Dynamic Island, landscape
const CUTOUT: Insets = { top: 0, right: 0, bottom: 0, left: 48 }; // Android camera cut-out on one side
// Realistic landscape CSS viewports: iPhone SE, 8, 12 mini, 12-14, Pixel, 14 Pro Max.
export const VIEWPORTS: Viewport[] = [
  { name: '568x320', w: 568, h: 320, insets: [NONE] },
  { name: '667x375', w: 667, h: 375, insets: [NONE] },
  { name: '812x375', w: 812, h: 375, insets: [NOTCH] },
  { name: '844x390', w: 844, h: 390, insets: [NONE, NOTCH] },
  { name: '844x340', w: 844, h: 340, insets: [NOTCH] }, // the same iPhone in Safari, with the browser bars showing
  { name: '915x412', w: 915, h: 412, insets: [NONE, CUTOUT] },
  { name: '932x430', w: 932, h: 430, insets: [NONE, ISLAND] },
];
// Portrait CSS viewports: iPhone SE 1 / SE 2-3 + 8 (no insets), iPhone 12-14 (notch), Pixel 7 (status bar 24, gesture bar), iPhone 14 Pro Max (Dynamic Island).
const P_NOTCH: Insets = { top: 47, right: 0, bottom: 34, left: 0 };
export const PORTRAITS: Viewport[] = [
  { name: '320x568', w: 320, h: 568, insets: [NONE] },
  { name: '375x667', w: 375, h: 667, insets: [NONE] },
  { name: '390x844', w: 390, h: 844, insets: [P_NOTCH] },
  { name: '412x915', w: 412, h: 915, insets: [{ top: 24, right: 0, bottom: 16, left: 0 }] },
  { name: '430x932', w: 430, h: 932, insets: [{ top: 59, right: 0, bottom: 34, left: 0 }] },
];
export const ORIENTATIONS = { landscape: VIEWPORTS, portrait: PORTRAITS } as const;
// What you press (the probe also records whether something else sits on top of its centre).
export const TOUCH_SELECTORS = ['#remote .rb', '#signals .sg', '#btnA', '#btnB', '#pswap', '#howtoopen', '#assist', '#howtoclose', '#zoomfix', '#join button', '#name', '#teamswap', '#schoolskip', '#schoolall'];
export const insetsName = (i: Insets) => (i.left || i.right || i.bottom || i.top ? `inset-${i.top}-${i.right}-${i.bottom}-${i.left}` : 'noinset');

// ---- process hygiene: Chrome is killed by PID tree (SIGTERM, then SIGKILL)
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
  await sleep(500);
  for (const p of pids) { try { process.kill(p, 0); process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
}

class Cdp {
  private id = 0;
  private pending = new Map<number, (v: any) => void>();
  readonly errors: string[] = [];
  constructor(private ws: WebSocket) {
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)!(m); this.pending.delete(m.id); }
      else if (m.method === 'Runtime.exceptionThrown') this.errors.push(String(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 400));
    });
  }
  send(method: string, params: object = {}): Promise<any> {
    const id = ++this.id;
    return new Promise((resolve, reject) => { this.pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result))); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval<T = unknown>(expr: string): Promise<T> {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
    return r.result.value as T;
  }
}

// ---- what runs in the page
// A WebSocket that never touches the network: the test pushes the relay's messages with window.__push.
const FAKE_WS = `(() => {
  const socks = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; socks.push(this); setTimeout(() => { this.readyState = 1; if (this.onopen) this.onopen({}); }, 5); }
    send(d) { (window.__sent = window.__sent || []).push(JSON.parse(d)); }
    close() { if (this.readyState === 3) return; this.readyState = 3; setTimeout(() => { if (this.onclose) this.onclose({}); }, 0); }
  }
  FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
  window.WebSocket = FakeWS;
  window.__push = (m) => { const s = socks[socks.length - 1]; if (s && s.onmessage) s.onmessage({ data: JSON.stringify(m) }); };
  window.__closeSocket = () => { const s = socks[socks.length - 1]; if (s) s.close(); };
})();`;

export interface Box { x: number; y: number; w: number; h: number }
export interface Item {
  sel: string; i: number;
  box: Box; // border box
  text: Box | null; // union of the text line boxes, when the element carries text
  ellipsis: boolean; // text-overflow: ellipsis on a clipping box: the cut is designed
  clipped: boolean; // content taller/wider than the box (not designed)
  round: boolean; // a circle (border-radius 50%)
  fs: number; // computed font size
  covered: boolean; // a touch target whose centre hits something that is not it (an overlay on top, off screen)
}
export interface Probe { vw: number; vh: number; inset: Insets; zoomed: boolean; pressed: boolean; view: string; items: Item[] }

// Selectors that matter for layout. Anything not displayed in the current state is skipped by the probe.
export const SELECTORS = [
  '#join .brand', '#name', '#join button',
  '#zone', '#stickhint', '#stickhint .ico', '#stickhint .lbl',
  '#btnA', '#btnA .ico', '#btnA .lbl', '#btnA .hold', '#btnB', '#btnB .ico', '#btnB .lbl', '#btnB .hold',
  '#stickLbl .pl', '#stickLbl .lbl', '#stickLbl .hold', '#lblA .pl', '#lblA .lbl', '#lblA .hold', '#lblB .pl', '#lblB .lbl', '#lblB .hold',
  '#hud', '#puesto', '#pico', '#pname', '#phint', '#pswap', '#school', '#schoolstep', '#schooltext', '#schoolskip', '#schoolall', '#signals', '#signals .sg',
  '#wait > *', '#howtoopen', '#assist', '#assist svg', '#assistlbl', '#choosing > *', '#results > *',
  '#howto h2', '#howtogame', '#howto .steps', '#howto .steps li', '#howto .steps .n', '#howto .steps .ic', '#howto .steps .tx', '#howto .note', '#howtoclose',
  '#rotate > *', '#zoomfix', '#remote .rb', '#remote .crown', '#teamswap',
];

const PROBE = `((selectors, touch) => {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const ps = getComputedStyle(probe);
  const inset = { top: parseFloat(ps.paddingTop), right: parseFloat(ps.paddingRight), bottom: parseFloat(ps.paddingBottom), left: parseFloat(ps.paddingLeft) };
  probe.remove();
  const box = (r) => ({ x: r.left, y: r.top, w: r.width, h: r.height });
  const modal = document.body.dataset.howto === 'open'; // the how-to card is a modal: what it hides is meant to be hidden
  const items = [];
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach((el, i) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.display === 'none' || s.visibility === 'hidden') return; }
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      let text = null;
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (hasText) {
        const range = document.createRange(); range.selectNodeContents(el);
        const rs = [...range.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
        if (rs.length) { const l = Math.min(...rs.map((q) => q.left)), t = Math.min(...rs.map((q) => q.top)), rr = Math.max(...rs.map((q) => q.right)), b = Math.max(...rs.map((q) => q.bottom)); text = { x: l, y: t, w: rr - l, h: b - t }; }
      }
      const clips = cs.overflow !== 'visible' || cs.overflowX !== 'visible';
      items.push({ sel, i, box: box(r), text, ellipsis: cs.textOverflow === 'ellipsis' && clips,
        clipped: clips && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1),
        round: parseFloat(cs.borderTopLeftRadius) >= Math.min(r.width, r.height) / 2 - 0.5 && r.width > 0 && Math.abs(r.width - r.height) < 1,
        fs: parseFloat(cs.fontSize),
        covered: touch.includes(sel) && !(modal && !el.closest('#howto, #remote, #zoomfix')) && (() => { const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(e && el.contains(e)); })() });
    });
  }
  return { vw: innerWidth, vh: innerHeight, inset, zoomed: document.body.classList.contains('zoomed'), view: document.body.dataset.view || '', pressed: !!document.querySelector('.act.down'), items };
})`;

// ---- scenarios: relay messages that put the page in each state
export interface ControlsMsg { stick: { label: string; icon: string; hold?: boolean }; btn1: { label: string; icon: string; hold?: boolean }; btn2: { label: string; icon: string; hold?: boolean } }
const PIZZAS: ControlsMsg = { stick: { label: 'Mover', icon: 'move' }, btn1: { label: 'Tomar / Soltar', icon: 'grab' }, btn2: { label: 'Picar / Correr', icon: 'chop' } };
// A future game at the registry's limits: 14-char labels and the "hold" hint on both buttons.
const LONG: ControlsMsg = { stick: { label: 'Apuntar largo!', icon: 'move' }, btn1: { label: 'Desplazamiento', icon: 'grab', hold: true }, btn2: { label: 'Mmmmmmm Mmmmmm', icon: 'chop', hold: true } };
// The real registry labels of Obstaculos (shared/games.ts) and the campaign flag the screen puts in phase.match: it makes the phone show the signal pad.
const OBST: ControlsMsg = { stick: { label: 'Moverse', icon: 'move' }, btn1: { label: 'Saltar', icon: 'jump' }, btn2: { label: 'Agarrar', icon: 'grab' } };
const CAMPAIGN_MATCH = { match: { gameId: 'obstaculos', modeId: 'coop', mapId: 'campaign', difficulty: 'normal', teams: null, modeOptions: { campaign: true } } };
const HOWTO = {
  steps: [
    { icon: 'crate', text: 'Toma masa y tomate de las cajas' },
    { icon: 'chop', text: 'Pícalos en la tabla manteniendo el botón' },
    { icon: 'oven', text: 'Llévalos al horno y espera' },
    { icon: 'bell', text: 'Entrega la pizza en el mostrador antes de que venza el pedido' },
  ],
  note: 'Todos cooperan por el puntaje de equipo',
};
const HOWTO_LONG = { steps: HOWTO.steps.map((s) => ({ ...s, text: (s.text + ' y además todo lo que haga falta para terminar').slice(0, 70) })), note: 'Todos cooperan por el puntaje de equipo y nadie se queda atrás' };
const POOL = ['masa', 'corte', 'queso', 'horno', 'reparto', 'lavado', 'apoyo', 'prep'];
const puestos = (id: number, list: string[], cheese = true) => ({ cheese, sink: true, assign: [{ id, puestos: list, pool: POOL }] });

export interface Scenario { name: string; fresh?: boolean; msgs: object[]; after?: string; storedName?: boolean }
const player = (name: string, id = 1, color = '#E63B2E') => ({ t: 'joined', player: { id, name, color, slot: 0 }, room: 'main' });
const config = (controls: ControlsMsg = PIZZAS, howTo = HOWTO) => ({ t: 'config', game: controls === OBST ? 'obstaculos' : 'pizzas', difficulty: 'normal', map: 'auto', seed: 1, controls, howTo });
const captain = (id: number | null = 1) => ({ t: 'captain', playerId: id }); // the relay's crown message: id 1 is the phone every scenario plays
const phase = (p: string, extra: object = {}) => ({ t: 'phase', phase: p, ...extra });
const VS_TEAMS = [{ id: 0, name: 'Picantes', color: '#A8330A', icon: '▲', side: 'izquierda', playerIds: [1] }, { id: 1, name: 'Frescos', color: '#14338A', icon: '●', side: 'derecha', playerIds: [2] }];
const vsConfig = () => ({ ...config(), modeId: 'versus', teams: VS_TEAMS, teamsLocked: true, modeOptions: { hiddenScore: true, handicap: true } });
const you = (team: number) => ({ t: 'you', teamId: team, color: VS_TEAMS[team]!.color, icon: VS_TEAMS[team]!.icon, sideLabel: VS_TEAMS[team]!.side });
const vsResult = (verdict: string, winner: number | null) => ({ verdict, winner, scores: [{ team: 0, score: 410 }, { team: 1, score: 340 }] });

// contextual buttons: the screen sends the label, the glyph and the greyed state of A and B with the state of every tick
const hint = (h: object) => ({ t: 'hint', ...h });
const school = (step: number, text: string, btn: 'a' | 'b', done = false) => ({ t: 'school', step, total: 4, text, btn, ...(done ? { done: true } : {}) });
const SCHOOL = [player('Nico'), config(), phase('lobby'), phase('school')];
const PLAYING = [player('Nico'), config(), phase('lobby'), phase('playing', { puestos: puestos(1, ['horno', 'reparto']) })];

const WIDE = `document.documentElement.style.setProperty('--font', 'Verdana, sans-serif'); window.dispatchEvent(new Event('resize'))`;

export const SCENARIOS: Scenario[] = [
  { name: 'join', fresh: true, msgs: [] },
  { name: 'join-longname', fresh: true, msgs: [], after: `(() => { const i = document.getElementById('name'); i.value = 'WWWWWWWWWWWWWWWW'; })()` },
  { name: 'menu', msgs: [player('Nico'), config(), phase('menu')] },
  { name: 'menu-longname', msgs: [player('WWWWWWWWWWWWWWWW', 1, '#8E5CD9'), config(), phase('menu')] },
  { name: 'howto', msgs: [player('Nico'), config(), phase('lobby')] }, // joining opens the "Cómo se juega" card
  { name: 'howto-long', msgs: [player('Nico'), config(PIZZAS, HOWTO_LONG), phase('lobby')] },
  { name: 'lobby', msgs: [player('Nico'), config(), phase('lobby')], after: `document.body.dataset.howto = 'closed'` },
  // Ayudante: the switch next to "Cómo se juega", off and on; in versus (the busiest lobby: team card + swap + the switch) and with the Captain's D-pad
  { name: 'lobby-assist', msgs: [player('Nico'), config(), phase('lobby'), { t: 'assist', playerId: 1, on: true }], after: `document.body.dataset.howto = 'closed'` },
  { name: 'lobby-assist-versus', msgs: [player('WWWWWWWWWWWWWWWW'), vsConfig(), you(0), phase('lobby'), { t: 'assist', playerId: 1, on: true }], after: `document.body.dataset.howto = 'closed'` },
  { name: 'captain-lobby-assist', msgs: [player('Nico'), vsConfig(), you(1), phase('lobby'), captain(), { t: 'assist', playerId: 1, on: true }], after: `document.body.dataset.howto = 'closed'` },
  { name: 'lobby-assist-wide-font', msgs: [player('WWWWWWWWWWWWWWWW'), { ...vsConfig(), map: 'V1' }, you(1), phase('lobby'), captain(), { t: 'assist', playerId: 1, on: true }], after: `${WIDE}; document.body.dataset.howto = 'closed'` },
  { name: 'lobby-other-game', msgs: [player('Nico'), { ...config(), game: 'obstaculos' }, phase('lobby')], after: `document.body.dataset.howto = 'closed'` }, // a game with no use for the switch
  { name: 'lobby-longname', msgs: [player('WWWWWWWWWWWWWWWW', 1, '#2F7DE1'), { ...config(), map: 'random', seed: 4000000000, difficulty: 'hard' }, phase('lobby')], after: `document.body.dataset.howto = 'closed'` },
  { name: 'play', msgs: [player('Nico'), config(), phase('lobby'), phase('playing')] },
  // the campaign round: the pad plus the 6 signal buttons (a quick match round, `play`, has none)
  { name: 'play-campaign', msgs: [player('Nico'), config(OBST), phase('lobby'), phase('playing', CAMPAIGN_MATCH)] },
  { name: 'play-campaign-pressed', msgs: [player('Nico'), config(OBST), phase('lobby'), phase('playing', CAMPAIGN_MATCH)], after: `document.querySelectorAll('.act, .sg').forEach((b) => b.classList.add('down'))` },
  { name: 'play-campaign-longname', msgs: [player('WWWWWWWWWWWWWWWW', 1, '#8E5CD9'), config(OBST), phase('lobby'), phase('playing', CAMPAIGN_MATCH)] },
  { name: 'play-campaign-wide-font', msgs: [player('Nico'), config(OBST), phase('lobby'), phase('playing', CAMPAIGN_MATCH)], after: WIDE },
  { name: 'play-campaign-zoomed', msgs: [player('Nico'), config(OBST), phase('lobby'), phase('playing', CAMPAIGN_MATCH)], after: `document.body.classList.add('zoomed')` },
  { name: 'play-puesto', msgs: [player('Nico'), config(), phase('lobby'), phase('playing', { puestos: puestos(1, ['horno', 'reparto']) })] },
  { name: 'play-puesto-long', msgs: [player('Nico'), config(), phase('lobby'), phase('playing', { puestos: puestos(1, ['prep']) })] },
  { name: 'play-puesto-double', msgs: [player('WWWWWWWWWWWWWWWW', 1, '#FFC21A'), config(), phase('lobby'), phase('playing', { puestos: puestos(1, ['reparto', 'lavado']) })] },
  { name: 'play-hint', msgs: [...PLAYING, hint({ a: 'Al horno', b: 'Estirar', aIcon: 'oven', bIcon: 'chop' })] },
  { name: 'play-hint-off', msgs: [...PLAYING, hint({ a: 'Tomar', b: 'Correr', aIcon: 'grab', bIcon: 'move', aOff: true, bOff: true })] },
  { name: 'play-hint-mixed', msgs: [...PLAYING, hint({ a: 'Entregar', b: 'Picar', aIcon: 'bell', bIcon: 'chop', bOff: true })] },
  { name: 'play-hint-long', msgs: [...PLAYING, hint({ a: 'Devolver plato', b: 'Poner en tabla', aIcon: 'plate', bIcon: 'chop' })] },
  { name: 'play-hint-long-off', msgs: [...PLAYING, hint({ a: 'Despensa vacía', b: 'Sin control', aIcon: 'crate', bIcon: 'chop', aOff: true, bOff: true })] },
  { name: 'play-hint-wide-font', msgs: [player('WWWWWWWWWWWWWWWW', 1, '#1FB5A8'), config(), phase('lobby'), phase('playing', { puestos: puestos(1, ['prep', 'lavado']) }), hint({ a: 'Devolver plato', b: 'Poner en tabla', aIcon: 'plate', bIcon: 'chop' })], after: WIDE },
  { name: 'play-pressed', msgs: [player('Nico'), config(), phase('lobby'), phase('playing', { puestos: puestos(1, ['masa']) })], after: `document.querySelectorAll('.act').forEach((b) => b.classList.add('down'))` },
  { name: 'play-hold-labels', msgs: [player('Nico'), config(LONG), phase('lobby'), phase('playing', { puestos: puestos(1, ['corte']) })] },
  { name: 'play-reconnecting', msgs: [player('Nico'), config(), phase('lobby'), phase('playing', { puestos: puestos(1, ['masa', 'horno']) })], after: `window.__closeSocket()` },
  { name: 'play-error', msgs: [player('Nico'), config(), phase('lobby'), phase('playing'), { t: 'error', reason: 'Sala llena (8 jugadores)' }] },
  { name: 'play-zoomed', msgs: [player('Nico'), config(), phase('lobby'), phase('playing', { puestos: puestos(1, ['horno']) })], after: `document.body.classList.add('zoomed')` },
  // iOS draws SF Rounded, wider than the fallback of headless Chrome: Verdana (~12% wider) stands in to check there is room to spare
  { name: 'play-wide-font', msgs: [player('WWWWWWWWWWWWWWWW', 1, '#1FB5A8'), config(LONG), phase('lobby'), phase('playing', { puestos: puestos(1, ['prep', 'lavado']) })], after: WIDE },
  { name: 'play-wide-font-real', msgs: [player('Nico'), config(), phase('lobby'), phase('playing', { puestos: puestos(1, ['reparto', 'lavado']) })], after: WIDE },
  { name: 'howto-wide-font', msgs: [player('Nico'), config(PIZZAS, HOWTO_LONG), phase('lobby')], after: WIDE },
  { name: 'lobby-wide-font', msgs: [player('WWWWWWWWWWWWWWWW'), { ...config(), map: 'random', seed: 4000000000, difficulty: 'hard' }, phase('lobby')], after: `${WIDE}; document.body.dataset.howto = 'closed'` },
  { name: 'lobby-zoomed', msgs: [player('Nico'), config(), phase('lobby')], after: `document.body.dataset.howto = 'closed'; document.body.classList.add('zoomed')` },
  { name: 'results', msgs: [player('Nico'), config(), phase('lobby'), phase('playing'), phase('results', { scores: [{ id: 1, score: 1240 }] })] },
  { name: 'results-big', msgs: [player('Nico'), config(), phase('lobby'), phase('playing'), phase('results', { scores: [{ id: 1, score: 1234567 }] })] },
  // versus: the phone knows its team and gets the verdict with the results (won / lost / a draw / no winner), each inside a frame in the team colour
  { name: 'vs-results-won', msgs: [player('Nico'), vsConfig(), you(0), phase('lobby'), phase('playing'), phase('results', { scores: [{ id: 1, score: 410 }], result: vsResult('win', 0) })] },
  { name: 'vs-results-lost', msgs: [player('Nico'), vsConfig(), you(1), phase('lobby'), phase('playing'), phase('results', { scores: [{ id: 1, score: 340 }], result: vsResult('win', 0) })] },
  { name: 'vs-results-draw', msgs: [player('Nico'), vsConfig(), you(0), phase('lobby'), phase('playing'), phase('results', { scores: [{ id: 1, score: 1234567 }], result: vsResult('draw', null) })] },
  { name: 'vs-results-none', msgs: [player('WWWWWWWWWWWWWWWW'), vsConfig(), you(1), phase('lobby'), phase('playing'), phase('results', { scores: [{ id: 1, score: 340 }], result: vsResult('nowinner', null) })], after: WIDE },
  // the Captain's D-pad (id 1 holds the crown): every screen but the round, and the others do not get it
  { name: 'captain-menu', msgs: [player('Nico'), config(), phase('menu'), captain()] },
  { name: 'captain-menu-longname', msgs: [player('WWWWWWWWWWWWWWWW', 1, '#8E5CD9'), config(), phase('menu'), captain()] },
  { name: 'captain-lobby', msgs: [player('Nico'), config(), phase('lobby'), captain()], after: `document.body.dataset.howto = 'closed'` },
  { name: 'captain-lobby-longname', msgs: [player('WWWWWWWWWWWWWWWW', 1, '#2F7DE1'), { ...config(), map: 'random', seed: 4000000000, difficulty: 'hard' }, phase('lobby'), captain()], after: `document.body.dataset.howto = 'closed'` },
  { name: 'captain-howto', msgs: [player('Nico'), config(), phase('lobby'), captain()] },
  { name: 'captain-howto-long', msgs: [player('Nico'), config(PIZZAS, HOWTO_LONG), phase('lobby'), captain()] },
  { name: 'captain-results', msgs: [player('Nico'), config(), phase('lobby'), phase('playing'), phase('results', { scores: [{ id: 1, score: 1240 }] }), captain()] },
  { name: 'captain-results-big', msgs: [player('Nico'), config(), phase('lobby'), phase('playing'), phase('results', { scores: [{ id: 1, score: 1234567 }] }), captain()] },
  { name: 'captain-lobby-zoomed', msgs: [player('Nico'), config(), phase('lobby'), captain()], after: `document.body.dataset.howto = 'closed'; document.body.classList.add('zoomed')` },
  { name: 'captain-wide-font', msgs: [player('WWWWWWWWWWWWWWWW'), { ...config(), map: 'random', seed: 4000000000, difficulty: 'hard' }, phase('lobby'), captain()], after: `${WIDE}; document.body.dataset.howto = 'closed'` },
  { name: 'captain-howto-wide-font', msgs: [player('Nico'), config(PIZZAS, HOWTO_LONG), phase('lobby'), captain()], after: WIDE },
  { name: 'captain-play', msgs: [player('Nico'), config(), phase('lobby'), phase('playing', { puestos: puestos(1, ['horno', 'reparto']) }), captain()] }, // the round: the pad alone, no D-pad
  { name: 'not-captain-menu', msgs: [player('Nico'), config(), phase('menu'), captain(2)] },
  { name: 'not-captain-howto', msgs: [player('Nico'), config(), phase('lobby'), captain(2)] },
  // the Cocina escuela: the pad plus the school card (step, dots, instruction, "Ya sé" and, for the Captain, "Saltar a todos"); the lit button comes with the message
  { name: 'school-step', msgs: [...SCHOOL, school(0, 'Toma masa del cajón', 'a')] },
  { name: 'school-knife', msgs: [...SCHOOL, school(1, 'Toma tomate y pícalo en la tabla', 'b'), hint({ a: 'Poner en tabla', b: 'Picar', aIcon: 'chop', bIcon: 'chop' })] },
  { name: 'school-captain', msgs: [...SCHOOL, captain(), school(2, 'Lleva el tomate picado al horno', 'a'), hint({ a: 'Al horno', b: 'Correr', aIcon: 'oven', bIcon: 'move', bOff: true })] },
  { name: 'school-done-captain', msgs: [...SCHOOL, captain(), school(4, 'Aléjate y toca B para correr', 'b', true)] },
  { name: 'school-versus', msgs: [player('Nico'), vsConfig(), you(1), phase('lobby'), phase('school'), captain(), school(3, 'Entrega la pizza en la ventanilla', 'a')] },
  { name: 'school-wide-font', msgs: [player('WWWWWWWWWWWWWWWW'), config(), phase('lobby'), phase('school'), captain(), school(3, 'Entrega la pizza en la ventanilla', 'a'), hint({ a: 'Devolver plato', b: 'Poner en tabla', aIcon: 'plate', bIcon: 'chop' })], after: WIDE },
  { name: 'school-zoomed', msgs: [...SCHOOL, captain(), school(1, 'Toma tomate y pícalo en la tabla', 'a')], after: `document.body.classList.add('zoomed')` },
];

// ---- the browser session
export interface Session {
  load(s: Scenario): Promise<void>;
  setViewport(v: Viewport, insets: Insets): Promise<void>;
  probe(): Promise<Probe>;
  shot(file: string): Promise<void>;
  tap(x: number, y: number): Promise<void>;
  hold(x: number, y: number, ms: number): Promise<void>; // touch down, wait, touch up
  eval<T>(expr: string): Promise<T>;
  pageErrors(): string[];
  close(): Promise<void>;
}

export async function openSession(): Promise<Session> {
  const vite: ViteDevServer = await createServer({ root: path.resolve(HERE, '..'), configFile: path.resolve(HERE, '../vite.config.ts'), server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'error' });
  await vite.listen();
  const profile = mkdtempSync(path.join(tmpdir(), 'pg-ctrl-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
  const cleanup = async () => { await killTree(chrome); await vite.close(); rmSync(profile, { recursive: true, force: true }); };
  try {
    let targets: any[] = [];
    for (let i = 0; i < 60 && !targets.length; i++) { await sleep(200); try { targets = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json() as any[]).filter((t) => t.type === 'page'); } catch { /* not up yet */ } }
    if (!targets.length) throw new Error(`Chrome did not start (${CHROME})`);
    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    await new Promise((r) => ws.once('open', r));
    const cdp = new Cdp(ws);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_WS });
    let vp: Viewport = VIEWPORTS[0]!;
    const setViewport = async (v: Viewport, insets: Insets) => {
      vp = v;
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: v.w, height: v.h, deviceScaleFactor: 2, mobile: true, screenOrientation: v.w > v.h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
      await sleep(60);
    };
    return {
      async load(s) {
        await setViewport(vp, NONE);
        const store = s.fresh ? `localStorage.clear()` : `localStorage.setItem('pg.name', 'Nico'); localStorage.setItem('pg.room', 'main'); localStorage.setItem('pg.token', 'tok')`;
        await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/c/?room=main` });
        await sleep(300);
        await cdp.eval(store);
        await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/c/?room=main` });
        for (let i = 0; i < 50; i++) { if (await cdp.eval<boolean>(`document.readyState === 'complete' && typeof window.__push === 'function'`)) break; await sleep(100); }
        await sleep(250); // the stored name starts the pad; the fake socket opens
        for (const m of s.msgs) { await cdp.eval(`window.__push(${JSON.stringify(m)})`); await sleep(15); }
        if (s.after) await cdp.eval(s.after);
        await sleep(120);
      },
      setViewport,
      async probe() { return cdp.eval<Probe>(`(${PROBE})(${JSON.stringify(SELECTORS)}, ${JSON.stringify(TOUCH_SELECTORS)})`); },
      async shot(file) { const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(r.data, 'base64')); },
      async tap(x, y) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
        await sleep(50);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await sleep(300);
      },
      async hold(x, y, ms) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
        await sleep(ms);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await sleep(300);
      },
      eval: (e) => cdp.eval(e),
      pageErrors: () => cdp.errors,
      close: async () => { try { ws.close(); } catch { /* closing */ } await cleanup(); },
    };
  } catch (e) { await cleanup(); throw e; }
}
