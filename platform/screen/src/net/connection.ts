// The screen's side of the relay protocol: connect (and reconnect), the player table the messages keep up to date, and the dispatch of
// each message to the shell or, when the shell does not own it, to the games. Moved out of apps/screen/src/main.ts (F4b).
import { PING_MS, PressTracker, WS_PATH, acceptNav, navToKey, remoteBlocked, type PublicPlayer, type ServerMsg } from '@pichi/core';
import { app, renderUi, services, sync } from '../shell/app-state';
import { games } from '../shell/game';
import { onKey } from '../vote/dpad-vote';
import { onMenuAct, scheduleMenu } from '../lobby/menu-bridge';
import { latency, queueLag, record } from './latency';
import { sendMsg, setSocket, socket } from './socket';

function upsert(info: PublicPlayer, reset = false) {
  let p = app.players.get(info.id);
  const fresh = !p;
  if (!p) {
    p = {
      info,
      ctl: { x: 0, y: 0, b: false },
      pendA: 0,
      pendB: 0,
      tracker: new PressTracker(),
      rtt: [],
      lag: [],
      off: null,
      pkts: 0,
      pktsRate: 0,
    };
    app.players.set(info.id, p);
    for (const g of games().list()) g.players?.joined?.(p);
    services.playerJoined();
  }
  const back = !fresh && !p.info.connected && info.connected;
  p.info = info;
  if (reset) p.ctl = { x: 0, y: 0, b: false };
  for (const g of games().list()) g.players?.updated?.(p, back);
  renderUi();
}

function remove(id: number) {
  const p = app.players.get(id);
  if (!p) return;
  app.players.delete(id);
  for (const g of games().list()) g.players?.removed?.(p);
  renderUi();
}

export function onMessage(m: ServerMsg) {
  switch (m.t) {
    case 'state': {
      const ids = new Set(m.players.map((i) => i.id));
      for (const id of [...app.players.keys()]) if (!ids.has(id)) remove(id);
      m.players.forEach((i) => upsert(i, true));
      break;
    }
    case 'player_joined':
      upsert(m.player, true);
      break;
    case 'player_left': {
      const p = app.players.get(m.playerId);
      if (p) {
        p.info.connected = false;
        p.ctl = { x: 0, y: 0, b: false };
        for (const g of games().list()) g.players?.left?.(p);
        renderUi();
      }
      break;
    }
    case 'player_removed':
      remove(m.playerId);
      break;
    case 'appearance': {
      const p = app.players.get(m.playerId);
      if (p) {
        p.info = { ...p.info, ap: m.ap, customizing: m.customizing };
        renderUi();
      }
      break;
    }
    case 'captain':
      app.captainId = m.playerId;
      renderUi();
      scheduleMenu(true); // a new Captain (or one that came back) gets the form even if nothing in it changed
      break;
    case 'menuAct':
      onMenuAct(m); // the Captain's touch: absolute values, judged by the game against its own state
      break;
    case 'nav': {
      // the Captain's D-pad: the same handler as the keyboard, fed with the key that intent stands for
      if (!acceptNav(app.captainId, m.from) || remoteBlocked(app.lastKeyAt, performance.now())) break;
      onKey(navToKey(m.key), false);
      break;
    }
    case 'rtt': {
      const p = app.players.get(m.playerId);
      if (p) {
        p.off = m.off;
        record('rtt', p, m.rtt);
      }
      break;
    }
    case 'pong': {
      latency.screenRtt = performance.now() - m.id;
      sync.add(latency.screenRtt, m.t0, m.ts);
      break;
    }
    case 'input': {
      const p = app.players.get(m.playerId);
      if (!p) return;
      latency.totalPkts++;
      p.pkts++;
      p.ctl = { x: m.x, y: m.y, b: (m.btn & 2) !== 0 };
      p.ctlAt = performance.now();
      for (const g of games().list()) g.players?.input?.(p, m); // the last packet of every phone
      const delta = p.tracker.update(m.presses);
      if (delta.some((d) => d > 0)) {
        p.pendA += delta[0] ?? 0;
        p.pendB += delta[1] ?? 0;
        if (p.off !== null) queueLag(p.info.id, m.ts + p.off);
      }
      break;
    }
    default:
      for (const g of games().list()) g.message?.(m); // setTeam, schoolDone, assist, puesto: the games own them
  }
}

export function connect() {
  const ws = new WebSocket(`ws://${location.host}${WS_PATH}?role=screen&room=${encodeURIComponent(app.room)}`);
  setSocket(ws);
  ws.onopen = () => {
    sendMsg({ t: 'config', ...app.config });
    sendMsg({ t: 'phase', phase: app.phase });
  };
  ws.onmessage = (ev) => onMessage(JSON.parse(ev.data));
  ws.onclose = () => setTimeout(connect, 500);
}

export function startConnection() {
  connect();
  setInterval(() => {
    const ws = socket();
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    // id carries the perf timestamp so RTT keeps sub-ms precision
    ws.send(JSON.stringify({ t: 'ping', id: performance.now(), t0: Date.now() }));
  }, PING_MS);
}
