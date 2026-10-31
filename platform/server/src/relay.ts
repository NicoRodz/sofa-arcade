import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  COLORS,
  captainOf,
  hintExtras,
  PROTOCOL_VERSION,
  MENU_CAP,
  configMsgOf,
  DEFAULT_ROOM,
  MAX_PLAYERS,
  SLOT_GRACE_MS,
  WS_PATH,
  APPEARANCE_PHASES,
  defaultAppearance,
  sanitizeAppearance,
  youMsg,
  type Appearance,
  type ClientMsg,
  type LobbyConfig,
  type PhaseInfo,
  type PublicPlayer,
  type ServerMsg,
} from '@pichi/core';
import type { GameCatalog } from '@pichi/core/contract';
import { createLastWins } from './appearance-guard';
import { actFits, createRateLimiter, menuFits } from './menu-guard';

interface Player {
  id: number;
  token: string;
  name: string;
  slot: number;
  ws: WebSocket | null;
  assist?: true; // Ayudante, chosen from the phone in the lobby; it stays with the slot (a reconnect with the token keeps it)
  caps?: string[]; // what this phone announced when it joined (MENU_CAP: it draws the Captain's touch menu)
  ap: Appearance; // the sanitized look; it stays with the slot (a reconnect with the token keeps it)
  customizing?: true; // in the character creator now (only a phone that sent `ap` ever is)
  school?: true; // this phone did (or skipped) the Cocina escuela; it stays with the slot like assist
  expiry?: ReturnType<typeof setTimeout>;
}
interface Room {
  players: Map<number, Player>;
  screens: Set<WebSocket>;
  nextId: number;
  phase: PhaseInfo;
  config: LobbyConfig;
  captain: number | null; // who holds the crown (see captainOf); only the relay knows who is connected, so it elects and tells everyone
  menu: string | null; // the last `menu` snapshot of the screen as sent on the wire: a Captain that arrives (or changes) gets it at once
}

const send = (ws: WebSocket, m: ServerMsg) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
};
// The team comes from the lobby teams the screen sent (it owns them), so a phone that reconnects with its token keeps it.
const teamIdOf = (r: Room, id: number) => r.config.teams?.find((t) => t.playerIds.includes(id))?.id ?? null;
const pub = (p: Player, r: Room): PublicPlayer => ({
  id: p.id,
  name: p.name,
  color: COLORS[p.slot % COLORS.length]!,
  slot: p.slot,
  connected: p.ws !== null,
  teamId: teamIdOf(r, p.id),
  ap: p.ap,
  ...(p.customizing ? { customizing: true } : {}),
  ...(p.assist ? { assist: true as const } : {}),
  ...(p.school ? { school: true as const } : {}),
});

/** What the composition root hands the relay: the games it knows (config validation lives in `parse`), how to read a client frame and the lobby a room starts with. */
export interface RelayDeps {
  catalog: GameCatalog;
  parse(raw: string): ClientMsg | null;
  defaultConfig: LobbyConfig;
}

export function attachRelay(server: Server, { catalog, parse, defaultConfig }: RelayDeps) {
  const configFor = (cfg: LobbyConfig) => configMsgOf(cfg, catalog.info(cfg.game, cfg.modeId));
  const rooms = new Map<string, Room>();
  const room = (code: string) => {
    let r = rooms.get(code);
    if (!r)
      rooms.set(
        code,
        (r = {
          players: new Map(),
          screens: new Set(),
          nextId: 1,
          phase: { phase: 'menu' },
          config: defaultConfig,
          captain: null,
          menu: null,
        }),
      );
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
      sendMenu(r);
    } else if (to) {
      send(to, { t: 'captain', playerId: next });
      sendMenu(r);
    }
  };
  // The menu goes to the Captain alone, and only when that phone can draw it (an older phone keeps its D-pad).
  const sendMenu = (r: Room, raw: string | null = r.menu) => {
    const c = r.captain === null ? undefined : r.players.get(r.captain);
    if (raw && c?.ws && c.caps?.includes(MENU_CAP) && c.ws.readyState === WebSocket.OPEN) c.ws.send(raw);
  };

  const appearanceMsg = (p: Player): ServerMsg => ({ t: 'appearance', playerId: p.id, ap: p.ap, customizing: !!p.customizing });

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
    const actAllowed = createRateLimiter(); // menuAct per second of this connection
    const appearanceGate = createLastWins<{ ap: Record<string, unknown>; done: boolean }>((a) => {
      // lobby / home / results only; `playerId` is the socket's player, never the payload's
      if (!me || !APPEARANCE_PHASES.includes(r.phase.phase)) return;
      me.ap = sanitizeAppearance(a.ap, me.slot);
      if (a.done) delete me.customizing;
      else me.customizing = true;
      const am = appearanceMsg(me);
      toScreens(r, am);
      toPlayers(r, am);
    });

    if (isScreen) {
      r.screens.add(ws);
      send(ws, { t: 'state', players: [...r.players.values()].map((p) => pub(p, r)) });
      send(ws, { t: 'captain', playerId: r.captain });
    }

    ws.on('message', (data) => {
      const raw = data.toString();
      const m = parse(raw);
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
        r.phase = { phase: m.phase, scores: m.scores, puestos: m.puestos, match: m.match, result: m.result };
        if (m.phase !== 'lobby') r.menu = null; // the form belongs to the lobby
        toPlayers(r, { t: 'phase', ...r.phase });
        if (!APPEARANCE_PHASES.includes(m.phase))
          for (const p of r.players.values())
            if (p.customizing) {
              delete p.customizing; // the match starts: the look is forced as it stands
              const am = appearanceMsg(p);
              toScreens(r, am);
              toPlayers(r, am);
            }
        return;
      }
      if (m.t === 'buzz') {
        const to = r.players.get(m.playerId);
        if (isScreen && to?.ws) send(to.ws, { t: 'buzz', kind: m.kind });
        return;
      }
      if (m.t === 'hint') {
        const to = r.players.get(m.playerId);
        if (isScreen && to?.ws) send(to.ws, { t: 'hint', a: m.a, b: m.b, ...hintExtras(m) });
        return;
      }
      if (m.t === 'school') {
        // the screen tells one phone where its chef is in the Cocina escuela
        const to = r.players.get(m.playerId);
        if (isScreen && to?.ws)
          send(to.ws, {
            t: 'school',
            step: m.step,
            total: m.total,
            text: m.text,
            ...(m.btn ? { btn: m.btn } : {}),
            ...(m.done ? { done: true as const } : {}),
          });
        return;
      }
      if (m.t === 'menu' || m.t === 'menuErr') {
        // screen -> Captain only: re-parsed by the protocol, so what is forwarded is exactly what was validated
        if (!isScreen || !menuFits(raw)) return;
        const { t: _t, ...body } = m;
        const out = JSON.stringify({ t: m.t, ...body });
        if (m.t === 'menu') r.menu = out;
        sendMenu(r, out);
        return;
      }
      if (m.t === 'config') {
        if (!isScreen) return;
        const { t: _t, ...cfg } = m;
        r.config = { ...defaultConfig, ...cfg }; // the parser already filled the team fields; the spread only satisfies the type
        toPlayers(r, configFor(r.config));
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
          p = {
            id: r.nextId++,
            token: m.token,
            name: m.name,
            slot,
            ws: null,
            ap: m.ap ? sanitizeAppearance(m.ap, slot) : defaultAppearance(slot), // an old phone sends none: seeded by its slot
            ...(m.ap ? { customizing: true as const } : {}),
          };
          r.players.set(p.id, p);
        } else {
          p.name = m.name;
          if (p.ws && p.ws !== ws) p.ws.close();
        }
        p.caps = m.caps ?? [];
        clearTimeout(p.expiry);
        p.ws = ws;
        me = p;
        send(ws, { t: 'joined', player: pub(p, r), room: url.searchParams.get('room') || DEFAULT_ROOM, v: PROTOCOL_VERSION });
        send(ws, configFor(r.config));
        sendYou(r, p);
        if (p.assist) send(ws, { t: 'assist', playerId: p.id, on: true }); // a phone that comes back remembers its choice
        send(ws, { t: 'phase', ...r.phase });
        toScreens(r, { t: 'player_joined', player: pub(p, r) });
        if (m.ap) for (const o of r.players.values()) if (o !== p) send(ws, appearanceMsg(o)); // the creator's "same as Ana" hint needs the others
        syncCaptain(r, ws);
        return;
      }
      if (m.t === 'nav' && me) {
        // The Captain's D-pad only; `from` comes from the socket (set at join), so nothing in the payload can pose as someone else.
        if (r.captain === me.id) toScreens(r, { t: 'nav', from: me.id, key: m.key });
        return;
      }
      if (m.t === 'menuAct' && me) {
        // The Captain's touch, stamped like nav: `from` is the socket's player. Shape was parsed; here its size and pace, and who sent it.
        if (r.captain === me.id && actFits(raw) && actAllowed()) toScreens(r, { ...m, from: me.id });
        return;
      }
      if (m.t === 'schoolDone' && me) {
        // it stays with the slot; the screen hears it every time (a "Saltar" during the school needs the nudge even when it was known)
        me.school = true;
        toScreens(r, { t: 'schoolDone', playerId: me.id, ...(m.skip ? { skip: true as const } : {}) });
        return;
      }
      if (m.t === 'appearance' && me) {
        appearanceGate.push(m);
        return;
      }
      if (m.t === 'assist' && me) {
        if (r.phase.phase === 'playing' || r.phase.phase === 'school' || !!me.assist === m.on) return; // the round (and the school) have their chefs: the choice is for the lobby
        if (m.on) me.assist = true;
        else delete me.assist;
        const msg: ServerMsg = { t: 'assist', playerId: me.id, on: m.on };
        toScreens(r, msg);
        send(ws, msg);
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
      appearanceGate.dispose();
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
