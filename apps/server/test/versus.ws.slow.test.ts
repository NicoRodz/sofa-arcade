// Versus F1 over the real relay: phones are bots on websockets, the "screen" is a Node client that runs the host's side with the same pure
// functions the real screen uses (versusLobby.ts: syncTeams, movePlayer, startVersusRound). Every input a bot sends goes phone -> relay ->
// screen -> tick, so joining, `you`, setTeam, config/phase with the match, inputs and the results all cross the wire.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { PressTracker, type ClientMsg, type LobbyConfig } from '@pichi/core';
import { DEFAULT_CONFIG, type ServerMsg } from '@pichi/catalog';
import { GAMES, modeOf } from '@pichi/catalog';
import { COUNTDOWN_MS, TICK_MS, tick, type Controls, type Game, type Player, type Station } from '@pichi/game-pizzas/sim';
import { summarizeTeam } from '@pichi/game-pizzas/sim/scoring/results';
import { movePlayer, teamOf, type TeamInfo } from '@pichi/core/lobby/teams';
import { VERSUS_AUTO, lobbySetup, startVersusRound, syncTeams } from '@pichi/game-pizzas/sim/versus/lobby';
import { outcomeFor, phoneResult, tallyDeliveries, versusReport, type VersusReport } from '@pichi/game-pizzas/sim/versus/report';
import { type GameEvents, Emitter } from '@pichi/game-pizzas/sim/round/events';
import { mulberry32 } from '@pichi/core/rng';
import { decide, type Mem } from '@pichi/game-pizzas/test/golden/bot';
import { isoOf } from '@pichi/game-pizzas/test/golden/mirror-bot';
import { SIGMAS } from '@pichi/game-pizzas/sim/maps/symmetry';
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

// A phone: joins with a token, keeps what the relay told it, and sends inputs like the controller does (counters for the presses).
class Phone {
  ws: WebSocket;
  msgs: ServerMsg[] = [];
  id = 0;
  you: Extract<ServerMsg, { t: 'you' }> | null = null;
  phase: Extract<ServerMsg, { t: 'phase' }> | null = null;
  config: Extract<ServerMsg, { t: 'config' }> | null = null;
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
      else if (m.t === 'config') this.config = m;
      this.msgs.push(m);
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

// The screen: owns the lobby (config, teams) and the round. Mirrors what apps/screen/src/main.ts does with the same functions.
class Screen {
  ws: WebSocket;
  config: LobbyConfig = {
    ...DEFAULT_CONFIG,
    modeId: 'versus',
    modeOptions: { hiddenScore: true, handicap: true },
    map: VERSUS_AUTO,
    seed: 11,
  };
  ids: number[] = [];
  touched = false;
  slots = new Map<number, number>();
  trackers = new Map<number, PressTracker>();
  latest = new Map<number, { x: number; y: number; btn: number; presses: number[]; seq: number }>();
  game: Game | null = null;
  bus = new Emitter<GameEvents>();
  tally = tallyDeliveries(this.bus); // deliveries per chef, as the real screen counts them for the MVP
  constructor(readonly room: string) {
    this.ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws?role=screen&room=${room}`);
    this.ws.on('message', (d) => this.onMessage(JSON.parse(d.toString()) as ServerMsg));
  }
  send(m: ClientMsg) {
    this.ws.send(JSON.stringify(m));
  }
  sendConfig() {
    this.send({ t: 'config', ...this.config });
  }
  onMessage(m: ServerMsg) {
    if (m.t === 'player_joined') {
      this.slots.set(m.player.id, m.player.slot);
      if (!this.ids.includes(m.player.id)) this.ids.push(m.player.id);
    } else if (m.t === 'setTeam' && this.config.teams) {
      // a phone asks: the lobby decides
      const r = movePlayer(this.config.teams, m.playerId, m.teamId, this.config.teamsLocked);
      if (r.ok) {
        this.touched = true;
        this.config = { ...this.config, teams: r.teams };
        this.sendConfig();
      }
    } else if (m.t === 'input') this.latest.set(m.playerId, { x: m.x, y: m.y, btn: m.btn, presses: m.presses, seq: m.seq });
  }
  /** The teams follow the connected phones, as the lobby does on every join. */
  syncTeams() {
    this.config = { ...this.config, teams: syncTeams(versus, this.config.teams, this.ids, this.config.seed, this.touched) };
    this.sendConfig();
  }
  /** Lobby -> round: the same call as the screen's startVersus, then the `phase` the phones get. */
  start(rand = mulberry32(3)) {
    expect(lobbySetup(versus, this.config.teams).ok).toBe(true);
    const round = startVersusRound({
      teams: this.config.teams!,
      choice: this.config.map,
      difficulty: 'easy',
      seed: this.config.seed,
      modeOptions: this.config.modeOptions,
      slotOf: (id) => this.slots.get(id) ?? 0,
      rand,
      bus: this.bus,
      countdownMs: COUNTDOWN_MS,
    });
    this.game = round.game;
    this.config = { ...this.config, teams: round.teams, teamsLocked: true };
    this.sendConfig();
    this.send({ t: 'phase', phase: 'playing', match: round.match });
    return round;
  }
}

// What a bot decides from the game, in team 0's frame (team 1 plays the reflected world, as in the F2 mirror proof), then goes out as a phone input.
function brain(g: Game, p: Player, rank: number, mem: Mem, t: number): Controls {
  const iso = isoOf(SIGMAS.mirrorX);
  const flip = p.team === 1;
  const stations: Station[] = g.stations
    .filter((s) => s.owner === p.team)
    .map((s) => {
      const [tx, ty] = flip ? iso.tile(s.tx, s.ty) : [s.tx, s.ty];
      return { ...s, tx, ty };
    });
  if (flip) stations.sort((a, b) => a.ty - b.ty || a.tx - b.tx);
  const snap = (v: number) => Math.round(v * 1e9) / 1e9;
  const [x, y] = (flip ? iso.point(p.x, p.y) : [p.x, p.y]).map(snap) as [number, number];
  const [fx, fy] = flip ? iso.vec(p.fx, p.fy) : [p.fx, p.fy];
  const view = { grid: g.grid, stations, time: g.time } as unknown as Game;
  const c = decide(view, { ...p, x, y, fx, fy } as Player, rank, mem, t);
  const [cx, cy] = flip ? iso.vec(c.x, c.y) : [c.x, c.y];
  return { ...c, x: cx, y: cy };
}

interface Played {
  screen: Screen;
  phones: Phone[];
  game: Game;
  teams: TeamInfo[];
  frames: number;
  report: VersusReport;
}

/**
 * n phones on the relay join, get their team, and play a whole round on V1 (frame by frame: every bot sends its input, the screen waits for
 * all of them, then ticks once). `lazy`: team 1's bots stand still for the first `lazyMs` of the match, so the round has a winner.
 */
async function playRound(room: string, n: number, o: { lazyMs?: number } = {}): Promise<Played> {
  const screen = new Screen(room);
  await new Promise<void>((r) => screen.ws.once('open', () => r()));
  const phones = Array.from({ length: n }, (_v, i) => new Phone(room, `Bot${i + 1}`));
  await until(() => phones.every((p) => p.id > 0) && screen.ids.length === n, 'phones joined');
  screen.syncTeams();
  await until(() => phones.every((p) => p.you), 'every phone knows its team');
  screen.config = { ...screen.config, map: 'V1' };
  const round = screen.start();
  const game = round.game;
  await until(() => phones.every((p) => p.phase?.phase === 'playing'), 'phase playing');
  const mem = new Map(phones.map((p) => [p.id, { step: 0, since: 0, lastPress: -99, bin: false } as Mem]));
  const rankOf = new Map(round.teams.flatMap((t) => t.playerIds.map((id, rank) => [id, rank] as const)));
  const trackers = new Map(phones.map((p) => [p.id, new PressTracker()]));
  let frames = 0;
  const limit = Math.ceil((COUNTDOWN_MS + game.params.roundMs) / TICK_MS) + 60;
  // the first sample of a phone is the baseline of its press counters (PressTracker), so every bot sends one idle input before the match
  for (const p of phones) p.sendControls({ x: 0, y: 0, a: 0, b: false });
  await until(() => phones.every((p) => screen.latest.get(p.id)?.seq === 0), 'baseline inputs');
  for (const p of phones) trackers.get(p.id)!.update(screen.latest.get(p.id)!.presses);
  while (!game.over && frames < limit) {
    const want = frames + 1;
    for (const p of phones) {
      const gp = game.players.get(p.id);
      const idle = !gp || (o.lazyMs !== undefined && teamOf(round.teams, p.id)!.id === 1 && game.time < o.lazyMs); // team 1 waits out the first lazyMs of the match
      p.sendControls(idle ? { x: 0, y: 0, a: 0, b: false } : brain(game, gp, rankOf.get(p.id)!, mem.get(p.id)!, frames));
    }
    await until(() => phones.every((p) => screen.latest.get(p.id)!.seq >= want), `inputs of frame ${want}`, 3000);
    const controls = new Map<number, Controls>();
    for (const p of phones) {
      const l = screen.latest.get(p.id)!;
      const d = trackers.get(p.id)!.update(l.presses);
      controls.set(p.id, { x: l.x, y: l.y, a: d[0] ?? 0, b: (l.btn & 2) !== 0, bTaps: d[1] ?? 0 });
    }
    tick(game, controls);
    frames++;
  }
  // the end, as the real screen does it: the report of the round (from the sim and the per-chef tally) and what the phones are told of it
  const report = versusReport(game, round.teams, screen.tally.counts);
  screen.send({
    t: 'phase',
    phase: 'results',
    scores: phones.map((p) => ({ id: p.id, score: game.teams[game.players.get(p.id)!.team]!.score })),
    result: phoneResult(report),
  });
  await until(() => phones.every((p) => p.phase?.phase === 'results'), 'phase results');
  return { screen, phones, game, teams: round.teams, frames, report };
}
const closeAll = (r: Played) => {
  r.screen.ws.close();
  r.phones.forEach((p) => p.ws.close());
};

describe('versus over the relay: bots on websockets', () => {
  for (const n of [4, 6]) {
    it(`${n} phones: ${n / 2} v ${n / 2} on V1 play a whole round and it ends with a winner`, async () => {
      const r = await playRound(`vs${n}`, n, { lazyMs: 20_000 });
      const { game, phones } = r;
      expect(r.frames).toBeGreaterThan(10_000); // 3 s countdown + 180 s of play at 60 Hz: a whole round went through the wire, not a stub
      expect(game.over).toBe(true);
      expect(game.versus).toBe(true);
      expect(game.mapId).toBe('V1');
      expect(game.teams.map((t) => t.n)).toEqual([n / 2, n / 2]);
      expect(game.teams.map((t) => t.k)).toEqual([1, 1]); // even teams: no handicap
      const [a, b] = game.teams.map((t) => summarizeTeam(game, t.id));
      expect(a!.delivered).toBeGreaterThan(0); // they really cooked: pizzas went through the window of their own kitchen
      expect(b!.delivered).toBeGreaterThan(0);
      // team 1 stood still for the first 20 s so the teams do not tie: a winner is defined and it is the team with more points
      expect(a!.score).not.toBe(b!.score);
      expect(game.result!.winner).toBe(a!.score > b!.score ? 0 : 1);
      expect(game.result!.aborted).toBe(false);
      // what the phones were told: their own team's score at the end, the match they are in, and their kitchen side
      for (const p of phones) {
        const mine = r.teams.find((t) => t.playerIds.includes(p.id))!;
        const score = p.phase!.scores!.find((s) => s.id === p.id)!.score;
        expect(score).toBe(game.teams[mine.id]!.score);
        expect(p.you).toMatchObject({
          teamId: mine.id,
          color: mine.color,
          icon: mine.icon,
          sideLabel: mine.id === 0 ? 'izquierda' : 'derecha',
        });
      }
      // the results payload (F4): the verdict and every team's score reach each phone, and each one reads its own outcome from its team
      const { report } = r;
      const winner = a!.score > b!.score ? 0 : 1;
      expect([report.verdict, report.winner, report.decidedBy, report.ranked]).toEqual([
        'win',
        winner,
        'score',
        winner === 0 ? [0, 1] : [1, 0],
      ]);
      expect(report.margin).toBe(Math.abs(a!.score - b!.score));
      for (const p of phones) {
        expect(p.phase!.result).toEqual({
          verdict: 'win',
          winner,
          scores: [
            { team: 0, score: a!.score },
            { team: 1, score: b!.score },
          ],
        });
        const mine = r.teams.find((t) => t.playerIds.includes(p.id))!;
        expect(outcomeFor(p.phase!.result!, p.you!.teamId)).toBe(mine.id === winner ? 'won' : 'lost');
        expect(p.phase!.result!.scores.find((s) => s.team === p.you!.teamId)!.score).toBe(game.teams[mine.id]!.score); // the phone's own team's score
      }
      // the numbers of each team in the report are the sim's, and the MVP tally adds up to the team's deliveries (a chef counted twice or lost would break it)
      for (const t of report.teams) {
        const sim = summarizeTeam(game, t.teamId);
        expect([t.score, t.delivered, t.tips, t.bestStreak, t.vips, t.stars, t.k]).toEqual([
          sim.score,
          sim.delivered,
          sim.tips,
          sim.bestStreak,
          sim.vips,
          sim.stars,
          sim.k,
        ]);
        const members = r.teams[t.teamId]!.playerIds;
        expect(
          members.reduce((n, id) => n + (r.screen.tally.counts.get(id) ?? 0), 0),
          `team ${t.teamId} tally`,
        ).toBe(sim.delivered);
        expect(t.mvp, `team ${t.teamId} mvp`).not.toBeNull();
        expect(members).toContain(t.mvp!.playerId);
        expect(t.mvp!.delivered).toBe(Math.max(...members.map((id) => r.screen.tally.counts.get(id) ?? 0)));
        expect([t.name, t.icon, t.color]).toEqual([r.teams[t.teamId]!.name, r.teams[t.teamId]!.icon, r.teams[t.teamId]!.color]);
      }
      closeAll(r);
    }, 180_000);
  }

  it('5 phones: 3 v 2, the small team carries k 1.22 on every delivery and the big one plays at 1', async () => {
    const r = await playRound('vs5', 5);
    const { game } = r;
    const small = game.teams.find((t) => t.n === 2)!,
      big = game.teams.find((t) => t.n === 3)!;
    expect(small.k).toBe(1.22);
    expect(big.k).toBe(1);
    const s = summarizeTeam(game, small.id);
    expect(s.delivered).toBeGreaterThan(0);
    expect(s.k).toBe(1.22);
    expect(s.score).toBeGreaterThan(s.gross); // the multiplier was applied: points are above what the deliveries were worth
    expect(s.score).toBeLessThanOrEqual(Math.ceil(s.gross * 1.22) + s.delivered); // ... by 1.22 and nothing else (rounding per delivery)
    expect(summarizeTeam(game, big.id).score).toBe(summarizeTeam(game, big.id).gross);
    expect(game.result!.order).toHaveLength(2);
    expect(r.report.teams[small.id]).toMatchObject({ k: 1.22, gross: s.gross, score: s.score }); // the report shows the advantage and what it was applied to
    expect(r.report.teams[big.id]!.k).toBe(1);
    closeAll(r);
  }, 180_000);
});

describe("versus lobby over the relay: teams are the screen's call", () => {
  it('a phone asks to change team: the screen moves it and the phone gets its new colour and side; locked teams refuse', async () => {
    const screen = new Screen('vsmove');
    await new Promise<void>((r) => screen.ws.once('open', () => r()));
    const phones = Array.from({ length: 4 }, (_v, i) => new Phone('vsmove', `P${i + 1}`));
    await until(() => phones.every((p) => p.id > 0) && screen.ids.length === 4, 'joined');
    screen.syncTeams();
    await until(() => phones.every((p) => p.you), 'teams known');
    const [p1] = phones as [Phone];
    const before = p1.you!.teamId;
    expect(screen.config.teams!.map((t) => t.playerIds.length)).toEqual([2, 2]);
    p1.you = null;
    p1.send({ t: 'setTeam', teamId: 1 - before });
    await until(() => p1.you !== null, 'new you');
    expect(p1.you).toMatchObject({ teamId: 1 - before, icon: before === 0 ? '●' : '▲' });
    expect(screen.config.teams!.map((t) => t.playerIds.length).sort()).toEqual([1, 3]); // moved by hand: nobody else is touched
    // locked: the same request changes nothing
    screen.config = { ...screen.config, teamsLocked: true };
    screen.sendConfig();
    await until(() => p1.config?.teamsLocked === true, 'locked config');
    const kept = JSON.stringify(screen.config.teams);
    p1.send({ t: 'setTeam', teamId: before });
    await new Promise((r) => setTimeout(r, 150));
    expect(JSON.stringify(screen.config.teams)).toBe(kept);
    screen.ws.close();
    phones.forEach((p) => p.ws.close());
  });
});
