// F2: the sim by team (design pizzas-modalidades-coop-versus §1 and §5). Kitchens and owners, twin queues, VIP, handicap k by
// stretches, ghosts and pause, ranking, the mirror proof and the coop regression. Test maps are V1 (mirror) and V3 (rotation)
// from the design, translated to the real legend in golden/mirror-bot.ts.
import { describe, expect, it } from 'vitest';
import { GHOST_MS, handicapK } from '@pichi/core/lobby/teams';
import { type GameEvents, Emitter } from '../round/events';
import { DIRS, fixedMap, isFloor } from '../maps';
import {
  TICK_MS,
  addPlayer,
  createGame,
  dropPlayer,
  rejoinPlayer,
  resolvePause,
  spawnOrder,
  targetStation,
  tick,
  type Controls,
  type Game,
  type Recipe,
} from '../overcooked';
import { summarizeTeam } from '../scoring/results';
import { VIP_EVERY_MS, VIP_TTL_MS } from './versus';
import { MIRRORS, runVersus, twinSpawns } from '../../test/golden/mirror-bot';
import { runGolden, SCENARIOS, type GoldenRun } from '../../test/golden/bot';
import n2 from '../../test/golden/fixtures/coop-n2-map2-normal.json';
import n4 from '../../test/golden/fixtures/coop-n4-map9-hard.json';
import n6 from '../../test/golden/fixtures/coop-n6-map11-easy.json';

const idle: Controls = { x: 0, y: 0, a: 0, b: false };
const V1 = MIRRORS.v1;
type Log = { [K in keyof GameEvents]?: { t: number; p: GameEvents[K] }[] };

/** A versus game on V1 with the chefs of every team added. `log` collects each event with the match time it happened at. */
function mk(
  teams: number[][],
  o: { difficulty?: 'easy' | 'normal' | 'hard'; seed?: number; handicap?: boolean; rows?: readonly string[] } = {},
) {
  const bus = new Emitter<GameEvents>();
  const log: Log = {};
  const rows = o.rows ?? V1.rows;
  const g = createGame({
    rows,
    spawns: twinSpawns(rows, V1.sigma, V1.half),
    difficulty: o.difficulty ?? 'normal',
    seed: o.seed ?? 5,
    bus,
    teams: teams.map((playerIds) => ({ playerIds })),
    handicap: o.handicap,
  });
  for (const k of [
    'orderNew',
    'delivered',
    'vipNew',
    'vipWon',
    'vipLost',
    'teamK',
    'playerDropped',
    'playerBack',
    'playerGone',
    'matchPaused',
    'matchResumed',
    'roundEnd',
    'streak',
    'orderExpired',
  ] as const) {
    bus.on(k, ((p: never) => {
      ((log[k] ??= []) as { t: number; p: unknown }[]).push({ t: g.time, p });
    }) as never);
  }
  teams.forEach((ids) => ids.forEach((id, rank) => addPlayer(g, id, rank, rank)));
  return { g, log };
}
const run = (g: Game, ms: number) => {
  for (let t = 0; t < ms - 1e-6; t += TICK_MS) tick(g, new Map());
};
const runUntil = (g: Game, f: () => boolean, maxMs = 200_000) => {
  for (let t = 0; t < maxMs && !f(); t += TICK_MS) tick(g, new Map());
};
const orderOf = (g: Game, team: number, recipe: Recipe, leftMs = 0, vip = false) => ({
  id: g.teams[team]!.orderSeq++,
  expiresAt: g.time + leftMs,
  warned: true,
  recipe,
  ...(vip ? { vip: true } : {}),
});

/** Puts the chef at its own window with a dish in hand (no tick yet). */
function standAtWindow(g: Game, id: number, item: 'dish' | 'dishQ' = 'dishQ') {
  const p = g.players.get(id)!;
  const w = g.stations.find((s) => s.kind === 'window' && s.owner === p.team)!;
  const [dx, dy] = DIRS.find(([dx, dy]) => isFloor(g.grid, w.tx + dx, w.ty + dy))!;
  p.x = w.tx + dx + 0.5;
  p.y = w.ty + dy + 0.5;
  p.fx = -dx;
  p.fy = -dy;
  p.vx = p.vy = 0;
  p.item = item;
}
/** One tick in which the given chefs (already standing at their windows) press A. */
const pressA = (g: Game, ids: number[]) => tick(g, new Map(ids.map((id): [number, Controls] => [id, { ...idle, a: 1 }])));
const serve = (g: Game, id: number, item: 'dish' | 'dishQ' = 'dishQ') => {
  standAtWindow(g, id, item);
  pressA(g, [id]);
};

describe('kitchens: each team has its own side and stations', () => {
  it('V1: the left kitchen is team 0 and the right one team 1, with the same stations on each side', () => {
    const { g } = mk([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(g.versus).toBe(true);
    const owned = (t: number) =>
      g.stations
        .filter((s) => s.owner === t)
        .map((s) => `${s.kind}${s.kind === 'crate' ? s.crate : ''}`)
        .sort();
    expect(g.stations.filter((s) => s.owner === null)).toHaveLength(0);
    expect(owned(0)).toEqual(owned(1));
    expect(owned(0)).toContain('pot');
    expect(owned(0)).toContain('window');
    expect(owned(0)).toContain('crate2');
    for (const s of g.stations) expect(s.owner).toBe(s.tx < 8 ? 0 : 1);
  });
  it('V3 (rotation): the top kitchen is team 0 and the bottom one team 1', () => {
    const { g } = mk(
      [
        [1, 2],
        [3, 4],
      ],
      { rows: MIRRORS.v3.rows },
    );
    for (const s of g.stations) expect(s.owner).toBe(s.ty < 4 ? 0 : 1);
  });
  it('chefs start inside their own kitchen, on the tile of their rank, and the twin ranks are twins', () => {
    const { g } = mk([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    for (const p of g.players.values()) expect(p.x < 8).toBe(p.team === 0);
    for (let r = 0; r < 3; r++) {
      const a = g.players.get(1 + r)!,
        b = g.players.get(4 + r)!;
      expect([b.x, b.y]).toEqual([16 - a.x, a.y]);
    }
  });
  it('a chef that is on no team (a latecomer) is not added: it watches', () => {
    const { g } = mk([
      [1, 2],
      [3, 4],
    ]);
    expect(addPlayer(g, 9, 4)).toBe(false);
    expect(g.players.has(9)).toBe(false);
  });
  it('a map with a single kitchen cannot host two teams', () => {
    expect(() => createGame({ rows: fixedMap('1')!.rows, teams: [{ playerIds: [1, 2] }, { playerIds: [3, 4] }] })).toThrow(
      /separate kitchens/,
    );
  });
  it('coop: every station belongs to team 0 and everybody is on it', () => {
    const g = createGame({ rows: fixedMap('3')!.rows, n: 2 }); // river map: two floor regions, still one team
    expect(g.versus).toBe(false);
    expect(g.stations.every((s) => s.owner === 0)).toBe(true);
    addPlayer(g, 1, 0);
    addPlayer(g, 2, 1);
    expect([...g.players.values()].map((p) => p.team)).toEqual([0, 0]);
  });
});

describe('owner: a rival kitchen does not answer', () => {
  /** Stands the team-0 chef beside a station, facing it. */
  function beside(g: Game, id: number, s: { tx: number; ty: number }) {
    const p = g.players.get(id)!;
    const [dx, dy] = DIRS.find(([dx, dy]) => isFloor(g.grid, s.tx + dx, s.ty + dy))!;
    p.x = s.tx + dx + 0.5;
    p.y = s.ty + dy + 0.5;
    p.fx = -dx;
    p.fy = -dy;
    p.vx = p.vy = 0;
    return p;
  }
  it("the rival oven takes nothing: the cut dough stays in the chef's hands", () => {
    const { g } = mk([
      [1, 2],
      [3, 4],
    ]);
    const rival = g.stations.find((s) => s.kind === 'pot' && s.owner === 1)!;
    const p = beside(g, 1, rival);
    p.item = 'cut0';
    pressA(g, [1]);
    expect(rival.inputs).toEqual([]);
    expect(p.item).toBe('cut0');
    expect(targetStation(g, p)).toBeNull();
  });
  it('the chef own oven does take it (the harness works)', () => {
    const { g } = mk([
      [1, 2],
      [3, 4],
    ]);
    const own = g.stations.find((s) => s.kind === 'pot' && s.owner === 0)!;
    const p = beside(g, 1, own);
    p.item = 'cut0';
    pressA(g, [1]);
    expect(own.inputs).toEqual([0]);
    expect(p.item).toBeNull();
  });
  it('rival crates give nothing, the rival counter does not hold what it is given, and its window pays nothing', () => {
    const { g } = mk([
      [1, 2],
      [3, 4],
    ]);
    const crate = g.stations.find((s) => s.kind === 'crate' && s.crate === 0 && s.owner === 1)!;
    const p = beside(g, 1, crate);
    pressA(g, [1]);
    expect(p.item).toBeNull();
    const counter = g.stations.find((s) => s.kind === 'counter' && s.owner === 1)!;
    beside(g, 1, counter).item = 'raw1';
    pressA(g, [1]);
    expect(counter.item).toBeNull();
    const win = g.stations.find((s) => s.kind === 'window' && s.owner === 1)!;
    g.teams[0]!.orders = [orderOf(g, 0, 'marinara', 1000)];
    beside(g, 1, win).item = 'dish';
    pressA(g, [1]);
    expect(g.teams[0]!.delivered + g.teams[1]!.delivered).toBe(0);
    expect(g.teams[0]!.orders).toHaveLength(1);
  });
  it('a station with no owner (a shared pantry) answers to both teams', () => {
    const { g } = mk([
      [1, 2],
      [3, 4],
    ]);
    const crate = g.stations.find((s) => s.kind === 'crate' && s.crate === 0 && s.owner === 1)!;
    crate.owner = null;
    const p = beside(g, 1, crate);
    pressA(g, [1]);
    expect(p.item).toBe('raw0');
  });
});

describe('twin queues: same seed per team, same recipes at the same instants', () => {
  const orderNews = (log: Log, team: number) =>
    (log.orderNew ?? []).filter((e) => e.p.team === team && !e.p.vip).map((e) => `${e.t.toFixed(3)}:${e.p.recipe}`);
  it('both teams receive the same order sequence, with both recipes present', () => {
    const { g, log } = mk(
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
      { difficulty: 'hard' },
    );
    run(g, 178_000);
    const a = orderNews(log, 0),
      b = orderNews(log, 1);
    expect(a.length).toBeGreaterThanOrEqual(5);
    expect(a).toEqual(b);
    expect(new Set(a.map((x) => x.split(':')[1])).size).toBe(2);
  });
  it('delivering in A does not change anything in B (queue, deadlines, events)', () => {
    const one = mk([
        [1, 2],
        [3, 4],
      ]),
      two = mk([
        [1, 2],
        [3, 4],
      ]);
    run(one.g, 8000);
    run(two.g, 8000);
    serve(two.g, 1); // team 0 serves its first order; team 1 does nothing in either game
    run(one.g, 36_000 + TICK_MS);
    run(two.g, 36_000); // 44 s: the second order (40 s) is in both queues, the VIP (60 s) is not
    serve(two.g, 1);
    run(one.g, 3000 + TICK_MS);
    run(two.g, 3000);
    expect(two.g.teams[0]!.delivered).toBe(2);
    expect(one.g.teams[0]!.delivered).toBe(0);
    expect(orderNews(two.log, 1)).toHaveLength(1);
    const view = (g: Game, log: Log) => ({
      orders: g.teams[1]!.orders,
      score: g.teams[1]!.score,
      news: orderNews(log, 1),
      expired: (log.orderExpired ?? []).filter((e) => e.p.team === 1).map((e) => e.t.toFixed(3)),
    });
    expect(view(two.g, two.log)).toEqual(view(one.g, one.log));
  });
  it('a full queue does not shift the recipes: the team that skips a slot still draws it, so each recipe arrives when the rival got it', () => {
    const { g, log } = mk(
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
      { seed: 9, difficulty: 'hard' },
    );
    const filler = () => g.teams[0]!.orders.push({ id: g.teams[0]!.orderSeq++, expiresAt: Infinity, warned: true, recipe: 'marinara' });
    for (let s = 0; s < 178; s++) {
      // team 1 serves every order as it comes; team 0 has a full queue in the middle minute and an empty one around it
      const full = s >= 60 && s < 120;
      if (full) while (g.teams[0]!.orders.length < g.params.maxOrders) filler();
      else g.teams[0]!.orders = [];
      run(g, 1000);
      if (g.teams[1]!.orders.length) serve(g, 4);
    }
    const a = orderNews(log, 0),
      b = orderNews(log, 1);
    expect(a.length).toBeGreaterThanOrEqual(4); // team 0 did admit some, of both recipes...
    expect(new Set(a.map((x) => x.split(':')[1])).size).toBe(2);
    expect(b.length).toBeGreaterThan(a.length); // ...and skipped others
    for (const x of a) expect(b).toContain(x); // every order it got is the rival's order of that very instant, same recipe
    expect(new Set(b.map((x) => x.split(':')[1])).size).toBe(2);
  });
  it('the order of calls does not matter: spawnOrder by hand on one team leaves the other stream alone', () => {
    const { g } = mk([
      [1, 2],
      [3, 4],
    ]);
    const before = g.teams[1]!.rng();
    const { g: h } = mk([
      [1, 2],
      [3, 4],
    ]);
    for (let i = 0; i < 5; i++) {
      h.teams[0]!.orders = [];
      spawnOrder(h, h.teams[0]!);
    }
    expect(h.teams[1]!.rng()).toBe(before);
  });
});

describe('VIP: one golden order in both queues, the first to deliver wins x2', () => {
  const toVip = (g: Game) => runUntil(g, () => g.vip.round !== null);
  it('appears in both queues at the same instant with the same recipe and 30 s of patience, every 60 s on Normal', () => {
    const { g, log } = mk([
      [1, 2],
      [3, 4],
    ]);
    toVip(g);
    expect(g.time).toBeGreaterThanOrEqual(VIP_EVERY_MS.normal);
    expect(g.time).toBeLessThan(VIP_EVERY_MS.normal + 100);
    const mine = g.teams.map((t) => t.orders.find((o) => o.vip)!);
    expect(mine[0]!.recipe).toBe(mine[1]!.recipe);
    expect(mine[0]!.expiresAt - g.time).toBeCloseTo(VIP_TTL_MS, -1);
    expect(mine[1]!.expiresAt).toBe(mine[0]!.expiresAt);
    expect(log.vipNew).toHaveLength(1);
    expect(VIP_EVERY_MS).toEqual({ easy: 75_000, normal: 60_000, hard: 45_000 });
    runUntil(g, () => g.time > 2 * VIP_EVERY_MS.normal + 50);
    expect(log.vipNew).toHaveLength(2);
  });
  it('the first team to deliver gets x2 and the rival order turns normal (and keeps its pizza)', () => {
    const { g, log } = mk([
      [1, 2],
      [3, 4],
    ]);
    toVip(g);
    for (const t of g.teams) t.orders = t.orders.filter((o) => o.vip); // only the golden order is waiting
    const vipLeft = g.teams[0]!.orders[0]!.expiresAt - g.time;
    serve(g, 1);
    const won = log.delivered!.at(-1)!.p;
    const tip = won.tip,
      base = won.base;
    expect(won.vip).toBe(true);
    expect(won.points).toBe(2 * (base + tip));
    expect(g.teams[0]!.vips).toBe(1);
    expect(log.vipWon).toHaveLength(1);
    expect(log.vipWon![0]!.p).toMatchObject({ team: 0, player: 1, tie: false });
    expect(log.vipLost).toEqual([expect.objectContaining({ p: { team: 1 } })]);
    const rivalOrder = g.teams[1]!.orders[0]!;
    expect(rivalOrder.vip).toBeUndefined();
    expect(rivalOrder.expiresAt - g.time).toBeLessThanOrEqual(vipLeft); // it keeps its own deadline
    serve(g, 3); // the rival delivers the pizza it had: normal points, no bonus
    const lost = log.delivered!.at(-1)!.p;
    expect(lost.vip).toBeUndefined();
    expect(lost.points).toBe(lost.base + lost.tip);
    expect(g.teams[1]!.vips).toBe(0);
  });
  it('two teams delivering it in the same tick both win it', () => {
    const { g, log } = mk([
      [1, 2],
      [3, 4],
    ]);
    toVip(g);
    for (const t of g.teams) t.orders = t.orders.filter((o) => o.vip);
    standAtWindow(g, 1);
    standAtWindow(g, 3);
    pressA(g, [1, 3]);
    expect(g.teams.map((t) => t.vips)).toEqual([1, 1]);
    expect(g.teams[0]!.score).toBe(g.teams[1]!.score);
    expect(log.vipWon!.map((e) => e.p.tie)).toEqual([false, true]);
    expect(log.vipLost).toBeUndefined();
  });
  it('a pizza goes to the golden order first, even when a normal order of the same recipe is ahead of it', () => {
    const { g } = mk([
      [1, 2],
      [3, 4],
    ]);
    toVip(g);
    const vipRecipe = g.teams[0]!.orders.find((o) => o.vip)!.recipe;
    g.teams[0]!.orders = [orderOf(g, 0, vipRecipe, 40_000), g.teams[0]!.orders.find((o) => o.vip)!];
    serve(g, 1, vipRecipe === 'margarita' ? 'dishQ' : 'dish');
    expect(g.teams[0]!.vips).toBe(1);
    expect(g.teams[0]!.orders.map((o) => o.vip)).toEqual([undefined]);
  });
  it('nobody delivers: both golden orders expire at 30 s, with the usual penalty', () => {
    const { g, log } = mk([
      [1, 2],
      [3, 4],
    ]);
    toVip(g);
    const t0 = g.time;
    runUntil(g, () => g.time > t0 + VIP_TTL_MS + 100);
    expect(g.teams.every((t) => t.orders.every((o) => !o.vip))).toBe(true);
    const exp = (team: number) => (log.orderExpired ?? []).filter((e) => e.p.team === team && Math.abs(e.t - (t0 + VIP_TTL_MS)) < 100);
    expect(exp(0)).toHaveLength(1);
    expect(exp(1)).toHaveLength(1);
  });
  it('coop never has a VIP', () => {
    const bus = new Emitter<GameEvents>();
    let vips = 0;
    bus.on('vipNew', () => vips++);
    const g = createGame({ bus, n: 2, difficulty: 'hard' });
    addPlayer(g, 1, 0);
    run(g, 100_000);
    expect(vips).toBe(0);
    expect(g.orders.some((o) => o.vip)).toBe(false);
  });
});

describe('handicap k by stretches', () => {
  /** A normal order with no patience left (so no tip) and the delivery of a dish. Returns what the team scored. */
  const deliver = (g: Game, team: number, id: number) => {
    g.teams[team]!.orders = [orderOf(g, team, 'marinara', 0)];
    g.teams[team]!.orders[0]!.expiresAt = g.time + 5; // at the first tick the patience is a hair above zero: tip rounds to 0
    const before = g.teams[team]!.score;
    serve(g, id, 'dish');
    return g.teams[team]!.score - before;
  };
  it('3v2: the small team starts at k = 1.22 and its delivery pays round(70 x 1.22) = 85; the big one pays 70', () => {
    const { g, log } = mk([
      [1, 2, 3],
      [4, 5],
    ]);
    expect(handicapK(2, 3)).toBe(1.22);
    expect(g.teams.map((t) => t.k)).toEqual([1, 1.22]);
    expect(deliver(g, 0, 1)).toBe(70);
    expect(deliver(g, 1, 4)).toBe(85);
    expect(log.delivered!.at(-1)!.p).toMatchObject({ team: 1, k: 1.22, points: 85, base: 70, tip: 0 });
    expect(g.teams[1]!.gross).toBe(70);
  });
  it('the order flow of a 3v2 is the one of 3 chefs (round of the average)', () => {
    const { g } = mk([
      [1, 2, 3],
      [4, 5],
    ]);
    expect(g.n).toBe(3);
    const c = mk([
      [1, 2],
      [3, 4],
    ]).g;
    expect(c.n).toBe(2);
    expect(c.params.maxOrders).toBeLessThan(g.params.maxOrders);
  });
  it('the multiplier follows the chefs that still hold a place: 1.22, then 1 after a drop of the big team, then 1.41 after a drop of the small one', () => {
    const { g, log } = mk([
      [1, 2, 3],
      [4, 5],
    ]);
    run(g, 5000);
    dropPlayer(g, 3);
    run(g, GHOST_MS - 500);
    expect(g.teams.map((t) => t.k)).toEqual([1, 1.22]); // the ghost still holds its place
    run(g, 1000);
    expect(g.teams.map((t) => t.k)).toEqual([1, 1]); // 2v2 now
    expect(log.teamK!.map((e) => e.p)).toEqual([{ team: 1, k: 1 }]);
    dropPlayer(g, 5);
    run(g, GHOST_MS + 500);
    expect(handicapK(1, 2)).toBe(1.41);
    expect(g.teams.map((t) => t.k)).toEqual([1, 1.41]); // 2 against 1
    expect(deliver(g, 1, 4)).toBe(99); // round(70 x 1.41)
  });
  it('the penalty of an expired order is not multiplied', () => {
    const { g } = mk([
      [1, 2, 3],
      [4, 5],
    ]);
    g.teams[1]!.score = 100;
    g.teams[1]!.orders = [orderOf(g, 1, 'marinara', 0)];
    run(g, 200);
    expect(g.teams[1]!.score).toBe(100 + g.params.penalty);
  });
  it('turned off in the lobby option: k stays 1', () => {
    const { g } = mk(
      [
        [1, 2, 3],
        [4, 5],
      ],
      { handicap: false },
    );
    expect(g.teams.map((t) => t.k)).toEqual([1, 1]);
    expect(deliver(g, 1, 4)).toBe(70);
  });
  it('even teams never get a multiplier', () => {
    const { g } = mk([
      [1, 2],
      [3, 4],
    ]);
    expect(g.teams.map((t) => t.k)).toEqual([1, 1]);
  });
});

describe('end of the round: score, deliveries, VIPs, who got there first', () => {
  /** Ends a quiet 2v2 round with the given numbers per team. */
  function finishWith(a: Partial<Game['teams'][number]>, b: Partial<Game['teams'][number]>) {
    const { g, log } = mk([
      [1, 2],
      [3, 4],
    ]);
    for (const t of g.teams) {
      t.orders = [];
      t.nextOrderAt = Infinity;
    }
    g.vip.nextAt = Infinity;
    Object.assign(g.teams[0]!, a);
    Object.assign(g.teams[1]!, b);
    g.time = g.params.roundMs - 1;
    tick(g, new Map());
    expect(g.over).toBe(true);
    return { g, log };
  }
  it('more points wins', () => {
    const { g, log } = finishWith({ score: 300 }, { score: 310, delivered: 1 });
    expect(g.result).toMatchObject({ winner: 1, aborted: false });
    expect(log.roundEnd![0]!.p).toMatchObject({ winner: 1, score: 310 });
    expect(log.roundEnd![0]!.p.results!.map((r) => r.teamId)).toEqual([1, 0]);
  });
  it('same points: more deliveries wins', () => {
    expect(finishWith({ score: 300, delivered: 5 }, { score: 300, delivered: 6 }).g.result!.winner).toBe(1);
  });
  it('same points and deliveries: more VIPs won', () => {
    expect(finishWith({ score: 300, delivered: 5, vips: 1 }, { score: 300, delivered: 5, vips: 0 }).g.result!.winner).toBe(0);
  });
  it('everything equal: the team that reached its final score first', () => {
    expect(
      finishWith({ score: 300, delivered: 5, vips: 1, reachedAt: 90_000 }, { score: 300, delivered: 5, vips: 1, reachedAt: 80_000 }).g
        .result!.winner,
    ).toBe(1);
  });
  it('a complete tie has no winner', () => {
    const { g, log } = finishWith(
      { score: 300, delivered: 5, vips: 1, reachedAt: 90_000 },
      { score: 300, delivered: 5, vips: 1, reachedAt: 90_000 },
    );
    expect(g.result!.winner).toBeNull();
    expect(log.roundEnd![0]!.p.winner).toBeNull();
  });
  it('the score that counts is the one with k, and reachedAt moves with every point', () => {
    const { g } = mk([
      [1, 2, 3],
      [4, 5],
    ]);
    for (const t of g.teams) {
      t.orders = [];
      t.nextOrderAt = Infinity;
    }
    g.vip.nextAt = Infinity;
    run(g, 20_000);
    g.teams[0]!.orders = [orderOf(g, 0, 'marinara', 0)];
    g.teams[0]!.orders[0]!.expiresAt = g.time + 5;
    serve(g, 1, 'dish');
    expect(g.teams[0]!.reachedAt).toBe(g.time);
    expect(g.teams[1]!.reachedAt).toBe(0);
    const s = summarizeTeam(g, 1);
    expect(s).toMatchObject({ teamId: 1, k: 1.22, score: 0 });
    expect(s.thresholds[0]).toBeGreaterThan(0);
  });
});

describe('a chef drops', () => {
  it('10 s: ghost with no body or input, what it held goes to the nearest free counter, and it comes back to the same team and chef with k unchanged', () => {
    const { g, log } = mk([
      [1, 2, 3],
      [4, 5],
    ]);
    run(g, 3000);
    const p = g.players.get(2)!;
    p.item = 'raw1';
    const counters = g.stations.filter((s) => s.kind === 'counter' && s.owner === 0);
    const nearest = [...counters].sort(
      (a, b) => Math.hypot(a.tx + 0.5 - p.x, a.ty + 0.5 - p.y) - Math.hypot(b.tx + 0.5 - p.x, b.ty + 0.5 - p.y),
    )[0]!;
    expect(dropPlayer(g, 2)).toBe(true);
    expect(dropPlayer(g, 2)).toBe(false);
    expect(p.ghost).toBe(true);
    expect(p.item).toBeNull();
    expect(nearest.item).toBe('raw1');
    const at = [p.x, p.y];
    for (let i = 0; i < 600; i++) tick(g, new Map([[2, { x: 1, y: 0, a: 1, b: true }]])); // 10 s of input that a ghost ignores
    expect([p.x, p.y]).toEqual(at);
    expect(g.players.get(2)).toBe(p);
    expect(g.teams.map((t) => t.k)).toEqual([1, 1.22]);
    expect(rejoinPlayer(g, 2)).toBe(true);
    expect(p).toMatchObject({ ghost: false, team: 0, id: 2 });
    expect(g.roster.find((r) => r.id === 2)).toMatchObject({ teamId: 0, droppedAt: null });
    run(g, GHOST_MS + 1000); // and it does not leave later
    expect(g.players.has(2)).toBe(true);
    expect(g.teams.map((t) => t.k)).toEqual([1, 1.22]);
    expect(log.playerDropped!.map((e) => e.p)).toEqual([{ player: 2, team: 0 }]);
    expect(log.playerBack!.map((e) => e.p)).toEqual([{ player: 2, team: 0 }]);
    expect(log.playerGone).toBeUndefined();
  });
  it('a ghost is not in anybody way: no collision with its team-mates', () => {
    const { g } = mk([
      [1, 2],
      [3, 4],
    ]);
    const a = g.players.get(1)!,
      b = g.players.get(2)!;
    dropPlayer(g, 2);
    b.x = a.x;
    b.y = a.y;
    const at = [a.x, a.y];
    run(g, 200);
    expect([a.x, a.y]).toEqual(at);
  });
  it('30 s: after 20 s the chef leaves, k is recomputed from that instant and the late phone watches', () => {
    const { g, log } = mk([
      [1, 2, 3],
      [4, 5],
    ]);
    run(g, 3000);
    const t0 = g.time;
    dropPlayer(g, 3);
    run(g, GHOST_MS - 300);
    expect(g.players.has(3)).toBe(true);
    expect(g.teams[1]!.k).toBe(1.22);
    run(g, 1000);
    expect(g.players.has(3)).toBe(false);
    expect(g.teams[1]!.k).toBe(1);
    expect(log.playerGone!.map((e) => e.p)).toEqual([{ player: 3, team: 0 }]);
    expect(log.teamK![0]!.t).toBeGreaterThan(t0 + GHOST_MS);
    expect(log.teamK![0]!.t).toBeLessThan(t0 + GHOST_MS + 100);
    run(g, 9000);
    expect(rejoinPlayer(g, 3)).toBe(false);
    expect(g.players.has(3)).toBe(false);
  });
  it('a team left with nobody pauses the clock; the host picks: continue (no winner) or end', () => {
    const play = () => {
      const m = mk([
        [1, 2],
        [3, 4],
      ]);
      run(m.g, 3000);
      dropPlayer(m.g, 3);
      dropPlayer(m.g, 4);
      run(m.g, GHOST_MS + 500);
      return m;
    };
    const { g, log } = play();
    expect(g.paused).toEqual({ teams: [1] });
    expect(log.matchPaused).toHaveLength(1);
    const frozen = g.time;
    run(g, 5000);
    expect(g.time).toBe(frozen);
    resolvePause(g, 'continue');
    expect(g.paused).toBeNull();
    expect(log.matchResumed).toHaveLength(1);
    run(g, 5000);
    expect(g.time).toBeGreaterThan(frozen);
    expect(g.teams.map((t) => t.k)).toEqual([1, 1]);
    runUntil(g, () => g.over);
    expect(g.result).toMatchObject({ winner: null, aborted: false });
    const { g: h } = play();
    resolvePause(h, 'end');
    expect(h.over).toBe(true);
    expect(h.result).toMatchObject({ winner: null, aborted: true });
  });
});

describe('prueba del espejo: scripted chefs reflected by the isometry tie exactly', () => {
  const compare = (r: ReturnType<typeof runVersus>) => {
    const [a, b] = r.g.teams;
    const fields = (t: NonNullable<typeof a>) => ({
      score: t.score,
      gross: t.gross,
      delivered: t.delivered,
      tips: t.tips,
      bestStreak: t.bestStreak,
      expired: t.expired,
      rejected: t.rejected,
      vips: t.vips,
      reachedAt: t.reachedAt,
    });
    // each team's own events: the same ticks, the same payloads (the chef and the station index differ between kitchens; `tie` says who was processed second in a shared tick)
    const own = (team: number) =>
      r.bus.log
        .map((l) => l.split('|'))
        .filter(([, , p]) => (JSON.parse(p!) as { team?: number }).team === team)
        .map(([tk, type, p]) => {
          const o = JSON.parse(p!) as Record<string, unknown>;
          delete o.team;
          delete o.player;
          delete o.station;
          delete o.tie;
          return `${tk}|${type}|${JSON.stringify(o)}`;
        });
    return { a: fields(a!), b: fields(b!), ea: own(0), eb: own(1) };
  };
  it('V1 3v3 (reflection): identical score, counters and events in both kitchens, and the chefs end up as twins', () => {
    const r = runVersus({
      ...V1,
      difficulty: 'normal',
      seed: 3,
      teams: [
        [1, 2, 3],
        [4, 5, 6],
      ],
    });
    const { a, b, ea, eb } = compare(r);
    expect(a.delivered).toBeGreaterThanOrEqual(5); // a tie at zero proves nothing
    expect(a.score).toBeGreaterThan(300);
    expect(a.bestStreak).toBeGreaterThanOrEqual(1);
    expect(ea.filter((e) => e.includes('|delivered|')).length).toBe(a.delivered);
    expect(b).toEqual(a);
    expect(eb).toEqual(ea);
    expect(r.g.result).toMatchObject({ winner: null });
    for (let i = 1; i <= 3; i++) {
      const p = r.g.players.get(i)!,
        q = r.g.players.get(i + 3)!;
      expect(q.x).toBeCloseTo(16 - p.x, 3);
      expect(q.y).toBeCloseTo(p.y, 3);
      expect(q.item).toBe(p.item);
    }
  });
  it('V3 2v2 (rotation of 180 degrees): the same', () => {
    const r = runVersus({
      ...MIRRORS.v3,
      difficulty: 'hard',
      seed: 8,
      teams: [
        [1, 2],
        [3, 4],
      ],
    });
    const { a, b, ea, eb } = compare(r);
    expect(a.delivered).toBeGreaterThanOrEqual(3);
    expect(b).toEqual(a);
    expect(eb).toEqual(ea);
  });
  it('the VIP is part of the proof: a golden order wins in both kitchens in the same tick', () => {
    // seed 2 on Easy: both golden orders (75 s and 150 s) are Marinaras, which the scripted chefs (plain pizza) can serve
    const r = runVersus({
      ...V1,
      difficulty: 'easy',
      seed: 2,
      teams: [
        [1, 2, 3],
        [4, 5, 6],
      ],
    });
    const [a, b] = r.g.teams;
    expect(a!.vips + b!.vips).toBe(4);
    expect(b!.vips).toBe(a!.vips);
    expect(b!.score).toBe(a!.score);
  });
  it('a different team play breaks the tie (the proof can fail): one chef less in team 1 loses points', () => {
    const r = runVersus({
      ...V1,
      difficulty: 'normal',
      seed: 3,
      teams: [
        [1, 2, 3],
        [4, 5],
      ],
      handicap: false,
    });
    expect(r.g.teams[0]!.score).not.toBe(r.g.teams[1]!.score);
  });
});

describe('coop regression: one team is the same round as before', () => {
  const FIX: Record<string, GoldenRun> = { [n2.name]: n2, [n4.name]: n4, [n6.name]: n6 };
  for (const sc of SCENARIOS) {
    it(`${sc.name}: with a declared single team the whole round matches the recorded fixture`, () => {
      const got = runGolden({ ...sc, teams: [{ playerIds: Array.from({ length: sc.n }, (_v, i) => i + 1) }] });
      const { events: ge, ...gr } = got,
        { events: we, ...wr } = FIX[sc.name]!;
      expect(gr).toEqual(wr);
      expect(ge).toEqual(we);
    });
  }
  it('coop draws a recipe only when the order is admitted (a full queue spends nothing); versus draws at every slot', () => {
    const seq = (versus: boolean, skipped: number) => {
      const g = versus
        ? mk(
            [
              [1, 2],
              [3, 4],
            ],
            { seed: 7 },
          ).g
        : createGame({ n: 2, seed: 7, rows: fixedMap('9')!.rows });
      const t = g.teams[0]!;
      t.orders = [];
      for (let i = 0; i < g.params.maxOrders; i++) t.orders.push({ id: 100 + i, expiresAt: Infinity, warned: true, recipe: 'marinara' });
      for (let i = 0; i < skipped; i++) spawnOrder(g, t); // full: nothing is admitted
      expect(t.orders).toHaveLength(g.params.maxOrders);
      const out: string[] = [];
      for (let i = 0; i < 24; i++) {
        t.orders = [];
        spawnOrder(g, t);
        out.push(t.orders[0]!.recipe);
      }
      return out.join();
    };
    expect(seq(false, 5)).toBe(seq(false, 0));
    expect(seq(true, 5)).not.toBe(seq(true, 0));
  });
  it('coop events carry no team and no VIP fields; the legacy fields are team 0', () => {
    const g = createGame({ n: 2 });
    expect(g.versus).toBe(false);
    expect(g.teams).toHaveLength(1);
    g.score = 42;
    expect(g.teams[0]!.score).toBe(42);
    g.orders = [];
    expect(g.teams[0]!.orders).toEqual([]);
    const seen: unknown[] = [];
    const bus = new Emitter<GameEvents>();
    for (const k of ['orderNew', 'streak', 'potStart', 'roundEnd'] as const) bus.on(k, (p) => seen.push(p));
    const h = createGame({ n: 2, bus, countdownMs: 0 });
    addPlayer(h, 1, 0);
    h.params.roundMs = 1000;
    runUntil(h, () => h.over);
    expect(seen.length).toBeGreaterThan(0);
    for (const p of seen) expect(Object.keys(p as object)).not.toContain('team');
  });
});
