import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '@pichi/core';
import { startServer } from '../src/server';

// Arena is in development (`?soon=1`): the relay knows it, so the only barrier is who may set the lobby config. Only the screen may.
let srv: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  srv = await startServer({ port: 0, mode: 'none' });
});
afterAll(async () => {
  await srv.close();
});

const open = (query: string) => {
  const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws${query}`);
  const msgs: ServerMsg[] = [];
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
  const ready = new Promise<void>((r) => ws.once('open', () => r()));
  const next = async (t: ServerMsg['t']) => {
    const end = Date.now() + 2000;
    while (Date.now() < end) {
      const j = msgs.findIndex((m) => m.t === t);
      if (j >= 0) return msgs.splice(j, 1)[0]!;
      await new Promise((r) => setImmediate(r));
    }
    throw new Error(`timeout waiting for ${t}`);
  };
  return { ws, msgs, ready, next, send: (m: ClientMsg) => ws.send(JSON.stringify(m)) };
};
const settle = () => new Promise((r) => setTimeout(r, 120));

describe('relay: a game in development', () => {
  it('a phone asking for arena changes nothing in the room; the screen choosing it reaches the phones', async () => {
    const screen = open('?role=screen&room=c-arena');
    const a = open('?room=c-arena');
    await Promise.all([screen.ready, a.ready]);
    a.send({ t: 'join', name: 'Ana', token: 'a' });
    await a.next('joined');
    await a.next('config');
    a.send({ t: 'config', game: 'arena', difficulty: 'normal', map: 'auto', seed: 1 });
    await settle();
    expect(a.msgs.filter((m) => m.t === 'config')).toEqual([]); // no broadcast
    expect(srv.relay.rooms.get('c-arena')!.config.game).toBe('pizzas'); // the lobby did not move
    screen.send({ t: 'config', game: 'arena', difficulty: 'normal', map: 'auto', seed: 1 }); // what the screen sends under ?soon=1
    expect(await a.next('config')).toMatchObject({ game: 'arena' });
    [screen.ws, a.ws].forEach((w) => w.close());
  });
});
