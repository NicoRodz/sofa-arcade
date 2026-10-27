// The Captain's touch menu through the real relay: who may send what, what is forwarded, and to whom.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { MENU_CAP, type MenuSnapshot, type ServerMsg } from '@pichi/core';
import { startServer } from '../src/server';
import { createRateLimiter } from '@pichi/server-kit/menu-guard';

let srv: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  srv = await startServer({ port: 0, mode: 'none' });
});
afterAll(async () => {
  await srv.close();
});

class Client {
  ws: WebSocket;
  msgs: ServerMsg[] = [];
  constructor(query = '') {
    this.ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws${query}`);
    this.ws.on('message', (d) => this.msgs.push(JSON.parse(d.toString())));
  }
  open = () => new Promise<void>((r) => this.ws.once('open', () => r()));
  send = (m: object | string) => this.ws.send(typeof m === 'string' ? m : JSON.stringify(m));
  async next<T extends ServerMsg['t']>(t: T): Promise<Extract<ServerMsg, { t: T }>> {
    const end = Date.now() + 2000;
    while (Date.now() < end) {
      const j = this.msgs.findIndex((m) => m.t === t);
      if (j >= 0) return this.msgs.splice(j, 1)[0] as Extract<ServerMsg, { t: T }>;
      await new Promise((r) => setImmediate(r));
    }
    throw new Error(`timeout waiting for ${t}`);
  }
  count = (t: string) => this.msgs.filter((m) => m.t === t).length;
}
const settle = () => new Promise((r) => setTimeout(r, 80));
const joinAs = async (room: string, name: string, token: string, caps?: string[]) => {
  const c = new Client(`?room=${room}`);
  await c.open();
  c.send({ t: 'join', name, token, ...(caps ? { caps } : {}) });
  const id = (await c.next('joined')).player.id;
  return { c, id };
};
const snap = (rev = 1): MenuSnapshot => ({
  rev,
  screen: 'lobby',
  rows: [
    { id: 'difficulty', label: 'Dificultad', kind: 'choice', value: 'normal', options: [{ id: 'hard', label: 'Difícil', enabled: true }] },
  ],
  primary: { id: 'start', label: '¡A cocinar!', enabled: true, summary: ['Normal'] },
});
const room = async (name: string) => {
  const screen = new Client(`?role=screen&room=${name}`);
  await screen.open();
  const cap = await joinAs(name, 'Ana', 'a', [MENU_CAP]);
  const other = await joinAs(name, 'Bo', 'b', [MENU_CAP]);
  const close = () => [screen.ws, cap.c.ws, other.c.ws].forEach((w) => w.close());
  return { screen, cap, other, close };
};

describe('menuAct: the Captain touches the form', () => {
  it('reaches the screens stamped with `from` of the socket; a fake `from` in the payload is overwritten', async () => {
    const { screen, cap, other, close } = await room('m1');
    cap.c.send({ t: 'menuAct', rev: 4, act: 'set', row: 'difficulty', value: 'hard' });
    expect(await screen.next('menuAct')).toEqual({ t: 'menuAct', from: cap.id, rev: 4, act: 'set', row: 'difficulty', value: 'hard' });
    cap.c.send(`{"t":"menuAct","rev":5,"act":"start","from":${other.id}}`);
    expect(await screen.next('menuAct')).toEqual({ t: 'menuAct', from: cap.id, rev: 5, act: 'start' });
    close();
  });

  it('is dropped from a non-Captain, from a screen, from a socket that never joined', async () => {
    const { screen, cap, other, close } = await room('m2');
    other.c.send({ t: 'menuAct', rev: 1, act: 'start' });
    other.c.send(`{"t":"menuAct","rev":1,"act":"start","from":${cap.id}}`);
    screen.send({ t: 'menuAct', rev: 1, act: 'start' });
    const ghost = new Client('?room=m2');
    await ghost.open();
    ghost.send({ t: 'menuAct', rev: 1, act: 'start' });
    cap.c.send({ t: 'menuAct', rev: 9, act: 'focus', row: 'difficulty' }); // the one that must arrive
    expect((await screen.next('menuAct')).rev).toBe(9);
    await settle();
    expect(screen.count('menuAct')).toBe(0);
    ghost.ws.close();
    close();
  });

  it('is dropped when malformed: unknown act, free text in row/value, wrong types, no rev', async () => {
    const { screen, cap, close } = await room('m3');
    for (const bad of [
      { act: 'start' },
      { rev: 1, act: 'delete' },
      { rev: 1, act: 'set', row: 'a b' },
      { rev: 1, act: 'set', row: 'difficulty', value: '<script>' },
      { rev: 1, act: 'set', row: 'difficulty', value: 3 },
      { rev: 'x', act: 'start' },
    ])
      cap.c.send({ t: 'menuAct', ...bad });
    cap.c.send({ t: 'menuAct', rev: 2, act: 'start' });
    expect((await screen.next('menuAct')).rev).toBe(2);
    await settle();
    expect(screen.count('menuAct')).toBe(0);
    close();
  });

  it('is dropped over 512 bytes', async () => {
    const { screen, cap, close } = await room('m4');
    cap.c.send(JSON.stringify({ t: 'menuAct', rev: 1, act: 'start', pad: 'x'.repeat(600) }));
    cap.c.send({ t: 'menuAct', rev: 2, act: 'start' });
    expect((await screen.next('menuAct')).rev).toBe(2);
    await settle();
    expect(screen.count('menuAct')).toBe(0);
    close();
  });

  it('lets 10 per second through per connection and drops the rest', async () => {
    const { screen, cap, close } = await room('m5');
    for (let i = 0; i < 25; i++) cap.c.send({ t: 'menuAct', rev: i, act: 'focus', row: 'difficulty' });
    await settle();
    expect(screen.count('menuAct')).toBe(10);
    close();
  });
});

describe('menu / menuErr: screen to Captain only', () => {
  it('goes to the Captain alone, never to the other phones or to a second screen', async () => {
    const { screen, cap, other, close } = await room('m6');
    const screen2 = new Client('?role=screen&room=m6');
    await screen2.open();
    screen.send({ t: 'menu', ...snap(3) });
    expect(await cap.c.next('menu')).toEqual({ t: 'menu', ...snap(3) });
    screen.send({ t: 'menuErr', rev: 3, code: 'stale', msg: 'Cambió la configuración' });
    expect(await cap.c.next('menuErr')).toEqual({ t: 'menuErr', rev: 3, code: 'stale', msg: 'Cambió la configuración' });
    await settle();
    expect(other.c.count('menu') + other.c.count('menuErr') + screen2.count('menu') + screen2.count('menuErr')).toBe(0);
    screen2.ws.close();
    close();
  });

  it('is ignored when a phone sends it (only the screen describes the lobby)', async () => {
    const { screen, cap, other, close } = await room('m7');
    cap.c.send({ t: 'menu', ...snap(1) });
    other.c.send({ t: 'menu', ...snap(1) });
    cap.c.send({ t: 'menuErr', rev: 1, code: 'stale', msg: 'x' });
    await settle();
    expect(cap.c.count('menu') + cap.c.count('menuErr') + other.c.count('menu') + screen.count('menu')).toBe(0);
    close();
  });

  it('is ignored when malformed, and over 32 KB', async () => {
    const { screen, cap, close } = await room('m8');
    screen.send({ t: 'menu', rev: 1, screen: 'lobby', rows: 'nope', primary: {} });
    const big = snap(2);
    big.primary.summary = Array.from({ length: 6 }, () => 'x'.repeat(80));
    screen.send(JSON.stringify({ ...big, t: 'menu', pad: 'y'.repeat(33_000) }));
    screen.send({ t: 'menu', ...snap(3) });
    expect((await cap.c.next('menu')).rev).toBe(3);
    await settle();
    expect(cap.c.count('menu')).toBe(0);
    close();
  });

  it('is not sent to a Captain that did not announce the capability (it keeps its D-pad)', async () => {
    const screen = new Client('?role=screen&room=m9');
    await screen.open();
    const old = await joinAs('m9', 'Viejo', 'o'); // no caps
    screen.send({ t: 'menu', ...snap(1) });
    await settle();
    expect(old.c.count('menu')).toBe(0);
    old.c.send({ t: 'nav', key: 'ok' }); // and nav still works
    expect(await screen.next('nav')).toMatchObject({ from: old.id, key: 'ok' });
    screen.ws.close();
    old.c.ws.close();
  });

  it('a Captain that arrives or changes gets the last snapshot at once; a phase out of the lobby clears it', async () => {
    const screen = new Client('?role=screen&room=m10');
    await screen.open();
    screen.send({ t: 'menu', ...snap(7) }); // nobody there yet
    const a = await joinAs('m10', 'Ana', 'a', [MENU_CAP]);
    expect((await a.c.next('menu')).rev).toBe(7);
    const b = await joinAs('m10', 'Bo', 'b', [MENU_CAP]);
    await settle();
    expect(b.c.count('menu')).toBe(0); // not the Captain
    a.c.ws.close(); // the crown passes to Bo
    expect((await b.c.next('menu')).rev).toBe(7);
    screen.send({ t: 'phase', phase: 'playing' });
    await settle();
    b.c.ws.close(); // nobody holds the crown now: the next one to join gets it, and there must be no stale form for it
    await settle();
    const c = await joinAs('m10', 'Cy', 'c', [MENU_CAP]);
    await settle();
    expect(c.c.count('menu')).toBe(0);
    [screen.ws, b.c.ws, c.c.ws].forEach((w) => w.close());
  });
});

describe('createRateLimiter', () => {
  it('counts a rolling window with an injected clock', () => {
    let t = 0;
    const ok = createRateLimiter(3, 1000, () => t);
    expect([ok(), ok(), ok(), ok()]).toEqual([true, true, true, false]);
    t = 999;
    expect(ok()).toBe(false);
    t = 1000;
    expect(ok()).toBe(true);
  });
});
