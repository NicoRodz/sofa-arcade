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
    a.send({ t: 'config', game: 'arena', modeId: 'versus', difficulty: 'normal', map: 'auto', seed: 1 });
    await settle();
    expect(a.msgs.filter((m) => m.t === 'config')).toEqual([]); // no broadcast
    expect(srv.relay.rooms.get('c-arena')!.config.game).toBe('pizzas'); // the lobby did not move
    screen.send({ t: 'config', game: 'arena', modeId: 'versus', difficulty: 'normal', map: 'auto', seed: 1 }); // what the screen sends under ?soon=1
    expect(await a.next('config')).toMatchObject({ game: 'arena' });
    [screen.ws, a.ws].forEach((w) => w.close());
  });
});

// Protocol v7 (F9): the six new buzz kinds and the `st` / `card` of a hint cross the relay to the phone they name, and only that one; a v6 hint stays as it was.
describe('relay: protocol v7 (the phone of Manchazo)', () => {
  const kinds = ['stain', 'rescued', 'lootlost', 'dizzy', 'phase', 'hourglass'] as const;
  it('the new buzz kinds reach the named phone; a phone cannot send them to another; an unknown kind is dropped', async () => {
    const screen = open('?role=screen&room=v7-buzz');
    const a = open('?room=v7-buzz');
    const b = open('?room=v7-buzz');
    await Promise.all([screen.ready, a.ready, b.ready]);
    a.send({ t: 'join', name: 'Ana', token: 'a' });
    b.send({ t: 'join', name: 'Beto', token: 'b' });
    const idA = ((await a.next('joined')) as Extract<ServerMsg, { t: 'joined' }>).player.id;
    const idB = ((await b.next('joined')) as Extract<ServerMsg, { t: 'joined' }>).player.id;
    await a.next('phase');
    await b.next('phase');
    a.send({ t: 'buzz', playerId: idB, kind: 'stain' }); // a phone cannot buzz another one
    screen.ws.send(JSON.stringify({ t: 'buzz', playerId: idA, kind: 'from-the-future' }));
    for (const kind of kinds) {
      screen.send({ t: 'buzz', playerId: idA, kind });
      expect(await a.next('buzz')).toEqual({ t: 'buzz', kind });
    }
    await settle();
    expect(a.msgs.filter((m) => m.t === 'buzz')).toEqual([]); // the unknown kind never arrived
    expect(b.msgs.filter((m) => m.t === 'buzz')).toEqual([]);
    [screen.ws, a.ws, b.ws].forEach((w) => w.close());
  });
  it('a hint carries `st` and `card` to its phone; an unknown status or a malformed card is dropped and the labels still go through; a v6 hint has neither key', async () => {
    const screen = open('?role=screen&room=v7-hint');
    const a = open('?room=v7-hint');
    await Promise.all([screen.ready, a.ready]);
    a.send({ t: 'join', name: 'Ana', token: 'a' });
    const idA = ((await a.next('joined')) as Extract<ServerMsg, { t: 'joined' }>).player.id;
    await a.next('phase');
    screen.send({ t: 'hint', playerId: idA, a: '¡Mareado!', b: 'Pegote', st: 'dizzy', card: 'glue' });
    expect(await a.next('hint')).toEqual({ t: 'hint', a: '¡Mareado!', b: 'Pegote', st: 'dizzy', card: 'glue' });
    screen.ws.send(JSON.stringify({ t: 'hint', playerId: idA, a: 'x', b: null, st: 'frozen', card: 'Not A Card' }));
    expect(await a.next('hint')).toEqual({ t: 'hint', a: 'x', b: null });
    screen.send({ t: 'hint', playerId: idA, a: 'Cargar', b: null });
    expect(await a.next('hint')).toEqual({ t: 'hint', a: 'Cargar', b: null });
    [screen.ws, a.ws].forEach((w) => w.close());
  });
});
