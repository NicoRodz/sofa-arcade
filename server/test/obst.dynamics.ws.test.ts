// "Obstaculos en cadena", campaign dynamics 4-9 and the throw niche (A5) over the real relay: two phones are bots on websockets, the "screen" is a Node client that runs the
// host's side with the same pure session the real screen uses (ObstSession), in lockstep (it waits for both inputs of a frame before it advances 1/60 s). Every stick and button
// a bot sends goes phone -> relay -> screen -> session.receive -> step. The bots are the controllers of obst.dynamics.scenarios.ts (they read the snapshot like the screen does).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { type ClientMsg, type ServerMsg } from '@party/shared';
import { ObstSession, TILE, snapshot, type ObstEvent } from '../../shared/games/obstaculos';
import { startServer } from '../src/server';
import { SCENARIOS, type Scenario } from './obst.dynamics.scenarios';

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

// Two bots play the scenario's level; `stop` ends it early. Returns what the session saw.
async function play(room: string, sc: Scenario, o: { campaign?: boolean; maxSec?: number; stop?: (s: ObstSession) => boolean } = {}) {
  const screen = new Screen(room);
  await new Promise<void>((r) => screen.ws.once('open', () => r()));
  const phones = [new Phone(room, 'Nico'), new Phone(room, 'Angi')];
  await until(() => phones.every((p) => p.id > 0) && screen.slots.size === 2, 'phones joined');
  const slots = phones.map((p) => screen.slots.get(p.id)!);
  const campaign = o.campaign !== false && sc.world;
  const s = new ObstSession({ mode: sc.mode, difficulty: 'normal', level: 0, seed: 1, slots, levels: [sc.level], ...(campaign ? { campaign: { world: sc.world! } } : {}) });
  for (const p of phones) p.sendInput(0, 0, false, false); // the first sample of a phone is the baseline of its press counters
  await until(() => phones.every((p) => screen.latest.get(p.id)?.seq === 0), 'baseline inputs');
  const ctrl = sc.make();
  const events: ObstEvent[] = [];
  let frames = 0;
  const maxFrames = ((o.maxSec ?? sc.maxSec) + 4) * 60;
  while (s.status !== 'between' && !s.over && frames < maxFrames && !(o.stop?.(s))) {
    const snap = snapshot(s.world);
    phones.forEach((p, i) => { const b = ctrl(slots[i]!, snap, frames); p.sendInput(b.x, b.y, b.jump, b.grab); });
    const want = frames + 1;
    await until(() => phones.every((p) => screen.latest.get(p.id)!.seq >= want), `inputs of frame ${want}`, 3000);
    for (const p of phones) { const l = screen.latest.get(p.id)!; s.receive(screen.slots.get(p.id)!, { x: l.x, y: l.y, presses: l.presses }); }
    events.push(...s.advance(1000 / 60));
    frames++;
  }
  screen.ws.close(); phones.forEach((p) => p.ws.close());
  return { s, events, frames };
}
const names = (ev: ObstEvent[]) => ev.map((e) => e.name);
const data = <N extends ObstEvent['name']>(ev: ObstEvent[], n: N) => ev.filter((e) => e.name === n).map((e) => e.data as Extract<ObstEvent, { name: N }>['data']);
const sc = (id: string) => SCENARIOS[id]!();

describe('campaign dynamics 4-9 over the relay: two bots on websockets', () => {
  it('4 balance: slot 0 walks onto plate D and stands there; D goes down its 3 tiles at 2 tiles/s, E rises, the rider goes along, one obst.balance rings', async () => {
    const r = await play('obd1', sc('balance'), { stop: (s) => s.world.ent.objectives.find((o) => o.letter === 'D')!.oy >= 3 * TILE - 0.01 });
    const w = r.s.world;
    const D = w.ent.objectives.find((o) => o.letter === 'D')!, E = w.ent.objectives.find((o) => o.letter === 'E')!;
    expect(D.oy).toBeCloseTo(3 * TILE, 6);
    expect(E.oy).toBeCloseTo(-3 * TILE, 6);
    expect(w.players[0]!.body.y + 46).toBeCloseTo(17 * TILE + 3 * TILE, 0); // standing on D, now 3 tiles lower
    expect(data(r.events, 'obst.balance')).toEqual([{ id: 'D', other: 'E' }]);
    expect(r.frames / 60).toBeLessThan(3 + 3); // 3 s of countdown + the ride (1.5 s) + walking to it
  }, 60_000);

  it('5 target: slot 0 runs and jumps through the diana, the gate opens for 4 s, both run through it and clear the level', async () => {
    const r = await play('obd2', sc('target'));
    expect(r.s.world.status).toBe('cleared');
    expect(data(r.events, 'obst.target')).toEqual([{ id: 'a', player: 0, seconds: 4 }]);
    expect(data(r.events, 'obst.gate').filter((g) => g.open)).toHaveLength(1);
    expect(r.s.world.players.every((p) => p.inGoal)).toBe(true);
  }, 60_000);

  it('5 target, quick match twin: the same bots never open the gate (the diana is inert outside a campaign)', async () => {
    const r = await play('obd2b', sc('target'), { campaign: false, maxSec: 12 });
    expect(r.s.world.status).toBe('playing');
    expect(names(r.events)).not.toContain('obst.target');
  }, 60_000);

  it('6 soft enemies: two beetles in the way shove the bots around (obst.enemy), nobody dies, no heart is spent, the level is cleared', async () => {
    const r = await play('obd3', sc('enemies'));
    const w = r.s.world;
    expect(w.status).toBe('cleared');
    expect(data(r.events, 'obst.enemy').some((e) => e.action === 'push')).toBe(true);
    expect(w.deaths).toBe(0);
    expect(w.heartsLost).toBe(0);
  }, 90_000);

  it('7 ice: the bots cross an ice sheet and a wall at the end of it (obst.ice rings when they step onto it) and clear the level', async () => {
    const r = await play('obd4', sc('ice'));
    expect(r.s.world.status).toBe('cleared');
    expect(names(r.events)).toContain('obst.ice');
    expect(r.s.world.players.every((p) => p.inGoal)).toBe(true);
  }, 90_000);

  it('8 wind: gusts of 1 s every 3 s with a warning ahead blow across a gap; the phases ring in order and the bots get both across', async () => {
    const r = await play('obd5', sc('wind'));
    expect(r.s.world.status).toBe('cleared');
    const ph = data(r.events, 'obst.wind').map((e) => e.phase);
    expect(ph.slice(0, 5)).toEqual(['warn', 'gust', 'calm', 'warn', 'gust']);
    expect(data(r.events, 'obst.wind').every((e) => e.dir === -1)).toBe(true);
  }, 120_000);

  it('9 pickaxe: slot 0 takes it, climbs a 5-tile ice wall, hands it down the rope with B, slot 1 climbs the same wall, they walk to the goal', async () => {
    const r = await play('obd6', sc('pickaxe'));
    expect(r.s.world.status).toBe('cleared');
    expect(data(r.events, 'obst.pickaxe').map((e) => `${e.player}${e.action}`)).toEqual(['0take', '0climb', '0top', '0pass', '1climb', '1top']);
    expect(r.s.world.deaths).toBe(0);
    expect(r.s.world.players.every((p) => p.inGoal)).toBe(true);
  }, 90_000);

  it('throw niche: tied, slot 0 throws slot 1 across a 5-tile pit (liquid 7 tiles down), slot 1 plants, then walks off and hauls slot 0 up the far face', async () => {
    const r = await play('obd7', sc('throw'));
    const w = r.s.world;
    expect(w.status).toBe('cleared');
    expect(data(r.events, 'obst.throw')).toHaveLength(1);
    expect(data(r.events, 'obst.throw')[0]!.vx).toBeCloseTo(420 * 1.3, 6); // the campaign launch is x1.3
    expect(names(r.events)).toContain('obst.edgeAssist'); // the thrower came up the face
    expect(w.deaths).toBe(0);
  }, 90_000);

  it('throw niche, quick match twin: the same two bots with the old throw and the old rope do not get across (they never clear it)', async () => {
    const r = await play('obd7b', sc('throw'), { campaign: false, maxSec: 25 });
    expect(r.s.world.status).toBe('playing');
    expect(data(r.events, 'obst.throw')).toHaveLength(1); // they did throw: it just does not reach
    expect(data(r.events, 'obst.throw')[0]!.vx).toBe(420);
  }, 120_000);
});

describe('campaign dynamics 10-12 over the relay (A6): two bots on websockets', () => {
  it('10 lantern: slot 0 takes the lantern and carries the light over a 6-tile pit bridged by crystals, slot 1 right behind it; the crystals light up (obst.lantern) and the level is cleared with no deaths', async () => {
    const r = await play('obe1', sc('lantern'));
    const w = r.s.world;
    const acts = data(r.events, 'obst.lantern').map((e) => e.action);
    expect(acts[0]).toBe('take');
    expect(acts).toContain('light'); // (a few lights and dims ring: the crystals change a column at a time as the circle moves)
    expect(acts.indexOf('dim')).toBeGreaterThan(acts.indexOf('light')); // behind them the bridge goes dark again
    expect(data(r.events, 'obst.lantern').filter((e) => e.action === 'light').every((e) => e.player === 0)).toBe(true);
    expect(w.status).toBe('cleared');
    expect(w.deaths).toBe(0);
    expect(w.players.every((p) => p.inGoal)).toBe(true);
  }, 90_000);

  it('10 lantern, quick match twin: no lantern, no light, no dark; the crystals are air, so the same bots walk into the pit and die', async () => {
    const r = await play('obe1b', sc('lantern'), { campaign: false, maxSec: 20 });
    expect(names(r.events).filter((n) => n === 'obst.lantern')).toEqual([]);
    expect(r.s.world.ent.lanterns).toEqual([]);
    expect(data(r.events, 'obst.death').some((d) => d.cause === 'liquid')).toBe(true);
  }, 60_000);

  it('11 bungee: slot 0 anchors to the elastic ring, slot 1 walks off the edge: the rope stretches past 1.3x its length (up to 1.6x), obst.bungee rings, and slot 1 is never sent to a bubble', async () => {
    let max = 0;
    const r = await play('obe2', sc('bungee'), { stop: (s) => { const [a, b] = s.world.players; max = Math.max(max, Math.hypot(a!.body.x - b!.body.x, a!.body.y - b!.body.y)); return s.world.tick > 600; } });
    const rope = 3.5 * TILE * 1.2;
    expect(max).toBeGreaterThan(1.3 * rope);
    expect(max).toBeLessThan(1.6 * rope + 8);
    expect(data(r.events, 'obst.bubble')).toEqual([]);
    expect(data(r.events, 'obst.bungee').length).toBeGreaterThanOrEqual(1);
    expect(data(r.events, 'obst.bungee')[0]!.player).toBe(1);
  }, 90_000);

  it('12 sinkers: both spawn on rock D, which sinks 1 tile/s (2 characters) down to its 3 tiles; one obst.sinker with load 2', async () => {
    const r = await play('obe3', sc('sinkers'), { stop: (s) => s.world.tick > 360 });
    const D = r.s.world.ent.objectives.find((o) => o.letter === 'D')!;
    expect(D.oy).toBeCloseTo(3 * TILE, 6);
    expect(data(r.events, 'obst.sinker')).toEqual([{ id: 'D', load: 2 }]);
    expect(r.s.world.ent.objectives.find((o) => o.letter === 'E')!.oy).toBe(0);
  }, 60_000);

  it('12 geyser: the vent bubbles, erupts and throws the players that wait in it high above the floor (more than a jump), every 4 s: warn, gush, calm', async () => {
    let top = Infinity;
    const r = await play('obe4', sc('geyser'), { stop: (s) => { for (const p of s.world.players) top = Math.min(top, p.body.y); return s.world.tick > 720; } });
    const ph = data(r.events, 'obst.geyser').map((e) => e.phase);
    expect(ph.slice(0, 3)).toEqual(['warn', 'gush', 'calm']);
    expect(15 * TILE + 2 - top).toBeGreaterThan(300); // a normal jump lifts the head 173 px
  }, 90_000);
});
