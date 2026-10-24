import nipplejs from 'nipplejs';
import { DIFFICULTY_LABEL } from '@party/shared/difficulty';
import { fixedMap } from '@party/shared/maps';
import { gameName, type GameControls, type HowTo } from '@party/shared/games';
import { controlHtml, howToHtml, iconSvg } from '@party/shared/render';
import { PUESTOS, type PuestoId } from '@party/shared/puestos';
import { shouldShowHowTo } from './howto';
import { createZoomGuard, isDoubleTap } from './zoom';
import {
  BUZZ_PATTERNS, ClockSync, DEADZONE, DEFAULT_ROOM, INPUT_HZ, PING_MS, PRESS_MOD, WS_PATH, applyDeadzone,
  type BuzzKind, type ClientMsg, type Phase, type PuestoMsg, type ServerMsg,
} from '@party/shared';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

// Touch hardening: no zoom (pinch, double-tap), scroll, selection or context menu. iOS Safari ignores user-scalable=no,
// so the gesture events are cancelled too, and zoom.ts watches visualViewport in case it zooms anyway.
const stop = (e: Event) => e.preventDefault();
document.addEventListener('touchmove', stop, { passive: false });
document.addEventListener('touchstart', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false }); // second finger = pinch
for (const g of ['gesturestart', 'gesturechange', 'gestureend', 'contextmenu', 'dblclick', 'selectstart']) {
  document.addEventListener(g, (e) => { if (!(e.target as HTMLElement | null)?.closest?.('input')) e.preventDefault(); });
}
let lastEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (isDoubleTap(lastEnd, now)) e.preventDefault();
  lastEnd = now;
}, { passive: false });

function resetZoom() {
  window.scrollTo(0, 0);
  const meta = document.querySelector<HTMLMetaElement>('meta[name=viewport]');
  if (!meta) return;
  const original = meta.content;
  meta.content = 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'; // a changed value makes iOS re-evaluate the scale
  setTimeout(() => { meta.content = original; }, 120);
}
const zoomGuard = createZoomGuard({
  viewport: window.visualViewport,
  reset: resetZoom,
  onZoomed: (z) => document.body.classList.toggle('zoomed', z),
  later: (fn, ms) => { setTimeout(fn, ms); },
});
window.visualViewport?.addEventListener('resize', zoomGuard.check);
window.visualViewport?.addEventListener('scroll', zoomGuard.check);
setInterval(zoomGuard.check, 2000);
$('zoomfix').addEventListener('click', () => zoomGuard.manualReset());

const state = { x: 0, y: 0, btn: 0, presses: [0, 0], seq: 0 };
const sync = new ClockSync();
let lastRtt: number | undefined;
let ws: WebSocket | null = null;
let joined = false;
let started = false;
let halted = false; // server refused us (e.g. room full): stop retrying until the page is shown again
let phase: Phase = 'lobby';
let myId = 0;
let lastPong = 0;
const room = new URLSearchParams(location.search).get('room') || DEFAULT_ROOM;
const view = (v: string) => { document.body.dataset.view = v; };
let pingId = 0;
const sent = new Map<number, { perf: number; t0: number }>();

const token = store.get('pg.token') ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
store.set('pg.token', token);
let name = store.get('pg.name') ?? '';

// Labels and icons come from the game registry via the config message: nothing here knows a specific game.
function applyControls(c: GameControls) {
  $('stickhint').innerHTML = controlHtml(c.stick);
  $('btnA').innerHTML = controlHtml(c.btn1);
  $('btnB').innerHTML = controlHtml(c.btn2);
}

// "Cómo se juega": one-view summary, closed with a tap. Opens on join and when the lobby picks a game not shown yet.
let seenGame: string | null = null;
const setHowTo = (open: boolean) => { document.body.dataset.howto = open ? 'open' : 'closed'; };
function renderHowTo(game: string, name: string, h: HowTo) {
  $('howtogame').textContent = name;
  $('howtobody').innerHTML = howToHtml(h);
  if (shouldShowHowTo(seenGame, game, phase)) { seenGame = game; setHowTo(true); }
}
// pointerup, not click: a touchend inside the double-tap window is cancelled (see above) and would swallow the click
$('howto').addEventListener('pointerup', () => setHowTo(false));
$('howtoopen').addEventListener('pointerup', () => setHowTo(true));

// R7: vibrate where the browser can (Android), flash the phone's colour where it cannot (iOS Safari has no vibration API).
let flashTimer: ReturnType<typeof setTimeout> | undefined;
function buzz(kind: BuzzKind) {
  if (phase !== 'playing') return;
  const pattern = BUZZ_PATTERNS[kind];
  try { if (typeof navigator.vibrate === 'function' && navigator.vibrate([...pattern])) return; } catch { /* blocked: fall back to the flash */ }
  document.body.classList.add('flash');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => document.body.classList.remove('flash'), 120);
}

const tx = (m: ClientMsg) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
let label = '';
const hud = (s: string) => { label = s; $('hud').textContent = s; };

// Suggested station card: informs, never blocks. "Cambiar" cycles to another puesto and tells the screen.
let puestoPool: PuestoId[] = [];
let puestoNow: PuestoId[] = [];
let feats = { cheese: false, sink: false };
function showPuesto(ids: PuestoId[] | null) {
  document.body.dataset.puesto = ids ? 'on' : 'off';
  if (!ids) return;
  puestoNow = ids;
  $('pico').innerHTML = iconSvg(PUESTOS[ids[0]!].icon);
  $('pname').textContent = ids.map((i) => PUESTOS[i].name).join(' + ');
  $('phint').textContent = ids.map((i) => PUESTOS[i].hint(feats)).join(' · ');
}
function applyPuestos(pm: PuestoMsg | undefined) {
  const mine = pm?.assign.find((a) => a.id === myId);
  if (!pm || !mine) { showPuesto(null); return; }
  feats = { cheese: pm.cheese, sink: pm.sink };
  puestoPool = mine.pool;
  showPuesto(mine.puestos);
}
$('pswap').addEventListener('pointerup', (e) => {
  e.preventDefault();
  if (!puestoPool.length) return;
  const next = puestoPool[(puestoPool.indexOf(puestoNow[0]!) + 1) % puestoPool.length]!;
  showPuesto([next]);
  tx({ t: 'puesto', puestos: [next] });
});

function showPhase(p: Phase, scores?: { id: number; score: number }[], puestos?: PuestoMsg) {
  phase = p;
  applyPuestos(p === 'playing' ? puestos : undefined);
  if (p === 'playing') setHowTo(false);
  if (p !== 'playing') { state.x = 0; state.y = 0; state.btn = 0; document.querySelectorAll('.act').forEach((b) => b.classList.remove('down')); }
  if (p === 'results' && scores) {
    const mine = scores.find((s) => s.id === myId) ?? scores[0]; // cooperative: every entry carries the team score
    $('rank').textContent = mine ? String(mine.score) : '-';
    $('myscore').textContent = mine ? 'puntos de equipo' : '';
  }
  view(p);
}

function connect() {
  if (ws && ws.readyState <= WebSocket.OPEN) return;
  halted = false;
  const sock = (ws = new WebSocket(`ws://${location.host}${WS_PATH}?room=${encodeURIComponent(room)}`));
  sock.onopen = () => { lastPong = Date.now(); tx({ t: 'join', name, token }); };
  sock.onmessage = (ev) => {
    const m = JSON.parse(ev.data) as ServerMsg;
    if (m.t === 'joined') {
      joined = true;
      myId = m.player.id;
      document.documentElement.style.setProperty('--c', m.player.color);
      $('who').textContent = m.player.name;
      hud(`${m.player.name} #${m.player.slot + 1}`);
    } else if (m.t === 'config') {
      $('game').textContent = gameName(m.game);
      applyControls(m.controls);
      renderHowTo(m.game, gameName(m.game), m.howTo);
      $('setup').textContent = `${DIFFICULTY_LABEL[m.difficulty]} · ${m.map === 'auto' ? 'Mapa al azar' : m.map === 'random' ? `Mapa aleatorio ${m.seed}` : fixedMap(m.map)?.name ?? ''}`;
    } else if (m.t === 'phase') {
      showPhase(m.phase, m.scores, m.puestos);
    } else if (m.t === 'buzz') {
      buzz(m.kind);
    } else if (m.t === 'pong') {
      lastPong = Date.now();
      const s = sent.get(m.id);
      if (!s) return;
      sent.delete(m.id);
      lastRtt = performance.now() - s.perf;
      sync.add(lastRtt, s.t0, m.ts);
    } else if (m.t === 'error') {
      halted = true;
      hud(m.reason);
    }
  };
  sock.onclose = () => {
    if (sock !== ws) return;
    joined = false;
    if (halted) return;
    hud('reconnecting...');
    setTimeout(connect, 500);
  };
}

function sendInput() {
  if (!joined || phase !== 'playing') return;
  tx({ t: 'input', seq: state.seq++, x: state.x, y: state.y, btn: state.btn, presses: state.presses, ts: Date.now() });
}

function startPad() {
  if (started) return;
  started = true;
  store.set('pg.room', room);
  view('lobby');
  const stick = nipplejs.create({ zone: $('zone'), mode: 'dynamic', color: 'white', size: 130, threshold: DEADZONE });
  stick.on('move', (e) => {
    const [x, y] = applyDeadzone(e.data.vector.x, -e.data.vector.y);
    state.x = x; state.y = y;
  });
  stick.on('start', () => $('stickhint').classList.add('active'));
  stick.on('end', () => { state.x = 0; state.y = 0; $('stickhint').classList.remove('active'); });

  const bindButton = (el: HTMLElement, i: number) => {
    let activePointer: number | null = null;
    const release = (e: PointerEvent) => {
      if (e.pointerId !== activePointer) return;
      activePointer = null;
      state.btn &= ~(1 << i);
      el.classList.remove('down');
      sendInput();
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (activePointer !== null) return;
      activePointer = e.pointerId;
      el.setPointerCapture(e.pointerId);
      state.btn |= 1 << i;
      state.presses[i] = (state.presses[i]! + 1) % PRESS_MOD;
      el.classList.add('down');
      sendInput();
    });
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  };
  bindButton($('btnA'), 0);
  bindButton($('btnB'), 1);

  setInterval(sendInput, 1000 / INPUT_HZ);
  setInterval(() => {
    if (ws?.readyState !== WebSocket.OPEN) return;
    const id = pingId++;
    const t0 = Date.now();
    sent.set(id, { perf: performance.now(), t0 });
    if (sent.size > 20) sent.delete(sent.keys().next().value!);
    tx({ t: 'ping', id, t0, rtt: lastRtt, off: sync.offset ?? undefined });
  }, PING_MS);
  setInterval(() => { if (joined && lastRtt !== undefined) $('hud').textContent = `${label} | ${lastRtt.toFixed(0)} ms`; }, 1000);

  // A locked phone can leave a half-dead socket that still reads OPEN: drop it if the server went quiet.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (ws && ws.readyState === WebSocket.OPEN && Date.now() - lastPong > 3 * PING_MS) ws.close();
    connect();
  });
  window.addEventListener('pageshow', () => connect());
  connect();
}

$('name').setAttribute('value', name);
($('join') as HTMLFormElement).addEventListener('submit', (e) => {
  e.preventDefault();
  name = ($('name') as HTMLInputElement).value.trim() || 'Player';
  store.set('pg.name', name);
  startPad();
});
if (name && store.get('pg.room') === room) startPad(); // reopened page: rejoin with the stored token
