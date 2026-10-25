// Cocina escuela over the real relay: phones are bots on websockets, the "screen" is a Node client that runs the SAME createSchool the browser does. The bots complete the
// school with 1, 2 and 8 players and with a player that joins halfway; the relay carries the phase, each phone's step message, the "I already know it" memory and the skip.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { PressTracker, type ClientMsg, type PublicPlayer, type ServerMsg } from '@pichi/core';
import { Emitter, type GameEvents } from '@pichi/core/events';
import { TICK_MS, type Controls } from '@pichi/game-pizzas/sim';
import { SCHOOL_TOTAL, createSchool, type School, type SchoolMember } from '@pichi/game-pizzas/sim/school';
import { botControls, type BotMem } from '@pichi/game-pizzas/sim/school/school-bot';
import { startServer } from '../src/server';

let srv: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  srv = await startServer({ port: 0, mode: 'none' });
});
afterAll(async () => {
  await srv.close();
});

const tickOf = () => new Promise<void>((r) => setImmediate(r));
const until = async (f: () => boolean, what: string, ms = 8000) => {
  const end = Date.now() + ms;
  while (!f()) {
    if (Date.now() > end) throw new Error(`timeout: ${what}`);
    await tickOf();
  }
};

class Phone {
  ws: WebSocket;
  id = 0;
  closed = false;
  phases: string[] = [];
  school: Extract<ServerMsg, { t: 'school' }>[] = [];
  hints: Extract<ServerMsg, { t: 'hint' }>[] = [];
  assist: boolean | null = null;
  presses = [0, 0];
  seq = 0;
  heldB = false;
  constructor(
    readonly room: string,
    readonly name: string,
    readonly token = `tok-${room}-${name}`,
  ) {
    this.ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws?room=${room}`);
    this.ws.on('open', () => this.send({ t: 'join', name, token }));
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      if (m.t === 'joined') this.id = m.player.id;
      else if (m.t === 'phase') this.phases.push(m.phase);
      else if (m.t === 'school') this.school.push(m);
      else if (m.t === 'hint') this.hints.push(m);
      else if (m.t === 'assist') this.assist = m.on;
    });
  }
  send(m: ClientMsg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
  sendControls(c: Controls) {
    if (c.a > 0) this.presses[0] = (this.presses[0]! + c.a) % 65536;
    if (c.b && !this.heldB) this.presses[1] = (this.presses[1]! + 1) % 65536;
    this.heldB = c.b;
    this.send({ t: 'input', seq: this.seq++, x: c.x, y: c.y, btn: c.b ? 2 : 0, presses: [...this.presses], ts: Date.now() });
  }
  close() {
    this.closed = true;
    this.ws.close();
  }
}

class Screen {
  ws: WebSocket;
  players = new Map<number, PublicPlayer>();
  known = new Set<number>(); // 'schoolDone' heard
  skips = new Set<number>(); // ... with skip
  latest = new Map<number, { x: number; y: number; btn: number; presses: number[]; seq: number }>();
  trackers = new Map<number, PressTracker>();
  constructor(readonly room: string) {
    this.ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws?role=screen&room=${room}`);
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      if (m.t === 'state') m.players.forEach((p) => this.players.set(p.id, p));
      else if (m.t === 'player_joined') this.players.set(m.player.id, m.player);
      else if (m.t === 'player_left') {
        const p = this.players.get(m.playerId);
        if (p) p.connected = false;
      } else if (m.t === 'schoolDone') {
        this.known.add(m.playerId);
        if (m.skip) this.skips.add(m.playerId);
        const p = this.players.get(m.playerId);
        if (p) p.school = true;
      } // main.ts does the same with PublicPlayer.school
      else if (m.t === 'input') this.latest.set(m.playerId, { x: m.x, y: m.y, btn: m.btn, presses: m.presses, seq: m.seq });
    });
  }
  send(m: ClientMsg) {
    this.ws.send(JSON.stringify(m));
  }
  roster(): SchoolMember[] {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      slot: p.slot,
      connected: p.connected,
      ...(p.school ? { known: true } : {}),
      ...(p.assist ? { assist: true } : {}),
    }));
  }
  consume(id: number): Controls {
    const l = this.latest.get(id);
    if (!l) return { x: 0, y: 0, a: 0, b: false };
    const t = this.trackers.get(id) ?? new PressTracker();
    this.trackers.set(id, t);
    const d = t.update(l.presses);
    return { x: l.x, y: l.y, a: d[0] ?? 0, b: (l.btn & 2) !== 0, bTaps: d[1] ?? 0 };
  }
}

/** The screen's loop: each frame the bots read the screen's school game (as the phone's player reads the TV), send their controls over the wire, and the screen steps. */
async function runOverWire(o: {
  room: string;
  n: number;
  joinLate?: { at: number; n: number };
  limitMs?: number;
  known?: number[];
  skipAt?: { ms: number; phone: number };
}) {
  const screen = new Screen(o.room);
  await new Promise<void>((r) => screen.ws.once('open', () => r()));
  const phones = Array.from({ length: o.n }, (_v, i) => new Phone(o.room, `Bot${i + 1}`));
  await until(() => phones.every((p) => p.id > 0) && screen.players.size === phones.length, 'phones joined');
  for (const i of o.known ?? []) phones[i]!.send({ t: 'schoolDone' });
  await until(() => (o.known ?? []).every((i) => screen.known.has(phones[i]!.id)), 'known heard');
  screen.send({ t: 'phase', phase: 'school' });
  await until(() => phones.every((p) => p.phases.at(-1) === 'school'), 'phase school reached the phones');
  const bus = new Emitter<GameEvents>();
  const school: School = createSchool({ bus, send: (m) => screen.send(m) });
  const mem = new Map<number, BotMem>();
  const seen = new Set<number>();
  let late: Phone[] = [];
  let skipped = false;
  const frames = Math.ceil((o.limitMs ?? 120_000) / TICK_MS);
  let f = 0;
  for (; f < frames; f++) {
    if (o.joinLate && f === Math.ceil(o.joinLate.at / TICK_MS)) {
      late = Array.from({ length: o.joinLate.n }, (_v, i) => new Phone(o.room, `Late${i + 1}`));
      phones.push(...late);
    }
    if (o.skipAt && !skipped && f * TICK_MS >= o.skipAt.ms) {
      skipped = true;
      phones[o.skipAt.phone]!.send({ t: 'schoolDone', skip: true });
    }
    for (const p of phones) {
      const gp = school.game.players.get(p.id);
      if (!gp || p.ws.readyState !== WebSocket.OPEN) continue;
      const mm = mem.get(p.id) ?? { lastPress: -99, stuck: 0 };
      mem.set(p.id, mm);
      p.sendControls(botControls(school.game, gp, school.progressOf(p.id)?.step ?? 0, mm, f));
    }
    await tickOf();
    for (const p of phones)
      if (p.id > 0 && p.ws.readyState === WebSocket.OPEN && school.game.players.has(p.id))
        await until(() => (screen.latest.get(p.id)?.seq ?? -1) >= p.seq - 1, `input of ${p.name}`, 3000);
    for (const e of screen.skips)
      if (!seen.has(e)) {
        seen.add(e);
        school.skip(e);
      } // what main.ts does with a 'schoolDone' that carries skip
    school.step(TICK_MS, screen.roster(), (id) => screen.consume(id));
    if (f % 8 === 0) await tickOf();
    if (school.everyoneDone && (!o.joinLate || f > Math.ceil(o.joinLate.at / TICK_MS) + 5)) break;
  }
  for (let i = 0; i < 70; i++) {
    school.step(TICK_MS, screen.roster(), (id) => screen.consume(id));
    await tickOf();
  } // the screen shows "todos listos" for a moment: the last messages reach the phones
  await until(
    () => phones.every((p) => p.ws.readyState !== WebSocket.OPEN || p.school.at(-1)?.done === true),
    'every phone heard it is done',
  );
  return { screen, phones, school, frames: f };
}

describe('the school over the relay (bots on websockets)', () => {
  for (const n of [1, 2, 8]) {
    it(`${n} player(s): everybody gets the phase, their own steps one after the other, and finishes`, async () => {
      const r = await runOverWire({ room: `sc${n}`, n, limitMs: 150_000 });
      expect(r.school.everyoneDone, `${n} players`).toBe(true);
      for (const p of r.phones) {
        expect(p.phases).toContain('school');
        const steps = [...new Set(p.school.map((m) => m.step))];
        expect(steps, `${p.name} steps`).toEqual([0, 1, 2, 3, SCHOOL_TOTAL]);
        expect(p.school.at(-1)!.done).toBe(true);
        expect(p.hints.length, `${p.name} contextual buttons`).toBeGreaterThan(3);
      }
      r.phones.forEach((p) => p.close());
      r.screen.ws.close();
    }, 170_000);
  }

  it('a player that joins halfway starts at step 0 and the school waits for them', async () => {
    const r = await runOverWire({ room: 'scLate', n: 1, joinLate: { at: 20_000, n: 1 }, limitMs: 120_000 });
    const [first, late] = r.phones as [Phone, Phone];
    expect(r.school.everyoneDone).toBe(true);
    expect(first.school.at(-1)!.done).toBe(true);
    expect(
      first.school.some((m) => m.done),
      'the first one was done well before the joiner showed up',
    ).toBe(true);
    expect(late.school[0]!.step, 'the late phone is told step 0 first').toBe(0);
    expect(late.school.at(-1)!.done).toBe(true);
    expect(late.phases[0], 'a phone that joins during the school hears the school phase on arrival').toBe('school');
    r.phones.forEach((p) => p.close());
    r.screen.ws.close();
  }, 150_000);

  it('a phone that presses "Saltar" is done at once, wherever it was; the other keeps cooking', async () => {
    const r = await runOverWire({ room: 'scSkip', n: 2, skipAt: { ms: 1500, phone: 1 }, limitMs: 120_000 });
    expect(r.school.progressOf(r.phones[1]!.id)!.skipped).toBe(true);
    expect(r.school.progressOf(r.phones[0]!.id)).toEqual({ step: SCHOOL_TOTAL, skipped: false });
    expect(r.phones[1]!.school.at(-1)!.done).toBe(true);
    r.phones.forEach((p) => p.close());
    r.screen.ws.close();
  }, 150_000);

  it('a phone that already did the school arrives finished: the relay keeps it with the slot (also across a reconnect) and the table starts with it checked', async () => {
    const r = await runOverWire({ room: 'scKnown', n: 2, known: [0], limitMs: 120_000 });
    expect(r.screen.players.get(r.phones[0]!.id)!.school).toBe(true);
    expect(r.screen.players.get(r.phones[1]!.id)!.school).toBeUndefined();
    expect(r.school.progressOf(r.phones[0]!.id)).toEqual({ step: SCHOOL_TOTAL, skipped: true }); // checked from the first frame
    expect(r.school.progressOf(r.phones[1]!.id)).toEqual({ step: SCHOOL_TOTAL, skipped: false }); // the other one cooked
    expect(r.phones[0]!.school[0]!.text).toMatch(/Ya la hiciste/);
    expect(r.phones[1]!.school[0]!.step).toBe(0);
    // a reconnect with the same token comes back flagged
    const again = new Phone('scKnown', 'Bot1');
    const screen2 = new Screen('scKnown');
    await until(() => again.id > 0 && screen2.players.size >= 1, 'rejoin');
    expect(screen2.players.get(again.id)!.school).toBe(true);
    again.close();
    screen2.ws.close();
    r.phones.forEach((p) => p.close());
    r.screen.ws.close();
  }, 150_000);
});

describe('what the relay allows around the school', () => {
  it("only a screen can send a phone its step; a phone cannot send itself (or another) one, and a 'schoolDone' never carries an id", async () => {
    const screen = new Screen('scAuth');
    await new Promise<void>((r) => screen.ws.once('open', () => r()));
    const a = new Phone('scAuth', 'A'),
      b = new Phone('scAuth', 'B');
    await until(() => a.id > 0 && b.id > 0, 'joined');
    a.send({ t: 'school', playerId: b.id, step: 4, total: 4, text: 'trampa', done: true });
    await tickOf();
    await new Promise((r) => setTimeout(r, 150));
    expect(b.school).toHaveLength(0);
    screen.send({ t: 'school', playerId: b.id, step: 2, total: 4, text: 'Lleva el tomate picado al horno', btn: 'a' });
    await until(() => b.school.length === 1, 'the screen can');
    expect(b.school[0]).toEqual({ t: 'school', step: 2, total: 4, text: 'Lleva el tomate picado al horno', btn: 'a' });
    expect(a.school).toHaveLength(0);
    a.close();
    b.close();
    screen.ws.close();
  });
  it('Ayudante cannot be switched on or off during the school (the chefs are in), only in the lobby', async () => {
    const screen = new Screen('scAssist');
    await new Promise<void>((r) => screen.ws.once('open', () => r()));
    const a = new Phone('scAssist', 'A');
    await until(() => a.id > 0, 'joined');
    a.send({ t: 'assist', on: true });
    await until(() => a.assist === true, 'on in the lobby');
    screen.send({ t: 'phase', phase: 'school' });
    await until(() => a.phases.at(-1) === 'school', 'school');
    a.send({ t: 'assist', on: false });
    await new Promise((r) => setTimeout(r, 200));
    expect(a.assist, 'still on').toBe(true);
    screen.send({ t: 'phase', phase: 'lobby' });
    await until(() => a.phases.at(-1) === 'lobby', 'lobby');
    a.send({ t: 'assist', on: false });
    await until(() => a.assist === false, 'off again in the lobby');
    a.close();
    screen.ws.close();
  });
});
