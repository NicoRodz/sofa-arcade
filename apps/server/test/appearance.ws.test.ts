// The character creator's look over the real relay: join.ap, the `appearance` message (sanitized, paced, phase-gated, stamped by the socket), old phones, and the token.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { defaultAppearance, type ClientMsg, type ServerMsg } from '@pichi/core';
import { startServer } from '../src/server';

let srv: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  srv = await startServer({ port: 0, mode: 'none' });
});
afterAll(async () => {
  await srv.close();
});

const tick = () => new Promise<void>((r) => setTimeout(r, 30));
class C {
  ws: WebSocket;
  msgs: ServerMsg[] = [];
  constructor(query: string) {
    this.ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws${query}`);
    this.ws.on('message', (d) => this.msgs.push(JSON.parse(d.toString())));
  }
  open = () => new Promise<void>((r) => this.ws.once('open', () => r()));
  send = (m: ClientMsg | Record<string, unknown>) => this.ws.send(JSON.stringify(m));
  of<T extends ServerMsg['t']>(t: T) {
    return this.msgs.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[];
  }
}
let n = 0;
const setup = async () => {
  const room = `ap${n++}`;
  const screen = new C(`?role=screen&room=${room}`);
  await screen.open();
  const phone = async (token: string, join: object = {}) => {
    const c = new C(`?room=${room}`);
    await c.open();
    c.send({ t: 'join', name: token, token, ...join });
    await tick();
    return c;
  };
  return { screen, phone, room };
};
const ap = { v: 1, g: 1, s: 0, hc: 3, sk: 2, hat: 4, gl: 1, bk: 2, cl: 4 };

describe('appearance over the relay', () => {
  it('join with ap: sanitized in the roster, customizing true; a bad ap never rejects the join', async () => {
    const { screen, phone } = await setup();
    const a = await phone('a', { ap: { ...ap, hc: 99, __proto__x: 1 } });
    expect(a.of('joined')[0]!.player).toMatchObject({ ap: { ...ap, hc: 1 }, customizing: true });
    expect(screen.of('player_joined')[0]!.player.ap).toEqual({ ...ap, hc: 1 });
    const b = await phone('b', { ap: 'garbage' });
    expect(b.of('joined')).toHaveLength(1); // joined anyway
    expect(b.of('joined')[0]!.player.ap).toEqual(defaultAppearance(1));
  });
  it('an old phone (no ap) gets randomAppearance(slot) and is not "customizing"', async () => {
    const { phone } = await setup();
    const a = await phone('old');
    const p = a.of('joined')[0]!.player;
    expect(p.ap).toEqual(defaultAppearance(0));
    expect(p.customizing).toBeUndefined();
  });
  it("appearance in the lobby is sanitized and forwarded with the SOCKET's player id (a forged playerId/from is ignored); done clears customizing", async () => {
    const { screen, phone } = await setup();
    screen.send({ t: 'phase', phase: 'lobby' });
    const a = await phone('a', { ap });
    const b = await phone('b', { ap });
    const id = a.of('joined')[0]!.player.id;
    screen.msgs.length = 0;
    a.send({ t: 'appearance', playerId: 77, from: 77, ap: { ...ap, gl: -4, hat: 2 }, done: false } as never); // forged fields on purpose
    await tick();
    expect(screen.of('appearance')).toEqual([{ t: 'appearance', playerId: id, ap: { ...ap, gl: 0, hat: 2 }, customizing: true }]);
    expect(b.of('appearance').pop()).toMatchObject({ playerId: id, customizing: true }); // other phones hear it too
    a.send({ t: 'appearance', ap: { ...ap, hat: 2 }, done: true });
    await tick();
    expect(screen.of('appearance').pop()).toMatchObject({ playerId: id, customizing: false });
  });
  it('phases: home (menu), lobby and results accept; school and playing do not, and starting the match forces done', async () => {
    const { screen, phone } = await setup();
    const a = await phone('a', { ap }); // room starts in 'menu' (home)
    screen.msgs.length = 0;
    a.send({ t: 'appearance', ap: { ...ap, hc: 0 }, done: false });
    await tick();
    expect(screen.of('appearance')).toHaveLength(1);
    for (const [ph, ok] of [
      ['school', false],
      ['playing', false],
      ['results', true],
      ['lobby', true],
    ] as const) {
      screen.send({ t: 'phase', phase: ph });
      await tick();
      screen.msgs.length = 0;
      a.send({ t: 'appearance', ap: { ...ap, hc: 2 }, done: false });
      await tick();
      expect(screen.of('appearance').length, ph).toBe(ok ? 1 : 0);
    }
    screen.send({ t: 'phase', phase: 'playing' });
    await new Promise((r) => setTimeout(r, 1100)); // let the pace window (5/s) clear
    screen.msgs.length = 0;
    screen.send({ t: 'phase', phase: 'lobby' });
    a.send({ t: 'appearance', ap, done: false }); // customizing again
    await tick();
    screen.msgs.length = 0;
    screen.send({ t: 'phase', phase: 'playing' });
    await tick();
    expect(screen.of('appearance').pop()).toMatchObject({ customizing: false }); // forced done
  });
  it('is paced at 5 per second per player: a burst applies 5 now and the LAST one later', async () => {
    const { screen, phone } = await setup();
    screen.send({ t: 'phase', phase: 'lobby' });
    const a = await phone('a', { ap });
    screen.msgs.length = 0;
    for (let i = 0; i < 12; i++) a.send({ t: 'appearance', ap: { ...ap, hc: i % 5, cl: i % 11 }, done: i === 11 });
    await tick();
    expect(screen.of('appearance')).toHaveLength(5);
    await new Promise((r) => setTimeout(r, 1100));
    const all = screen.of('appearance');
    expect(all).toHaveLength(6);
    expect(all[5]).toMatchObject({ ap: { hc: 1, cl: 0 }, customizing: false }); // the final "Listo" was not lost
  });
  it('the look stays with the slot: a reconnect with the token keeps it and ignores the join ap', async () => {
    const { screen, phone } = await setup();
    screen.send({ t: 'phase', phase: 'lobby' });
    const a = await phone('a', { ap });
    a.send({ t: 'appearance', ap: { ...ap, bk: 5 }, done: true });
    await tick();
    a.ws.close();
    await tick();
    const a2 = await phone('a', { ap: { ...ap, bk: 1 } });
    expect(a2.of('joined')[0]!.player).toMatchObject({ ap: { ...ap, bk: 5 } });
    expect(a2.of('joined')[0]!.player.customizing).toBeUndefined();
  });
  it("a screen cannot send appearance, and a new phone with ap is told the others' looks", async () => {
    const { screen, phone } = await setup();
    const a = await phone('a', { ap });
    screen.send({ t: 'appearance', ap, done: true });
    await tick();
    expect(a.of('appearance')).toHaveLength(0);
    const b = await phone('b', { ap: { ...ap, g: 0 } });
    expect(b.of('appearance')).toMatchObject([{ playerId: a.of('joined')[0]!.player.id, ap }]);
  });
});
