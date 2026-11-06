// The socket's corners that app.test.ts does not reach: which sockets connect() reuses, the stale socket that closes late, what the join carries,
// and the ping loop (nothing goes out on a dead socket, the pong that matches gives the RTT, the table of pending pings stays at 20).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MENU_CAP, WS_PATH, type ServerMsg } from '@pichi/core';
import { createClock, createConnection } from './connect';
import type { Session } from './store';

class FakeSocket {
  static all: FakeSocket[] = [];
  static OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send = (d: string) => this.sent.push(d);
  close = () => {
    this.readyState = 3;
    this.onclose?.();
  };
}

const hud = { textContent: '' };
const session = (over: Partial<Session> = {}) =>
  ({ $: () => hud, ws: null, joined: false, halted: false, room: 'r', token: 'tok', name: 'Ana', label: '', ...over }) as unknown as Session;
const sentOf = (sock: FakeSocket) => sock.sent.map((x) => JSON.parse(x) as Record<string, unknown>);

beforeEach(() => {
  FakeSocket.all = [];
  hud.textContent = '';
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('location', { host: 'h:1' });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('connect()', () => {
  const setup = (s: Session, dispatch: (m: ServerMsg) => void = () => {}) => {
    const render = vi.fn();
    const connect = createConnection(s, { dispatch, clock: createClock(s), cap: { render } as never, joinExtra: () => ({ extra: 7 }) });
    return { connect, render };
  };
  it('opens the room of the session on the relay path, escaped', () => {
    const s = session({ room: 'sala 1&x' });
    setup(s).connect();
    expect(FakeSocket.all[0]!.url).toBe(`ws://h:1${WS_PATH}?room=sala%201%26x`);
  });
  it('does not open a second socket while one is connecting or open', () => {
    const s = session();
    const { connect } = setup(s);
    connect();
    connect();
    FakeSocket.all[0]!.readyState = 1;
    connect();
    expect(FakeSocket.all).toHaveLength(1);
  });
  it('opens a new one once the old one is closing or closed', () => {
    const s = session();
    const { connect } = setup(s);
    connect();
    FakeSocket.all[0]!.readyState = 2;
    connect();
    expect(FakeSocket.all).toHaveLength(2);
  });
  it('a fresh connect lifts the halt of a refused phone', () => {
    const s = session({ halted: true });
    setup(s).connect();
    expect(s.halted).toBe(false);
  });
  it('the join carries the menu capability and what the games add', () => {
    const s = session();
    setup(s).connect();
    FakeSocket.all[0]!.readyState = 1;
    FakeSocket.all[0]!.onopen?.();
    expect(sentOf(FakeSocket.all[0]!)[0]).toEqual({ t: 'join', name: 'Ana', token: 'tok', caps: [MENU_CAP], extra: 7 });
  });
  it('hands every message of the relay to dispatch, parsed', () => {
    const got: ServerMsg[] = [];
    setup(session(), (m) => got.push(m)).connect();
    FakeSocket.all[0]!.onmessage?.({ data: JSON.stringify({ t: 'captain', playerId: 3 }) });
    expect(got).toEqual([{ t: 'captain', playerId: 3 }]);
  });
  it('a stale socket that closes after its replacement changes nothing: no hud, no second retry', () => {
    const s = session();
    const { connect, render } = setup(s);
    connect();
    const old = FakeSocket.all[0]!;
    old.readyState = 3; // dropped without telling us yet
    connect(); // the page came back to the foreground
    s.joined = true;
    old.onclose?.();
    expect(s.joined).toBe(true);
    expect(render).not.toHaveBeenCalled();
    expect(hud.textContent).toBe('');
    vi.advanceTimersByTime(2000);
    expect(FakeSocket.all).toHaveLength(2);
  });
  it('a halted phone still redraws on close but keeps the reason on the hud', () => {
    const s = session();
    const { connect, render } = setup(s);
    connect();
    s.halted = true;
    hud.textContent = 'room full';
    FakeSocket.all[0]!.close();
    expect(render).toHaveBeenCalledTimes(1);
    expect(hud.textContent).toBe('room full');
  });
});

describe('the ping loop', () => {
  const live = () => {
    const s = session();
    const sock = new FakeSocket('x');
    sock.readyState = 1;
    s.ws = sock as never;
    return { s, sock, clock: createClock(s) };
  };
  it('sends nothing when the socket is not open', () => {
    const s = session();
    const clock = createClock(s);
    clock.ping();
    s.ws = new FakeSocket('x') as never; // still connecting
    clock.ping();
    expect((s.ws as unknown as FakeSocket).sent).toEqual([]);
  });
  it('numbers the pings and sends the last RTT with the next one', () => {
    const { sock, clock } = live();
    clock.ping();
    vi.advanceTimersByTime(40);
    clock.pong({ t: 'pong', id: 0, ts: Date.now() } as never);
    expect(clock.rtt()).toBeGreaterThanOrEqual(40);
    clock.ping();
    const [a, b] = sentOf(sock);
    expect(a).toMatchObject({ t: 'ping', id: 0 });
    expect(a!.rtt).toBeUndefined();
    expect(b).toMatchObject({ t: 'ping', id: 1, rtt: clock.rtt() });
  });
  it('counts a pong once: the second one for the same id is ignored', () => {
    const { clock } = live();
    clock.ping();
    vi.advanceTimersByTime(30);
    clock.pong({ t: 'pong', id: 0, ts: 0 } as never);
    const first = clock.rtt();
    vi.advanceTimersByTime(500);
    clock.pong({ t: 'pong', id: 0, ts: 0 } as never);
    expect(clock.rtt()).toBe(first);
  });
  it('an unknown pong leaves the RTT unset', () => {
    const { clock } = live();
    clock.pong({ t: 'pong', id: 5, ts: 0 } as never);
    expect(clock.rtt()).toBeUndefined();
  });
  it('remembers at most 20 pings: the oldest unanswered one is forgotten', () => {
    const { clock } = live();
    for (let i = 0; i < 22; i++) clock.ping();
    clock.pong({ t: 'pong', id: 0, ts: 0 } as never);
    expect(clock.rtt()).toBeUndefined();
    clock.pong({ t: 'pong', id: 2, ts: 0 } as never);
    expect(clock.rtt()).toBeDefined();
  });
});
