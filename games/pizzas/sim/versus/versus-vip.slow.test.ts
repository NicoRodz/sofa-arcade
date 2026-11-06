import { describe, expect, it } from 'vitest';
import { GHOST_MS, handicapK } from '@pichi/core/lobby/teams';
import { type GameEvents, Emitter } from '../round/events';
import { addPlayer, createGame, dropPlayer, type Game } from '../overcooked';
import { VIP_EVERY_MS, VIP_TTL_MS } from './versus';
import { mk, run, runUntil, orderOf, standAtWindow, pressA, serve } from './versus.kit';

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
