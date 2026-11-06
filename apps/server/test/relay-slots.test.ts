import { afterEach, describe, expect, it, vi } from 'vitest';
import { SLOT_GRACE_MS } from '@pichi/core';
import { Client, kit, settle, useRelayServer } from './relay.kit';

useRelayServer();

describe('slot expiry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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
    expect(kit.srv.relay.rooms.get('e1')!.players.size).toBe(1);

    vi.advanceTimersByTime(1);
    expect((await screen.next('player_removed')).playerId).toBe(1);
    expect(kit.srv.relay.rooms.get('e1')!.players.size).toBe(0);

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
    expect(kit.srv.relay.rooms.get('e2')!.players.get(1)!.ws).not.toBeNull();
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

describe('the Captain (F0 of the menus from the phone)', () => {
  const joinAs = async (room: string, name: string, token: string) => {
    const c = new Client(`?room=${room}`);
    await c.open();
    c.send({ t: 'join', name, token });
    const id = (await c.next('joined')).player.id;
    return { c, id };
  };

  it('the first player to join gets the crown, everyone hears it, and a later joiner does not take it', async () => {
    const screen = new Client('?role=screen&room=c1');
    await screen.open();
    expect(await screen.next('captain')).toEqual({ t: 'captain', playerId: null }); // nobody yet
    const a = await joinAs('c1', 'Ana', 'a');
    expect(await screen.next('captain')).toEqual({ t: 'captain', playerId: a.id });
    expect(await a.c.next('captain')).toEqual({ t: 'captain', playerId: a.id });
    const b = await joinAs('c1', 'Bo', 'b');
    expect(await b.c.next('captain')).toEqual({ t: 'captain', playerId: a.id }); // the newcomer is told who holds it
    await settle();
    expect(screen.msgs.filter((m) => m.t === 'captain')).toEqual([]); // no change: no broadcast
    expect(a.c.msgs.filter((m) => m.t === 'captain')).toEqual([]);
    const late = new Client('?role=screen&room=c1'); // a screen that reloads learns it on connect
    await late.open();
    expect(await late.next('captain')).toEqual({ t: 'captain', playerId: a.id });
    [screen.ws, a.c.ws, b.c.ws, late.ws].forEach((w) => w.close());
  });

  it("forwards the captain's nav to the screens stamped with `from` from the socket, ignoring any id in the payload", async () => {
    const screen = new Client('?role=screen&room=c2');
    await screen.open();
    const a = await joinAs('c2', 'Ana', 'a');
    const b = await joinAs('c2', 'Bo', 'b');
    a.c.send({ t: 'nav', key: 'right' });
    expect(await screen.next('nav')).toEqual({ t: 'nav', from: a.id, key: 'right' });
    a.c.send('{"t":"nav","key":"ok","from":' + b.id + ',"playerId":' + b.id + '}'); // poses as Bo
    expect(await screen.next('nav')).toEqual({ t: 'nav', from: a.id, key: 'ok' });
    [screen.ws, a.c.ws, b.c.ws].forEach((w) => w.close());
  });

  it('drops nav from anyone who is not the captain, from a screen, from a socket that never joined, and malformed ones', async () => {
    const screen = new Client('?role=screen&room=c3');
    await screen.open();
    const a = await joinAs('c3', 'Ana', 'a');
    const b = await joinAs('c3', 'Bo', 'b');
    b.c.send({ t: 'nav', key: 'ok' });
    b.c.send('{"t":"nav","key":"ok","from":' + a.id + '}'); // claims to be the captain
    screen.send({ t: 'nav', key: 'ok' });
    const ghost = new Client('?room=c3');
    await ghost.open();
    ghost.send({ t: 'nav', key: 'ok' });
    a.c.send('{"t":"nav","key":"start"}');
    a.c.send('{"t":"nav"}');
    a.c.send({ t: 'nav', key: 'back' }); // the one that must arrive, after everything else was refused
    expect(await screen.next('nav')).toEqual({ t: 'nav', from: a.id, key: 'back' });
    await settle();
    expect(screen.msgs.filter((m) => m.t === 'nav')).toEqual([]);
    [screen.ws, a.c.ws, b.c.ws, ghost.ws].forEach((w) => w.close());
  });

  it('when the captain drops the crown passes to the next one who joined, and returns to the first when they come back', async () => {
    const screen = new Client('?role=screen&room=c4');
    await screen.open();
    const a = await joinAs('c4', 'Ana', 'a');
    const b = await joinAs('c4', 'Bo', 'b');
    const c = await joinAs('c4', 'Cy', 'c');
    await settle();
    screen.msgs.length = 0;
    b.c.msgs.length = 0;
    c.c.msgs.length = 0;
    a.c.ws.close();
    expect(await screen.next('captain')).toEqual({ t: 'captain', playerId: b.id });
    expect(await b.c.next('captain')).toEqual({ t: 'captain', playerId: b.id });
    expect(await c.c.next('captain')).toEqual({ t: 'captain', playerId: b.id });
    c.c.send({ t: 'nav', key: 'ok' }); // Cy was never captain
    b.c.send({ t: 'nav', key: 'down' });
    expect(await screen.next('nav')).toEqual({ t: 'nav', from: b.id, key: 'down' });
    b.c.ws.close();
    expect(await screen.next('captain')).toEqual({ t: 'captain', playerId: c.id }); // rotates again
    const a2 = new Client('?room=c4');
    await a2.open();
    a2.send({ t: 'join', name: 'Ana', token: 'a' });
    expect((await a2.next('joined')).player.id).toBe(a.id);
    expect(await screen.next('captain')).toEqual({ t: 'captain', playerId: a.id }); // the first one is back
    expect(await a2.next('captain')).toEqual({ t: 'captain', playerId: a.id });
    a2.send({ t: 'nav', key: 'up' });
    expect(await screen.next('nav')).toEqual({ t: 'nav', from: a.id, key: 'up' });
    [screen.ws, a2.ws, c.c.ws].forEach((w) => w.close());
  });

  it('with nobody connected the crown is empty, and the next one to connect takes it', async () => {
    const screen = new Client('?role=screen&room=c5');
    await screen.open();
    const a = await joinAs('c5', 'Ana', 'a');
    await screen.next('captain');
    await screen.next('captain');
    screen.msgs.length = 0;
    a.c.ws.close();
    expect(await screen.next('captain')).toEqual({ t: 'captain', playerId: null });
    const b = await joinAs('c5', 'Bo', 'b');
    expect(await screen.next('captain')).toEqual({ t: 'captain', playerId: b.id }); // Ana (lower id) is not connected: Bo
    [screen.ws, b.c.ws].forEach((w) => w.close());
  });
});
