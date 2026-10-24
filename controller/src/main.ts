import nipplejs from 'nipplejs';
import {
  ClockSync, DEADZONE, INPUT_HZ, PING_MS, PRESS_MOD, WS_PATH, applyDeadzone, type ClientMsg, type ServerMsg,
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

const state = { x: 0, y: 0, btn: 0, presses: 0, seq: 0 };
const sync = new ClockSync();
let lastRtt: number | undefined;
let ws: WebSocket | null = null;
let joined = false;
let pingId = 0;
const sent = new Map<number, { perf: number; t0: number }>();

const token = store.get('pg.token') ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
store.set('pg.token', token);
let name = store.get('pg.name') ?? '';

const tx = (m: ClientMsg) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
let label = '';
const hud = (s: string) => { label = s; $('hud').textContent = s; };

function connect() {
  if (ws && ws.readyState <= WebSocket.OPEN) return;
  ws = new WebSocket(`ws://${location.host}${WS_PATH}`);
  ws.onopen = () => tx({ t: 'join', name, token });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data) as ServerMsg;
    if (m.t === 'joined') {
      joined = true;
      document.documentElement.style.setProperty('--c', m.player.color);
      $('fire').style.background = m.player.color;
      hud(`${m.player.name} #${m.player.slot + 1}`);
    } else if (m.t === 'pong') {
      const s = sent.get(m.id);
      if (!s) return;
      sent.delete(m.id);
      lastRtt = performance.now() - s.perf;
      sync.add(lastRtt, s.t0, m.ts);
    } else if (m.t === 'error') {
      hud(m.reason);
    }
  };
  ws.onclose = () => { joined = false; hud('reconnecting...'); setTimeout(connect, 500); };
}

function sendInput() {
  if (!joined) return;
  tx({ t: 'input', seq: state.seq++, x: state.x, y: state.y, btn: state.btn, presses: [state.presses], ts: Date.now() });
}

function startPad() {
  $('join').style.display = 'none';
  $('pad').style.display = 'block';
  const stick = nipplejs.create({ zone: $('zone'), mode: 'dynamic', color: 'white', size: 130, threshold: DEADZONE });
  stick.on('move', (e) => {
    const [x, y] = applyDeadzone(e.data.vector.x, -e.data.vector.y);
    state.x = x; state.y = y;
  });
  stick.on('end', () => { state.x = 0; state.y = 0; });

  const fire = $('fire');
  let activePointer: number | null = null;
  const release = (e: PointerEvent) => {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    state.btn = 0;
    fire.classList.remove('down');
    sendInput();
  };
  fire.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (activePointer !== null) return;
    activePointer = e.pointerId;
    fire.setPointerCapture(e.pointerId);
    state.btn = 1;
    state.presses = (state.presses + 1) % PRESS_MOD;
    fire.classList.add('down');
    sendInput();
  });
  fire.addEventListener('pointerup', release);
  fire.addEventListener('pointercancel', release);

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

  document.addEventListener('visibilitychange', () => { if (!document.hidden) connect(); });
  connect();
}

$('name').setAttribute('value', name);
($('join') as HTMLFormElement).addEventListener('submit', (e) => {
  e.preventDefault();
  name = ($('name') as HTMLInputElement).value.trim() || 'Player';
  store.set('pg.name', name);
  startPad();
});
