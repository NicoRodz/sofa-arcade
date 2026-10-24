import Phaser from 'phaser';
import {
  ClockSync, DEFAULT_ROOM, PING_MS, PressTracker, WS_PATH, type PublicPlayer, type ServerMsg,
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
  circle?: Phaser.GameObjects.Arc; label?: Phaser.GameObjects.Text;
}
const players = new Map<number, P>();
const pendingLag: { id: number; sendServerTime: number }[] = [];
const csv: string[] = [];
const sync = new ClockSync();
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
      rtt: [], lag: [], off: null, pkts: 0, pktsRate: 0,
    };
    players.set(info.id, p);
  }
  p.info = info;
  if (reset) { p.tracker.reset(); p.vx = p.vy = 0; }
}

function onMessage(m: ServerMsg) {
  switch (m.t) {
    case 'state': m.players.forEach((i) => upsert(i, true)); break;
    case 'player_joined': upsert(m.player, true); break;
    case 'player_left': {
      const p = players.get(m.playerId);
      if (p) { p.info.connected = false; p.vx = p.vy = 0; }
      break;
    }
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
        p.flashUntil = performance.now() + FLASH_MS;
        if (p.off !== null) pendingLag.push({ id: p.info.id, sendServerTime: m.ts + p.off });
      }
      break;
    }
  }
}

let ws: WebSocket;
function connect() {
  ws = new WebSocket(`ws://${location.host}${WS_PATH}?role=screen&room=${DEFAULT_ROOM}`);
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

const f = (n: number) => (Number.isFinite(n) ? n.toFixed(0) : '-');
const $ = (id: string) => document.getElementById(id)!;
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
