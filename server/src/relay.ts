import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  COLORS, DEFAULT_CONFIG, captainOf, PROTOCOL_VERSION, configMsg, DEFAULT_ROOM, MAX_PLAYERS, SLOT_GRACE_MS, WS_PATH, parseClientMessage, youMsg,
  type LobbyConfig, type PhaseInfo, type PublicPlayer, type ServerMsg,
} from '@party/shared';

interface Player {
  id: number;
  token: string;
  name: string;
  slot: number;
  ws: WebSocket | null;
  expiry?: ReturnType<typeof setTimeout>;
}
interface Room {
  players: Map<number, Player>;
  screens: Set<WebSocket>;
  nextId: number;
  phase: PhaseInfo;
  config: LobbyConfig;
  captain: number | null; // who holds the crown (see captainOf); only the relay knows who is connected, so it elects and tells everyone
}

const send = (ws: WebSocket, m: ServerMsg) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
};
// The team comes from the lobby teams the screen sent (it owns them), so a phone that reconnects with its token keeps it.
const teamIdOf = (r: Room, id: number) => r.config.teams?.find((t) => t.playerIds.includes(id))?.id ?? null;
const pub = (p: Player, r: Room): PublicPlayer => ({
  id: p.id, name: p.name, color: COLORS[p.slot % COLORS.length]!, slot: p.slot, connected: p.ws !== null, teamId: teamIdOf(r, p.id),
});

export function attachRelay(server: Server) {
  const rooms = new Map<string, Room>();
  const room = (code: string) => {
    let r = rooms.get(code);
    if (!r) rooms.set(code, (r = { players: new Map(), screens: new Set(), nextId: 1, phase: { phase: 'menu' }, config: DEFAULT_CONFIG, captain: null }));
    return r;
  };
  const toScreens = (r: Room, m: ServerMsg) => {
    const s = JSON.stringify(m);
    for (const ws of r.screens) if (ws.readyState === WebSocket.OPEN) ws.send(s);
  };

  const toPlayers = (r: Room, m: ServerMsg) => {
    for (const p of r.players.values()) if (p.ws) send(p.ws, m);
  };

  // Re-elects the Captain after anyone joins or drops. Tells everyone when it changed; `to` also gets it when it did not (a socket that just arrived).
  const syncCaptain = (r: Room, to?: WebSocket) => {
    const next = captainOf([...r.players.values()].map((p) => ({ id: p.id, connected: p.ws !== null })));
    if (next !== r.captain) {
      r.captain = next;
      const m: ServerMsg = { t: 'captain', playerId: next };
      toScreens(r, m);
      toPlayers(r, m);
    } else if (to) send(to, { t: 'captain', playerId: next });
  };

  const sendYou = (r: Room, p: Player) => {
    const you = youMsg(r.config.teams, p.id);
    if (you && p.ws) send(p.ws, you);
  };

  const wss = new WebSocketServer({ server, path: WS_PATH });
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '', 'http://x');
    const r = room(url.searchParams.get('room') || DEFAULT_ROOM);
    const isScreen = url.searchParams.get('role') === 'screen';
    let me: Player | null = null;

    if (isScreen) {
      r.screens.add(ws);
      send(ws, { t: 'state', players: [...r.players.values()].map((p) => pub(p, r)) });
      send(ws, { t: 'captain', playerId: r.captain });
    }

    ws.on('message', (data) => {
      const m = parseClientMessage(data.toString());
      if (!m) return;
      if (m.t === 'ping') {
        send(ws, { t: 'pong', id: m.id, t0: m.t0, ts: Date.now() });
        if (me && m.rtt !== undefined && m.off !== undefined) {
          toScreens(r, { t: 'rtt', playerId: me.id, rtt: m.rtt, off: m.off });
        }
        return;
      }
      if (m.t === 'phase') {
        if (!isScreen) return;
        r.phase = { phase: m.phase, scores: m.scores, puestos: m.puestos, match: m.match };
        toPlayers(r, { t: 'phase', ...r.phase });
        return;
      }
      if (m.t === 'buzz') {
        const to = r.players.get(m.playerId);
        if (isScreen && to?.ws) send(to.ws, { t: 'buzz', kind: m.kind });
        return;
      }
      if (m.t === 'config') {
        if (!isScreen) return;
        const { t: _t, ...cfg } = m;
        r.config = { ...DEFAULT_CONFIG, ...cfg }; // the parser already filled the team fields; the spread only satisfies the type
        toPlayers(r, configMsg(r.config));
        for (const p of r.players.values()) sendYou(r, p);
        return;
      }
      if (isScreen) return;
      if (m.t === 'join') {
        let p = [...r.players.values()].find((x) => x.token === m.token);
        if (!p) {
          const used = new Set([...r.players.values()].map((x) => x.slot));
          let slot = 0;
          while (used.has(slot)) slot++;
          if (slot >= MAX_PLAYERS) {
            send(ws, { t: 'error', reason: 'room full' });
            ws.close();
            return;
          }
          p = { id: r.nextId++, token: m.token, name: m.name, slot, ws: null };
          r.players.set(p.id, p);
        } else {
          p.name = m.name;
          if (p.ws && p.ws !== ws) p.ws.close();
        }
        clearTimeout(p.expiry);
        p.ws = ws;
        me = p;
        send(ws, { t: 'joined', player: pub(p, r), room: url.searchParams.get('room') || DEFAULT_ROOM, v: PROTOCOL_VERSION });
        send(ws, configMsg(r.config));
        sendYou(r, p);
        send(ws, { t: 'phase', ...r.phase });
        toScreens(r, { t: 'player_joined', player: pub(p, r) });
        syncCaptain(r, ws);
        return;
      }
      if (m.t === 'nav' && me) {
        // The Captain's D-pad only; `from` comes from the socket (set at join), so nothing in the payload can pose as someone else.
        if (r.captain === me.id) toScreens(r, { t: 'nav', from: me.id, key: m.key });
        return;
      }
      if (m.t === 'setTeam' && me) {
        toScreens(r, { t: 'setTeam', playerId: me.id, teamId: m.teamId });
        return;
      }
      if (m.t === 'puesto' && me) {
        toScreens(r, { t: 'puesto', playerId: me.id, puestos: m.puestos });
        return;
      }
      if (m.t === 'input' && me) {
        const { t: _t, ...rest } = m;
        toScreens(r, { t: 'input', playerId: me.id, ...rest });
      }
    });

    ws.on('close', () => {
      r.screens.delete(ws);
      if (me && me.ws === ws) {
        me.ws = null;
        toScreens(r, { t: 'player_left', playerId: me.id });
        syncCaptain(r);
        const p = me;
        p.expiry = setTimeout(() => {
          if (p.ws) return;
          r.players.delete(p.id);
          toScreens(r, { t: 'player_removed', playerId: p.id });
        }, SLOT_GRACE_MS);
        p.expiry.unref?.();
      }
    });
  });

  return { wss, rooms };
}
