import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, type ClientMsg } from '@pichi/core';
import { Client, kit, settle, useRelayServer } from './relay.kit';

useRelayServer();

describe('teams', () => {
  const teams = (a: number[], b: number[]) => [
    { id: 0, name: 'Picantes', color: '#F26A1B', icon: '▲', side: 'izquierda', playerIds: a },
    { id: 1, name: 'Frescos', color: '#1E6BD6', icon: '●', playerIds: b },
  ];
  const cfg = (t: ReturnType<typeof teams> | null, extra: object = {}): ClientMsg =>
    ({
      t: 'config',
      game: 'pizzas',
      difficulty: 'normal',
      map: 'auto',
      seed: 1,
      modeId: 'versus',
      teams: t,
      teamsLocked: false,
      modeOptions: {},
      ...extra,
    }) as ClientMsg;

  it('each phone learns its team from the screen config, the screen sees teamId per player, and the protocol version is announced', async () => {
    const screen = new Client('?role=screen&room=tm1');
    const a = new Client('?room=tm1');
    const b = new Client('?room=tm1');
    await Promise.all([screen.open(), a.open(), b.open()]);
    a.send({ t: 'join', name: 'Ana', token: 'a' });
    b.send({ t: 'join', name: 'Beto', token: 'b' });
    const ja = await a.next('joined'),
      jb = await b.next('joined');
    expect(ja.v).toBe(PROTOCOL_VERSION);
    expect(ja.player.teamId).toBeNull(); // no teams yet
    await a.next('phase');
    await b.next('phase');
    expect(a.msgs.filter((m) => m.t === 'you')).toEqual([]); // cooperative / unassigned: nothing to tell
    a.msgs = a.msgs.filter((m) => m.t !== 'config');
    b.msgs = b.msgs.filter((m) => m.t !== 'config'); // the join-time config
    screen.send(cfg(teams([ja.player.id], [jb.player.id])));
    expect(await a.next('you')).toEqual({ t: 'you', teamId: 0, color: '#F26A1B', icon: '▲', sideLabel: 'izquierda' });
    expect(await b.next('you')).toEqual({ t: 'you', teamId: 1, color: '#1E6BD6', icon: '●' });
    expect(await a.next('config')).toMatchObject({ modeId: 'versus', teams: teams([ja.player.id], [jb.player.id]) });
    const late = new Client('?room=tm1');
    await late.open();
    late.send({ t: 'join', name: 'Cata', token: 'c' });
    expect((await late.next('joined')).player.teamId).toBeNull(); // not in a team: a spectator
    expect(late.msgs.filter((m) => m.t === 'you')).toEqual([]);
    const s2 = new Client('?role=screen&room=tm1');
    await s2.open();
    expect((await s2.next('state')).players.map((p) => [p.name, p.teamId])).toEqual([
      ['Ana', 0],
      ['Beto', 1],
      ['Cata', null],
    ]);
    [screen.ws, a.ws, b.ws, late.ws, s2.ws].forEach((w) => w.close());
  });

  it('the results phase carries the versus result to every phone, and a phone that reconnects at the results still gets it', async () => {
    const screen = new Client('?role=screen&room=tm4');
    const a = new Client('?room=tm4');
    await Promise.all([screen.open(), a.open()]);
    a.send({ t: 'join', name: 'Ana', token: 'a' });
    await a.next('joined');
    await a.next('phase');
    const result = {
      verdict: 'win' as const,
      winner: 1,
      scores: [
        { team: 0, score: 340 },
        { team: 1, score: 410 },
      ],
    };
    screen.send({ t: 'phase', phase: 'results', scores: [{ id: 1, score: 410 }], result });
    expect(await a.next('phase')).toEqual({ t: 'phase', phase: 'results', scores: [{ id: 1, score: 410 }], result });
    a.ws.close();
    await screen.next('player_left');
    const a2 = new Client('?room=tm4');
    await a2.open();
    a2.send({ t: 'join', name: 'Ana', token: 'a' });
    await a2.next('joined');
    expect(await a2.next('phase')).toMatchObject({ phase: 'results', result });
    screen.send({ t: 'phase', phase: 'lobby' }); // the next phase drops it
    expect((await a2.next('phase')).result).toBeUndefined();
    [screen.ws, a2.ws].forEach((w) => w.close());
  });

  it('a phone that drops and comes back with its token keeps its team and gets told again', async () => {
    const screen = new Client('?role=screen&room=tm2');
    const a = new Client('?room=tm2');
    await Promise.all([screen.open(), a.open()]);
    a.send({ t: 'join', name: 'Ana', token: 'a' });
    const id = (await a.next('joined')).player.id;
    screen.send(cfg(teams([99], [id])));
    expect((await a.next('you')).teamId).toBe(1);
    a.ws.close();
    await screen.next('player_left');
    screen.msgs = screen.msgs.filter((m) => m.t !== 'player_joined'); // the first join
    const a2 = new Client('?room=tm2');
    await a2.open();
    a2.send({ t: 'join', name: 'Ana', token: 'a' });
    const j = await a2.next('joined');
    expect(j.player).toMatchObject({ id, teamId: 1 });
    expect(await a2.next('you')).toMatchObject({ teamId: 1, icon: '●' });
    expect((await screen.next('player_joined')).player.teamId).toBe(1);
    [screen.ws, a2.ws].forEach((w) => w.close());
  });

  it('a phone asks to change team and only the screen hears it; the screen decides; phones cannot set teams', async () => {
    const screen = new Client('?role=screen&room=tm3');
    const a = new Client('?room=tm3');
    const b = new Client('?room=tm3');
    await Promise.all([screen.open(), a.open(), b.open()]);
    a.send({ t: 'setTeam', teamId: 1 }); // before joining: dropped
    a.send({ t: 'join', name: 'Ana', token: 'a' });
    b.send({ t: 'join', name: 'Beto', token: 'b' });
    const ia = (await a.next('joined')).player.id,
      ib = (await b.next('joined')).player.id;
    await screen.next('player_joined');
    await screen.next('player_joined');
    a.send({ t: 'setTeam', teamId: 1 });
    expect(await screen.next('setTeam')).toEqual({ t: 'setTeam', playerId: ia, teamId: 1 });
    expect(screen.msgs.filter((m) => m.t === 'setTeam')).toEqual([]); // the pre-join one never arrived
    a.send({ t: 'setTeam', teamId: 77 }); // invalid team id: refused by the parser
    a.send(cfg(teams([ia], [ib]))); // a phone cannot set the lobby
    await settle();
    expect(screen.msgs.filter((m) => m.t === 'setTeam')).toEqual([]);
    expect(b.msgs.filter((m) => m.t === 'you' || (m.t === 'config' && m.teams !== null))).toEqual([]);
    expect(kit.srv.relay.rooms.get('tm3')!.config.teams).toBeNull();
    // the screen answers by publishing the new teams: only the phones that have one are told
    screen.send(cfg(teams([ib], [ia])));
    expect((await a.next('you')).teamId).toBe(1);
    expect((await b.next('you')).teamId).toBe(0);
    expect(b.msgs.filter((m) => m.t === 'setTeam')).toEqual([]);
    [screen.ws, a.ws, b.ws].forEach((w) => w.close());
  });

  it('the match start travels with the playing phase and a late joiner still gets it', async () => {
    const screen = new Client('?role=screen&room=tm4');
    const a = new Client('?room=tm4');
    await Promise.all([screen.open(), a.open()]);
    a.send({ t: 'join', name: 'Ana', token: 'a' });
    const id = (await a.next('joined')).player.id;
    await a.next('phase');
    const match = {
      gameId: 'pizzas',
      modeId: 'versus',
      mapId: '8',
      difficulty: 'normal',
      teams: teams([id], [50]),
      modeOptions: { hiddenScore: true },
    };
    screen.send({ t: 'phase', phase: 'playing', match } as ClientMsg);
    expect(await a.next('phase')).toMatchObject({ phase: 'playing', match });
    a.ws.close();
    await screen.next('player_left');
    const a2 = new Client('?room=tm4');
    await a2.open();
    a2.send({ t: 'join', name: 'Ana', token: 'a' });
    await a2.next('joined');
    expect(await a2.next('phase')).toMatchObject({ phase: 'playing', match });
    [screen.ws, a2.ws].forEach((w) => w.close());
  });
});
