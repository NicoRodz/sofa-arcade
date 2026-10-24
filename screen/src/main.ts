import Phaser from 'phaser';
import {
  ClockSync, DEFAULT_CONFIG, PING_MS, PressTracker, WS_PATH, canStart, newRoomCode, nextPhase,
  type BuzzKind, type ClientMsg, type LobbyConfig, type Phase, type PublicPlayer, type ServerMsg,
} from '@party/shared';
import { DIFFICULTIES, DIFFICULTY_LABEL, params } from '@party/shared/difficulty';
import { summarize } from '@party/shared/results';
import { GAMES, PLATFORM, gameName } from '@party/shared/games';
import { howToHtml } from '@party/shared/render';
import { generate, resolveMap } from '@party/shared/generate';
import { defaultMap, fixedMap, isMapChoice, lobbyMaps, lobbyN, mapFeatures, mapStatus, replacementMap, type MapChoice } from '@party/shared/maps';
import { initAudio } from './audio';
import { gameBus } from './bus';
import { chefCanvas } from './art/chef';
import { chefOf } from './art/tokens';
import { drawLogo, drawMiniMap, starCanvas } from './art/ui';
import { drawCardArt } from './art/cards';
import { NAV_SFX, clampSel, lobbyEscGoesBack, menuCards, menuOnKey, menuPick, soundFor, type MenuAction } from './menu';
import { iris } from './art/iris';
import { toggleShake } from './art/fx';
import { HOWTO_MS, howToOnKey, isExpired, progress, secondsLeft, type HowToState } from './howto';
import { MainScene, type Host } from './scene';
import type { PuestoView } from './art/puestos';
import { assignPuestos, featuresOf, type PuestoId } from '@party/shared/puestos';
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
  pendB: number; // same for B (a quick tap can start and end between two ticks: the dash needs it)
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
const connectedCount = () => [...players.values()].filter((p) => p.info.connected).length;
const connectedN = () => lobbyN(connectedCount());
const room = (() => {
  const q = new URLSearchParams(location.search).get('room');
  try {
    const code = q || sessionStorage.getItem('pg.screenRoom') || newRoomCode();
    sessionStorage.setItem('pg.screenRoom', code);
    return code;
  } catch { return q || newRoomCode(); }
})();
let phase: Phase = 'menu'; // Pichiclub start: the screen picks the game, then that game's lobby
let config: LobbyConfig = { ...DEFAULT_CONFIG, seed: (Math.random() * 2 ** 32) >>> 0 };
let game = createGame();
const played = new Set<string>(); // fixed maps already played in this session: the lobby proposes a new one by default
let mapTouched = false; // the host picked a map by hand: stop proposing defaults
let mapNotice = '';
const puestoOf = new Map<number, PuestoView>(); // suggested stations of the running round, by player id
let puestoStamp = 0;
let puestoMsg: import('@party/shared').PuestoMsg | undefined;
let debugOverride = false;
let screenRtt = NaN;
let totalPkts = 0;
let pktsRate = 0;
const audio = initAudio(gameBus, () => ({
  phase, started: game.started, timeLeftMs: phase === 'playing' && game.started ? game.params.roundMs - game.time : null,
}));

const record = (kind: 'rtt' | 'lag', p: P, v: number) => {
  (kind === 'rtt' ? p.rtt : p.lag).push(v);
  csv.push(`${kind},${p.info.name}#${p.info.id},${Date.now()},${v.toFixed(2)}`);
};

function upsert(info: PublicPlayer, reset = false) {
  let p = players.get(info.id);
  if (!p) {
    p = {
      info, ctl: { x: 0, y: 0, b: false }, pendA: 0, pendB: 0, tracker: new PressTracker(),
      rtt: [], lag: [], off: null, pkts: 0, pktsRate: 0,
    };
    players.set(info.id, p);
    addPlayer(game, info.id, info.slot);
    audio.playerJoined();
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
    const n = connectedN();
    const map = resolveMap(config.map, config.seed, config.difficulty, n, Math.random);
    game = createGame({ mapId: map.id, difficulty: config.difficulty, n, rows: map.rows, spawns: map.spawns, countdownMs: COUNTDOWN_MS, bus: gameBus });
    played.add(map.id);
    // spawn i holds the i-th chef (connected ones first), so "spawn i = puesto i" holds even when slots have gaps
    const order = [...players.values()].sort((a, b) => Number(b.info.connected) - Number(a.info.connected) || a.info.slot - b.info.slot);
    order.forEach((p, rank) => { addPlayer(game, p.info.id, p.info.slot, rank); p.pendA = 0; p.pendB = 0; });
    puestoOf.clear();
    const live = order.filter((p) => p.info.connected);
    if (live.length >= 2) {
      const pm = assignPuestos(live.map((p) => p.info.id), featuresOf(game.stations), map.puestos);
      pm.assign.forEach((a) => puestoOf.set(a.id, { ids: a.puestos, stamp: ++puestoStamp }));
      puestoMsg = pm;
    } else puestoMsg = undefined;
    overAt = null;
    stats.delivered.clear();
    scene.startRound(game, map.id, config.seed);
  } else if (phase === 'results') renderResults();
  else if (phase === 'lobby') scene.endRound();
  else if (phase === 'menu') menuSel = Math.max(0, menuCards(connectedCount()).findIndex((c) => c.id === config.game)); // coming back: the game just left stays highlighted
  // cooperative: every player carries the team score
  sendMsg({ t: 'phase', phase, scores: phase === 'results' ? [...players.keys()].map((id) => ({ id, score: game.score })) : undefined, puestos: phase === 'playing' ? puestoMsg : undefined });
  renderUi();
}
const setConfig = (patch: Partial<LobbyConfig>) => {
  config = { ...config, ...patch };
  sendMsg({ t: 'config', ...config });
  renderUi();
};
// Starting a round: iris closes, the "how to play" card shows for ~10 s (Enter skips), iris again, then the countdown.
function startRound() {
  if (phase !== 'lobby' || starting || howTo || !canStart([...players.values()].map((p) => p.info))) return;
  starting = true;
  iris(() => openHowTo('start'), () => { starting = false; });
}
function beginRound() {
  if (starting) return;
  starting = true;
  iris(() => { closeHowTo(); dispatch('start'); gateUntil = performance.now() + 700; }, () => { starting = false; });
}

let howTo: HowToState | null = null;
function openHowTo(mode: HowToState['mode']) {
  const g = GAMES.find((x) => x.id === config.game) ?? GAMES[0];
  howTo = { mode, startedAt: performance.now() };
  $('howtogame').textContent = g.name;
  $('howtobody').innerHTML = howToHtml(g.howTo);
  $('howtobar').style.visibility = mode === 'start' ? 'visible' : 'hidden';
  $('howto').classList.remove('off');
  tickHowTo();
}
function closeHowTo() {
  howTo = null;
  $('howto').classList.add('off');
}
function tickHowTo() {
  if (!howTo) return;
  const now = performance.now();
  if (howTo.mode === 'start') {
    if (isExpired(howTo, now)) { beginRound(); return; }
    ($('howtofill') as HTMLElement).style.width = `${(progress(howTo.startedAt, now) * 100).toFixed(1)}%`;
    $('howtohint').innerHTML = `Empieza en <b>${secondsLeft(howTo.startedAt, now)}</b> · Enter para saltar`;
  } else {
    ($('howtofill') as HTMLElement).style.width = '0';
    $('howtohint').innerHTML = '<b>H</b> o <b>Enter</b> para cerrar';
  }
}
setInterval(tickHowTo, 100);
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
    case 'puesto': { // the phone picked another puesto with "Cambiar": the screen lights it up again
      if (phase === 'playing' && players.has(m.playerId)) puestoOf.set(m.playerId, { ids: m.puestos as PuestoId[], stamp: ++puestoStamp });
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
      p.ctl = { x: m.x, y: m.y, b: (m.btn & 2) !== 0 };
      const delta = p.tracker.update(m.presses);
      if (delta.some((d) => d > 0)) {
        p.pendA += delta[0] ?? 0;
        p.pendB += delta[1] ?? 0;
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
  puestos: () => puestoOf,
  step(delta) {
    if (phase !== 'playing' || performance.now() < gateUntil) { acc = 0; return; }
    acc += Math.min(delta, 100);
    while (acc >= TICK_MS) {
      acc -= TICK_MS;
      const controls = new Map<number, Controls>();
      for (const p of players.values()) {
        controls.set(p.info.id, { ...p.ctl, a: p.pendA, bTaps: p.pendB });
        p.pendA = 0; p.pendB = 0;
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
  forceLobby: () => { if (phase === 'menu') setPhase('lobby'); }, // capture tool: skip the menu (and its player range)
  menu: () => ({ sel: menuSel, cards: menuCards(connectedCount()).map((c) => `${c.id}:${c.state}`) }),
  forceExpire: () => { for (const o of game.orders) o.expiresAt = game.time + 30; },
  fastForward: (ms: number) => { game.params.roundMs = game.time + ms; },
  setScore: (n: number) => { game.score = n; }, // capture tool: results screen with stars
  snapshot: () => ({ fps: phaser.loop.actualFps, phase, players: [...game.players.values()], stations: game.stations, orders: game.orders, time: game.time, score: game.score, countdown: game.countdown, streak: game.streak, bestStreak: game.bestStreak, crowd: [...game.crowd.keys()] }),
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
// Keeps the selection useful for the people connected: proposes a default until the host picks by hand, and moves off a map
// that got blocked because someone joined or left (saying so).
function syncMap(n: number) {
  const patch = (map: MapChoice) => { config = { ...config, map }; sendMsg({ t: 'config', ...config }); };
  if (!mapTouched) {
    const d = defaultMap(n, played).id;
    if (config.map !== d) patch(d);
    return;
  }
  const cur = isMapChoice(config.map) && config.map !== 'auto' && config.map !== 'random' ? fixedMap(config.map) : undefined;
  if (cur && mapStatus(cur, n).state === 'blocked') {
    const r = replacementMap(cur, n);
    mapNotice = `${cur.name} no sirve con ${n} ${n === 1 ? 'jugador' : 'jugadores'}: se cambió a ${r.name}`;
    patch(r.id);
  } else if (!cur) mapNotice = '';
}
// Start menu: one persistent card per registry game (plus the announced ones), so the art is drawn once and the idle state never restarts.
let menuSel = 0;
function renderMenu() {
  const cards = menuCards(connectedCount());
  const host = $('menucards');
  const key = cards.map((c) => c.id).join('|');
  if (host.dataset.key !== key) {
    host.dataset.key = key;
    host.replaceChildren(...cards.map((c) => {
      const el = document.createElement('div');
      if (c.state !== 'soon') el.dataset.game = c.id;
      el.dataset.card = c.id;
      el.innerHTML = `<canvas class="art"></canvas><div class="body"><div class="nm">${esc(c.name)}</div><div class="bl">${esc(c.blurb)}</div>${c.range ? `<div class="pl">${esc(c.range)}</div>` : ''}</div><div class="tag"></div>`;
      drawCardArt(el.querySelector('canvas')!, c.id);
      return el;
    }));
  }
  menuSel = clampSel(cards, menuSel);
  cards.forEach((c, i) => {
    const el = host.children[i] as HTMLElement;
    el.className = `gc ${c.state}${i === menuSel && c.state !== 'soon' ? ' sel' : ''}${el.classList.contains('nope') ? ' nope' : ''}`;
    el.querySelector('.tag')!.textContent = c.notice;
  });
}
function menuAct(a: MenuAction) {
  const snd = soundFor(a);
  if (snd) audio.ui(NAV_SFX[snd]);
  if (a.kind === 'move') { menuSel = a.sel; renderUi(); }
  else if (a.kind === 'pick') {
    const g = GAMES.find((x) => x.id === a.id);
    if (g) transition(() => { setConfig({ game: g.id }); dispatch('pick'); });
  } else if (a.kind === 'refuse') {
    const el = $('menucards').querySelector<HTMLElement>('.sel');
    el?.classList.remove('nope'); void el?.offsetWidth; el?.classList.add('nope');
  }
}
// iris wipe between menu and lobby, the same one that opens a round
function transition(swap: () => void) {
  if (starting) return;
  starting = true;
  iris(swap, () => { starting = false; });
}
const goBack = () => { if (phase !== 'lobby' || starting || howTo) return; audio.ui(NAV_SFX.back); transition(() => dispatch('back')); };

function renderUi() {
  const inMenu = phase === 'menu';
  const lobby = phase === 'lobby';
  const hub = inMenu || lobby; // both share the logo, the QR + room code and the connected players
  $('lobbybg').classList.toggle('off', !hub);
  $('stage').classList.toggle('off', !hub);
  $('menuui').classList.toggle('off', !inMenu);
  $('lobbyui').classList.toggle('off', !lobby);
  $('results').classList.toggle('off', phase !== 'results');
  $('debug').classList.toggle('off', !debugOverride);
  if (!hub) return;
  $('title').textContent = inMenu ? PLATFORM : gameName(config.game);
  $('platform').textContent = inMenu ? 'Elige un juego' : PLATFORM;
  renderChips();
  if (inMenu) { renderMenu(); return; }
  setHtml('diffs', DIFFICULTIES.map((d) => `<button class="pill ${d === config.difficulty ? 'sel' : ''}" data-diff="${d}">${DIFFICULTY_LABEL[d]}</button>`).join(''));
  const list = [...players.values()];
  const n = connectedN();
  syncMap(n);
  const cards = lobbyMaps(n).map(({ map, status }) => {
    const f = mapFeatures(map.rows);
    const cls = `mc ${status.state === 'recommended' ? 'rec' : status.state === 'warn' ? 'warn' : 'blk'} ${map.id === config.map ? 'sel' : ''}`;
    const tags = `${f.cheese ? '<i class="tag" title="Queso: Margarita">Q</i>' : ''}${f.sink ? '<i class="tag l" title="Lavado de platos">L</i>' : ''}`;
    return `<button class="${cls}" data-map="${map.id}"><span class="t"><b>${map.id}</b>${esc(map.name)}</span><span class="m">${map.nMin}-${map.nMax}<span class="st">${'★'.repeat(map.stars)}</span>${tags}</span>${status.state === 'recommended' ? '' : `<span class="why">${status.reason}</span>`}</button>`;
  });
  const special = [['auto', 'Aleatorio', 'de los ideales'], ['random', 'Mapa generado', 'semilla nueva']]
    .map(([id, label, sub]) => `<button class="mc special ${id === config.map ? 'sel' : ''}" data-map="${id}"><span class="t">${label}</span><span class="m">${sub}</span></button>`);
  setHtml('maps', [...cards, ...special].join(''));
  $('mapfor').textContent = `· para ${n} ${n === 1 ? 'jugador' : 'jugadores'}`;
  const rand = config.map === 'random';
  $('seedrow').classList.toggle('off', !rand);
  $('seed').textContent = String(config.seed);
  const gen = rand ? generate(config.seed, config.difficulty, n) : null;
  const shown = gen ? { rows: gen.rows } : config.map === 'auto' ? null : fixedMap(config.map);
  const key = shown ? shown.rows.join('') : 'none';
  if (key !== lastMapKey) {
    lastMapKey = key;
    const cv = $('minimap') as HTMLCanvasElement;
    if (shown) drawMiniMap(cv, shown.rows); else { const c = cv.getContext('2d')!; c.fillStyle = '#3A2A24'; c.fillRect(0, 0, cv.width, cv.height); c.fillStyle = '#FFF4E0'; c.font = '800 54px ui-rounded, system-ui'; c.textAlign = 'center'; c.fillText('?', cv.width / 2, cv.height / 2 + 18); }
  }
  const sel = config.map === 'auto' || config.map === 'random' ? null : fixedMap(config.map);
  const selStatus = sel ? mapStatus(sel, n) : null;
  const info = $('mapinfo');
  info.textContent = mapNotice || (gen && !gen.inBand ? 'Esta semilla no cae en la banda de la dificultad: se usa el mapa válido más cercano'
    : selStatus?.state === 'warn' ? `${sel!.name}: ${selStatus.reason}. Con ${n} se puede, pero cuesta` : '');
  info.classList.toggle('notice', !!mapNotice);
  const pr = params(config.difficulty, n);
  $('diffinfo').textContent = `Pedido cada ${(pr.orderEveryMs / 1000).toFixed(0)} s, paciencia ${pr.orderTtlMs / 1000} s, hasta ${pr.maxOrders} pedidos`;
  ($('start') as HTMLButtonElement).disabled = !canStart(list.map((p) => p.info));
}
renderUi();

// R7: a short vibration on the phone of the chef the event belongs to (the phone falls back to a colour flash)
const buzz = (player: number, kind: BuzzKind) => sendMsg({ t: 'buzz', playerId: player, kind });
gameBus.on('itemPicked', (e) => buzz(e.player, 'pick'));
gameBus.on('chopDone', (e) => buzz(e.player, 'chop'));
gameBus.on('washDone', (e) => buzz(e.player, 'chop'));
gameBus.on('interactInvalid', (e) => buzz(e.player, 'bad'));
gameBus.on('dishRejected', (e) => buzz(e.player, 'bad'));
gameBus.on('dash', (e) => buzz(e.player, 'dash'));

// round stats for the results screen
const stats = { delivered: new Map<number, number>() };
gameBus.on('delivered', (e) => stats.delivered.set(e.player, (stats.delivered.get(e.player) ?? 0) + 1));

let resultsTimers: ReturnType<typeof setTimeout>[] = [];
function renderResults() {
  resultsTimers.forEach(clearTimeout);
  resultsTimers = [];
  const sum = summarize(game);
  const st = sum.stars;
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
  const [t1, t2, t3] = sum.thresholds;
  $('starline').innerHTML = sum.next === null ? '¡Tres estrellas!' : `Próxima estrella a <b>${sum.thresholds[st]}</b> · te faltaron <b>${sum.next}</b>`;
  $('starline').title = `★ ${t1} · ★★ ${t2} · ★★★ ${t3}`;
  const stat = (cls: string, v: number | string, label: string) => `<div class="stat ${cls}"><b>${v}</b><span>${label}</span></div>`;
  $('stats').innerHTML = stat('good', sum.delivered, 'Entregadas') + stat('gold', sum.bestStreak, 'Mejor racha') + stat('gold', sum.tips, 'En propinas') + stat('bad', sum.expired + sum.rejected, 'Falladas');
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

$('menucards').addEventListener('click', (e) => {
  const id = (e.target as HTMLElement).closest<HTMLElement>('[data-game]')?.dataset.game;
  if (!id || starting || phase !== 'menu') return;
  const cards = menuCards(connectedCount());
  menuSel = Math.max(0, cards.findIndex((c) => c.id === id));
  renderUi();
  menuAct(menuPick(cards, id));
});
$('menucards').addEventListener('pointermove', (e) => { // hovering moves the highlight (silently), so mouse and keys agree
  const id = (e.target as HTMLElement).closest<HTMLElement>('[data-game]')?.dataset.game;
  const i = menuCards(connectedCount()).findIndex((c) => c.id === id);
  if (i >= 0 && i !== menuSel && phase === 'menu' && !starting) { menuSel = i; renderUi(); }
});
$('back').addEventListener('click', goBack);
$('diffs').addEventListener('click', (e) => {
  const d = (e.target as HTMLElement).closest<HTMLElement>('[data-diff]')?.dataset.diff;
  const diff = DIFFICULTIES.find((x) => x === d);
  if (diff) setConfig({ difficulty: diff });
});
$('maps').addEventListener('click', (e) => {
  const m = (e.target as HTMLElement).closest<HTMLElement>('[data-map]')?.dataset.map as MapChoice | undefined;
  if (!isMapChoice(m)) return;
  const f = m === 'auto' || m === 'random' ? null : fixedMap(m);
  if (f && mapStatus(f, connectedN()).state === 'blocked') return;
  mapTouched = true; mapNotice = '';
  setConfig({ map: m });
});
$('again-seed').addEventListener('click', () => setConfig({ seed: (config.seed + 1) % 2 ** 32 }));
$('start').addEventListener('click', () => startRound());
$('again').addEventListener('click', () => dispatch('again'));
$('howtobtn').addEventListener('click', () => { if (!howTo && !starting && phase === 'lobby') openHowTo('preview'); });
$('howto').addEventListener('click', () => { if (howTo?.mode === 'preview') closeHowTo(); });
window.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') { debugOverride = !debugOverride; renderUi(); return; }
  if ((e.key === 's' || e.key === 'S') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) { toggleShake(); return; }
  const act = starting ? 'none' : howToOnKey(howTo, phase, e.key);
  if (act === 'open-preview') { openHowTo('preview'); return; }
  if (act === 'close') { closeHowTo(); return; }
  if (act === 'skip') { beginRound(); return; }
  if (howTo || starting) return; // the card swallows Enter and the iris swallows everything
  if (phase === 'menu') { menuAct(menuOnKey(menuCards(connectedCount()), menuSel, e.key)); return; }
  if (lobbyEscGoesBack(phase, e.key, !!howTo, starting)) { goBack(); return; }
  if (e.key === 'Enter' && e.repeat) return; // a held Enter that picked the game must not also start the round
  if (e.key === 'Enter' && phase === 'lobby') startRound();
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
