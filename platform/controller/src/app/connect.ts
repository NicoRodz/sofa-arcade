// The socket: connect, rejoin after a drop, and the ping that keeps the clock offset with the screen.
import { ClockSync, MENU_CAP, PING_MS, WS_PATH, type ServerMsg } from '@pichi/core';
import { send, setHud, type Session } from './store';
import type { Captain } from './captain';

export function createClock(s: Session) {
  const sync = new ClockSync();
  const sent = new Map<number, { perf: number; t0: number }>();
  let pingId = 0;
  let lastRtt: number | undefined;
  let lastPong = 0;
  return {
    stamp: () => {
      lastPong = Date.now();
    },
    silent: () => Date.now() - lastPong > 3 * PING_MS,
    rtt: () => lastRtt,
    pong(m: Extract<ServerMsg, { t: 'pong' }>) {
      lastPong = Date.now();
      const x = sent.get(m.id);
      if (!x) return;
      sent.delete(m.id);
      lastRtt = performance.now() - x.perf;
      sync.add(lastRtt, x.t0, m.ts);
    },
    ping() {
      if (s.ws?.readyState !== WebSocket.OPEN) return;
      const id = pingId++;
      const t0 = Date.now();
      sent.set(id, { perf: performance.now(), t0 });
      if (sent.size > 20) sent.delete(sent.keys().next().value!);
      send(s, { t: 'ping', id, t0, rtt: lastRtt, off: sync.offset ?? undefined });
    },
  };
}
export type Clock = ReturnType<typeof createClock>;

export function createConnection(
  s: Session,
  d: { dispatch: (m: ServerMsg) => void; clock: Clock; cap: Captain; joinExtra: () => Record<string, unknown> },
) {
  function connect() {
    if (s.ws && s.ws.readyState <= WebSocket.OPEN) return;
    s.halted = false;
    const sock = new WebSocket(`ws://${location.host}${WS_PATH}?room=${encodeURIComponent(s.room)}`);
    s.ws = sock;
    sock.onopen = () => {
      d.clock.stamp();
      send(s, { t: 'join', name: s.name, token: s.token, caps: [MENU_CAP], ...d.joinExtra() });
    };
    sock.onmessage = (ev) => d.dispatch(JSON.parse(ev.data) as ServerMsg);
    sock.onclose = () => {
      if (sock !== s.ws) return;
      s.joined = false;
      d.cap.render();
      if (s.halted) return;
      setHud(s, 'reconnecting...');
      setTimeout(connect, 500);
    };
  }
  return connect;
}
