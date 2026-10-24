import nipplejs from 'nipplejs';
import { DIFFICULTY_LABEL } from '@party/shared/difficulty';
import { fixedMap } from '@party/shared/maps';
import { gameName } from '@party/shared/games';
import {
  ClockSync, DEADZONE, DEFAULT_ROOM, INPUT_HZ, PING_MS, PRESS_MOD, WS_PATH, applyDeadzone,
  type ClientMsg, type Phase, type ServerMsg,
} from '@party/shared';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

// Touch hardening: no zoom, scroll, double-tap zoom or context menu.
const stop = (e: Event) => e.preventDefault();
document.addEventListener('touchmove', stop, { passive: false });
document.addEventListener('gesturestart', stop);
document.addEventListener('gesturechange', stop);
document.addEventListener('contextmenu', stop);
let lastEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastEnd < 350) e.preventDefault();
  lastEnd = now;
}, { passive: false });

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

const tx = (m: ClientMsg) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
let label = '';
const hud = (s: string) => { label = s; $('hud').textContent = s; };

function showPhase(p: Phase, scores?: { id: number; score: number }[]) {
  phase = p;
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
      $('btnA').style.background = m.player.color;
      $('who').textContent = m.player.name;
      hud(`${m.player.name} #${m.player.slot + 1}`);
    } else if (m.t === 'config') {
      $('game').textContent = gameName(m.game);
      $('setup').textContent = `${DIFFICULTY_LABEL[m.difficulty]} · ${m.map === 'auto' ? 'Mapa al azar' : m.map === 'random' ? `Mapa aleatorio ${m.seed}` : fixedMap(m.map)?.name ?? ''}`;
    } else if (m.t === 'phase') {
      showPhase(m.phase, m.scores);
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
  stick.on('end', () => { state.x = 0; state.y = 0; });

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
