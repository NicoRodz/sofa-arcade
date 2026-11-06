import { describe, expect, it } from 'vitest';
import { GAMES } from '@pichi/catalog';
import { Client, kit, settle, useRelayServer } from './relay.kit';

useRelayServer();

describe('assist (Ayudante, chosen from the phone in the lobby)', () => {
  const join = async (room: string) => {
    const screen = new Client(`?role=screen&room=${room}`);
    const a = new Client(`?room=${room}`);
    await Promise.all([screen.open(), a.open()]);
    a.send({ t: 'join', name: 'Ana', token: 'a' });
    const id = (await a.next('joined')).player.id;
    await a.next('phase');
    await screen.next('player_joined');
    return { screen, a, id };
  };
  it('a phone switches it on and off: the screen and the phone itself hear the whole choice, once per change', async () => {
    const { screen, a, id } = await join('as1');
    a.send({ t: 'assist', on: true });
    expect(await screen.next('assist')).toEqual({ t: 'assist', playerId: id, on: true });
    expect(await a.next('assist')).toEqual({ t: 'assist', playerId: id, on: true });
    a.send({ t: 'assist', on: true }); // already on: nothing new to say
    a.send({ t: 'assist', on: false });
    expect(await screen.next('assist')).toEqual({ t: 'assist', playerId: id, on: false });
    expect(screen.msgs.filter((m) => m.t === 'assist')).toEqual([]);
    [screen.ws, a.ws].forEach((w) => w.close());
  });
  it('it stays with the slot: a screen that connects later sees it in the player list, and a phone that reconnects with its token is told', async () => {
    const { screen, a, id } = await join('as2');
    a.send({ t: 'assist', on: true });
    await screen.next('assist');
    const late = new Client('?role=screen&room=as2');
    await late.open();
    expect((await late.next('state')).players).toEqual([expect.objectContaining({ id, assist: true })]);
    a.ws.close();
    const back = new Client('?room=as2');
    await back.open();
    back.send({ t: 'join', name: 'Ana', token: 'a' });
    expect((await back.next('joined')).player).toMatchObject({ id, assist: true });
    expect(await back.next('assist')).toEqual({ t: 'assist', playerId: id, on: true });
    [screen.ws, late.ws, back.ws].forEach((w) => w.close());
  });
  it('a player that never chose it has no flag in the list, and the screen cannot switch it for a phone', async () => {
    const { screen, a, id } = await join('as3');
    const late = new Client('?role=screen&room=as3');
    await late.open();
    expect((await late.next('state')).players[0]).not.toHaveProperty('assist');
    screen.ws.send(JSON.stringify({ t: 'assist', on: true, playerId: id }));
    a.send({ t: 'assist', on: false });
    await new Promise((r) => setTimeout(r, 80));
    expect(a.msgs.filter((m) => m.t === 'assist')).toEqual([]);
    expect(screen.msgs.filter((m) => m.t === 'assist')).toEqual([]);
    [screen.ws, a.ws, late.ws].forEach((w) => w.close());
  });
  it('once the round has started the choice is frozen: the relay ignores it until the lobby is back', async () => {
    const { screen, a, id } = await join('as4');
    screen.send({ t: 'phase', phase: 'playing' });
    await a.next('phase');
    a.send({ t: 'assist', on: true });
    await new Promise((r) => setTimeout(r, 80));
    expect(screen.msgs.filter((m) => m.t === 'assist')).toEqual([]);
    screen.send({ t: 'phase', phase: 'lobby' });
    await a.next('phase');
    a.send({ t: 'assist', on: true });
    expect(await screen.next('assist')).toEqual({ t: 'assist', playerId: id, on: true });
    [screen.ws, a.ws].forEach((w) => w.close());
  });
  it('anything but a boolean is refused', async () => {
    const { screen, a } = await join('as5');
    a.send('{"t":"assist","on":"yes"}');
    a.send('{"t":"assist"}');
    await new Promise((r) => setTimeout(r, 80));
    expect(screen.msgs.filter((m) => m.t === 'assist')).toEqual([]);
    [screen.ws, a.ws].forEach((w) => w.close());
  });
});

describe('lobby config', () => {
  it('screen config reaches players and late joiners; players cannot set it', async () => {
    const screen = new Client('?role=screen&room=c1');
    const a = new Client('?room=c1');
    await Promise.all([screen.open(), a.open()]);
    a.send({ t: 'join', name: 'Ana', token: 'a' });
    await a.next('joined');
    expect(await a.next('config')).toMatchObject({ game: 'pizzas', difficulty: 'normal', map: 'auto', seed: 1 }); // default right after joining

    a.send({ t: 'config', game: 'pizzas', difficulty: 'hard', map: '3', seed: 1 }); // not a screen: ignored
    await settle();
    expect(a.msgs.filter((m) => m.t === 'config')).toEqual([]);

    screen.send({ t: 'config', game: 'pizzas', difficulty: 'hard', map: 'random', seed: 99 });
    expect(await a.next('config')).toMatchObject({ difficulty: 'hard', map: 'random', seed: 99 });
    expect(kit.srv.relay.rooms.get('c1')!.config).toEqual({
      game: 'pizzas',
      difficulty: 'hard',
      map: 'random',
      seed: 99,
      modeId: 'coop',
      teams: null,
      teamsLocked: false,
      modeOptions: {},
    }); // a v1 screen sends no team fields: cooperative, no teams
    const b = new Client('?room=c1');
    await b.open();
    b.send({ t: 'join', name: 'Bo', token: 'b' });
    expect(await b.next('config')).toMatchObject({ difficulty: 'hard', map: 'random', seed: 99 }); // late joiner
    [screen.ws, a.ws, b.ws].forEach((w) => w.close());
  });

  it('config carries the game control labels and how-to steps, on join and on change', async () => {
    const screen = new Client('?role=screen&room=c2');
    const a = new Client('?room=c2');
    await Promise.all([screen.open(), a.open()]);
    a.send({ t: 'join', name: 'Ana', token: 'a' });
    await a.next('joined');
    const first = await a.next('config');
    expect(first.controls).toEqual(GAMES[0].controls);
    expect(first.howTo.steps.length).toBeGreaterThanOrEqual(3);
    screen.send({ t: 'config', game: 'pizzas', difficulty: 'easy', map: 'auto', seed: 5 });
    const next = await a.next('config');
    expect(next).toMatchObject({ difficulty: 'easy', controls: GAMES[0].controls, howTo: GAMES[0].howTo });
    expect(kit.srv.relay.rooms.get('c2')!.config).not.toHaveProperty('controls'); // the room keeps only the lobby config
    [screen.ws, a.ws].forEach((w) => w.close());
  });
});

describe('game choice (menu -> lobby)', () => {
  it('a phone in the menu waits; the chosen game reaches it as config before the lobby phase; a late phone joins into the lobby with that game', async () => {
    const screen = new Client('?role=screen&room=m1');
    const a = new Client('?room=m1');
    await Promise.all([screen.open(), a.open()]);
    a.send({ t: 'join', name: 'Ana', token: 'a' });
    await a.next('joined');
    expect((await a.next('phase')).phase).toBe('menu');

    a.send({ t: 'phase', phase: 'lobby' }); // a phone does not choose: ignored
    a.send({ t: 'config', game: 'pizzas', difficulty: 'hard', map: '3', seed: 1 });
    await settle();
    expect(a.msgs.filter((m) => m.t === 'phase' || (m.t === 'config' && m.difficulty === 'hard'))).toEqual([]);
    expect(kit.srv.relay.rooms.get('m1')!.phase.phase).toBe('menu');

    screen.send({ t: 'config', game: 'pizzas', difficulty: 'normal', map: 'auto', seed: 1 }); // what the screen sends when a card is picked
    screen.send({ t: 'phase', phase: 'lobby' });
    const order = ['config', 'phase'];
    const seen: string[] = [];
    while (seen.length < 2) {
      const m = a.msgs.find((x) => order.includes(x.t) && !seen.includes(x.t));
      if (m) {
        seen.push(m.t);
        a.msgs.splice(a.msgs.indexOf(m), 1);
      } else await new Promise((r) => setImmediate(r));
    }
    expect(seen).toEqual(['config', 'phase']); // the phone knows the game before it leaves the menu
    expect(kit.srv.relay.rooms.get('m1')!.phase.phase).toBe('lobby');

    const b = new Client('?room=m1');
    await b.open();
    b.send({ t: 'join', name: 'Bo', token: 'b' });
    expect(await b.next('config')).toMatchObject({ game: 'pizzas', controls: GAMES[0].controls });
    expect((await b.next('phase')).phase).toBe('lobby');
    screen.send({ t: 'phase', phase: 'menu' }); // back to the menu: every phone goes back to waiting
    expect((await a.next('phase')).phase).toBe('menu');
    expect((await b.next('phase')).phase).toBe('menu');
    [screen.ws, a.ws, b.ws].forEach((w) => w.close());
  });
});
