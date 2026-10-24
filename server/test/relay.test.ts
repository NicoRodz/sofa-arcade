import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { SLOT_GRACE_MS, type ClientMsg, type ServerMsg } from '@party/shared';
import { startServer } from '../src/server';

let srv: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => { srv = await startServer({ port: 0, mode: 'none' }); });
afterAll(async () => { await srv.close(); });

class Client {
  ws: WebSocket;
  msgs: ServerMsg[] = [];
  constructor(query = '') {
    this.ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws${query}`);
    this.ws.on('message', (d) => this.msgs.push(JSON.parse(d.toString())));
  }
  open() { return new Promise<void>((r) => this.ws.once('open', () => r())); }
  send(m: ClientMsg | string) { this.ws.send(typeof m === 'string' ? m : JSON.stringify(m)); }
  async next<T extends ServerMsg['t']>(t: T): Promise<Extract<ServerMsg, { t: T }>> {
    // setImmediate + Date.now: keeps working while setTimeout is faked
    const end = Date.now() + 2000;
    while (Date.now() < end) {
      const j = this.msgs.findIndex((m) => m.t === t);
      if (j >= 0) return this.msgs.splice(j, 1)[0] as Extract<ServerMsg, { t: T }>;
      await new Promise((r) => setImmediate(r));
    }
    throw new Error(`timeout waiting for ${t}; got ${JSON.stringify(this.msgs)}`);
  }
}

const input = (n: number, presses = 0): ClientMsg =>
  ({ t: 'input', seq: n, x: 0.5, y: -1, btn: 0, presses: [presses], ts: Date.now() });

describe('relay', () => {
  it('join, input forwarding, ping/pong, rtt report and reconnect with token', async () => {
    const screen = new Client('?role=screen&room=t1');
    await screen.open();
    expect((await screen.next('state')).players).toEqual([]);

    const a = new Client('?room=t1');
    await a.open();
    a.send({ t: 'join', name: 'Ana', token: 'tok-a' });
    const joined = await a.next('joined');
    expect(joined.player).toMatchObject({ id: 1, name: 'Ana', slot: 0, connected: true });
    expect((await screen.next('player_joined')).player.name).toBe('Ana');

    a.send(input(7, 2));
    const fwd = await screen.next('input');
    expect(fwd).toMatchObject({ playerId: 1, seq: 7, x: 0.5, y: -1, presses: [2] });

    a.send({ t: 'ping', id: 5, t0: 123, rtt: 12.5, off: -40 });
    const pong = await a.next('pong');
    expect(pong).toMatchObject({ id: 5, t0: 123 });
    expect(pong.ts).toBeGreaterThan(1e12);
    expect(await screen.next('rtt')).toMatchObject({ playerId: 1, rtt: 12.5, off: -40 });

    a.send('not json');
    a.send({ t: 'input', seq: 'x' } as unknown as ClientMsg);
    a.send(input(8, 3));
    expect((await screen.next('input')).seq).toBe(8); // garbage was ignored, relay still alive

    a.ws.close();
    expect((await screen.next('player_left')).playerId).toBe(1);

    const a2 = new Client('?room=t1');
    await a2.open();
    a2.send({ t: 'join', name: 'Ana', token: 'tok-a' });
    expect((await a2.next('joined')).player.id).toBe(1); // same slot/circle
    expect((await screen.next('player_joined')).player.id).toBe(1);
    [screen.ws, a2.ws].forEach((w) => w.close());
  });

  it('ping from a screen gets a pong; inputs before join are dropped; rooms are isolated', async () => {
    const screen = new Client('?role=screen&room=t2');
    const other = new Client('?role=screen&room=t3');
    const c = new Client('?room=t2');
    await Promise.all([screen.open(), other.open(), c.open()]);
    screen.send({ t: 'ping', id: 1, t0: 1 });
    expect((await screen.next('pong')).id).toBe(1);
    c.send(input(1));
    c.send({ t: 'join', name: 'Bo', token: 'b' });
    await c.next('joined');
    c.send(input(2));
    expect((await screen.next('input')).seq).toBe(2);
    await new Promise((r) => setTimeout(r, 100));
    expect(other.msgs.filter((m) => m.t === 'input')).toEqual([]);
    [screen.ws, other.ws, c.ws].forEach((w) => w.close());
  });
});

const settle = async () => { for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r)); };

describe('phases', () => {
  it('screen phase changes reach every connected player; late joiners get the current phase; players cannot set it', async () => {
    const screen = new Client('?role=screen&room=p1');
    const a = new Client('?room=p1');
    const b = new Client('?room=p1');
    await Promise.all([screen.open(), a.open(), b.open()]);
    a.send({ t: 'join', name: 'Ana', token: 'a' });
    await a.next('joined');
    expect((await a.next('phase')).phase).toBe('lobby'); // phase right after joining

    screen.send({ t: 'phase', phase: 'playing' });
    expect((await a.next('phase')).phase).toBe('playing');

    b.send({ t: 'join', name: 'Bo', token: 'b' });
    await b.next('joined');
    expect((await b.next('phase')).phase).toBe('playing'); // late joiner

    b.send({ t: 'phase', phase: 'results' }); // not a screen: ignored
    await settle();
    expect(a.msgs.filter((m) => m.t === 'phase')).toEqual([]);

    screen.send({ t: 'phase', phase: 'results', scores: [{ id: 2, score: 5 }, { id: 1, score: 1 }] });
    expect(await a.next('phase')).toMatchObject({ phase: 'results', scores: [{ id: 2, score: 5 }, { id: 1, score: 1 }] });
    expect((await b.next('phase')).phase).toBe('results');
    [screen.ws, a.ws, b.ws].forEach((w) => w.close());
  });

  it('keeps the phase when a player reconnects with its token', async () => {
    const screen = new Client('?role=screen&room=p2');
    const a = new Client('?room=p2');
    await Promise.all([screen.open(), a.open()]);
    a.send({ t: 'join', name: 'Ana', token: 'a' });
    await a.next('joined');
    screen.send({ t: 'phase', phase: 'playing' });
    await a.next('phase');
    a.ws.close();
    await screen.next('player_left');
    const a2 = new Client('?room=p2');
    await a2.open();
    a2.send({ t: 'join', name: 'Ana', token: 'a' });
    expect((await a2.next('joined')).player.id).toBe(1);
    expect((await a2.next('phase')).phase).toBe('playing');
    [screen.ws, a2.ws].forEach((w) => w.close());
  });
});

describe('lobby config', () => {
  it('screen config reaches players and late joiners; players cannot set it', async () => {
    const screen = new Client('?role=screen&room=c1');
    const a = new Client('?room=c1');
    await Promise.all([screen.open(), a.open()]);
    a.send({ t: 'join', name: 'Ana', token: 'a' });
    await a.next('joined');
    expect(await a.next('config')).toMatchObject({ game: 'pizzas', difficulty: 'normal' }); // default right after joining

    a.send({ t: 'config', game: 'pizzas', difficulty: 'hard' }); // not a screen: ignored
    await settle();
    expect(a.msgs.filter((m) => m.t === 'config')).toEqual([]);

    screen.send({ t: 'config', game: 'pizzas', difficulty: 'hard' });
    expect((await a.next('config')).difficulty).toBe('hard');
    expect(srv.relay.rooms.get('c1')!.config).toEqual({ game: 'pizzas', difficulty: 'hard' });
    const b = new Client('?room=c1');
    await b.open();
    b.send({ t: 'join', name: 'Bo', token: 'b' });
    expect((await b.next('config')).difficulty).toBe('hard'); // late joiner
    [screen.ws, a.ws, b.ws].forEach((w) => w.close());
  });
});

describe('slot expiry', () => {
  afterEach(() => { vi.useRealTimers(); });

  const dropped = async (room: string) => {
    const screen = new Client(`?role=screen&room=${room}`);
    const a = new Client(`?room=${room}`);
    await Promise.all([screen.open(), a.open()]);
    a.send({ t: 'join', name: 'Ana', token: 'a' });
    await a.next('joined');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    a.ws.close();
    await screen.next('player_left');
    return screen;
  };

  it('frees the slot after 60 s without the phone', async () => {
    const screen = await dropped('e1');
    vi.advanceTimersByTime(SLOT_GRACE_MS - 1);
    await settle();
    expect(screen.msgs.filter((m) => m.t === 'player_removed')).toEqual([]);
    expect(srv.relay.rooms.get('e1')!.players.size).toBe(1);

    vi.advanceTimersByTime(1);
    expect((await screen.next('player_removed')).playerId).toBe(1);
    expect(srv.relay.rooms.get('e1')!.players.size).toBe(0);

    const b = new Client('?room=e1');
    await b.open();
    b.send({ t: 'join', name: 'Bo', token: 'b' });
    expect((await b.next('joined')).player).toMatchObject({ id: 2, slot: 0 }); // slot 0 is free again
    [screen.ws, b.ws].forEach((w) => w.close());
  });

  it('returning before 60 s cancels the expiry', async () => {
    const screen = await dropped('e2');
    vi.advanceTimersByTime(SLOT_GRACE_MS - 1000);
    const a2 = new Client('?room=e2');
    await a2.open();
    a2.send({ t: 'join', name: 'Ana', token: 'a' });
    expect((await a2.next('joined')).player.id).toBe(1);
    vi.advanceTimersByTime(SLOT_GRACE_MS * 2);
    await settle();
    expect(screen.msgs.filter((m) => m.t === 'player_removed')).toEqual([]);
    expect(srv.relay.rooms.get('e2')!.players.get(1)!.ws).not.toBeNull();
    [screen.ws, a2.ws].forEach((w) => w.close());
  });

  it('a second drop restarts the 60 s window instead of inheriting the first timer', async () => {
    const screen = await dropped('e3');
    vi.advanceTimersByTime(30_000);
    const a2 = new Client('?room=e3');
    await a2.open();
    a2.send({ t: 'join', name: 'Ana', token: 'a' });
    await a2.next('joined');
    a2.ws.close();
    await screen.next('player_left');
    vi.advanceTimersByTime(40_000); // 70 s after the first drop, 40 s after the second
    await settle();
    expect(screen.msgs.filter((m) => m.t === 'player_removed')).toEqual([]);
    vi.advanceTimersByTime(20_000);
    expect((await screen.next('player_removed')).playerId).toBe(1);
    screen.ws.close();
  });
});
