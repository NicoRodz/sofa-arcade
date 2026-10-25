// Ayudante over the real relay: phones are bots on websockets. A phone switches the option on in the lobby (the relay tells the screen), the "screen" (a Node client
// with the same pure functions as the real one) builds the round from what it was told, and the bots cook with and without it. The point is that the profile does what
// it says through the whole wire: B reaches the sim as a press counter (one tap = one press), and the flag lives in the sim only for the chef that chose it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { DEFAULT_CONFIG, PressTracker, type ClientMsg, type LobbyConfig, type ServerMsg } from '@pichi/core';
import { COUNTDOWN_MS, TICK_MS, addPlayer, createGame, tick, type Controls, type Game } from '@pichi/game-pizzas/sim';
import { GAMES, modeOf } from '@pichi/core/games';
import { fixedMap } from '@pichi/game-pizzas/sim/maps';
import { lobbySetup, startVersusRound, syncTeams } from '@pichi/game-pizzas/sim/versus/lobby';
import { decide, type Mem } from '@pichi/game-pizzas/test/golden/bot';
import { startServer } from '../src/server';

let srv: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  srv = await startServer({ port: 0, mode: 'none' });
});
afterAll(async () => {
  await srv.close();
});

const tickOf = () => new Promise<void>((r) => setImmediate(r));
const until = async (f: () => boolean, what: string, ms = 5000) => {
  const end = Date.now() + ms;
  while (!f()) {
    if (Date.now() > end) throw new Error(`timeout: ${what}`);
    await tickOf();
  }
};

class Phone {
  ws: WebSocket;
  id = 0;
  assist: boolean | null = null; // what the relay last told this phone about its own choice
  presses = [0, 0];
  seq = 0;
  heldB = false;
  constructor(
    readonly room: string,
    readonly name: string,
  ) {
    this.ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws?room=${room}`);
    this.ws.on('open', () => this.send({ t: 'join', name, token: `tok-${room}-${name}` }));
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      if (m.t === 'joined') this.id = m.player.id;
      else if (m.t === 'assist' && m.playerId === this.id) this.assist = m.on;
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
}

class Screen {
  ws: WebSocket;
  assist = new Set<number>(); // the phones that chose Ayudante, as the screen learns it (assist messages and the player list)
  ids: number[] = [];
  slots = new Map<number, number>();
  latest = new Map<number, { x: number; y: number; btn: number; presses: number[]; seq: number }>();
  constructor(readonly room: string) {
    this.ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws?role=screen&room=${room}`);
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      if (m.t === 'player_joined') {
        this.slots.set(m.player.id, m.player.slot);
        if (!this.ids.includes(m.player.id)) this.ids.push(m.player.id);
        if (m.player.assist) this.assist.add(m.player.id);
      } else if (m.t === 'assist') {
        if (m.on) this.assist.add(m.playerId);
        else this.assist.delete(m.playerId);
      } else if (m.t === 'input') this.latest.set(m.playerId, { x: m.x, y: m.y, btn: m.btn, presses: m.presses, seq: m.seq });
    });
  }
  send(m: ClientMsg) {
    this.ws.send(JSON.stringify(m));
  }
}

/** How a bot presses B: 'hold' keeps it down while it chops (the old way), 'tap' presses it ONE frame per chop (what Ayudante is for). */
type Style = 'hold' | 'tap';
const asTap = () => {
  let sent = false;
  return (c: Controls): Controls => {
    if (!c.b) {
      sent = false;
      return c;
    }
    const first = !sent;
    sent = true;
    return { ...c, b: first };
  };
};

async function coopRound(room: string, o: { assist: boolean[]; style: Style; ms: number }) {
  const screen = new Screen(room);
  await new Promise<void>((r) => screen.ws.once('open', () => r()));
  const phones = o.assist.map((_a, i) => new Phone(room, `Bot${i + 1}`));
  await until(() => phones.every((p) => p.id > 0) && screen.ids.length === phones.length, 'phones joined');
  phones.forEach((p, i) => {
    if (o.assist[i]) p.send({ t: 'assist', on: true });
  });
  await until(
    () => screen.assist.size === o.assist.filter(Boolean).length && phones.every((p, i) => (p.assist ?? false) === o.assist[i]),
    'the relay told everybody',
  );
  screen.send({ t: 'phase', phase: 'playing' });
  const map = fixedMap('9')!;
  const g: Game = createGame({
    mapId: map.id,
    rows: map.rows,
    spawns: map.spawns,
    n: phones.length,
    seed: 22,
    difficulty: 'normal',
    countdownMs: COUNTDOWN_MS,
    assist: [...screen.assist],
  });
  phones.forEach((p, rank) => addPlayer(g, p.id, p.id - 1, rank));
  const mem = new Map(phones.map((p) => [p.id, { step: 0, since: 0, lastPress: -99, bin: false } as Mem]));
  const trackers = new Map(phones.map((p) => [p.id, new PressTracker()]));
  const taps = new Map(phones.map((p) => [p.id, asTap()]));
  for (const p of phones) p.sendControls({ x: 0, y: 0, a: 0, b: false });
  await until(() => phones.every((p) => screen.latest.get(p.id)?.seq === 0), 'baseline');
  for (const p of phones) trackers.get(p.id)!.update(screen.latest.get(p.id)!.presses);
  let chopDone = 0;
  g.bus.on('chopDone', () => {
    chopDone++;
  });
  const frames = Math.ceil((COUNTDOWN_MS + o.ms) / TICK_MS);
  for (let f = 0; f < frames; f++) {
    for (const p of phones) {
      const c = decide(g, g.players.get(p.id)!, p.id - 1, mem.get(p.id)!, f);
      p.sendControls(o.style === 'tap' ? taps.get(p.id)!(c) : c);
    }
    await until(() => phones.every((p) => screen.latest.get(p.id)!.seq >= p.seq - 1), `inputs of frame ${f}`, 3000);
    const controls = new Map<number, Controls>();
    for (const p of phones) {
      const l = screen.latest.get(p.id)!;
      const d = trackers.get(p.id)!.update(l.presses);
      controls.set(p.id, { x: l.x, y: l.y, a: d[0] ?? 0, b: (l.btn & 2) !== 0, bTaps: d[1] ?? 0 });
    }
    tick(g, controls);
    if (f % 8 === 0) await tickOf();
  }
  const out = { g, delivered: g.delivered, chopDone, flags: phones.map((p) => !!g.players.get(p.id)!.assist) };
  screen.ws.close();
  phones.forEach((p) => p.ws.close());
  return out;
}

describe('Ayudante over the relay (bots on websockets)', () => {
  it('the choice crosses the wire: phones -> relay -> screen -> sim, and ONLY the chefs that chose it carry the flag', async () => {
    const r = await coopRound('aw1', { assist: [true, false, true, false], style: 'hold', ms: 5000 });
    expect(r.flags).toEqual([true, false, true, false]);
    expect(r.g.assist.size).toBe(2);
  }, 60_000);

  it('cooking with B held (the usual way) works with and without it, and both teams of bots deliver pizzas', async () => {
    const plain = await coopRound('aw2', { assist: [false, false, false, false], style: 'hold', ms: 90_000 });
    const helped = await coopRound('aw3', { assist: [true, true, false, false], style: 'hold', ms: 90_000 });
    expect(plain.delivered, 'control: nobody on Ayudante').toBeGreaterThan(0);
    expect(helped.delivered, 'two of four on Ayudante').toBeGreaterThan(0);
    expect(plain.flags.some(Boolean)).toBe(false);
  }, 120_000);

  it('ONE TAP of B per chop, sent through the wire as a single press: nothing gets chopped without Ayudante, everything does with it', async () => {
    const plain = await coopRound('aw4', { assist: [false, false], style: 'tap', ms: 70_000 });
    const helped = await coopRound('aw5', { assist: [true, true], style: 'tap', ms: 70_000 });
    expect(plain.chopDone, 'control: a tap chops nothing').toBe(0);
    expect(plain.delivered).toBe(0);
    expect(helped.chopDone, 'with Ayudante the same taps chop').toBeGreaterThan(4);
    expect(helped.delivered, 'and the pizzas get served').toBeGreaterThan(0);
  }, 120_000);

  it('a mixed table: the chef with Ayudante chops with taps while the other chef (who taps too) does not', async () => {
    const mixed = await coopRound('aw6', { assist: [true, false], style: 'tap', ms: 60_000 });
    expect(mixed.chopDone, 'only the Ayudante chef can chop with taps').toBeGreaterThan(2);
    expect(mixed.flags).toEqual([true, false]);
  }, 60_000);

  it('versus: the lobby shows the k the Ayudante costs (1.03 for the team that has one), the round starts with it, a chef that dropped it before the start is back to 1', async () => {
    const versus = modeOf(GAMES[0], 'versus');
    const screen = new Screen('aw7');
    await new Promise<void>((r) => screen.ws.once('open', () => r()));
    const phones = ['A', 'B', 'C', 'D'].map((n) => new Phone('aw7', n));
    await until(() => phones.every((p) => p.id > 0) && screen.ids.length === 4, 'joined');
    phones[0]!.send({ t: 'assist', on: true });
    await until(() => screen.assist.has(phones[0]!.id), 'told');
    const config: LobbyConfig = {
      ...DEFAULT_CONFIG,
      modeId: 'versus',
      modeOptions: { handicap: true, sabotage: 'off' },
      map: 'V1',
      seed: 11,
    };
    const teams = syncTeams(versus, null, screen.ids, config.seed, false)!;
    const mine = teams.find((t) => t.playerIds.includes(phones[0]!.id))!;
    const setup = lobbySetup(versus, teams, screen.assist);
    expect(setup.ok).toBe(true);
    expect(setup.k[mine.id]).toBe(1.03);
    expect(setup.k[1 - mine.id]).toBe(1);
    const round = startVersusRound({
      teams,
      choice: 'V1',
      difficulty: 'normal',
      seed: 11,
      modeOptions: config.modeOptions,
      slotOf: (id) => screen.slots.get(id) ?? 0,
      rand: () => 0.2,
      assist: [...screen.assist],
    });
    expect(round.game.teams.map((t) => t.k)).toEqual(setup.k);
    expect([...round.game.players.values()].filter((p) => p.assist).map((p) => p.id)).toEqual([phones[0]!.id]);
    // the phone changes its mind in the lobby, the screen starts again from what it now knows
    phones[0]!.send({ t: 'assist', on: false });
    await until(() => !screen.assist.has(phones[0]!.id), 'told it is off');
    const again = startVersusRound({
      teams,
      choice: 'V1',
      difficulty: 'normal',
      seed: 11,
      modeOptions: config.modeOptions,
      slotOf: (id) => screen.slots.get(id) ?? 0,
      rand: () => 0.2,
      assist: [...screen.assist],
    });
    expect(again.game.teams.map((t) => t.k)).toEqual([1, 1]);
    screen.ws.close();
    phones.forEach((p) => p.ws.close());
  }, 30_000);
});
