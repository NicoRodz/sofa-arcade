import Phaser from 'phaser';
import {
  ClockSync, DEFAULT_CONFIG, PING_MS, PressTracker, WS_PATH, canStart, newRoomCode, nextPhase,
  type ClientMsg, type LobbyConfig, type Phase, type PublicPlayer, type ServerMsg,
} from '@party/shared';
import { DIFFICULTIES, DIFFICULTY_LABEL, params, stars } from '@party/shared/difficulty';
import { GAMES } from '@party/shared/games';
import { generate, resolveMap } from '@party/shared/generate';
import { FIXED_MAPS, MAP_IDS, fixedMap, isMapChoice, type MapChoice } from '@party/shared/maps';
import { gameBus } from './bus';
import { chefCanvas } from './art/chef';
import { chefOf } from './art/tokens';
import { drawLogo, drawMiniMap, starCanvas } from './art/ui';
import { iris } from './art/iris';
import { MainScene, type Host } from './scene';
import { C, H, W } from './art/tokens';
import { percentile } from '@party/shared/stats';
import {
  COUNTDOWN_MS, TICK_MS, addPlayer, createGame, removePlayer, tick,
  type Controls,
} from '@party/shared/game';

interface P {
  info: PublicPlayer;
  ctl: { x: number; y: number; b: boolean }; // latest input: no queue
  pendA: number; // A presses not yet consumed by a tick
  tracker: PressTracker;
  rtt: number[]; lag: number[];
  off: number | null; // phone clock -> server clock
  pkts: number; pktsRate: number;
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
let config: LobbyConfig = { ...DEFAULT_CONFIG, seed: (Math.random() * 2 ** 32) >>> 0 };
let game = createGame();
let debugOverride = false;
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
  players.delete(id);
  removePlayer(game, id);
  renderUi();
}

const sendMsg = (m: ClientMsg) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };

function setPhase(next: Phase) {
  if (next === phase) return;
  phase = next;
  if (phase === 'playing') {
    const map = resolveMap(config.map, config.seed, config.difficulty, players.size, Math.random);
    game = createGame({ difficulty: config.difficulty, n: players.size, rows: map.rows, countdownMs: COUNTDOWN_MS, bus: gameBus });
    for (const p of players.values()) { addPlayer(game, p.info.id, p.info.slot); p.pendA = 0; }
    overAt = null;
    stats.delivered.clear(); stats.expired = 0;
    scene.startRound(game, FIXED_MAPS.find((m) => m.rows === map.rows)?.id ?? 'random', config.seed);
  } else if (phase === 'results') renderResults();
  else if (phase === 'lobby') scene.endRound();
  // cooperative: every player carries the team score
  sendMsg({ t: 'phase', phase, scores: phase === 'results' ? [...players.keys()].map((id) => ({ id, score: game.score })) : undefined });
  renderUi();
}
const setConfig = (patch: Partial<LobbyConfig>) => {
  config = { ...config, ...patch };
  sendMsg({ t: 'config', ...config });
  renderUi();
};
function startRound() {
  if (phase !== 'lobby' || starting || !canStart([...players.values()].map((p) => p.info))) return;
  starting = true;
  iris(() => { dispatch('start'); gateUntil = performance.now() + 700; }, () => { starting = false; });
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

let overAt: number | null = null;
let gateUntil = 0; // the logic waits for the iris to open
let starting = false;
let acc = 0;
const host: Host = {
  players: () => new Map([...players].map(([id, p]) => [id, p.info])),
  step(delta) {
    if (phase !== 'playing' || performance.now() < gateUntil) { acc = 0; return; }
    acc += Math.min(delta, 100);
    while (acc >= TICK_MS) {
      acc -= TICK_MS;
      const controls = new Map<number, Controls>();
      for (const p of players.values()) {
        controls.set(p.info.id, { ...p.ctl, a: p.pendA });
        p.pendA = 0;
      }
      tick(game, controls);
      if (game.over) { overAt ??= performance.now(); break; }
    }
    // "¡TIEMPO!" stays on screen for a beat before the results
    if (game.over && overAt !== null && performance.now() - overAt > 1100) { overAt = null; dispatch('timeout'); }
  },
};
const scene = new MainScene(host);
// Called right after the frame is drawn: closest browser-side proxy for "visible on screen".
const phaser = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: C.cocoa,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
  fps: { target: 60 },
  scene,
});
phaser.events.on(Phaser.Core.Events.POST_RENDER, () => {
  const off = sync.offset;
  if (!pendingLag.length || off === null) return;
  const nowServer = Date.now() + off;
  for (const q of pendingLag.splice(0)) {
    const p = players.get(q.id);
    if (p) record('lag', p, nowServer - q.sendServerTime);
  }
});
(window as unknown as { __pg: unknown }).__pg = {
  forceExpire: () => { for (const o of game.orders) o.expiresAt = game.time + 30; },
  fastForward: (ms: number) => { game.params.roundMs = game.time + ms; },
  snapshot: () => ({ fps: phaser.loop.actualFps, phase, players: [...game.players.values()], stations: game.stations, orders: game.orders, time: game.time, score: game.score, countdown: game.countdown }),
};

$('code').textContent = room;
fetch(`/api/info?room=${encodeURIComponent(room)}`)
  .then((r) => r.json())
  .then(({ url, qrSvg }: { url: string; qrSvg: string }) => {
    document.getElementById('qr')!.innerHTML = qrSvg;
    document.getElementById('joinurl')!.textContent = url.replace(/^http:\/\//, '');
  })
  .catch(() => { document.getElementById('joinurl')!.textContent = 'no se pudo obtener la URL'; });

const f = (n: number) => (Number.isFinite(n) ? n.toFixed(0) : '-');
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

// layout: the 1920x1080 stage is scaled to the window
const fit = () => document.documentElement.style.setProperty('--k', String(Math.min(innerWidth / 1920, innerHeight / 1080)));
fit();
addEventListener('resize', fit);
drawLogo($('logo') as HTMLCanvasElement);

// lobby chips: one persistent element per slot so the idle animation never restarts
const chips = Array.from({ length: 8 }, (_v, i) => {
  const el = document.createElement('div');
  el.className = 'chip empty';
  el.style.setProperty('--c', chefOf(i).color);
  el.innerHTML = '<div class="av"></div><div><div class="nm"></div><div class="sub"></div></div><div class="num"></div>';
  $('chips').appendChild(el);
  return { el, av: el.querySelector('.av')!, nm: el.querySelector('.nm')!, sub: el.querySelector('.sub')!, num: el.querySelector('.num')!, who: -1 };
});
chips.forEach((c, i) => { c.num.textContent = String(i + 1); c.nm.textContent = 'Esperando…'; });

const cache = new Map<string, string>();
const setHtml = (id: string, html: string) => { if (cache.get(id) !== html) { cache.set(id, html); $(id).innerHTML = html; } };

function renderChips() {
  const bySlot = new Map([...players.values()].map((p) => [p.info.slot % 8, p.info]));
  chips.forEach((c, i) => {
    const info = bySlot.get(i);
    c.el.classList.toggle('empty', !info);
    c.el.classList.toggle('gone', !!info && !info.connected);
    if (!info) { c.who = -1; c.av.replaceChildren(); c.nm.textContent = 'Esperando…'; c.sub.textContent = ''; return; }
    if (c.who !== info.id) {
      c.who = info.id;
      c.av.replaceChildren(chefCanvas(i, 'idle', true));
      c.el.classList.remove('pop'); void c.el.offsetWidth; c.el.classList.add('pop');
    }
    c.nm.textContent = info.name;
    c.sub.textContent = info.connected ? `${chefOf(i).name} · listo` : 'Desconectado';
  });
}

let lastMapKey = '';
function renderUi() {
  const lobby = phase === 'lobby';
  $('lobbybg').classList.toggle('off', !lobby);
  $('stage').classList.toggle('off', !lobby);
  $('results').classList.toggle('off', phase !== 'results');
  $('debug').classList.toggle('off', !debugOverride);
  if (!lobby) return;
  setHtml('games', GAMES.map((g) => `<button class="pill ${g.id === config.game ? 'sel' : ''}" id="gamepill" data-game="${g.id}" title="${esc(g.blurb)}">${g.name}</button>`).join(''));
  setHtml('diffs', DIFFICULTIES.map((d) => `<button class="pill ${d === config.difficulty ? 'sel' : ''}" data-diff="${d}">${DIFFICULTY_LABEL[d]}</button>`).join(''));
  const mapLabel = (id: string) => `${id} ${fixedMap(id)!.name}`;
  setHtml('maps', [['auto', 'Al azar'], ...MAP_IDS.map((id) => [id, mapLabel(id)]), ['random', 'Mapa aleatorio']]
    .map(([id, label]) => `<button class="pill ${id === config.map ? 'sel' : ''}" data-map="${id}">${label}</button>`).join(''));
  const list = [...players.values()];
  const rand = config.map === 'random';
  $('seedrow').classList.toggle('off', !rand);
  $('seed').textContent = String(config.seed);
  const gen = rand ? generate(config.seed, config.difficulty, list.length) : null;
  const shown = gen ? { rows: gen.rows } : config.map === 'auto' ? null : fixedMap(config.map);
  const key = shown ? shown.rows.join('') : 'none';
  if (key !== lastMapKey) {
    lastMapKey = key;
    const cv = $('minimap') as HTMLCanvasElement;
    if (shown) drawMiniMap(cv, shown.rows); else { const c = cv.getContext('2d')!; c.fillStyle = '#3A2A24'; c.fillRect(0, 0, cv.width, cv.height); c.fillStyle = '#FFF4E0'; c.font = '800 54px ui-rounded, system-ui'; c.textAlign = 'center'; c.fillText('?', cv.width / 2, cv.height / 2 + 18); }
  }
  $('mapinfo').textContent = gen && !gen.inBand ? 'Esta semilla no cae en la banda de la dificultad: se usa el mapa válido más cercano'
    : list.length > 4 && !rand ? 'Mapa pensado para 2 a 4: los extra aparecen junto a un punto de inicio' : '';
  const pr = params(config.difficulty, list.length);
  $('diffinfo').textContent = `Pedido cada ${(pr.orderEveryMs / 1000).toFixed(0)} s, paciencia ${pr.orderTtlMs / 1000} s, hasta ${pr.maxOrders} pedidos`;
  renderChips();
  ($('start') as HTMLButtonElement).disabled = !canStart(list.map((p) => p.info));
}
renderUi();

// round stats for the results screen
const stats = { delivered: new Map<number, number>(), expired: 0 };
gameBus.on('delivered', (e) => stats.delivered.set(e.player, (stats.delivered.get(e.player) ?? 0) + 1));
gameBus.on('orderExpired', () => { stats.expired++; });

let resultsTimers: ReturnType<typeof setTimeout>[] = [];
function renderResults() {
  resultsTimers.forEach(clearTimeout);
  resultsTimers = [];
  const st = stars(game.difficulty, game.n, game.score);
  const starsEl = $('stars');
  starsEl.replaceChildren();
  for (let i = 0; i < 3; i++) {
    const cv = starCanvas();
    if (i >= st) cv.classList.add('off2');
    starsEl.appendChild(cv);
    resultsTimers.push(setTimeout(() => cv.classList.add('drop'), 500 + i * 550));
  }
  const target = game.score, t0 = performance.now() + 400, dur = 1300;
  const fin = $('finalscore');
  const step = () => {
    const k = Math.max(0, Math.min(1, (performance.now() - t0) / dur));
    fin.textContent = String(Math.round(target * (1 - (1 - k) ** 3)));
    if (k < 1 && phase === 'results') requestAnimationFrame(step);
  };
  step();
  $('stats').innerHTML = `<div class="stat good"><b>${game.delivered}</b><span>Entregadas</span></div><div class="stat bad"><b>${stats.expired}</b><span>Falladas</span></div>`;
  const ranked = [...players.values()].map((p) => ({ p, n: stats.delivered.get(p.info.id) ?? 0 })).sort((a, b) => b.n - a.n || a.p.info.slot - b.p.info.slot);
  const top = ranked.filter((r) => r.n > 0).slice(0, 3);
  const order = top.length === 3 ? [1, 0, 2] : top.length === 2 ? [1, 0] : [0];
  const pod = $('podium');
  pod.replaceChildren();
  for (const i of order) {
    const r = top[i];
    if (!r) continue;
    const el = document.createElement('div');
    el.className = `pod p${i + 1}`;
    el.innerHTML = `${i === 0 ? '<div class="crown">👑</div>' : ''}<div class="step">${esc(r.p.info.name)}<small>${r.n} ${r.n === 1 ? 'pizza' : 'pizzas'}</small></div>`;
    el.insertBefore(chefCanvas(r.p.info.slot, 'happy', true), el.firstChild);
    pod.appendChild(el);
  }
  if (!top.length) pod.innerHTML = '<div class="hint">Nadie alcanzó a entregar una pizza</div>';
}

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
$('maps').addEventListener('click', (e) => {
  const m = (e.target as HTMLElement).closest<HTMLElement>('[data-map]')?.dataset.map as MapChoice | undefined;
  if (isMapChoice(m)) setConfig({ map: m });
});
$('again-seed').addEventListener('click', () => setConfig({ seed: (config.seed + 1) % 2 ** 32 }));
$('start').addEventListener('click', () => startRound());
$('again').addEventListener('click', () => dispatch('again'));
window.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') { debugOverride = !debugOverride; renderUi(); }
  else if (e.key === 'Enter' && phase === 'lobby') startRound();
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
