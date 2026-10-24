// Contextual buttons over the real relay: phones are bots on websockets, the "screen" is a Node client that runs a cooperative round with the same
// pure functions the real one uses (createHintSync is the very code screen/src/main.ts calls every frame). The bots cook with the golden script, and
// what the PHONES hear back is checked: the labels follow the recipe step by step, with their glyphs, and a phone that drops and returns is told
// the state again within HINT_REFRESH_MS (a label is a state, never an event it could miss).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { PressTracker, type ClientMsg, type ServerMsg } from '@party/shared';
import { COUNTDOWN_MS, TICK_MS, addPlayer, createGame, tick, type Controls, type Game } from '@party/shared/game';
import { fixedMap } from '@party/shared/maps';
import { HINT_REFRESH_MS, createHintSync } from '@party/shared/hints';
import { decide, type Mem } from '../../shared/golden/bot';
import { startServer } from '../src/server';

let srv: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => { srv = await startServer({ port: 0, mode: 'none' }); });
afterAll(async () => { await srv.close(); });

const tickOf = () => new Promise<void>((r) => setImmediate(r));
const until = async (f: () => boolean, what: string, ms = 5000) => {
  const end = Date.now() + ms;
  while (!f()) { if (Date.now() > end) throw new Error(`timeout: ${what}`); await tickOf(); }
};
type Hint = Extract<ServerMsg, { t: 'hint' }>;

class Phone {
  ws!: WebSocket;
  id = 0;
  hints: { at: number; m: Hint }[] = []; // at: the index of the sim frame the screen was on when the phone received it (set by the test loop)
  frame = 0;
  presses = [0, 0]; seq = 0; heldB = false;
  constructor(readonly room: string, readonly name: string) { this.connect(); }
  connect() {
    this.ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws?room=${this.room}`);
    this.ws.on('open', () => this.send({ t: 'join', name: this.name, token: `tok-${this.room}-${this.name}` }));
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      if (m.t === 'joined') this.id = m.player.id;
      else if (m.t === 'hint') this.hints.push({ at: this.frame, m });
    });
  }
  send(m: ClientMsg) { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }
  sendControls(c: Controls) {
    if (c.a > 0) this.presses[0] = (this.presses[0]! + c.a) % 65536;
    if (c.b && !this.heldB) this.presses[1] = (this.presses[1]! + 1) % 65536;
    this.heldB = c.b;
    this.send({ t: 'input', seq: this.seq++, x: c.x, y: c.y, btn: c.b ? 2 : 0, presses: [...this.presses], ts: Date.now() });
  }
  get last() { return this.hints[this.hints.length - 1]?.m; }
}

// The screen: gets every phone's input from the relay, ticks the sim, and syncs the hints like the real screen does after every frame.
async function playCoop(room: string, o: { frames: number; dropAt?: number; dropFor?: number }) {
  const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws?role=screen&room=${room}`);
  const latest = new Map<number, { x: number; y: number; btn: number; presses: number[]; seq: number }>();
  const joined: number[] = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString()) as ServerMsg;
    if (m.t === 'player_joined' && !joined.includes(m.player.id)) joined.push(m.player.id);
    else if (m.t === 'input') latest.set(m.playerId, { x: m.x, y: m.y, btn: m.btn, presses: m.presses, seq: m.seq });
  });
  await new Promise<void>((r) => ws.once('open', () => r()));
  const phones = [new Phone(room, 'Ana'), new Phone(room, 'Beto')];
  await until(() => phones.every((p) => p.id > 0) && joined.length === 2, 'phones joined');
  const map = fixedMap('2')!;
  const g: Game = createGame({ mapId: map.id, rows: map.rows, spawns: map.spawns, n: 2, seed: 11, countdownMs: COUNTDOWN_MS });
  phones.forEach((p, rank) => addPlayer(g, p.id, rank, rank));
  const hs = createHintSync((m) => ws.send(JSON.stringify(m)));
  const mem = new Map(phones.map((p) => [p.id, { step: 0, since: 0, lastPress: -99, bin: false } as Mem]));
  const trackers = new Map(phones.map((p) => [p.id, new PressTracker()]));
  for (const p of phones) p.sendControls({ x: 0, y: 0, a: 0, b: false });
  await until(() => phones.every((p) => latest.get(p.id)?.seq === 0), 'baseline inputs');
  for (const p of phones) trackers.get(p.id)!.update(latest.get(p.id)!.presses);
  const dropped: { at: number; back: number } = { at: -1, back: -1 };
  for (let frame = 0; frame < o.frames; frame++) {
    if (o.dropAt === frame) { phones[0]!.ws.close(); dropped.at = g.time; }
    if (o.dropAt !== undefined && frame === o.dropAt + (o.dropFor ?? 0)) { phones[0]!.connect(); dropped.back = g.time; await until(() => phones[0]!.ws.readyState === WebSocket.OPEN, 'the phone is back'); }
    const away = o.dropAt !== undefined && frame >= o.dropAt && frame < o.dropAt + (o.dropFor ?? 0);
    const sending = phones.filter((p) => !(away && p === phones[0]));
    for (const p of sending) { p.frame = frame; p.sendControls(decide(g, g.players.get(p.id)!, phones.indexOf(p), mem.get(p.id)!, frame)); }
    await until(() => sending.every((p) => latest.get(p.id)!.seq >= p.seq - 1), `inputs of frame ${frame}`, 3000);
    const controls = new Map<number, Controls>();
    for (const p of phones) {
      const l = latest.get(p.id)!;
      const d = trackers.get(p.id)!.update(l.presses);
      controls.set(p.id, away && p === phones[0] ? { x: 0, y: 0, a: 0, b: false } : { x: l.x, y: l.y, a: d[0] ?? 0, b: (l.btn & 2) !== 0, bTaps: d[1] ?? 0 });
    }
    tick(g, controls);
    if (g.countdown <= 0) hs.sync(g, g.time); // the same call the real screen makes after each frame (sim ms stand in for the clock)
    if (frame % 4 === 0) await tickOf();
  }
  for (let i = 0; i < 40; i++) await tickOf();
  return { g, phones, ws, dropped, hs };
}

describe('contextual buttons over the relay', () => {
  it('a bot cooking a pizza hears the recipe in its buttons: Tomar masa, Poner en tabla, Estirar, Tomar picado, Al horno, Tomar tomate... Sacar pizza, Entregar', async () => {
    const r = await playCoop('hw1', { frames: Math.ceil((COUNTDOWN_MS + 70_000) / TICK_MS) });
    expect(r.g.delivered, 'the bots really cooked and served a pizza').toBeGreaterThan(0);
    for (const p of r.phones) {
      const seen = p.hints.map((h) => h.m.a);
      const order = ['Tomar masa', 'Poner en tabla', 'Tomar picado', 'Al horno', 'Tomar tomate', 'Tomar plato', 'Sacar pizza', 'Entregar'];
      let at = 0;
      for (const label of order) { at = seen.indexOf(label, at); expect(at, `${p.name} never heard "${label}" after the previous step`).toBeGreaterThanOrEqual(0); }
      expect(p.hints.some((h) => h.m.b === 'Estirar' && h.m.bIcon === 'chop' && !h.m.bOff), 'B says Estirar over the dough on the board').toBe(true);
      expect(p.hints.some((h) => h.m.b === 'Picar' && !h.m.bOff), 'B says Picar over the tomato').toBe(true);
      expect(p.hints.some((h) => h.m.a === 'Tomar masa' && h.m.aIcon === 'dough')).toBe(true);
      expect(p.hints.some((h) => h.m.a === 'Entregar' && h.m.aIcon === 'bell' && !h.m.aOff)).toBe(true);
      expect(p.hints.some((h) => h.m.aOff), 'with nothing in front the button greys').toBe(true);
      // each message is the whole state: no stale half (a label with an icon, never an icon alone)
      for (const h of p.hints) { if (h.m.a !== null) expect(h.m.aIcon).toBeTruthy(); if (h.m.b !== null) expect(h.m.bIcon).toBeTruthy(); }
      // not a flood: the sync is throttled per chef (HINT_MIN_MS) and unchanged states are silent
      expect(p.hints.length).toBeLessThan(r.g.time / 50);
    }
    r.ws.close(); r.phones.forEach((p) => p.ws.close());
  }, 60_000);

  it('a phone that drops for a few seconds and returns hears its state again within HINT_REFRESH_MS, without anything to catch up on', async () => {
    const dropAt = Math.ceil(12_000 / TICK_MS), dropFor = Math.ceil(5_000 / TICK_MS);
    const r = await playCoop('hw2', { frames: dropAt + dropFor + Math.ceil(3_000 / TICK_MS), dropAt, dropFor });
    const ana = r.phones[0]!;
    const after = ana.hints.filter((h) => h.at >= dropAt + dropFor);
    expect(after.length, 'the returning phone was told').toBeGreaterThan(0);
    const firstAfter = after[0]!;
    expect((firstAfter.at - (dropAt + dropFor)) * TICK_MS, `told ${(firstAfter.at - (dropAt + dropFor)) * TICK_MS} ms after it came back`).toBeLessThanOrEqual(HINT_REFRESH_MS + 100);
    expect(firstAfter.m.a, 'a whole state, with its label').toBeTruthy();
    r.ws.close(); r.phones.forEach((p) => p.ws.close());
  }, 60_000);
});
