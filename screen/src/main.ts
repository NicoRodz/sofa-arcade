import Phaser from 'phaser';
import {
  ClockSync, PING_MS, ROUND_MS, PressTracker, WS_PATH, canStart, newRoomCode, nextPhase,
  type ClientMsg, type Phase, type PublicPlayer, type ServerMsg,
} from '@party/shared';
import { percentile } from '@party/shared/stats';

const SPEED = 420; // px/s at full deflection
const FLASH_MS = 150;

interface P {
  info: PublicPlayer;
  x: number; y: number; vx: number; vy: number;
  flashUntil: number;
  tracker: PressTracker;
  rtt: number[]; lag: number[];
  off: number | null; // phone clock -> server clock
  pkts: number; pktsRate: number;
  score: number;
  circle?: Phaser.GameObjects.Arc; label?: Phaser.GameObjects.Text;
}
const players = new Map<number, P>();
const pendingLag: { id: number; sendServerTime: number }[] = [];
const csv: string[] = [];
const sync = new ClockSync();
const $ = (id: string) => document.getElementById(id)!;
const room = (() => {
  const q = new URLSearchParams(location.search).get('room');
  try {
    const code = q || sessionStorage.getItem('pg.screenRoom') || newRoomCode();
    sessionStorage.setItem('pg.screenRoom', code);
    return code;
  } catch { return q || newRoomCode(); }
})();
let phase: Phase = 'lobby';
let roundEnd = 0;
let debugOverride: boolean | null = null;
let screenRtt = NaN;
let totalPkts = 0;
let pktsRate = 0;

const record = (kind: 'rtt' | 'lag', p: P, v: number) => {
  (kind === 'rtt' ? p.rtt : p.lag).push(v);
  csv.push(`${kind},${p.info.name}#${p.info.id},${Date.now()},${v.toFixed(2)}`);
};

function upsert(info: PublicPlayer, reset = false) {
  let p = players.get(info.id);
  if (!p) {
    p = {
      info, x: 200 + info.slot * 120, y: 300, vx: 0, vy: 0, flashUntil: 0, tracker: new PressTracker(),
      rtt: [], lag: [], off: null, pkts: 0, pktsRate: 0, score: 0,
    };
    players.set(info.id, p);
  }
  p.info = info;
  if (reset) p.vx = p.vy = 0;
  renderUi();
}

function remove(id: number) {
  const p = players.get(id);
  if (!p) return;
  p.circle?.destroy();
  p.label?.destroy();
  players.delete(id);
  renderUi();
}

const sendMsg = (m: ClientMsg) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
const ranking = () => [...players.values()].sort((a, b) => b.score - a.score);

function setPhase(next: Phase) {
  if (next === phase) return;
  phase = next;
  if (phase === 'playing') {
    roundEnd = performance.now() + ROUND_MS;
    for (const p of players.values()) p.score = 0;
  }
  sendMsg({ t: 'phase', phase, scores: phase === 'results' ? ranking().map((p) => ({ id: p.info.id, score: p.score })) : undefined });
  renderUi();
}
const dispatch = (ev: Parameters<typeof nextPhase>[1]) => {
  if (ev === 'start' && !canStart([...players.values()].map((p) => p.info))) return;
  setPhase(nextPhase(phase, ev));
};

function onMessage(m: ServerMsg) {
  switch (m.t) {
    case 'state': {
      const ids = new Set(m.players.map((i) => i.id));
      for (const id of [...players.keys()]) if (!ids.has(id)) remove(id);
      m.players.forEach((i) => upsert(i, true));
      break;
    }
    case 'player_joined': upsert(m.player, true); break;
    case 'player_left': {
      const p = players.get(m.playerId);
      if (p) { p.info.connected = false; p.vx = p.vy = 0; renderUi(); }
      break;
    }
    case 'player_removed': remove(m.playerId); break;
    case 'rtt': {
      const p = players.get(m.playerId);
      if (p) { p.off = m.off; record('rtt', p, m.rtt); }
      break;
    }
    case 'pong': {
      screenRtt = performance.now() - m.id;
      sync.add(screenRtt, m.t0, m.ts);
      break;
    }
    case 'input': {
      const p = players.get(m.playerId);
      if (!p) return;
      totalPkts++; p.pkts++;
      p.vx = m.x; p.vy = m.y;
      const delta = p.tracker.update(m.presses);
      if (delta.some((d) => d > 0)) {
        if (phase === 'playing') p.score += delta.reduce((a, b) => a + b, 0);
        p.flashUntil = performance.now() + FLASH_MS;
        if (p.off !== null) pendingLag.push({ id: p.info.id, sendServerTime: m.ts + p.off });
      }
      break;
    }
  }
}

let ws: WebSocket;
function connect() {
  ws = new WebSocket(`ws://${location.host}${WS_PATH}?role=screen&room=${encodeURIComponent(room)}`);
  ws.onopen = () => sendMsg({ t: 'phase', phase });
  ws.onmessage = (ev) => onMessage(JSON.parse(ev.data));
  ws.onclose = () => setTimeout(connect, 500);
}
connect();
setInterval(() => {
  if (ws.readyState !== WebSocket.OPEN) return;
  // id carries the perf timestamp so RTT keeps sub-ms precision
  ws.send(JSON.stringify({ t: 'ping', id: performance.now(), t0: Date.now() }));
}, PING_MS);

class Main extends Phaser.Scene {
  create() {
    // Called right after the frame is drawn: closest browser-side proxy for "visible on screen".
    this.game.events.on(Phaser.Core.Events.POST_RENDER, () => {
      const off = sync.offset;
      if (!pendingLag.length || off === null) return;
      const nowServer = Date.now() + off;
      for (const q of pendingLag.splice(0)) {
        const p = players.get(q.id);
        if (p) record('lag', p, nowServer - q.sendServerTime);
      }
    });
  }
  update(time: number, delta: number) {
    const dt = delta / 1000;
    const { width, height } = this.scale;
    for (const p of players.values()) {
      p.x = Phaser.Math.Clamp(p.x + p.vx * SPEED * dt, 30, width - 30);
      p.y = Phaser.Math.Clamp(p.y + p.vy * SPEED * dt, 30, height - 30);
      if (!p.circle) {
        p.circle = this.add.circle(p.x, p.y, 28, Phaser.Display.Color.HexStringToColor(p.info.color).color);
        p.label = this.add.text(p.x, p.y, p.info.name, { fontSize: '18px', color: '#fff' }).setOrigin(0.5, 0);
      }
      const flash = performance.now() < p.flashUntil;
      p.circle.setPosition(p.x, p.y);
      p.circle.setFillStyle(flash ? 0xffffff : Phaser.Display.Color.HexStringToColor(p.info.color).color);
      p.circle.setScale(flash ? 1.4 : 1);
      p.circle.setAlpha(p.info.connected ? 1 : 0.3);
      p.label!.setPosition(p.x, p.y + 34).setText(p.info.name).setColor(p.info.connected ? '#fff' : '#777');
    }
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1b1b24',
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  fps: { target: 60 },
  scene: Main,
});

$('code').textContent = room;
fetch(`/api/info?room=${encodeURIComponent(room)}`)
  .then((r) => r.json())
  .then(({ url, qrSvg }: { url: string; qrSvg: string }) => {
    document.getElementById('qr')!.innerHTML = qrSvg;
    document.getElementById('joinurl')!.textContent = url;
  })
  .catch(() => { document.getElementById('joinurl')!.textContent = 'no se pudo obtener la URL'; });

const f = (n: number) => (Number.isFinite(n) ? n.toFixed(0) : '-');
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function renderUi() {
  $('lobby').classList.toggle('off', phase !== 'lobby');
  $('hud').classList.toggle('off', phase !== 'playing');
  $('results').classList.toggle('off', phase !== 'results');
  $('debug').classList.toggle('off', !(debugOverride ?? phase !== 'playing'));
  const list = [...players.values()];
  $('plist').innerHTML = list
    .map((p) => `<li class="${p.info.connected ? '' : 'gone'}"><span class="dot" style="background:${p.info.color}"></span>${esc(p.info.name)}</li>`)
    .join('') || '<li style="color:#888">Esperando jugadores...</li>';
  ($('start') as HTMLButtonElement).disabled = !canStart(list.map((p) => p.info));
  $('rank').innerHTML = ranking()
    .map((p, i) => `<li style="color:${p.info.color}"><span>${i + 1}. ${esc(p.info.name)}</span><b>${p.score}</b></li>`)
    .join('');
  $('scores').innerHTML = list
    .map((p) => `<span style="color:${p.info.connected ? p.info.color : '#777'}">${esc(p.info.name)} ${p.score}</span>`)
    .join('');
}
renderUi();

$('start').addEventListener('click', () => dispatch('start'));
$('again').addEventListener('click', () => dispatch('again'));
window.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') { debugOverride = !($('debug').classList.contains('off')); renderUi(); }
  else if (e.key === 'Enter' && phase === 'lobby') dispatch('start');
  else if (e.key === 'Enter' && phase === 'results') dispatch('again');
});
setInterval(() => {
  pktsRate = totalPkts; totalPkts = 0;
  const rows = ['<tr><th>player</th><th>rtt last</th><th>p95</th><th>max</th><th>lag last</th><th>p95</th><th>pkt/s</th></tr>'];
  for (const p of players.values()) {
    p.pktsRate = p.pkts; p.pkts = 0;
    const r = p.rtt, l = p.lag;
    rows.push(
      `<tr style="color:${p.info.connected ? p.info.color : '#777'}"><td>${p.info.name}</td><td>${f(r.at(-1) ?? NaN)}</td>` +
      `<td>${f(percentile(r, 95))}</td><td>${f(r.length ? Math.max(...r) : NaN)}</td>` +
      `<td>${f(l.at(-1) ?? NaN)}</td><td>${f(percentile(l, 95))}</td><td>${p.pktsRate}</td></tr>`,
    );
  }
  $('table').innerHTML = rows.join('');
  $('summary').textContent = `total ${pktsRate} pkt/s | screen<->server RTT ${f(screenRtt)} ms | clock offset ${f(sync.offset ?? NaN)} ms`;
  if (phase === 'playing') {
    const left = roundEnd - performance.now();
    if (left <= 0) dispatch('timeout');
    $('timer').textContent = String(Math.max(0, Math.ceil(left / 1000)));
    renderUi();
  }
  $('warn').textContent = document.hidden ? 'TAB HIDDEN: rendering paused, keep it in the foreground' : '';
}, 250);

$('csv').addEventListener('click', () => {
  const blob = new Blob(['kind,player,t_ms,value_ms\n' + csv.join('\n') + '\n'], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `f0-latency-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$('clear').addEventListener('click', () => {
  csv.length = 0;
  for (const p of players.values()) { p.rtt = []; p.lag = []; }
});
