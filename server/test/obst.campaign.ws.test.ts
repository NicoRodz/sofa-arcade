// "Obstaculos en cadena", campaign layer for 2 (A2) over the real relay: two phones are bots on websockets, the "screen" is a Node client that
// runs the host's side with the same pure session the real screen uses (ObstSession). Every stick and button a bot sends goes phone -> relay ->
// screen -> session.receive -> step, in lockstep (the screen waits for both inputs of a frame before it advances 1/60 s).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { type ClientMsg, type ServerMsg } from '@party/shared';
import { LEVELS, ObstBot, ObstSession, ROPE_LEN, snapshot, type ObstEvent } from '../../shared/games/obstaculos';
import { startServer } from '../src/server';

let srv: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => { srv = await startServer({ port: 0, mode: 'none' }); });
afterAll(async () => { await srv.close(); });

const tickOf = () => new Promise<void>((r) => setImmediate(r));
const until = async (f: () => boolean, what: string, ms = 5000) => {
  const end = Date.now() + ms;
  while (!f()) { if (Date.now() > end) throw new Error(`timeout: ${what}`); await tickOf(); }
};

class Phone {
  ws: WebSocket;
  id = 0;
  presses = [0, 0]; seq = 0;
  bot!: ObstBot; // created once the relay told the slot
  constructor(room: string, name: string) {
    this.ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws?room=${room}`);
    this.ws.on('open', () => this.send({ t: 'join', name, token: `tok-${room}-${name}` }));
    this.ws.on('message', (d) => { const m = JSON.parse(d.toString()) as ServerMsg; if (m.t === 'joined') this.id = m.player.id; });
  }
  send(m: ClientMsg) { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }
  sendInput(x: number, y: number, jump: boolean, grab: boolean) {
    if (jump) this.presses[0] = (this.presses[0]! + 1) % 65536;
    if (grab) this.presses[1] = (this.presses[1]! + 1) % 65536;
    this.send({ t: 'input', seq: this.seq++, x, y, btn: 0, presses: [...this.presses], ts: Date.now() });
  }
}

class Screen {
  ws: WebSocket;
  slots = new Map<number, number>();
  latest = new Map<number, { x: number; y: number; presses: number[]; seq: number }>();
  constructor(room: string) {
    this.ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws?role=screen&room=${room}`);
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      if (m.t === 'player_joined') this.slots.set(m.player.id, m.player.slot);
      else if (m.t === 'input') this.latest.set(m.playerId, { x: m.x, y: m.y, presses: m.presses, seq: m.seq });
    });
  }
}

// Two bots play `levelIdx` (1-based of LEVELS) in Encadenados; `campaign` switches the layer on. Returns what the session saw.
async function play(room: string, levelIdx: number, campaign: boolean, maxSec = 120) {
  const screen = new Screen(room);
  await new Promise<void>((r) => screen.ws.once('open', () => r()));
  const phones = [new Phone(room, 'Nico'), new Phone(room, 'Angi')];
  await until(() => phones.every((p) => p.id > 0) && screen.slots.size === 2, 'phones joined');
  const slots = phones.map((p) => screen.slots.get(p.id)!);
  phones.forEach((p, i) => { p.bot = new ObstBot(slots[i]!); }); // the bot plays the slot the relay gave
  const s = new ObstSession({ mode: 'chain', difficulty: 'normal', level: 0, seed: 1, slots, levels: [LEVELS[levelIdx - 1]!], ...(campaign ? { campaign: { world: 'forest' as const } } : {}) });
  for (const p of phones) p.sendInput(0, 0, false, false); // the first sample of a phone is the baseline of its press counters
  await until(() => phones.every((p) => screen.latest.get(p.id)?.seq === 0), 'baseline inputs');
  const events: ObstEvent[] = [];
  let frames = 0;
  while (s.status !== 'between' && !s.over && frames < (maxSec + 4) * 60) {
    const snap = snapshot(s.world);
    const view = { tick: s.world.tick, grid: s.world.grid, players: snap.players, goal: snap.goal };
    for (const p of phones) { const o = p.bot.decide(view); p.sendInput(o.x, o.y, o.jump, o.grab); }
    const want = frames + 1;
    await until(() => phones.every((p) => screen.latest.get(p.id)!.seq >= want), `inputs of frame ${want}`, 3000);
    for (const p of phones) { const l = screen.latest.get(p.id)!; s.receive(screen.slots.get(p.id)!, { x: l.x, y: l.y, presses: l.presses }); }
    events.push(...s.advance(1000 / 60));
    frames++;
  }
  screen.ws.close(); phones.forEach((p) => p.ws.close());
  return { s, events, frames };
}

describe('campaign layer for 2 over the relay: bots on websockets', () => {
  it('Marea alta (l03) in the forest world: the two bots clear it with the campaign rope, shared hearts and super jump', async () => {
    const r = await play('obc1', 3, true);
    const w = r.s.world;
    expect(r.frames).toBeGreaterThan(300); // a whole level went through the wire
    expect(w.status).toBe('cleared');
    expect(w.camp?.world).toBe('forest');
    expect(w.ropes[0]!.links[0]!.base).toBeCloseTo(ROPE_LEN * 1.2, 6);
    expect(w.result!.campaign).toMatchObject({ refills: 0 });
    expect(w.result!.campaign!.heartsLost).toBe(w.heartsLost);
    const names = r.events.map((e) => e.name);
    expect(names).toContain('obst.levelClear');
    expect(names).toContain('obst.superJump'); // two bots jump together: the pair is paired by the sim, not by the test
    expect(names).not.toContain('obst.heartsOut');
    expect(snapshot(w).camp!.hearts).toBe(6);
  }, 120_000);

  it('Avalancha (l12): the chase is cleared with the campaign layer on (hazard speed x0.8 of the forest)', async () => {
    const r = await play('obc2', 12, true);
    expect(r.s.world.status).toBe('cleared');
    expect(r.s.world.ent.hazard!.speed).toBeCloseTo(LEVELS[11]!.hazard!.speed * 0.8, 6);
    expect(r.s.world.result!.campaign).toBeDefined();
  }, 120_000);

  it('the same bots without the campaign option play the quick match: old rope, no campaign events, no campaign result', async () => {
    const r = await play('obc3', 3, false);
    const w = r.s.world;
    expect(w.status).toBe('cleared');
    expect(w.camp).toBeNull();
    expect(w.ropes[0]!.links[0]!.base).toBe(ROPE_LEN);
    expect(w.result!.campaign).toBeUndefined();
    expect(r.events.map((e) => e.name).filter((n) => /superJump|edgeAssist|heartsOut|signal|countdown/.test(n))).toEqual([]);
  }, 120_000);
});
