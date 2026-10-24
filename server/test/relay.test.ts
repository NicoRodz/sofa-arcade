import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '@party/shared';
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
    for (let i = 0; i < 100; i++) {
      const j = this.msgs.findIndex((m) => m.t === t);
      if (j >= 0) return this.msgs.splice(j, 1)[0] as Extract<ServerMsg, { t: T }>;
      await new Promise((r) => setTimeout(r, 20));
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
