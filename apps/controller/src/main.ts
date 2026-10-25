import nipplejs from 'nipplejs';
import { DIFFICULTY_LABEL } from '@pichi/core/difficulty';
import { fixedMap } from '@pichi/game-pizzas/sim/maps';
import { VERSUS_AUTO, VERSUS_RANDOM, versusMap } from '@pichi/game-pizzas/sim/versus/maps';
import { gameName, type GameControls, type HowTo } from '@pichi/core/games';
import { esc, howToHtml, iconSvg } from '@pichi/core/render';
import { PUESTOS, type PuestoId } from '@pichi/game-pizzas/sim/puestos';
import { SABOTAGE_LABEL, sabotageOf } from '@pichi/game-pizzas/sim/sabotage-config';
import { parseObstOptions, setupLabel } from '@pichi/game-obstaculos/lobby';
import { seenAfterPhase, shouldShowHowTo } from '@pichi/controller-kit/howto';
import { announceAssist, assistLabel } from './assist-help';
import { createSchoolUi } from '@pichi/game-pizzas/controller/school';
import { kvOf } from '@pichi/game-pizzas/sim/school';
import { createZoomGuard, isDoubleTap } from '@pichi/controller-kit/zoom';
import {
  BUZZ_PATTERNS,
  ClockSync,
  DEADZONE,
  DEFAULT_ROOM,
  INPUT_HZ,
  PING_MS,
  PRESS_MOD,
  WS_PATH,
  applyDeadzone,
  isNavKey,
  remoteVisible,
  type BuzzKind,
  type ClientMsg,
  type HintLabels,
  type Phase,
  type PuestoMsg,
  type ServerMsg,
  type SignalKind,
  type TeamInfo,
} from '@pichi/core';
import type { IconId } from '@pichi/core/icons';
import { attend } from '@pichi/controller-kit/attention';
import { bindRemote } from '@pichi/controller-kit/remote';
import { outcomeFor, type Outcome, type PhoneResult } from '@pichi/game-pizzas/sim/versus/report';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

// Touch hardening: no zoom (pinch, double-tap), scroll, selection or context menu. iOS Safari ignores user-scalable=no,
// so the gesture events are cancelled too, and zoom.ts watches visualViewport in case it zooms anyway.
const stop = (e: Event) => e.preventDefault();
document.addEventListener('touchmove', stop, { passive: false });
document.addEventListener(
  'touchstart',
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false },
); // second finger = pinch
for (const g of ['gesturestart', 'gesturechange', 'gestureend', 'contextmenu', 'dblclick', 'selectstart']) {
  document.addEventListener(g, (e) => {
    if (!(e.target as HTMLElement | null)?.closest?.('input')) e.preventDefault();
  });
}
let lastEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    if (isDoubleTap(lastEnd, now)) e.preventDefault();
    lastEnd = now;
  },
  { passive: false },
);

function resetZoom() {
  window.scrollTo(0, 0);
  const meta = document.querySelector<HTMLMetaElement>('meta[name=viewport]');
  if (!meta) return;
  const original = meta.content;
  meta.content = 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'; // a changed value makes iOS re-evaluate the scale
  setTimeout(() => {
    meta.content = original;
  }, 120);
}
const zoomGuard = createZoomGuard({
  viewport: window.visualViewport,
  reset: resetZoom,
  onZoomed: (z) => document.body.classList.toggle('zoomed', z),
  later: (fn, ms) => {
    setTimeout(fn, ms);
  },
});
window.visualViewport?.addEventListener('resize', zoomGuard.check);
window.visualViewport?.addEventListener('scroll', zoomGuard.check);
setInterval(zoomGuard.check, 2000);
$('zoomfix').addEventListener('click', () => zoomGuard.manualReset());

const state = { x: 0, y: 0, btn: 0, presses: [0, 0], seq: 0, sig: { kind: 'go' as SignalKind, seq: 0 }, go: false };
(window as unknown as { __pad: typeof state }).__pad = state; // headless drivers (tools/school-shots.ts) push the stick and the buttons through it; the game itself never reads it
// Campaign signals: the pad of 6 buttons shows only in a campaign round (phase.match.modeOptions.campaign). While it shows, every input carries `sig` (a monotonic counter: a new seq = one
// signal of that kind; seq 0 is the baseline the screen reads first) and `go` (true while "¡Ya!" is held: 0.4 s of it starts the 3-2-1). A quick match sends neither: the packets are the old ones.
let signalsOn = false;
const setSignals = (on: boolean) => {
  signalsOn = on;
  document.body.dataset.signals = on ? 'on' : 'off';
};
const sync = new ClockSync();
let lastRtt: number | undefined;
let ws: WebSocket | null = null;
let joined = false;
let started = false;
let halted = false; // server refused us (e.g. room full): stop retrying until the page is shown again
let phase: Phase = 'menu'; // until the screen says otherwise the phone waits for the game to be picked
let myId = 0;
let myName = ''; // as the relay registered it (trimmed)
let captainId: number | null = null; // who holds the crown (the relay says); the Captain gets the D-pad
let lastPong = 0;
const room = new URLSearchParams(location.search).get('room') || DEFAULT_ROOM;
const view = (v: string) => {
  document.body.dataset.view = v;
};
let pingId = 0;
const sent = new Map<number, { perf: number; t0: number }>();

const token = store.get('pg.token') ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
store.set('pg.token', token);
let name = store.get('pg.name') ?? '';

// Labels and icons come from the game registry via the config message: nothing here knows a specific game.
// The circle (the touch area) carries the icon only; the label goes in a plate underneath, outside the touch area.
// The screen may rename A and B for a moment (sabotage: "Tomar bolsa", "Cargar", "¡Lanzar!"): `hint` overrides the registry label, null brings it back.
function setControl(circle: HTMLElement, plate: HTMLElement, c: GameControls['stick']) {
  circle.innerHTML = iconSvg(c.icon);
  plate.innerHTML = `<div class="pl"><span class="lbl">${esc(c.label)}</span>${c.hold ? '<span class="hold">mantén apretado</span>' : ''}</div>`;
}
// A long label shrinks (down to 8px) until it fits its plate instead of spilling over the neighbours.
function fitLabels() {
  for (const pl of Array.from(document.querySelectorAll<HTMLElement>('.plq .pl'))) {
    const spans = Array.from(pl.querySelectorAll<HTMLElement>('.lbl, .hold'));
    for (const sp of spans) sp.style.fontSize = '';
    const avail = () => pl.parentElement!.clientWidth + 10 - 16; // plate: control width + 10, minus its side padding
    for (const sp of spans) {
      let size = parseFloat(getComputedStyle(sp).fontSize);
      while (sp.scrollWidth > avail() + 0.5 && size > 8) {
        size -= 0.5;
        sp.style.fontSize = `${size}px`;
      }
    }
  }
}
window.addEventListener('resize', fitLabels);
let controls: GameControls | null = null;
const NO_HINT: HintLabels = { a: null, b: null };
let hint: HintLabels = NO_HINT;
// A hint with a label also brings its icon and whether there is anything to do; the "mantén apretado" line only belongs to the game's own B.
const hinted = (base: GameControls['btn1'], label: string | null, icon: IconId | undefined, hold: boolean): GameControls['btn1'] =>
  label ? { ...base, label, ...(icon ? { icon } : {}), hold } : base;
function applyControls(c: GameControls | null = controls) {
  if (!c) return;
  controls = c;
  setControl($('stickhint'), $('stickLbl'), c.stick);
  setControl($('btnA'), $('lblA'), hinted(c.btn1, hint.a, hint.aIcon, !!c.btn1.hold));
  setControl($('btnB'), $('lblB'), hinted(c.btn2, hint.b, hint.bIcon, false));
  for (const [id, lbl, isOff] of [
    ['btnA', 'lblA', hint.aOff],
    ['btnB', 'lblB', hint.bOff],
  ] as const) {
    $(id).classList.toggle('off', !!isOff);
    $(lbl).classList.toggle('off', !!isOff);
  }
  fitLabels();
}
const sameHint = (x: HintLabels, y: HintLabels) =>
  x.a === y.a && x.b === y.b && x.aIcon === y.aIcon && x.bIcon === y.bIcon && !!x.aOff === !!y.aOff && !!x.bOff === !!y.bOff;
const setHint = (h: HintLabels) => {
  if (sameHint(hint, h)) return;
  hint = h;
  applyControls();
}; // every hint is a whole state, so the latest one is the truth

// "Cómo se juega": one-view summary, closed with a tap. Opens on join and when the lobby picks a game not shown yet.
let seenGame: string | null = null;
const setHowTo = (open: boolean) => {
  document.body.dataset.howto = open ? 'open' : 'closed';
};
let shown: { game: string; name: string; howTo: HowTo } | null = null; // the game the screen last announced
function renderHowTo(game: string, name: string, h: HowTo) {
  shown = { game, name, howTo: h };
  $('howtogame').textContent = name;
  $('howtobody').innerHTML = howToHtml(h);
  maybeShowHowTo();
}
function maybeShowHowTo() {
  if (shown && shouldShowHowTo(seenGame, shown.game, phase)) {
    seenGame = shown.game;
    setHowTo(true);
  }
}
// pointerup, not click: a touchend inside the double-tap window is cancelled (see above) and would swallow the click
$('howto').addEventListener('pointerup', () => setHowTo(false));
$('howtoopen').addEventListener('pointerup', () => setHowTo(true));

// R7: vibrate where the browser can (Android), flash the phone's colour where it cannot (iOS Safari has no vibration API).
let flashTimer: ReturnType<typeof setTimeout> | undefined;
let slipTimer: typeof flashTimer;
function buzz(kind: BuzzKind) {
  if (phase !== 'playing' && phase !== 'school') return; // the school buzzes like a round
  if (kind === 'slip') {
    // sabotage: the chef slipped on rubbish
    $('slip').classList.add('on');
    clearTimeout(slipTimer);
    slipTimer = setTimeout(() => $('slip').classList.remove('on'), 900);
  }
  const pattern = BUZZ_PATTERNS[kind];
  try {
    if (typeof navigator.vibrate === 'function' && navigator.vibrate([...pattern])) return;
  } catch {
    /* blocked: fall back to the flash */
  }
  document.body.classList.add('flash');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => document.body.classList.remove('flash'), 120);
}

// Versus: the team of this phone (the relay sends `you` after every config), shown as a strip with its colour, name, icon and kitchen side,
// and a button in the lobby to change team. Coop has no teams: nothing shows.
let teams: TeamInfo[] | null = null;
let teamsLocked = false;
let myTeam: number | null = null;
function showTeam(you: { teamId: number; color: string; icon: string; sideLabel?: string } | null) {
  myTeam = you?.teamId ?? null;
  document.body.dataset.team = you ? 'on' : 'off';
  if (!you) return;
  const name = teams?.find((t) => t.id === you.teamId)?.name ?? `Equipo ${you.teamId + 1}`;
  document.documentElement.style.setProperty('--tc', you.color);
  for (const k of ['', '2']) {
    $(`tcicon${k}`).textContent = you.icon;
    $(`tcname${k}`).textContent = name;
    $(`tcside${k}`).textContent = you.sideLabel ? `· cocina ${you.sideLabel}` : '';
  }
}
function applyTeams(t: TeamInfo[] | null, locked: boolean) {
  teams = t && t.length > 1 ? t : null;
  teamsLocked = locked;
  if (!teams) showTeam(null);
  ($('teamswap') as HTMLButtonElement).disabled = locked;
  $('teamswap').textContent = locked ? 'Equipos bloqueados' : 'Cambiar de equipo';
}
$('teamswap').addEventListener('pointerup', (e) => {
  e.preventDefault();
  if (!teams || myTeam === null || teamsLocked) return;
  const next = teams[(teams.findIndex((t) => t.id === myTeam) + 1) % teams.length]!; // two teams: the other one
  tx({ t: 'setTeam', teamId: next.id });
});

// Ayudante (assist.ts): one switch for this player, in the lobby. The phone shows what it asked for at once and the relay's echo ('assist' with this id) confirms it,
// also after a reconnect (the relay keeps the choice with the slot).
let assist = false;
function showAssist(on: boolean) {
  assist = on;
  $('assist').classList.toggle('on', on);
  $('assist').setAttribute('aria-pressed', String(on));
  $('assistlbl').textContent = assistLabel(on);
}
$('assist').addEventListener('pointerup', (e) => {
  e.preventDefault();
  if (phase !== 'lobby') return;
  showAssist(!assist);
  tx({ t: 'assist', on: assist });
  announceAssist(assist);
});

const tx = (m: ClientMsg) => {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
};
const schoolUi = createSchoolUi({
  kv: (() => {
    try {
      return kvOf(localStorage);
    } catch {
      return null;
    }
  })(),
  token,
  send: tx,
  isCaptain: () => joined && captainId !== null && captainId === myId,
});
let label = '';
const hud = (s: string) => {
  label = s;
  $('hud').textContent = s;
};

// The Captain's remote: shown on every screen but the round, and only while the socket is joined (a button that cannot send would lie).
const isCaptain = () => joined && captainId !== null && captainId === myId;
function renderCaptain() {
  document.body.dataset.remote = remoteVisible(isCaptain(), joined, phase) ? 'on' : 'off';
  schoolUi.refreshCaptain();
  const crown = isCaptain() ? '👑 ' : '';
  $('who').textContent = crown + myName;
  $('who2').textContent = crown + myName;
}
bindRemote(Array.from(document.querySelectorAll<HTMLElement>('#remote [data-nav]')), {
  isCaptain,
  isNavKey,
  send: (key) => tx({ t: 'nav', key }),
});

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
  if (!pm || !mine) {
    showPuesto(null);
    return;
  }
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

const VERDICT_TEXT: Record<Outcome, string> = { won: '¡Ganaron!', lost: 'Perdieron', draw: '¡Empate!', none: 'Sin ganador' };
function showPhase(p: Phase, scores?: { id: number; score: number }[], puestos?: PuestoMsg, result?: PhoneResult, campaign = false) {
  phase = p;
  const live = p === 'playing' || p === 'school'; // the school is played with the same pad as a round
  setSignals(p === 'playing' && campaign);
  if (!live) setHint(NO_HINT); // the labels the round gave go with it
  seenGame = seenAfterPhase(seenGame, p);
  if (p === 'menu') setHowTo(false);
  else maybeShowHowTo(); // the screen just entered a game: show its summary
  applyPuestos(p === 'playing' ? puestos : undefined);
  if (live) setHowTo(false);
  schoolUi.show(p === 'school');
  if (!live) {
    state.x = 0;
    state.y = 0;
    state.btn = 0;
    state.go = false;
    document.querySelectorAll('.act, .sg').forEach((b) => b.classList.remove('down'));
  }
  if (p === 'results' && scores) {
    const mine = scores.find((s) => s.id === myId) ?? scores[0]; // cooperative: every entry carries the team score
    $('rank').textContent = mine ? String(mine.score) : '-';
    $('myscore').textContent = mine ? 'puntos de equipo' : '';
    // versus: the verdict and the score of this phone's own team (the screen sends every team's; the phone picks its own)
    const outcome = result ? outcomeFor(result, myTeam) : null;
    const own = result && myTeam !== null ? result.scores.find((x) => x.team === myTeam) : undefined;
    if (outcome && own) {
      $('rank').textContent = String(own.score);
      $('myscore').textContent = 'puntos de tu equipo';
      $('verdict').textContent = VERDICT_TEXT[outcome];
      document.body.dataset.outcome = outcome;
    } else delete document.body.dataset.outcome;
  } else delete document.body.dataset.outcome;
  view(live ? 'playing' : p);
  renderCaptain();
}

function connect() {
  if (ws && ws.readyState <= WebSocket.OPEN) return;
  halted = false;
  const sock = (ws = new WebSocket(`ws://${location.host}${WS_PATH}?room=${encodeURIComponent(room)}`));
  sock.onopen = () => {
    lastPong = Date.now();
    tx({ t: 'join', name, token });
  };
  sock.onmessage = (ev) => {
    const m = JSON.parse(ev.data) as ServerMsg;
    attend(m, myId);
    if (m.t === 'joined') {
      joined = true;
      myId = m.player.id;
      document.documentElement.style.setProperty('--c', m.player.color);
      myName = m.player.name;
      showAssist(false); // the relay tells a phone that comes back what it had chosen (after this message)
      schoolUi.announce(); // a phone whose player did the Cocina escuela says so: the screen does not offer it again for them
      hud(`${m.player.name} #${m.player.slot + 1}`);
      renderCaptain();
    } else if (m.t === 'config') {
      document.body.dataset.game = m.game; // CSS: the Ayudante switch is a pizzas thing
      $('game').textContent = gameName(m.game);
      applyControls(m.controls);
      renderHowTo(m.game, gameName(m.game), m.howTo);
      applyTeams(m.teams, m.teamsLocked);
      const mapName =
        m.map === 'auto' || m.map === VERSUS_AUTO
          ? 'Mapa al azar'
          : m.map === 'random' || m.map === VERSUS_RANDOM
            ? `Mapa aleatorio ${m.seed}`
            : ((fixedMap(m.map) ?? versusMap(m.map))?.name ?? '');
      $('setup').textContent =
        m.game === 'obstaculos'
          ? setupLabel(parseObstOptions(m.modeOptions), m.difficulty, m.seed, DIFFICULTY_LABEL)
          : `${m.modeId === 'versus' ? 'Versus · ' : ''}${DIFFICULTY_LABEL[m.difficulty]} · ${mapName}${m.modeId === 'versus' ? ` · Sabotaje ${SABOTAGE_LABEL[sabotageOf(m.modeOptions)]}` : ''}`;
    } else if (m.t === 'assist' && m.playerId === myId) showAssist(m.on);
    else if (m.t === 'school') schoolUi.apply(m);
    else if (m.t === 'you') {
      showTeam(m);
    } else if (m.t === 'phase') {
      showPhase(m.phase, m.scores, m.puestos, m.result, m.match?.modeOptions.campaign === true);
    } else if (m.t === 'captain') {
      captainId = m.playerId;
      renderCaptain();
    } else if (m.t === 'buzz') {
      buzz(m.kind);
    } else if (m.t === 'hint') {
      const { t: _t, ...h } = m;
      setHint(h);
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
    renderCaptain();
    if (halted) return;
    hud('reconnecting...');
    setTimeout(connect, 500);
  };
}

function sendInput() {
  if (!joined || (phase !== 'playing' && phase !== 'school')) return;
  tx({
    t: 'input',
    seq: state.seq++,
    x: state.x,
    y: state.y,
    btn: state.btn,
    presses: state.presses,
    ts: Date.now(),
    ...(signalsOn ? { sig: state.sig, go: state.go } : {}),
  });
}

function startPad() {
  if (started) return;
  started = true;
  store.set('pg.room', room);
  view('menu');
  const stick = nipplejs.create({ zone: $('zone'), mode: 'dynamic', color: 'white', size: 130, threshold: DEADZONE });
  stick.on('move', (e) => {
    const [x, y] = applyDeadzone(e.data.vector.x, -e.data.vector.y);
    state.x = x;
    state.y = y;
  });
  stick.on('start', () => $('stickhint').classList.add('active'));
  stick.on('end', () => {
    state.x = 0;
    state.y = 0;
    $('stickhint').classList.remove('active');
  });

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
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('#signals [data-sig]'))) {
    // the campaign's signal pad: a press = one signal; "¡Ya!" also holds `go`
    const kind = el.dataset.sig as SignalKind;
    let activePointer: number | null = null;
    const release = (e: PointerEvent) => {
      if (e.pointerId !== activePointer) return;
      activePointer = null;
      if (kind === 'go') state.go = false;
      el.classList.remove('down');
      sendInput();
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (activePointer !== null || !signalsOn) return;
      activePointer = e.pointerId;
      el.setPointerCapture(e.pointerId);
      state.sig = { kind, seq: (state.sig.seq + 1) % PRESS_MOD };
      if (kind === 'go') state.go = true;
      el.classList.add('down');
      try {
        navigator.vibrate?.(8);
      } catch {
        /* no vibration API (iOS) */
      }
      sendInput();
    });
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  }

  setInterval(sendInput, 1000 / INPUT_HZ);
  setInterval(() => {
    if (ws?.readyState !== WebSocket.OPEN) return;
    const id = pingId++;
    const t0 = Date.now();
    sent.set(id, { perf: performance.now(), t0 });
    if (sent.size > 20) sent.delete(sent.keys().next().value!);
    tx({ t: 'ping', id, t0, rtt: lastRtt, off: sync.offset ?? undefined });
  }, PING_MS);
  setInterval(() => {
    if (joined && lastRtt !== undefined) $('hud').textContent = `${label} | ${lastRtt.toFixed(0)} ms`;
  }, 1000);

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
