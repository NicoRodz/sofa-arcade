import Phaser from 'phaser';
import {
  ClockSync, DEFAULT_CONFIG, PING_MS, PressTracker, WS_PATH, canStart, newRoomCode, nextPhase,
  type ClientMsg, type LobbyConfig, type Phase, type PublicPlayer, type ServerMsg,
} from '@party/shared';
import { DIFFICULTIES, DIFFICULTY_LABEL, params, stars } from '@party/shared/difficulty';
import { GAMES } from '@party/shared/games';
import { percentile } from '@party/shared/stats';
import {
  COLS, MAP, ROWS, TICK_MS, addPlayer, createGame, removePlayer, tick,
  type Controls, type Item, type Station,
} from '@party/shared/game';

interface P {
  info: PublicPlayer;
  ctl: { x: number; y: number; b: boolean }; // latest input: no queue
  pendA: number; // A presses not yet consumed by a tick
  tracker: PressTracker;
  rtt: number[]; lag: number[];
  off: number | null; // phone clock -> server clock
  pkts: number; pktsRate: number;
  label?: Phaser.GameObjects.Text;
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
let config: LobbyConfig = { ...DEFAULT_CONFIG };
let game = createGame();
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
      info, ctl: { x: 0, y: 0, b: false }, pendA: 0, tracker: new PressTracker(),
      rtt: [], lag: [], off: null, pkts: 0, pktsRate: 0,
    };
    players.set(info.id, p);
    addPlayer(game, info.id, info.slot);
  }
  p.info = info;
  if (reset) p.ctl = { x: 0, y: 0, b: false };
  renderUi();
}

function remove(id: number) {
  const p = players.get(id);
  if (!p) return;
  p.label?.destroy();
  players.delete(id);
  removePlayer(game, id);
  renderUi();
}

const sendMsg = (m: ClientMsg) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };

function setPhase(next: Phase) {
  if (next === phase) return;
  phase = next;
  if (phase === 'playing') {
    game = createGame({ difficulty: config.difficulty, n: players.size });
    for (const p of players.values()) { addPlayer(game, p.info.id, p.info.slot); p.pendA = 0; }
  }
  // cooperative: every player carries the team score
  sendMsg({ t: 'phase', phase, scores: phase === 'results' ? [...players.keys()].map((id) => ({ id, score: game.score })) : undefined });
  renderUi();
}
const setConfig = (patch: Partial<LobbyConfig>) => {
  config = { ...config, ...patch };
  sendMsg({ t: 'config', ...config });
  renderUi();
};
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
      if (p) { p.info.connected = false; p.ctl = { x: 0, y: 0, b: false }; renderUi(); }
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
      p.ctl = { x: m.x, y: m.y, b: (m.btn & 2) !== 0 };
      const delta = p.tracker.update(m.presses);
      if (delta.some((d) => d > 0)) {
        p.pendA += delta[0] ?? 0;
        if (p.off !== null) pendingLag.push({ id: p.info.id, sendServerTime: m.ts + p.off });
      }
      break;
    }
  }
}

let ws: WebSocket;
function connect() {
  ws = new WebSocket(`ws://${location.host}${WS_PATH}?role=screen&room=${encodeURIComponent(room)}`);
  ws.onopen = () => { sendMsg({ t: 'config', ...config }); sendMsg({ t: 'phase', phase }); };
  ws.onmessage = (ev) => onMessage(JSON.parse(ev.data));
  ws.onclose = () => setTimeout(connect, 500);
}
connect();
setInterval(() => {
  if (ws.readyState !== WebSocket.OPEN) return;
  // id carries the perf timestamp so RTT keeps sub-ms precision
  ws.send(JSON.stringify({ t: 'ping', id: performance.now(), t0: Date.now() }));
}, PING_MS);

const COL_ITEM = [0xf2d49b, 0xe53935]; // masa, tomate/queso
const COL_STATION: Record<Station['kind'], number> = {
  crate: 0x8d6e63, board: 0xd7b98e, pot: 0xbf5b2c, plates: 0xcfd8dc, window: 0x7e57c2, counter: 0x5c5c6e, trash: 0x37474f,
};
const HUD_H = 96;

class Main extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private acc = 0;
  create() {
    this.gfx = this.add.graphics();
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
  update(_time: number, delta: number) {
    if (phase === 'playing') {
      this.acc += Math.min(delta, 100);
      while (this.acc >= TICK_MS) {
        this.acc -= TICK_MS;
        const controls = new Map<number, Controls>();
        for (const p of players.values()) {
          controls.set(p.info.id, { ...p.ctl, a: p.pendA });
          p.pendA = 0;
        }
        tick(game, controls);
        if (game.over) { dispatch('timeout'); break; }
      }
    } else this.acc = 0;
    this.draw();
  }
  private item(it: Item, x: number, y: number, s: number) {
    const g = this.gfx;
    if (it === 'plate' || it === 'dish') {
      g.fillStyle(0xffffff).fillRect(x - s * 0.3, y - s * 0.3, s * 0.6, s * 0.6); // tray / box
      g.fillStyle(0xcfd8dc).fillRect(x - s * 0.24, y - s * 0.24, s * 0.48, s * 0.48);
      if (it === 'dish') g.fillStyle(COL_ITEM[0]!).fillCircle(x, y, s * 0.2).fillStyle(COL_ITEM[1]!).fillCircle(x - s * 0.06, y - s * 0.04, s * 0.07).fillCircle(x + s * 0.07, y + s * 0.05, s * 0.07);
      return;
    }
    const type = it.endsWith('1') ? 1 : 0;
    g.fillStyle(COL_ITEM[type]!);
    if (it.startsWith('raw')) {
      if (type === 0) g.fillCircle(x, y, s * 0.22); else g.fillRect(x - s * 0.2, y - s * 0.2, s * 0.4, s * 0.4);
    } else {
      // cut: two smaller pieces
      for (const dx of [-0.13, 0.13]) {
        if (type === 0) g.fillCircle(x + s * dx, y, s * 0.11); else g.fillRect(x + s * dx - s * 0.1, y - s * 0.1, s * 0.2, s * 0.2);
      }
    }
  }
  private bar(x: number, y: number, w: number, v: number, color: number) {
    this.gfx.fillStyle(0x000000, 0.7).fillRect(x, y, w, 7);
    this.gfx.fillStyle(color).fillRect(x, y, w * Math.max(0, Math.min(1, v)), 7);
  }
  private draw() {
    const { width, height } = this.scale;
    const s = Math.floor(Math.min(width / COLS, (height - HUD_H) / ROWS));
    const ox = Math.floor((width - s * COLS) / 2);
    const oy = HUD_H + Math.floor((height - HUD_H - s * ROWS) / 2);
    const g = this.gfx;
    g.clear();
    MAP.forEach((row, ty) => [...row].forEach((c, tx) => {
      if (c === '#') return;
      g.fillStyle(c === '.' ? ((tx + ty) % 2 ? 0x2a2a38 : 0x26262f) : 0x2a2a38).fillRect(ox + tx * s, oy + ty * s, s, s);
    }));
    for (const st of game.stations) {
      const x = ox + st.tx * s, y = oy + st.ty * s, cx = x + s / 2, cy = y + s / 2;
      g.fillStyle(COL_STATION[st.kind]).fillRect(x + 2, y + 2, s - 4, s - 4);
      if (st.kind === 'crate') this.item(st.crate === 0 ? 'raw0' : 'raw1', cx, cy, s * 1.3);
      else if (st.kind === 'plates') this.item('plate', cx, cy, s * 1.3);
      else if (st.kind === 'window') g.fillStyle(0xffffff, 0.8).fillRect(x + s * 0.2, y + s * 0.4, s * 0.6, s * 0.2);
      else if (st.kind === 'trash') g.lineStyle(3, 0xff5252).strokeCircle(cx, cy, s * 0.22);
      else if (st.kind === 'pot') {
        g.fillStyle(0x263238).fillCircle(cx, cy, s * 0.36);
        st.inputs.forEach((t, i) => g.fillStyle(COL_ITEM[t]!).fillCircle(cx + (i - 0.5) * s * 0.26, cy, s * 0.11));
        if (st.done) g.lineStyle(4, 0x69f0ae).strokeCircle(cx, cy, s * 0.4);
        else if (st.inputs.length === 2) this.bar(x + 4, y + s - 11, s - 8, st.progress, 0xff9100);
      } else if (st.item) {
        this.item(st.item, cx, cy, s);
        if (st.kind === 'board' && st.progress > 0) this.bar(x + 4, y + s - 11, s - 8, st.progress, 0x69f0ae);
      }
    }
    for (const gp of game.players.values()) {
      const p = players.get(gp.id);
      if (!p) continue;
      const px = ox + gp.x * s, py = oy + gp.y * s, r = s * 0.35;
      const len = Math.hypot(gp.fx, gp.fy) || 1;
      const color = Phaser.Display.Color.HexStringToColor(p.info.color).color;
      const alpha = p.info.connected ? 1 : 0.35;
      g.fillStyle(color, alpha).fillCircle(px, py, r);
      g.fillStyle(0xffffff, alpha).fillCircle(px + (gp.fx / len) * r * 0.6, py + (gp.fy / len) * r * 0.6, r * 0.25);
      if (gp.item) {
        g.fillStyle(0x000000, 0.45).fillCircle(px, py - r - s * 0.22, s * 0.26);
        this.item(gp.item, px, py - r - s * 0.22, s);
      }
      if (gp.cutting) g.lineStyle(3, 0xffffff).strokeCircle(px, py, r + 4);
      if (!p.label) p.label = this.add.text(0, 0, '', { fontSize: '16px', color: '#fff' }).setOrigin(0.5, 0);
      p.label.setPosition(px, py + r + 2).setText(p.info.name).setColor(p.info.connected ? '#fff' : '#777');
    }
    // orders, top-left of the HUD strip
    game.orders.forEach((o, i) => {
      const w = 110, x = 16 + i * (w + 10), y = 14;
      g.fillStyle(0x000000, 0.6).fillRoundedRect(x, y, w, 64, 8);
      this.item('cut0', x + 28, y + 26, 56);
      this.item('cut1', x + 56, y + 26, 56);
      this.item('dish', x + 88, y + 26, 56);
      const left = (o.expiresAt - game.time) / game.params.orderTtlMs;
      this.bar(x + 8, y + 50, w - 16, left, left > 0.5 ? 0x69f0ae : left > 0.25 ? 0xffd740 : 0xff5252);
    });
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
  $('setup').classList.toggle('off', phase !== 'lobby');
  $('hud').classList.toggle('off', phase !== 'playing');
  $('results').classList.toggle('off', phase !== 'results');
  $('debug').classList.toggle('off', !(debugOverride ?? phase !== 'playing'));
  $('games').innerHTML = GAMES.map((g) =>
    `<button class="card ${g.id === config.game ? 'sel' : ''}" data-game="${g.id}"><b>${g.name}</b><small>${g.blurb}<br>${g.players}</small></button>`).join('');
  $('diffs').innerHTML = DIFFICULTIES.map((d) =>
    `<button class="chip ${d === config.difficulty ? 'sel' : ''}" data-diff="${d}">${DIFFICULTY_LABEL[d]}</button>`).join('');
  const list = [...players.values()];
  const pr = params(config.difficulty, list.length);
  $('diffinfo').textContent = `Pedido cada ${(pr.orderEveryMs / 1000).toFixed(0)} s, paciencia ${pr.orderTtlMs / 1000} s, hasta ${pr.maxOrders} pedidos`;
  $('plist').innerHTML = list
    .map((p) => `<li class="${p.info.connected ? '' : 'gone'}"><span class="dot" style="background:${p.info.color}"></span>${esc(p.info.name)}</li>`)
    .join('') || '<li style="color:#888">Esperando jugadores...</li>';
  ($('start') as HTMLButtonElement).disabled = !canStart(list.map((p) => p.info));
  const st = stars(game.difficulty, game.n, game.score);
  $('rank').innerHTML = `<li><span>Equipo</span><b>${game.score}</b></li><li><span>Entregas</span><b>${game.delivered}</b></li>` +
    `<li><span>${DIFFICULTY_LABEL[game.difficulty]}</span><b>${'★'.repeat(st)}${'☆'.repeat(3 - st)}</b></li>`;
  $('scores').innerHTML = `<span>Equipo ${game.score}</span>`;
}
renderUi();

$('games').addEventListener('click', (e) => {
  const id = (e.target as HTMLElement).closest<HTMLElement>('[data-game]')?.dataset.game;
  const game = GAMES.find((g) => g.id === id);
  if (game) setConfig({ game: game.id });
});
$('diffs').addEventListener('click', (e) => {
  const d = (e.target as HTMLElement).closest<HTMLElement>('[data-diff]')?.dataset.diff;
  const diff = DIFFICULTIES.find((x) => x === d);
  if (diff) setConfig({ difficulty: diff });
});
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
    const left = game.params.roundMs - game.time;
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
