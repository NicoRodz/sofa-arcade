// The oven that burns, over the relay: bots on websockets play a cooperative round of map 1 with the burn rules on. The phones send their inputs, the relay hands them
// to a Node "screen" that hosts the sim (one tick per frame), exactly like sabotage.ws.test.ts. One pizza is left to burn in an oven; the bots are scripted chefs:
// a cook (the golden recipe of golden/bot.ts), a firefighter (walks to what is burning and holds Picar in front of it) and an idle one that does nothing.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { DEFAULT_CONFIG, PressTracker, type ClientMsg, type ServerMsg } from '@party/shared';
import { COUNTDOWN_MS, TICK_MS, addPlayer, createGame, tick, type Controls, type Game, type Player, type Station } from '@party/shared/game';
import { Emitter, type GameEvents } from '@party/shared/events';
import { DOUSE_MS, GRACE_MS } from '@party/shared/burn';
import { DIRS, fixedMap, isFloor } from '../../shared/maps';
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

class Phone {
  ws: WebSocket;
  id = 0;
  buzzes: string[] = [];
  phase: Extract<ServerMsg, { t: 'phase' }> | null = null;
  presses = [0, 0]; seq = 0; heldB = false;
  constructor(room: string, name: string) {
    this.ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws?room=${room}`);
    this.ws.on('open', () => this.send({ t: 'join', name, token: `tok-${room}-${name}` }));
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      if (m.t === 'joined') this.id = m.player.id;
      else if (m.t === 'phase') this.phase = m;
      else if (m.t === 'buzz') this.buzzes.push(m.kind);
    });
  }
  send(m: ClientMsg) { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }
  sendControls(c: Controls) {
    if (c.a > 0) this.presses[0] = (this.presses[0]! + c.a) % 65536;
    if (c.b && !this.heldB) this.presses[1] = (this.presses[1]! + 1) % 65536;
    this.heldB = c.b;
    this.send({ t: 'input', seq: this.seq++, x: c.x, y: c.y, btn: c.b ? 2 : 0, presses: [...this.presses], ts: Date.now() });
  }
}

type Role = 'cook' | 'firefighter' | 'idle';
const idle: Controls = { x: 0, y: 0, a: 0, b: false };

/** First step of the walk from the chef's tile to a tile that touches the station, as a stick vector; null when it already stands next to it. */
function walkTo(g: Game, p: Player, s: Station): { x: number; y: number } | null {
  const from: [number, number] = [Math.floor(p.x), Math.floor(p.y)];
  const touches = (x: number, y: number) => DIRS.some(([dx, dy]) => x + dx === s.tx && y + dy === s.ty);
  if (touches(...from)) return null;
  const prev = new Map<string, string | null>([[from.join(), null]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    if (touches(x, y)) {
      let k = `${x},${y}`;
      while (prev.get(k) && prev.get(prev.get(k)!) !== null) k = prev.get(k)!;
      const [nx, ny] = k.split(',').map(Number) as [number, number];
      const dx = nx + 0.5 - p.x, dy = ny + 0.5 - p.y, l = Math.hypot(dx, dy) || 1;
      return { x: dx / l, y: dy / l };
    }
    for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy, k = `${nx},${ny}`; if (isFloor(g.grid, nx, ny) && !prev.has(k)) { prev.set(k, `${x},${y}`); queue.push([nx, ny]); } }
  }
  return null;
}
function firefighter(g: Game, p: Player): Controls {
  const s = g.stations.filter((x) => x.fire !== undefined).sort((a, b) => Math.hypot(a.tx - p.x, a.ty - p.y) - Math.hypot(b.tx - p.x, b.ty - p.y))[0];
  if (!s) return idle;
  const step = walkTo(g, p, s);
  if (step) return { ...step, a: 0, b: false };
  const dx = s.tx + 0.5 - p.x, dy = s.ty + 0.5 - p.y, l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l, a: 0, b: true }; // facing it, Picar held
}

async function playRound(room: string, o: { roles: Role[]; seconds: number; burnAtMs?: number }) {
  const bus = new Emitter<GameEvents>();
  const log: { t: number; type: string; p: Record<string, unknown> }[] = [];
  const screenWs = new WebSocket(`ws://127.0.0.1:${srv.port}/ws?role=screen&room=${room}`);
  const ids: number[] = [];
  const latest = new Map<number, { x: number; y: number; btn: number; presses: number[]; seq: number }>();
  screenWs.on('message', (d) => {
    const m = JSON.parse(d.toString()) as ServerMsg;
    if (m.t === 'player_joined' && !ids.includes(m.player.id)) ids.push(m.player.id);
    else if (m.t === 'input') latest.set(m.playerId, { x: m.x, y: m.y, btn: m.btn, presses: m.presses, seq: m.seq });
  });
  await new Promise<void>((r) => screenWs.once('open', () => r()));
  const phones = o.roles.map((_r, i) => new Phone(room, `Bot${i + 1}`));
  await until(() => phones.every((p) => p.id > 0) && ids.length === phones.length, 'phones joined');
  const map = fixedMap('1')!;
  const game = createGame({ mapId: map.id, rows: map.rows, spawns: map.spawns, difficulty: 'normal', n: phones.length, seed: 9, bus, countdownMs: COUNTDOWN_MS, burn: true, fire: true });
  game.params.roundMs = o.seconds * 1000;
  for (const k of ['oven:warn', 'oven:burnt', 'oven:rescued', 'fire:start', 'fire:spread', 'fire:out', 'fire:end', 'douseStart', 'douseStop', 'delivered'] as const) bus.on(k, ((p: never) => { log.push({ t: game.time, type: k, p: p as Record<string, unknown> }); }) as never);
  phones.forEach((p, rank) => addPlayer(game, p.id, rank, rank));
  screenWs.send(JSON.stringify({ t: 'config', ...DEFAULT_CONFIG }));
  screenWs.send(JSON.stringify({ t: 'phase', phase: 'playing' }));
  await until(() => phones.every((p) => p.phase?.phase === 'playing'), 'phase playing');
  const trackers = new Map(phones.map((p) => [p.id, new PressTracker()]));
  const mem = new Map(phones.map((p) => [p.id, { step: 0, since: 0, lastPress: -99, bin: false } as Mem]));
  for (const p of phones) p.sendControls(idle);
  await until(() => phones.every((p) => latest.get(p.id)?.seq === 0), 'baseline inputs');
  for (const p of phones) trackers.get(p.id)!.update(latest.get(p.id)!.presses);
  let frames = 0, burned = false;
  const limit = Math.ceil((COUNTDOWN_MS + game.params.roundMs) / TICK_MS) + 60;
  while (!game.over && frames < limit) {
    const want = frames + 1;
    if (!burned && o.burnAtMs !== undefined && game.time >= o.burnAtMs) { // a pizza that nobody takes out of the first oven
      burned = true;
      const oven = game.stations.find((s) => s.kind === 'pot')!;
      oven.inputs = [0, 1]; oven.progress = 1; oven.done = true; oven.readyAt = game.time;
    }
    phones.forEach((p, i) => {
      const gp = game.players.get(p.id)!;
      const role = o.roles[i]!;
      p.sendControls(role === 'firefighter' ? firefighter(game, gp) : role === 'cook' ? decide(game, gp, i, mem.get(p.id)!, frames) : idle);
    });
    await until(() => phones.every((p) => latest.get(p.id)!.seq >= want), `inputs of frame ${want}`, 3000);
    const controls = new Map<number, Controls>();
    for (const p of phones) {
      const l = latest.get(p.id)!;
      const d = trackers.get(p.id)!.update(l.presses);
      controls.set(p.id, { x: l.x, y: l.y, a: d[0] ?? 0, b: (l.btn & 2) !== 0, bTaps: d[1] ?? 0 });
    }
    tick(game, controls);
    frames++;
  }
  const of = (type: string) => log.filter((e) => e.type === type);
  const close = () => { screenWs.close(); phones.forEach((p) => p.ws.close()); };
  return { game, log, of, phones, frames, close };
}

describe('the oven that burns over the relay', () => {
  it('nobody takes the pizza out and nobody puts the fire out: it burns after the grace time, catches fire 5 s later, jumps to the counters and stays lit to the end', async () => {
    const r = await playRound('bn1', { roles: ['idle', 'idle'], seconds: 40, burnAtMs: 2000 });
    expect(r.game.over).toBe(true);
    expect(r.of('oven:warn')).toHaveLength(1);
    expect(r.of('oven:burnt')).toHaveLength(1);
    expect(r.of('fire:start')).toHaveLength(1);
    expect(r.of('fire:spread').length).toBeGreaterThanOrEqual(1);
    expect(r.of('fire:out')).toHaveLength(0);
    expect(r.of('douseStart')).toHaveLength(0);
    expect(r.of('fire:start')[0]!.t - r.of('oven:burnt')[0]!.t).toBeGreaterThan(4900);
    expect(r.of('oven:burnt')[0]!.t - 2000).toBeGreaterThan(GRACE_MS.normal - 50);
    expect(r.game.stations.some((s) => s.fire !== undefined)).toBe(true);
    r.close();
  }, 60_000);

  it('a firefighter that walks to the flames and holds Picar through the phone puts them out in DOUSE_MS of match time, while the cook goes on cooking', async () => {
    const r = await playRound('bn2', { roles: ['firefighter', 'cook'], seconds: 60, burnAtMs: 2000 });
    expect(r.game.over).toBe(true);
    const out = r.of('fire:out');
    expect(out.length, 'fires put out').toBeGreaterThanOrEqual(1);
    expect(out.every((e) => e.p.player === r.phones[0]!.id)).toBe(true);
    expect(r.of('douseStart').length).toBeGreaterThanOrEqual(1);
    const start = r.of('fire:start')[0]!;
    expect(out[0]!.t - start.t).toBeGreaterThanOrEqual(DOUSE_MS - 20);
    expect(out[0]!.t - start.t).toBeLessThan(DOUSE_MS + 6000); // the walk there
    expect(r.of('fire:end').length).toBeGreaterThanOrEqual(1);
    expect(r.game.stations.some((s) => s.fire !== undefined)).toBe(false); // every flame is out by the end
    expect(r.game.delivered, 'the cook cooked').toBeGreaterThanOrEqual(1);
    r.close();
  }, 120_000);
});
