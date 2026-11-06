import { describe, expect, it } from 'vitest';
import type { ClientMsg } from '@pichi/core';
import { Client, input, settle, useRelayServer } from './relay.kit';

useRelayServer();

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

    a.send({ ...input(9, 3), sig: { kind: 'go', seq: 4 }, go: true } as ClientMsg);
    expect(await screen.next('input')).toMatchObject({ playerId: 1, seq: 9, sig: { kind: 'go', seq: 4 }, go: true }); // the campaign's signals reach the screen

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

describe('phases', () => {
  it('screen phase changes reach every connected player; late joiners get the current phase; players cannot set it', async () => {
    const screen = new Client('?role=screen&room=p1');
    const a = new Client('?room=p1');
    const b = new Client('?room=p1');
    await Promise.all([screen.open(), a.open(), b.open()]);
    a.send({ t: 'join', name: 'Ana', token: 'a' });
    await a.next('joined');
    expect((await a.next('phase')).phase).toBe('menu'); // phase right after joining: the screen is still choosing the game

    screen.send({ t: 'phase', phase: 'playing' });
    expect((await a.next('phase')).phase).toBe('playing');

    b.send({ t: 'join', name: 'Bo', token: 'b' });
    await b.next('joined');
    expect((await b.next('phase')).phase).toBe('playing'); // late joiner

    b.send({ t: 'phase', phase: 'results' }); // not a screen: ignored
    await settle();
    expect(a.msgs.filter((m) => m.t === 'phase')).toEqual([]);

    screen.send({
      t: 'phase',
      phase: 'results',
      scores: [
        { id: 2, score: 5 },
        { id: 1, score: 1 },
      ],
    });
    expect(await a.next('phase')).toMatchObject({
      phase: 'results',
      scores: [
        { id: 2, score: 5 },
        { id: 1, score: 1 },
      ],
    });
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

describe('puestos', () => {
  const puestos = {
    cheese: false,
    sink: false,
    assign: [{ id: 1, puestos: ['masa' as const, 'horno' as const], pool: ['masa' as const, 'corte' as const, 'horno' as const] }],
  };

  it('the round puestos reach the phones, late joiners included; "Cambiar" is forwarded to the screen only when the sender joined', async () => {
    const screen = new Client('?role=screen&room=pu1');
    const a = new Client('?room=pu1');
    await Promise.all([screen.open(), a.open()]);
    a.send({ t: 'puesto', puestos: ['corte'] }); // before joining: dropped
    a.send({ t: 'join', name: 'Ana', token: 'a' });
    await a.next('joined');
    await a.next('phase'); // menu, right after joining
    screen.send({ t: 'phase', phase: 'playing', puestos });
    expect(await a.next('phase')).toMatchObject({ phase: 'playing', puestos });
    a.send({ t: 'puesto', puestos: ['corte'] });
    expect(await screen.next('puesto')).toEqual({ t: 'puesto', playerId: 1, puestos: ['corte'] });
    a.ws.close();
    await screen.next('player_left');
    const a2 = new Client('?room=pu1');
    await a2.open();
    a2.send({ t: 'join', name: 'Ana', token: 'a' });
    await a2.next('joined');
    expect(await a2.next('phase')).toMatchObject({ phase: 'playing', puestos }); // reconnecting phone gets its card back
    screen.send({ t: 'phase', phase: 'lobby' });
    expect((await a2.next('phase')).puestos).toBeUndefined();
    [screen.ws, a2.ws].forEach((w) => w.close());
  });
});

describe('buzz', () => {
  it('only the screen can make a phone vibrate, and only the phone it names gets it', async () => {
    const screen = new Client('?role=screen&room=bz1');
    const a = new Client('?room=bz1');
    const b = new Client('?room=bz1');
    await Promise.all([screen.open(), a.open(), b.open()]);
    a.send({ t: 'join', name: 'Ana', token: 'a' });
    b.send({ t: 'join', name: 'Beto', token: 'b' });
    const idA = (await a.next('joined')).player.id,
      idB = (await b.next('joined')).player.id;
    await a.next('phase');
    await b.next('phase');
    a.send({ t: 'buzz', playerId: idB, kind: 'dash' }); // a phone cannot buzz another one
    screen.send({ t: 'buzz', playerId: idA, kind: 'chop' });
    expect(await a.next('buzz')).toEqual({ t: 'buzz', kind: 'chop' });
    screen.send({ t: 'buzz', playerId: 999, kind: 'chop' }); // unknown player: dropped
    screen.send({ t: 'buzz', playerId: idB, kind: 'pick' });
    expect(await b.next('buzz')).toEqual({ t: 'buzz', kind: 'pick' }); // b got only the screen's message
    expect(a.msgs.filter((m) => m.t === 'buzz')).toEqual([]);
    expect(b.msgs.filter((m) => m.t === 'buzz')).toEqual([]);
    [screen.ws, a.ws, b.ws].forEach((w) => w.close());
  });
});

describe('hint (the label of A and B, sabotage)', () => {
  it('only the screen can relabel a button, and only the phone it names gets it', async () => {
    const screen = new Client('?role=screen&room=ht1');
    const a = new Client('?room=ht1');
    const b = new Client('?room=ht1');
    await Promise.all([screen.open(), a.open(), b.open()]);
    a.send({ t: 'join', name: 'Ana', token: 'a' });
    b.send({ t: 'join', name: 'Beto', token: 'b' });
    const idA = (await a.next('joined')).player.id,
      idB = (await b.next('joined')).player.id;
    await a.next('phase');
    await b.next('phase');
    a.send({ t: 'hint', playerId: idB, a: 'Hack', b: null }); // a phone cannot relabel another one
    screen.send({ t: 'hint', playerId: idA, a: 'Cargar', b: '¡Lanzar!' });
    expect(await a.next('hint')).toEqual({ t: 'hint', a: 'Cargar', b: '¡Lanzar!' });
    screen.send({ t: 'hint', playerId: 999, a: 'x', b: null }); // unknown player: dropped
    screen.send({ t: 'hint', playerId: idB, a: null, b: null });
    expect(await b.next('hint')).toEqual({ t: 'hint', a: null, b: null });
    expect(a.msgs.filter((m) => m.t === 'hint')).toEqual([]);
    expect(b.msgs.filter((m) => m.t === 'hint')).toEqual([]);
    [screen.ws, a.ws, b.ws].forEach((w) => w.close());
  });
  it('the glyph and the greyed state travel with the labels (contextual buttons), and nothing else from the payload', async () => {
    const screen = new Client('?role=screen&room=ht2');
    const a = new Client('?room=ht2');
    await Promise.all([screen.open(), a.open()]);
    a.send({ t: 'join', name: 'Ana', token: 'a' });
    const idA = (await a.next('joined')).player.id;
    await a.next('phase');
    screen.ws.send(
      JSON.stringify({ t: 'hint', playerId: idA, a: 'Al horno', b: 'Picar', aIcon: 'oven', bIcon: 'chop', bOff: true, evil: 'x' }),
    );
    expect(await a.next('hint')).toEqual({ t: 'hint', a: 'Al horno', b: 'Picar', aIcon: 'oven', bIcon: 'chop', bOff: true });
    [screen.ws, a.ws].forEach((w) => w.close());
  });
});
