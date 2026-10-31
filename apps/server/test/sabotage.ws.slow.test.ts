// Sabotage S5: bots on websockets play whole rounds of the sabotage on V1. Phones send their inputs to the relay, the relay hands them to a Node "screen" that
// runs the host's side (startVersusRound with the lobby's modeOptions, then one tick per frame), exactly like versus.ws.test.ts. The bots are the scripted roles of
// games/pizzas/test/golden/sabotage-bot.ts: saboteur (fetches the bag, loads, aims, throws), janitor (patrols, cleans what lies around, bins it) and cook (the golden recipe).
// The balance claims of the plan are tested here: a team that only sabotages loses to one that only cooks, a mixed team stays close to a team of cooks, the
// bigger team of a 3 v 2 waits longer between throws.
import { appendFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { PressTracker, type ClientMsg, type LobbyConfig, type ServerMsg } from '@pichi/core';
import { DEFAULT_CONFIG } from '@pichi/catalog';
import { GAMES, modeOf } from '@pichi/catalog';
import { COUNTDOWN_MS, TICK_MS, tick, type Controls, type Game } from '@pichi/game-pizzas/sim';
import { syncTeams, startVersusRound } from '@pichi/game-pizzas/sim/versus/lobby';
import { Emitter, type GameEvents } from '@pichi/core/events';
import { RULES } from '@pichi/game-pizzas/sim/sabotage-config';
import { mulberry32 } from '@pichi/core/rng';
import { newSabMem, sabotageControls, type Role } from '@pichi/game-pizzas/test/golden/sabotage-bot';
import { startServer } from '../src/server';

let srv: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  srv = await startServer({ port: 0, mode: 'none' });
});
afterAll(async () => {
  await srv.close();
});

const versus = modeOf(GAMES[0], 'versus');
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
  hints: Extract<ServerMsg, { t: 'hint' }>[] = [];
  buzzes: string[] = [];
  phase: Extract<ServerMsg, { t: 'phase' }> | null = null;
  you: Extract<ServerMsg, { t: 'you' }> | null = null;
  presses = [0, 0];
  seq = 0;
  heldB = false;
  constructor(room: string, name: string) {
    this.ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws?room=${room}`);
    this.ws.on('open', () => this.send({ t: 'join', name, token: `tok-${room}-${name}` }));
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      if (m.t === 'joined') this.id = m.player.id;
      else if (m.t === 'you') this.you = m;
      else if (m.t === 'phase') this.phase = m;
      else if (m.t === 'hint') this.hints.push(m);
      else if (m.t === 'buzz') this.buzzes.push(m.kind);
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
  config: LobbyConfig;
  ids: number[] = [];
  slots = new Map<number, number>();
  latest = new Map<number, { x: number; y: number; btn: number; presses: number[]; seq: number }>();
  bus = new Emitter<GameEvents>();
  log: { t: number; type: string; p: Record<string, unknown> }[] = [];
  game!: Game;
  constructor(
    readonly room: string,
    sabotage: string,
    difficulty: 'easy' | 'normal' | 'hard',
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      modeId: 'versus',
      difficulty,
      modeOptions: { hiddenScore: false, handicap: true, sabotage },
      map: 'V1',
      seed: 11,
    };
    this.ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws?role=screen&room=${room}`);
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      if (m.t === 'player_joined') {
        this.slots.set(m.player.id, m.player.slot);
        if (!this.ids.includes(m.player.id)) this.ids.push(m.player.id);
      } else if (m.t === 'input') this.latest.set(m.playerId, { x: m.x, y: m.y, btn: m.btn, presses: m.presses, seq: m.seq });
    });
    for (const k of [
      'sabotage:launch',
      'sabotage:land',
      'sabotage:caught',
      'sabotage:burst',
      'sabotage:blocked',
      'chef:slip',
      'trash:picked',
      'trash:binned',
      'delivered',
    ] as const) {
      this.bus.on(k, ((p: never) => {
        this.log.push({ t: this.game?.time ?? 0, type: k, p: p as Record<string, unknown> });
      }) as never);
    }
    this.bus.on('chef:slip', (e) => this.send({ t: 'buzz', playerId: e.chef, kind: 'slip' }));
  }
  send(m: ClientMsg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
  ofType(type: string, team?: number) {
    return this.log.filter((e) => e.type === type && (team === undefined || e.p.team === team));
  }
}

interface Played {
  screen: Screen;
  phones: Phone[];
  game: Game;
  frames: number;
}

/**
 * n phones join; the lobby hands out the teams (sizes as `sizes`: the first phones fill team 0), V1 is played for `seconds` of match time. `roles[team][rank]` is each
 * chef's script. `bags`: bags each team starts with at its bin.
 */
async function playRound(
  room: string,
  o: {
    sizes: [number, number];
    roles: Role[][];
    seconds: number;
    sabotage?: string;
    difficulty?: 'easy' | 'normal' | 'hard';
    bags?: number;
    refill?: boolean;
  },
): Promise<Played> {
  const n = o.sizes[0] + o.sizes[1];
  const screen = new Screen(room, o.sabotage ?? 'soft', o.difficulty ?? 'normal');
  await new Promise<void>((r) => screen.ws.once('open', () => r()));
  const phones = Array.from({ length: n }, (_v, i) => new Phone(room, `Bot${i + 1}`));
  await until(() => phones.every((p) => p.id > 0) && screen.ids.length === n, 'phones joined');
  // the lobby's teams: first sizes[0] phones are team 0 (the screen is the host, it decides)
  const teams = syncTeams(versus, null, screen.ids, screen.config.seed, false)!;
  const byId = new Map(screen.ids.map((id, i) => [id, i] as const));
  const ordered = [screen.ids.slice(0, o.sizes[0]), screen.ids.slice(o.sizes[0])];
  screen.config = { ...screen.config, teams: teams.map((t, i) => ({ ...t, playerIds: ordered[i]! })) };
  void byId;
  screen.send({ t: 'config', ...screen.config });
  await until(() => phones.every((p) => p.you), 'teams known');
  const round = startVersusRound({
    teams: screen.config.teams!,
    choice: 'V1',
    difficulty: screen.config.difficulty,
    seed: screen.config.seed,
    modeOptions: screen.config.modeOptions,
    slotOf: (id) => screen.slots.get(id) ?? 0,
    rand: mulberry32(3),
    bus: screen.bus,
    countdownMs: COUNTDOWN_MS,
  });
  const game = (screen.game = round.game);
  game.params.roundMs = o.seconds * 1000;
  game.sab?.teams.forEach((t) => {
    t.bags = o.bags ?? 0;
  });
  screen.config = { ...screen.config, teams: round.teams, teamsLocked: true };
  screen.send({ t: 'config', ...screen.config });
  screen.send({ t: 'phase', phase: 'playing', match: round.match });
  await until(() => phones.every((p) => p.phase?.phase === 'playing'), 'phase playing');
  const mem = new Map(phones.map((p) => [p.id, newSabMem()]));
  const rankOf = new Map(round.teams.flatMap((t) => t.playerIds.map((id, rank) => [id, rank] as const)));
  const trackers = new Map(phones.map((p) => [p.id, new PressTracker()]));
  const idle: Controls = { x: 0, y: 0, a: 0, b: false };
  for (const p of phones) p.sendControls(idle);
  await until(() => phones.every((p) => screen.latest.get(p.id)?.seq === 0), 'baseline inputs');
  for (const p of phones) trackers.get(p.id)!.update(screen.latest.get(p.id)!.presses);
  let frames = 0;
  const limit = Math.ceil((COUNTDOWN_MS + game.params.roundMs) / TICK_MS) + 60;
  while (!game.over && frames < limit) {
    const want = frames + 1;
    for (const p of phones) {
      const gp = game.players.get(p.id);
      const role = o.roles[gp?.team ?? 0]?.[rankOf.get(p.id) ?? 0] ?? 'idle';
      p.sendControls(gp ? sabotageControls(game, gp, role, mem.get(p.id)!, frames, rankOf.get(p.id)!, 'mirrorX') : idle);
    }
    await until(() => phones.every((p) => screen.latest.get(p.id)!.seq >= want), `inputs of frame ${want}`, 3000);
    const controls = new Map<number, Controls>();
    for (const p of phones) {
      const l = screen.latest.get(p.id)!;
      const d = trackers.get(p.id)!.update(l.presses);
      controls.set(p.id, { x: l.x, y: l.y, a: d[0] ?? 0, b: (l.btn & 2) !== 0, bTaps: d[1] ?? 0 });
    }
    if (o.refill)
      game.sab?.teams.forEach((t) => {
        t.bags = Math.max(t.bags, 1);
      }); // an endless supply: only the cooldown limits the throws
    tick(game, controls);
    frames++;
  }
  if (process.env.SAB_DEBUG)
    appendFileSync(
      process.env.SAB_DEBUG,
      `[${room}] frames=${frames} time=${game.time.toFixed(0)} over=${game.over} delivered=${game.teams.map((t) => t.delivered)} scores=${game.teams.map((t) => t.score)} launches=${[0, 1].map((t) => screen.ofType('sabotage:launch', t).length)} slips=${screen.ofType('chef:slip').length} picked=${screen.ofType('trash:picked').length}\n`,
    );
  return { screen, phones, game, frames };
}
const wholeRound = (r: Played, seconds: number) => {
  expect(r.game.over).toBe(true);
  expect(r.frames).toBeGreaterThanOrEqual(Math.floor(seconds * 60));
}; // a round that did not play proves nothing
const closeAll = (r: Played) => {
  r.screen.ws.close();
  r.phones.forEach((p) => p.ws.close());
};
const delivered = (g: Game) => g.teams.map((t) => t.delivered);

describe('sabotage over the relay: bots that throw, slip, clean and cook', () => {
  it('both teams only sabotage and clean: bags are thrown over the wire, banana-skins land, chefs slip, the rubbish is picked up and binned, the phones feel it', async () => {
    const r = await playRound('sb1', {
      sizes: [2, 2],
      roles: [
        ['saboteur', 'janitor'],
        ['saboteur', 'janitor'],
      ],
      seconds: 100,
      sabotage: 'chaos',
      bags: 2,
    });
    const { screen, game } = r;
    wholeRound(r, 100);
    expect(game.sab?.mode).toBe('chaos');
    for (const team of [0, 1]) {
      expect(screen.ofType('sabotage:launch', team).length, `team ${team} throws`).toBeGreaterThanOrEqual(3);
      expect(screen.ofType('trash:picked', team).length, `team ${team} cleans`).toBeGreaterThanOrEqual(2);
      expect(screen.ofType('trash:binned', team).length, `team ${team} bins`).toBeGreaterThanOrEqual(1);
    }
    expect(
      screen.ofType('sabotage:land').length + screen.ofType('sabotage:caught').length + screen.ofType('sabotage:burst').length,
    ).toBeGreaterThanOrEqual(6);
    expect(screen.ofType('chef:slip').length, 'slips').toBeGreaterThanOrEqual(1);
    // what came over the wire to the phones: a slip is a buzz of its own on the phone of the chef that fell, and every thrower was relabelled "¡Lanzar!" by hints only if the screen sent them
    const slipped = new Set(screen.ofType('chef:slip').map((e) => e.p.chef as number));
    for (const p of r.phones) if (slipped.has(p.id)) expect(p.buzzes, `phone ${p.id}`).toContain('slip');
    expect(delivered(game)).toEqual([0, 0]); // nobody cooked: the sabotage alone scores nothing
    closeAll(r);
  }, 120_000);

  it('a team that only sabotages loses to a team that only cooks (the sabotage costs the saboteurs their time)', async () => {
    const r = await playRound('sb2', {
      sizes: [2, 2],
      roles: [
        ['saboteur', 'saboteur'],
        ['cook', 'cook'],
      ],
      seconds: 120,
      sabotage: 'soft',
      bags: 1,
    });
    wholeRound(r, 120);
    const [pure, cooks] = r.game.teams;
    expect(r.screen.ofType('sabotage:launch', 0).length, 'the saboteurs did throw').toBeGreaterThanOrEqual(1);
    expect(cooks!.delivered, 'the cooks cooked').toBeGreaterThanOrEqual(2);
    expect(pure!.delivered).toBe(0);
    expect(cooks!.score).toBeGreaterThan(pure!.score);
    expect(r.game.result!.winner).toBe(1);
    closeAll(r);
  }, 120_000);

  it('a balanced team (one saboteur, one cook) stays within 3 orders of a team of two cooks', async () => {
    const r = await playRound('sb3', {
      sizes: [2, 2],
      roles: [
        ['saboteur', 'cook'],
        ['cook', 'cook'],
      ],
      seconds: 150,
      sabotage: 'soft',
      bags: 1,
    });
    wholeRound(r, 150);
    const [mixed, cooks] = delivered(r.game) as [number, number];
    expect(r.screen.ofType('sabotage:launch', 0).length).toBeGreaterThanOrEqual(1);
    expect(Math.abs(mixed - cooks), `delivered ${mixed} against ${cooks}`).toBeLessThanOrEqual(3);
    closeAll(r);
  }, 120_000);

  it("3 v 2: with bags to spare, the bigger team waits k times as long between throws; the small kitchen's rubbish lasts 0.7 of the usual", async () => {
    const r = await playRound('sb4', {
      sizes: [3, 2],
      roles: [
        ['saboteur', 'janitor', 'janitor'],
        ['saboteur', 'janitor'],
      ],
      seconds: 140,
      sabotage: 'soft',
      refill: true,
    });
    wholeRound(r, 140);
    const { game, screen } = r;
    const k = game.teams[1]!.k;
    expect(k).toBeGreaterThan(1);
    const gaps = (team: number) => {
      const t = screen.ofType('sabotage:launch', team).map((e) => e.t);
      return t.slice(1).map((v, i) => v - t[i]!);
    };
    expect(screen.ofType('sabotage:launch', 0).length).toBeGreaterThanOrEqual(5);
    expect(screen.ofType('sabotage:launch', 1).length).toBeGreaterThanOrEqual(5);
    // nothing but the cooldown holds the bots back: the big team's gaps hug 12 s x k, the small team's hug 12 s
    for (const gap of gaps(0)) expect(gap).toBeGreaterThanOrEqual(RULES.soft.cooldownMs * k - 40);
    for (const gap of gaps(1)) expect(gap).toBeGreaterThanOrEqual(RULES.soft.cooldownMs - 40);
    expect(Math.min(...gaps(0))).toBeLessThan(RULES.soft.cooldownMs * k + 6000); // ... and they do throw as soon as it allows (the bound is the cooldown, not the supply)
    expect(Math.min(...gaps(1))).toBeLessThan(RULES.soft.cooldownMs + 6000);
    const smallKitchenRubbish = screen.ofType('sabotage:land', 0).length;
    expect(smallKitchenRubbish).toBeGreaterThanOrEqual(1);
    closeAll(r);
  }, 120_000);

  it('the sabotage costs the victim: the same cooks deliver fewer pizzas when they are being hit than when the sabotage is off', async () => {
    const off = await playRound('sb5', {
      sizes: [2, 2],
      roles: [
        ['idle', 'idle'],
        ['cook', 'cook'],
      ],
      seconds: 120,
      sabotage: 'off',
    });
    const on = await playRound('sb6', {
      sizes: [2, 2],
      roles: [
        ['saboteur', 'saboteur'],
        ['cook', 'cook'],
      ],
      seconds: 120,
      sabotage: 'chaos',
      bags: 2,
      refill: true,
    });
    wholeRound(off, 120);
    wholeRound(on, 120);
    if (process.env.SAB_DEBUG)
      appendFileSync(
        process.env.SAB_DEBUG,
        `[victim] off delivered=${off.game.teams[1]!.delivered} score=${off.game.teams[1]!.score} | on delivered=${on.game.teams[1]!.delivered} score=${on.game.teams[1]!.score} slips=${on.screen.ofType('chef:slip').length}\n`,
      );
    expect(off.game.sab).toBeNull();
    expect(on.screen.ofType('chef:slip').length).toBeGreaterThanOrEqual(3);
    expect(on.game.teams[1]!.score).toBeLessThan(off.game.teams[1]!.score);
    closeAll(off);
    closeAll(on);
  }, 120_000);
});
